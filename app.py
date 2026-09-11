"""
API REST (Flask) para el modelo de segmentación de clientes.

Desarrollo:
    python train_model.py        # genera los artefactos en models/ (una sola vez o al reentrenar)
    python app.py                # http://127.0.0.1:8000 (en macOS el 5000 lo ocupa el Receptor AirPlay)

Producción (Linux/macOS):
    gunicorn --workers 2 --bind 0.0.0.0:8000 app:app

Variables de entorno opcionales:
    PORT                 puerto en modo desarrollo (por defecto 8000)
    CORS_ALLOW_ORIGIN    origen permitido para CORS (por defecto '*'; en producción usar el dominio real)
    FLASK_DEBUG          '1' para modo debug (NUNCA en producción)

El contrato completo de cada endpoint está en API.md.
"""
import json
import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

RAIZ = Path(__file__).resolve().parent
RUTA_PIPELINE = RAIZ / 'models' / 'kmeans_pipeline.joblib'
RUTA_METADATOS = RAIZ / 'models' / 'model_metadata.json'
RUTA_SEGMENTADOS = RAIZ / 'data' / 'clientes_segmentados.csv'
RUTA_INDEX = RAIZ / 'index.html'  # Interfaz web (la genera otra IA)

MAX_LOTE = 1000  # Máximo de clientes por petición en /predict/batch

# Límites de validación: rechazan valores imposibles. Distintos del rango de entrenamiento,
# que solo genera una ADVERTENCIA (el modelo puede extrapolar, pero con menos confianza).
LIMITES = {
    'age': (18, 100),
    'annual_income_k': (1, 1000),
    'spending_score': (1, 100),
}
NOMBRES_CAMPOS = {
    'age': 'Edad',
    'annual_income_k': 'Ingreso anual (miles de USD)',
    'spending_score': 'Spending score',
}


# ---------------------------------------------------------------------------
# Carga de artefactos (una sola vez al iniciar el proceso, no en cada petición)
# ---------------------------------------------------------------------------
if not RUTA_PIPELINE.exists() or not RUTA_METADATOS.exists():
    raise RuntimeError('No se encontró el modelo entrenado. Ejecuta primero: python train_model.py')

PIPELINE = joblib.load(RUTA_PIPELINE)
METADATOS = json.loads(RUTA_METADATOS.read_text(encoding='utf-8'))
FEATURES = METADATOS['features']
SEGMENTOS = {s['id']: s for s in METADATOS['segments']}
CLIENTES = pd.read_csv(RUTA_SEGMENTADOS, dtype={'customer_id': str})

app = Flask(__name__)
app.json.ensure_ascii = False  # Respuestas con acentos legibles
app.json.sort_keys = False     # Respeta el orden de las llaves definido en el código


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
class ErrorAPI(Exception):
    # Error controlado que se convierte en una respuesta JSON uniforme
    def __init__(self, status, code, message, details=None):
        super().__init__(message)
        self.status, self.code, self.message, self.details = status, code, message, details


def respuesta_error(status, code, message, details=None):
    cuerpo = {'error': {'code': code, 'message': message}}
    if details:
        cuerpo['error']['details'] = details
    return jsonify(cuerpo), status


def resumen_segmento(s):
    # Versión corta del segmento para incluirla en la respuesta de una predicción
    return {'id': s['id'], 'name': s['name'], 'description': s['description'],
            'suggested_actions': s['suggested_actions']}


def validar_cliente(datos):
    # Devuelve (valores, errores). errores es una lista de {field, message} para mostrar en el formulario
    if not isinstance(datos, dict):
        return None, [{'field': None, 'message': 'Cada cliente debe ser un objeto JSON.'}]
    valores, errores = {}, []
    for campo in FEATURES:
        valor = datos.get(campo)
        nombre = NOMBRES_CAMPOS[campo]
        if valor is None or valor == '':
            errores.append({'field': campo, 'message': f'{nombre} es obligatorio.'})
            continue
        # bool es subclase de int en Python: lo rechazamos explícitamente
        if isinstance(valor, bool):
            errores.append({'field': campo, 'message': f'{nombre} debe ser numérico.'})
            continue
        try:
            numero = float(valor)
        except (TypeError, ValueError):
            errores.append({'field': campo, 'message': f'{nombre} debe ser numérico.'})
            continue
        if not np.isfinite(numero):
            errores.append({'field': campo, 'message': f'{nombre} debe ser un número finito.'})
            continue
        minimo, maximo = LIMITES[campo]
        if not minimo <= numero <= maximo:
            errores.append({'field': campo, 'message': f'{nombre} debe estar entre {minimo} y {maximo}.'})
            continue
        valores[campo] = numero
    return valores, errores


def advertencias_extrapolacion(valores):
    # Avisa si el cliente está fuera del rango observado al entrenar
    avisos = []
    for campo, valor in valores.items():
        rango = METADATOS['training_ranges'][campo]
        if not rango['min'] <= valor <= rango['max']:
            avisos.append({'field': campo,
                           'message': f'{NOMBRES_CAMPOS[campo]} ({valor:g}) está fuera del rango de entrenamiento '
                                      f'({rango["min"]:g}–{rango["max"]:g}); la asignación es menos confiable.'})
    return avisos


def predecir(lista_valores):
    # Asigna segmento a una lista de clientes ya validados
    X = pd.DataFrame(lista_valores, columns=FEATURES)
    etiquetas = PIPELINE.predict(X)
    # transform() del pipeline = distancia euclidiana (en espacio estandarizado) a cada centroide
    distancias = PIPELINE.transform(X)
    resultados = []
    for fila, etiqueta, dist in zip(lista_valores, etiquetas, distancias):
        orden = np.sort(dist)
        # Margen: qué tan cerca está el segundo centroide. 0 = en la frontera, 1 = muy claro
        margen = float(1 - orden[0] / orden[1]) if orden[1] > 0 else 1.0
        resultados.append({
            'segment': resumen_segmento(SEGMENTOS[int(etiqueta)]),
            'assignment_margin': round(margen, 4),
            'distances': [{'segment_id': i, 'segment_name': SEGMENTOS[i]['name'], 'distance': round(float(d), 4)}
                          for i, d in sorted(enumerate(dist), key=lambda par: par[1])],
            'warnings': advertencias_extrapolacion(fila),
        })
    return resultados


def cuerpo_json():
    datos = request.get_json(silent=True)
    if datos is None:
        raise ErrorAPI(400, 'invalid_json', 'El cuerpo de la petición debe ser JSON válido '
                                            '(Content-Type: application/json).')
    return datos


# ---------------------------------------------------------------------------
# CORS y manejo de errores
# ---------------------------------------------------------------------------
@app.after_request
def agregar_cors(respuesta):
    # Permite consumir la API desde un HTML servido en otro origen (p. ej. abrir index.html como archivo)
    respuesta.headers['Access-Control-Allow-Origin'] = os.environ.get('CORS_ALLOW_ORIGIN', '*')
    respuesta.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    respuesta.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return respuesta


@app.errorhandler(ErrorAPI)
def manejar_error_api(error):
    return respuesta_error(error.status, error.code, error.message, error.details)


@app.errorhandler(HTTPException)
def manejar_error_http(error):
    # 404, 405, etc. también responden en JSON (no en HTML)
    codigos = {404: 'not_found', 405: 'method_not_allowed', 413: 'payload_too_large'}
    return respuesta_error(error.code, codigos.get(error.code, 'http_error'), error.description)


@app.errorhandler(Exception)
def manejar_error_inesperado(error):
    app.logger.exception('Error no controlado')
    return respuesta_error(500, 'internal_error', 'Ocurrió un error interno. Intenta de nuevo más tarde.')


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get('/')
def inicio():
    # Sirve la interfaz si ya existe; si no, orienta hacia la API
    if RUTA_INDEX.exists():
        return send_from_directory(RAIZ, 'index.html')
    return jsonify({'message': 'API de segmentación activa. Consulta /api/v1/health y API.md.'})


@app.get('/api/v1/health')
def salud():
    return jsonify({'status': 'ok', 'model_version': METADATOS['model_version'], 'k': METADATOS['k']})


@app.get('/api/v1/model')
def modelo():
    # Información del modelo para la pantalla "Modelo" (sin los segmentos, que tienen su propio endpoint)
    return jsonify({
        'model_version': METADATOS['model_version'],
        'trained_at': METADATOS['trained_at'],
        'algorithm': METADATOS['algorithm'],
        'k': METADATOS['k'],
        'features': [{'name': f, 'label': NOMBRES_CAMPOS[f], 'validation': {'min': LIMITES[f][0], 'max': LIMITES[f][1]},
                      'training_range': METADATOS['training_ranges'][f]} for f in FEATURES],
        'n_training_samples': METADATOS['n_training_samples'],
        'metrics': METADATOS['metrics'],
        'elbow': METADATOS['elbow'],
    })


@app.get('/api/v1/segments')
def segmentos():
    return jsonify({'segments': METADATOS['segments']})


@app.get('/api/v1/segments/<int:segment_id>')
def segmento(segment_id):
    if segment_id not in SEGMENTOS:
        raise ErrorAPI(404, 'segment_not_found', f'No existe el segmento {segment_id}.')
    return jsonify(SEGMENTOS[segment_id])


@app.post('/api/v1/predict')
def predecir_uno():
    datos = cuerpo_json()
    valores, errores = validar_cliente(datos)
    if errores:
        raise ErrorAPI(422, 'validation_error', 'Revisa los datos del cliente.', {'fields': errores})
    resultado = predecir([valores])[0]
    return jsonify({'input': valores, **resultado})


@app.post('/api/v1/predict/batch')
def predecir_lote():
    datos = cuerpo_json()
    clientes = datos.get('customers') if isinstance(datos, dict) else None
    if not isinstance(clientes, list) or not clientes:
        raise ErrorAPI(400, 'invalid_body', 'Envía {"customers": [ ... ]} con al menos un cliente.')
    if len(clientes) > MAX_LOTE:
        raise ErrorAPI(413, 'batch_too_large', f'El lote admite como máximo {MAX_LOTE} clientes.')

    # Validamos todo el lote: los válidos se predicen y los inválidos se reportan por índice
    validos, indices_validos, rechazados = [], [], []
    for i, cliente in enumerate(clientes):
        valores, errores = validar_cliente(cliente)
        if errores:
            rechazados.append({'index': i, 'customer_ref': cliente.get('customer_ref') if isinstance(cliente, dict) else None,
                               'errors': errores})
        else:
            validos.append(valores)
            indices_validos.append(i)

    resultados = []
    for i, valores, pred in zip(indices_validos, validos, predecir(validos) if validos else []):
        resultados.append({'index': i, 'customer_ref': clientes[i].get('customer_ref'), 'input': valores, **pred})

    conteo = {}
    for r in resultados:
        conteo[r['segment']['name']] = conteo.get(r['segment']['name'], 0) + 1
    return jsonify({
        'summary': {'received': len(clientes), 'processed': len(resultados), 'rejected': len(rechazados),
                    'by_segment': conteo},
        'results': resultados,
        'errors': rechazados,
    })


@app.get('/api/v1/customers')
def clientes():
    # Cartera de entrenamiento ya segmentada (para gráficas y tablas del dashboard)
    datos = CLIENTES
    segment_id = request.args.get('segment_id')
    if segment_id is not None:
        if not segment_id.isdigit() or int(segment_id) not in SEGMENTOS:
            raise ErrorAPI(400, 'invalid_segment', 'segment_id debe ser el id de un segmento existente.')
        datos = datos[datos['segment_id'] == int(segment_id)]
    columnas = ['customer_id', 'gender', 'age', 'annual_income_k', 'spending_score', 'segment_id', 'segment_name']
    return jsonify({'total': int(len(datos)), 'customers': datos[columnas].to_dict(orient='records')})


@app.get('/api/v1/dashboard/summary')
def resumen_dashboard():
    # KPIs agregados de la cartera para la pantalla principal del dashboard
    return jsonify({
        'total_customers': int(len(CLIENTES)),
        'segments_count': METADATOS['k'],
        'averages': {f: round(float(CLIENTES[f].mean()), 2) for f in FEATURES},
        'gender_distribution': {g: int(n) for g, n in CLIENTES['gender'].value_counts().items()},
        'segments': [{'id': s['id'], 'name': s['name'], 'customers': s['customers'], 'share_pct': s['share_pct'],
                      'centroid': s['centroid'], 'female_pct': s['female_pct']} for s in METADATOS['segments']],
        'model': {'version': METADATOS['model_version'], 'silhouette': METADATOS['metrics']['silhouette']},
    })


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=int(os.environ.get('PORT', 8000)), debug=os.environ.get('FLASK_DEBUG') == '1')
