// Cliente HTTP único para la API de Flask. Los tipos siguen el contrato de API.md.

// En desarrollo (npm run dev) Vite reenvía /api a Flask; servido por Flask también es relativo.
// Solo si se abre el archivo directamente (file://) se apunta al servidor local (puerto 8000:
// en macOS el 5000 lo ocupa el Receptor AirPlay).
export const API_BASE =
  location.protocol === 'file:' ? 'http://127.0.0.1:8000/api/v1' : '/api/v1'

export interface FieldError {
  field: string | null
  message: string
}

export class ApiError extends Error {
  status: number
  code: string
  fields: FieldError[]

  constructor(status: number, code: string, message: string, fields: FieldError[] = []) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
  }
}

export interface Timed<T> {
  data: T
  ms: number // Latencia medida en el navegador (para el requerimiento de rendimiento)
}

export type Feature = 'age' | 'annual_income_k' | 'spending_score'

export interface Health {
  status: string
  model_version: string
  k: number
}

export interface Segment {
  id: number
  name: string
  base_name: string
  description: string
  suggested_actions: string[]
  customers: number
  share_pct: number
  centroid: Record<Feature, number>
  female_pct: number
}

export interface FeatureInfo {
  name: Feature
  label: string
  validation: { min: number; max: number }
  training_range: { min: number; max: number; mean: number; std: number }
}

export interface ModelInfo {
  model_version: string
  trained_at: string
  algorithm: string
  k: number
  features: FeatureInfo[]
  n_training_samples: number
  metrics: { inertia: number; silhouette: number }
  elbow: { k: number; inertia: number; silhouette: number | null }[]
}

export interface Summary {
  total_customers: number
  segments_count: number
  averages: Record<Feature, number>
  gender_distribution: { Female: number; Male: number }
  segments: {
    id: number
    name: string
    customers: number
    share_pct: number
    centroid: Record<Feature, number>
    female_pct: number
  }[]
  model: { version: string; silhouette: number }
}

export interface SegmentDetail extends Segment {
  means: Record<Feature, number>
  ranges: Record<Feature, { min: number; max: number }>
}

export interface CustomerRecord {
  customer_id: string
  gender: string
  age: number
  annual_income_k: number
  spending_score: number
  segment_id: number
  segment_name: string
}

export interface CustomersResponse {
  total: number
  customers: CustomerRecord[]
}

export interface BatchCustomerInput {
  customer_ref?: string
  age: number | string
  annual_income_k: number | string
  spending_score: number | string
}

export interface BatchResultItem {
  index: number
  customer_ref?: string
  input: Record<Feature, number>
  segment: { id: number; name: string; description: string; suggested_actions: string[] }
  assignment_margin: number
  distances: { segment_id: number; segment_name: string; distance: number }[]
  warnings: FieldError[]
}

export interface BatchErrorItem {
  index: number
  customer_ref?: string
  errors: FieldError[]
}

export interface BatchResponse {
  summary: {
    received: number
    processed: number
    rejected: number
    by_segment: Record<string, number>
  }
  results: BatchResultItem[]
  errors: BatchErrorItem[]
}

export interface Prediction {
  input: Record<Feature, number>
  segment: { id: number; name: string; description: string; suggested_actions: string[] }
  assignment_margin: number
  distances: { segment_id: number; segment_name: string; distance: number }[]
  warnings: FieldError[]
}

async function request<T>(path: string, init?: RequestInit): Promise<Timed<T>> {
  const inicio = performance.now()
  let respuesta: Response
  try {
    respuesta = await fetch(`${API_BASE}${path}`, init)
  } catch {
    throw new ApiError(0, 'network_error', 'No hay conexión con el servicio de segmentación.')
  }
  const ms = Math.round(performance.now() - inicio)
  const cuerpo = await respuesta.json().catch(() => null)
  if (!respuesta.ok) {
    const error = cuerpo?.error
    throw new ApiError(
      respuesta.status,
      error?.code ?? 'http_error',
      error?.message ?? `Error ${respuesta.status}`,
      error?.details?.fields ?? [],
    )
  }
  return { data: cuerpo as T, ms }
}

export const api = {
  health: () => request<Health>('/health'),
  model: () => request<ModelInfo>('/model'),
  segments: () => request<{ segments: Segment[] }>('/segments'),
  segment: (id: number) => request<SegmentDetail>(`/segments/${id}`),
  summary: () => request<Summary>('/dashboard/summary'),
  customers: (segmentId?: number) =>
    request<CustomersResponse>(segmentId !== undefined ? `/customers?segment_id=${segmentId}` : '/customers'),
  predict: (body: Record<string, unknown>) =>
    request<Prediction>('/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  predictBatch: (customers: BatchCustomerInput[]) =>
    request<BatchResponse>('/predict/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customers }),
    }),
}
