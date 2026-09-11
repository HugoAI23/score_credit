"""
Entrena el modelo de segmentación (StandardScaler + K-means) y guarda los artefactos para producción.

Uso:
    python train_model.py            # k = 5 (valor recomendado)
    python train_model.py --k 4      # otro número de clusters

Genera:
    models/kmeans_pipeline.joblib    -> pipeline entrenado (escalador + K-means) que carga la API
    models/model_metadata.json       -> métricas, perfiles de segmento y curva del codo para el dashboard
    data/clientes_segmentados.csv    -> los 200 clientes con su segmento asignado

¿Por qué un Pipeline?
    En producción el cliente nuevo DEBE pasar por el mismo escalador (misma media y desviación) que
    se usó al entrenar. Guardar escalador y K-means juntos en un solo objeto evita el error clásico
    de olvidar estandarizar, o de estandarizar con otros parámetros.
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import joblib
import sklearn
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

RAIZ = Path(__file__).resolve().parent
RUTA_DATOS = RAIZ / 'data' / 'retailmax.csv'
CARPETA_MODELOS = RAIZ / 'models'
RUTA_PIPELINE = CARPETA_MODELOS / 'kmeans_pipeline.joblib'
RUTA_METADATOS = CARPETA_MODELOS / 'model_metadata.json'
RUTA_SEGMENTADOS = RAIZ / 'data' / 'clientes_segmentados.csv'

# Mismas features que en clusters.ipynb (el sexo se excluye; ver sex_cluster.ipynb)
FEATURES = ['age', 'annual_income_k', 'spending_score']
SEMILLA = 42
VERSION_MODELO = '1.0.0'

# Nombre comercial (orientado a banca) según el nivel de ingreso y de gasto del centroide.
# Clave: (nivel_ingreso, nivel_gasto)
NOMBRES_SEGMENTO = {
    ('alto', 'alto'): 'Premium',
    ('alto', 'medio'): 'Consolidado',
    ('alto', 'bajo'): 'Ahorrador patrimonial',
    ('medio', 'alto'): 'Consumidor frecuente',
    ('medio', 'medio'): 'Estable',
    ('medio', 'bajo'): 'Prudente',
    ('bajo', 'alto'): 'Consumidor impulsivo',
    ('bajo', 'medio'): 'Emergente',
    ('bajo', 'bajo'): 'Básico',
}

DESCRIPCIONES = {
    'Premium': 'Ingreso alto y gasto alto. Clientes de mayor valor para el banco.',
    'Consolidado': 'Ingreso alto con gasto moderado. Perfil financiero sólido.',
    'Ahorrador patrimonial': 'Ingreso alto pero gasto bajo. Capacidad de ahorro e inversión.',
    'Consumidor frecuente': 'Ingreso medio con gasto alto. Uso intensivo de medios de pago.',
    'Estable': 'Ingreso y gasto medios. El perfil más representativo de la cartera.',
    'Prudente': 'Ingreso medio y gasto bajo. Comportamiento conservador.',
    'Consumidor impulsivo': 'Ingreso bajo con gasto alto. Requiere acompañamiento del gasto.',
    'Emergente': 'Ingreso bajo con gasto moderado. Perfil en crecimiento.',
    'Básico': 'Ingreso bajo y gasto bajo. Necesidades financieras esenciales.',
}

# Sugerencias comerciales editables (no son decisiones de crédito; solo orientan la oferta)
ACCIONES_SUGERIDAS = {
    'Premium': ['Tarjeta de crédito platino', 'Programa de recompensas', 'Asesor personal'],
    'Consolidado': ['Crédito hipotecario', 'Seguros patrimoniales', 'Tarjeta oro'],
    'Ahorrador patrimonial': ['Fondos de inversión', 'Depósitos a plazo', 'Planes de retiro'],
    'Consumidor frecuente': ['Cashback en compras', 'Meses sin intereses', 'Alertas de gasto'],
    'Estable': ['Crédito automotriz', 'Cuenta de nómina', 'Ahorro programado'],
    'Prudente': ['Cuenta de ahorro con rendimiento', 'Seguro de vida', 'Inversión de bajo riesgo'],
    'Consumidor impulsivo': ['Herramientas de presupuesto', 'Alertas de gasto', 'Límite de crédito prudente'],
    'Emergente': ['Tarjeta de crédito básica', 'Educación financiera', 'Ahorro automático'],
    'Básico': ['Cuenta sin comisiones', 'Microcrédito', 'Educación financiera'],
}


def nivel(z):
    # Umbral de ±0.5 desviaciones estándar respecto a la media de la cartera
    if z > 0.5:
        return 'alto'
    if z < -0.5:
        return 'bajo'
    return 'medio'


def etapa_vida(edad):
    if edad < 35:
        return 'joven'
    if edad < 50:
        return 'adulto'
    return 'senior'


def nombrar_segmentos(centroides_z, centroides_orig):
    # El número de cluster que asigna K-means es arbitrario; el nombre se deduce del centroide.
    # Devuelve (nombres, bases): el nombre único que se muestra y el nombre base del catálogo.
    bases = [NOMBRES_SEGMENTO[(nivel(z[1]), nivel(z[2]))] for z in centroides_z]
    nombres = list(bases)
    # Si dos segmentos obtienen el mismo nombre, los distinguimos por etapa de vida (edad del centroide)
    for base in set(bases):
        indices = [i for i, b in enumerate(bases) if b == base]
        if len(indices) > 1:
            for i in indices:
                nombres[i] = f'{base} {etapa_vida(centroides_orig[i][0])}'
    # Si aun así se repiten (misma etapa de vida), numeramos por ingreso ascendente: "Premium joven 1", "... 2"
    for nombre in set(nombres):
        indices = sorted((i for i, n in enumerate(nombres) if n == nombre), key=lambda i: centroides_orig[i][1])
        if len(indices) > 1:
            for posicion, i in enumerate(indices, start=1):
                nombres[i] = f'{nombre} {posicion}'
    return nombres, bases


def curva_codo(X, k_max=15):
    # Inercia y silueta para k = 1..k_max (se muestran en el dashboard del modelo)
    filas = []
    for k in range(1, k_max + 1):
        pipe = Pipeline([('scaler', StandardScaler()),
                         ('kmeans', KMeans(n_clusters=k, init='k-means++', n_init=10, random_state=SEMILLA))])
        etiquetas = pipe.fit_predict(X)
        silueta = None if k == 1 else round(float(silhouette_score(pipe['scaler'].transform(X), etiquetas)), 4)
        filas.append({'k': k, 'inertia': round(float(pipe['kmeans'].inertia_), 4), 'silhouette': silueta})
    return filas


def main(k):
    # customer_id como texto para conservar los ceros a la izquierda ("0001")
    df = pd.read_csv(RUTA_DATOS, dtype={'CustomerID': str}).rename(columns={
        'CustomerID': 'customer_id',
        'Gender': 'gender',
        'Age': 'age',
        'Annual Income (k$)': 'annual_income_k',
        'Spending Score (1-100)': 'spending_score'
    })
    X = df[FEATURES]

    # 1. Entrenamiento: el Pipeline estandariza y luego agrupa
    pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('kmeans', KMeans(n_clusters=k, init='k-means++', n_init=10, random_state=SEMILLA)),
    ])
    etiquetas = pipeline.fit_predict(X)
    scaler, kmeans = pipeline['scaler'], pipeline['kmeans']
    X_scaled = scaler.transform(X)

    # 2. Centroides en unidades reales y nombres de negocio
    centroides_z = kmeans.cluster_centers_
    centroides_orig = scaler.inverse_transform(centroides_z)
    nombres, bases = nombrar_segmentos(centroides_z, centroides_orig)

    # 3. Perfil de cada segmento (el sexo se usa solo como descriptor)
    df['segment_id'] = etiquetas
    df['segment_name'] = [nombres[e] for e in etiquetas]
    segmentos = []
    for c in range(k):
        sub = df[df['segment_id'] == c]
        nombre_base = bases[c]
        segmentos.append({
            'id': c,
            'name': nombres[c],
            'base_name': nombre_base,
            'description': DESCRIPCIONES[nombre_base],
            'suggested_actions': ACCIONES_SUGERIDAS[nombre_base],
            'customers': int(len(sub)),
            'share_pct': round(len(sub) / len(df) * 100, 1),
            'centroid': {f: round(float(v), 2) for f, v in zip(FEATURES, centroides_orig[c])},
            'means': {f: round(float(sub[f].mean()), 2) for f in FEATURES},
            'ranges': {f: {'min': float(sub[f].min()), 'max': float(sub[f].max())} for f in FEATURES},
            'female_pct': round(float((sub['gender'] == 'Female').mean() * 100), 1),
        })

    # 4. Metadatos para la API y el dashboard
    metadatos = {
        'model_version': VERSION_MODELO,
        'trained_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'algorithm': 'KMeans (k-means++, n_init=10) + StandardScaler',
        'sklearn_version': sklearn.__version__,
        'k': k,
        'features': FEATURES,
        'n_training_samples': int(len(df)),
        'metrics': {
            'inertia': round(float(kmeans.inertia_), 4),
            'silhouette': round(float(silhouette_score(X_scaled, etiquetas)), 4),
        },
        # Rango observado al entrenar: la API avisa si un cliente nuevo cae fuera (extrapolación)
        'training_ranges': {f: {'min': float(X[f].min()), 'max': float(X[f].max()),
                                'mean': round(float(X[f].mean()), 2), 'std': round(float(X[f].std(ddof=0)), 2)}
                            for f in FEATURES},
        'segments': segmentos,
        'elbow': curva_codo(X),
    }

    # 5. Guardado de artefactos
    CARPETA_MODELOS.mkdir(exist_ok=True)
    joblib.dump(pipeline, RUTA_PIPELINE)
    RUTA_METADATOS.write_text(json.dumps(metadatos, ensure_ascii=False, indent=2), encoding='utf-8')
    df.to_csv(RUTA_SEGMENTADOS, index=False)

    print(f'Modelo entrenado con k = {k} | silueta = {metadatos["metrics"]["silhouette"]}')
    for s in segmentos:
        print(f'  [{s["id"]}] {s["name"]:<24} {s["customers"]:>3} clientes  centroide = {s["centroid"]}')
    print(f'Artefactos guardados en {CARPETA_MODELOS} y {RUTA_SEGMENTADOS}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Entrena el modelo K-means de segmentación de clientes.')
    # k = 5: mejor equilibrio entre silueta (0.417), codo (casi empata con k = 4) e interpretabilidad
    parser.add_argument('--k', type=int, default=5, help='Número de clusters (por defecto 5)')
    args = parser.parse_args()
    if not 2 <= args.k <= 15:
        parser.error('k debe estar entre 2 y 15')
    main(args.k)
