# API de Segmentación de Clientes — Contrato REST

API en Flask que expone el modelo K-means (StandardScaler + K-means, **k = 5**, variables: edad, ingreso anual y spending score; el sexo **no** entra al modelo y solo se usa como descriptor).

## Puesta en marcha

```bash
pip install -r requirements.txt                  # incluye flask y gunicorn
python train_model.py                            # genera models/ y data/clientes_segmentados.csv
python app.py                                    # desarrollo: http://127.0.0.1:8000
gunicorn --workers 2 --bind 0.0.0.0:8000 app:app # producción
python -m unittest test_api -v                   # pruebas
```

| Archivo | Rol |
|---|---|
| `train_model.py` | Entrena y guarda `models/kmeans_pipeline.joblib` + `models/model_metadata.json` |
| `app.py` | API REST. Carga los artefactos una sola vez al iniciar |
| `test_api.py` | Pruebas de todos los endpoints |
| `index.html` | Interfaz web (raíz del proyecto). Flask la sirve en `GET /` |

Variables de entorno: `PORT` (dev, 8000; en macOS el 5000 lo ocupa el Receptor AirPlay), `CORS_ALLOW_ORIGIN` (por defecto `*`; en producción el dominio real), `FLASK_DEBUG=1` solo en desarrollo.

**Checklist de producción:** servir con gunicorn detrás de un proxy HTTPS (nginx); `CORS_ALLOW_ORIGIN` restringido; misma versión de scikit-learn al entrenar y al servir (el `.joblib` no es portable entre versiones; la versión usada queda en `model_metadata.json`); reentrenar con `train_model.py` cuando cambie la cartera y reiniciar el proceso; nunca `FLASK_DEBUG=1`; si el banco usa la segmentación para decisiones de crédito, revisar sesgos por edad (variable del modelo) con el área de cumplimiento.

## Convenciones

- Base: `/api/v1`. Todas las respuestas son JSON (`Content-Type: application/json`), incluidos los errores.
- Unidades: `age` en años, `annual_income_k` en **miles de USD** (60 = 60 000 USD), `spending_score` de 1 a 100.
- Los ids de segmento (`0..k-1`) son arbitrarios y **pueden cambiar al reentrenar**. La interfaz debe mostrar `name` y nunca asumir que "el 2 es Premium".
- Los números pueden enviarse como número o como texto numérico (`"40"`). Los booleanos se rechazan.

### Formato de error (todas las rutas)

```json
{ "error": { "code": "validation_error", "message": "Revisa los datos del cliente.",
  "details": { "fields": [ { "field": "age", "message": "Edad debe estar entre 18 y 100." } ] } } }
```

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `invalid_json` | El cuerpo no es JSON |
| 400 | `invalid_body` | Lote sin `customers` o vacío |
| 400 | `invalid_segment` | `segment_id` inválido en `/customers` |
| 404 | `not_found` / `segment_not_found` | Ruta o segmento inexistente |
| 405 | `method_not_allowed` | Método incorrecto |
| 413 | `batch_too_large` | Lote con más de 1000 clientes |
| 422 | `validation_error` | Datos del cliente inválidos (`details.fields` indica el campo) |
| 500 | `internal_error` | Error inesperado |

### Reglas de validación

| Campo | Obligatorio | Rango aceptado | Rango de entrenamiento (fuera ⇒ `warnings`) |
|---|---|---|---|
| `age` | sí | 18 – 100 | 18 – 70 |
| `annual_income_k` | sí | 1 – 1000 | 15 – 137 |
| `spending_score` | sí | 1 – 100 | 1 – 99 |

Fuera del rango aceptado ⇒ **422**. Dentro del aceptado pero fuera del de entrenamiento ⇒ **200** con un aviso en `warnings` (el modelo extrapola y la asignación es menos confiable).

---

## Endpoints

### `GET /api/v1/health`
```json
{ "status": "ok", "model_version": "1.0.0", "k": 5 }
```

### `GET /api/v1/model`
Metadatos del modelo, límites de validación y curva del codo (para la pantalla "Modelo").
```json
{
  "model_version": "1.0.0", "trained_at": "2026-09-10T23:04:03+00:00",
  "algorithm": "KMeans (k-means++, n_init=10) + StandardScaler", "k": 5,
  "features": [
    { "name": "age", "label": "Edad", "validation": { "min": 18, "max": 100 },
      "training_range": { "min": 18.0, "max": 70.0, "mean": 38.85, "std": 13.93 } }
  ],
  "n_training_samples": 200,
  "metrics": { "inertia": 168.2476, "silhouette": 0.4166 },
  "elbow": [ { "k": 1, "inertia": 600.0, "silhouette": null }, { "k": 2, "inertia": 389.3862, "silhouette": 0.3355 } ]
}
```
`features` trae los 3 campos; `elbow` va de k = 1 a 15 (`silhouette` es `null` en k = 1).

### `GET /api/v1/segments`  ·  `GET /api/v1/segments/{id}`
```json
{
  "id": 2, "name": "Premium", "base_name": "Premium",
  "description": "Ingreso alto y gasto alto. Clientes de mayor valor para el banco.",
  "suggested_actions": ["Tarjeta de crédito platino", "Programa de recompensas", "Asesor personal"],
  "customers": 40, "share_pct": 20.0,
  "centroid": { "age": 32.88, "annual_income_k": 86.1, "spending_score": 81.53 },
  "means":    { "age": 32.88, "annual_income_k": 86.1, "spending_score": 81.53 },
  "ranges":   { "age": { "min": 27.0, "max": 40.0 }, "annual_income_k": { "min": 69.0, "max": 137.0 },
                "spending_score": { "min": 58.0, "max": 97.0 } },
  "female_pct": 55.0
}
```
`/segments` responde `{ "segments": [ ... ] }`. Con k = 5 los segmentos actuales son: **Básico** (20), **Emergente** (54), **Premium** (40), **Ahorrador patrimonial** (39) y **Estable** (47). `base_name` es el nombre del catálogo (con otros k puede haber "Estable joven" / "Estable senior" con el mismo `base_name`).

### `POST /api/v1/predict`
Asigna el segmento a un cliente.

Petición:
```json
{ "age": 32, "annual_income_k": 90, "spending_score": 85 }
```
Respuesta 200:
```json
{
  "input": { "age": 32.0, "annual_income_k": 90.0, "spending_score": 85.0 },
  "segment": { "id": 2, "name": "Premium", "description": "Ingreso alto y gasto alto. Clientes de mayor valor para el banco.",
               "suggested_actions": ["Tarjeta de crédito platino", "Programa de recompensas", "Asesor personal"] },
  "assignment_margin": 0.9008,
  "distances": [
    { "segment_id": 2, "segment_name": "Premium", "distance": 0.2105 },
    { "segment_id": 1, "segment_name": "Emergente", "distance": 2.1224 },
    { "segment_id": 4, "segment_name": "Estable", "distance": 2.5876 },
    { "segment_id": 3, "segment_name": "Ahorrador patrimonial", "distance": 2.6144 },
    { "segment_id": 0, "segment_name": "Básico", "distance": 3.6836 }
  ],
  "warnings": []
}
```
- `distances`: distancia euclidiana (en desviaciones estándar) a cada centroide, **ordenada de menor a mayor**; la primera es el segmento asignado.
- `assignment_margin` ∈ [0, 1] = `1 − d₁/d₂` (d₁ = distancia al más cercano, d₂ = al segundo). Cerca de 0 ⇒ el cliente está en la frontera entre dos segmentos; cerca de 1 ⇒ asignación clara. **No es una probabilidad**: K-means no da probabilidades. Sugerencia de UI: ≥ 0.5 "Asignación clara", 0.2–0.5 "Moderada", < 0.2 "En frontera con {segundo segmento}".
- `warnings`: `[{ "field": "age", "message": "Edad (85) está fuera del rango de entrenamiento (18–70); ..." }]`.

Respuesta 422 (ejemplo real con `{"age": 10, "annual_income_k": "abc"}`):
```json
{ "error": { "code": "validation_error", "message": "Revisa los datos del cliente.", "details": { "fields": [
  { "field": "age", "message": "Edad debe estar entre 18 y 100." },
  { "field": "annual_income_k", "message": "Ingreso anual (miles de USD) debe ser numérico." },
  { "field": "spending_score", "message": "Spending score es obligatorio." } ] } } }
```

### `POST /api/v1/predict/batch`
Hasta 1000 clientes. `customer_ref` es opcional y se devuelve tal cual. Los inválidos no detienen el lote.

Petición:
```json
{ "customers": [
  { "customer_ref": "A1", "age": 25, "annual_income_k": 20, "spending_score": 80 },
  { "customer_ref": "A2", "age": 200, "annual_income_k": 20, "spending_score": 80 } ] }
```
Respuesta 200:
```json
{
  "summary": { "received": 2, "processed": 1, "rejected": 1, "by_segment": { "Emergente": 1 } },
  "results": [ { "index": 0, "customer_ref": "A1", "input": { "...": "..." }, "segment": { "...": "..." },
                 "assignment_margin": 0.5901, "distances": [ "..." ], "warnings": [] } ],
  "errors":  [ { "index": 1, "customer_ref": "A2",
                 "errors": [ { "field": "age", "message": "Edad debe estar entre 18 y 100." } ] } ]
}
```
Cada elemento de `results` tiene la misma forma que la respuesta de `/predict` más `index` y `customer_ref`.

### `GET /api/v1/customers[?segment_id={id}]`
Cartera de entrenamiento (200 clientes) ya segmentada, para gráficas y tablas.
```json
{ "total": 40, "customers": [
  { "customer_id": "0123", "gender": "Female", "age": 40, "annual_income_k": 69, "spending_score": 58,
    "segment_id": 2, "segment_name": "Premium" } ] }
```

### `GET /api/v1/dashboard/summary`
KPIs de la cartera.
```json
{
  "total_customers": 200, "segments_count": 5,
  "averages": { "age": 38.85, "annual_income_k": 60.56, "spending_score": 50.2 },
  "gender_distribution": { "Female": 112, "Male": 88 },
  "segments": [ { "id": 0, "name": "Básico", "customers": 20, "share_pct": 10.0,
                  "centroid": { "age": 46.25, "annual_income_k": 26.75, "spending_score": 18.35 }, "female_pct": 60.0 } ],
  "model": { "version": "1.0.0", "silhouette": 0.4166 }
}
```
