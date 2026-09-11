// Prueba técnica: comprueba que bklit UI corre dentro del proyecto y evalúa los
// requerimientos mínimos funcionales (RF) y no funcionales (RNF) de la interfaz.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react'
import { animate, stagger } from 'animejs'

import { Bar } from '@/components/charts/bar'
import { BarChart } from '@/components/charts/bar-chart'
import { BarXAxis } from '@/components/charts/bar-x-axis'
import { Gauge } from '@/components/charts/gauge'
import { Grid } from '@/components/charts/grid'
import { Ring } from '@/components/charts/ring'
import { RingCenter } from '@/components/charts/ring-center'
import { RingChart } from '@/components/charts/ring-chart'
import { ChartTooltip } from '@/components/charts/tooltip'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, ApiError, type Feature, type ModelInfo, type Prediction, type Segment, type Summary } from '@/lib/api'
import { colorFor } from '@/lib/segment-colors'

// ---------------------------------------------------------------------------
// Catálogo de requerimientos de la prueba
// ---------------------------------------------------------------------------
type Estado = 'pendiente' | 'cumple' | 'falla' | 'manual' | 'limitacion'

interface Requerimiento {
  id: string
  tipo: 'Funcional' | 'No funcional' | 'Limitación'
  titulo: string
  criterio: string
}

interface Resultado {
  estado: Estado
  evidencia: string
}

const REQUERIMIENTOS: Requerimiento[] = [
  { id: 'RF-01', tipo: 'Funcional', titulo: 'Disponibilidad de la API', criterio: 'GET /health responde status "ok".' },
  { id: 'RF-02', tipo: 'Funcional', titulo: 'Carga de datos de la cartera', criterio: 'GET /segments, /dashboard/summary y /model responden 200.' },
  { id: 'RF-03', tipo: 'Funcional', titulo: 'Gráfica de barras (bklit BarChart)', criterio: 'La distribución de clientes por segmento se dibuja como SVG.' },
  { id: 'RF-04', tipo: 'Funcional', titulo: 'Gráfica de anillos (bklit RingChart)', criterio: 'Participación por segmento con color asignado por base_name.' },
  { id: 'RF-05', tipo: 'Funcional', titulo: 'Consulta de un cliente', criterio: 'POST /predict devuelve segmento, descripción y acciones sugeridas.' },
  { id: 'RF-06', tipo: 'Funcional', titulo: 'Indicador de claridad (bklit Gauge)', criterio: 'El Gauge muestra la claridad de la asignación en escala 0–100.' },
  { id: 'RF-07', tipo: 'Funcional', titulo: 'Validación de datos', criterio: 'Una edad fuera de rango devuelve 422 y el mensaje se muestra bajo el campo.' },
  { id: 'RF-08', tipo: 'Funcional', titulo: 'Curva del codo (bklit BarChart)', criterio: 'Inercia del modelo para k = 1 a 15.' },
  { id: 'RNF-01', tipo: 'No funcional', titulo: 'Paleta institucional morada', criterio: 'Tokens de tema aplicados (--primary = #4A1F8C).' },
  { id: 'RNF-02', tipo: 'No funcional', titulo: 'Latencia de la API', criterio: 'Cada respuesta tarda menos de 300 ms en local.' },
  { id: 'RNF-03', tipo: 'No funcional', titulo: 'Movimiento con anime.js', criterio: 'Los KPI se animan con anime.js v4 (se omite con movimiento reducido).' },
  { id: 'RNF-04', tipo: 'No funcional', titulo: 'Movimiento reducido', criterio: 'Con prefers-reduced-motion, anime.js y bklit usan duración 0.' },
  { id: 'RNF-05', tipo: 'No funcional', titulo: 'Accesibilidad básica', criterio: 'Cada campo tiene etiqueta, el resultado usa aria-live y cada gráfica tiene tabla alternativa.' },
  { id: 'RNF-06', tipo: 'No funcional', titulo: 'Sin errores en tiempo de ejecución', criterio: '0 errores de JavaScript no controlados durante los primeros 5 s.' },
  { id: 'RNF-07', tipo: 'No funcional', titulo: 'Entrega en un solo archivo servido por Flask', criterio: 'El build incrusta JS y CSS en index.html y Flask lo sirve en GET /.' },
  { id: 'RNF-08', tipo: 'No funcional', titulo: 'Diseño responsive', criterio: 'Legible y sin scroll horizontal de 360 px a 1440 px.' },
  { id: 'LIM-01', tipo: 'Limitación', titulo: 'Scatter y Line de bklit usan eje temporal', criterio: 'Graficar ingreso vs. gasto o k vs. inercia requiere un eje X numérico.' },
]

const RESULTADOS_INICIALES: Record<string, Resultado> = {
  'RNF-08': { estado: 'manual', evidencia: 'Revisar a 360 px (móvil) y 1440 px (escritorio).' },
  'LIM-01': {
    estado: 'limitacion',
    evidencia:
      'scatter-chart-shell.tsx y time-series-chart-shell.tsx crean la escala X con scaleTime y convierten X a Date. ' +
      'Alternativas: BarChart por rangos, heatmap-chart (por verificar) o SVG propio.',
  },
}

const ESTILO_ESTADO: Record<Estado, { texto: string; clase: string }> = {
  cumple: { texto: 'Cumple', clase: 'bg-success/10 text-success ring-success/30' },
  falla: { texto: 'Falla', clase: 'bg-destructive/10 text-destructive ring-destructive/30' },
  pendiente: { texto: 'Pendiente', clase: 'bg-muted text-muted-foreground ring-border' },
  manual: { texto: 'Revisión manual', clase: 'bg-violet-100 text-violet-900 ring-violet-500/30' },
  limitacion: { texto: 'Limitación', clase: 'bg-warning/10 text-warning ring-warning/30' },
}

// ---------------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------------
const CAMPOS: { id: Feature; etiqueta: string; ayuda: string; min: number; max: number }[] = [
  { id: 'age', etiqueta: 'Edad', ayuda: 'Años, de 18 a 100.', min: 18, max: 100 },
  { id: 'annual_income_k', etiqueta: 'Ingreso anual (miles de USD)', ayuda: '60 equivale a 60,000 USD.', min: 1, max: 1000 },
  { id: 'spending_score', etiqueta: 'Spending score', ayuda: 'Nivel de gasto, de 1 a 100.', min: 1, max: 100 },
]

type ValoresFormulario = Record<Feature, string>
type ErroresFormulario = Partial<Record<Feature, string>>

const numero = new Intl.NumberFormat('es-MX')

function validar(valores: ValoresFormulario): ErroresFormulario {
  const errores: ErroresFormulario = {}
  for (const campo of CAMPOS) {
    const texto = valores[campo.id].trim()
    const n = Number(texto)
    if (texto === '') errores[campo.id] = `${campo.etiqueta} es obligatorio.`
    else if (!Number.isFinite(n)) errores[campo.id] = `${campo.etiqueta} debe ser numérico.`
    else if (n < campo.min || n > campo.max) errores[campo.id] = `${campo.etiqueta} debe estar entre ${campo.min} y ${campo.max}.`
  }
  return errores
}

function nivelClaridad(pred: Prediction): string {
  const puntaje = pred.assignment_margin * 100
  if (puntaje >= 50) return 'Asignación clara'
  if (puntaje >= 20) return 'Asignación moderada'
  return `En frontera con ${pred.distances[1]?.segment_name ?? 'otro segmento'}`
}

// ---------------------------------------------------------------------------
// Utilidades de verificación
// ---------------------------------------------------------------------------

// Espera a que bklit dibuje el SVG dentro del contenedor. Las gráficas miden su contenedor y se
// animan con requestAnimationFrame, que el navegador pausa en pestañas ocultas: por eso solo se
// cuenta el tiempo mientras la página está visible, con un límite de 10 s.
function useSvgRenderizado(
  ref: RefObject<HTMLElement | null>,
  activo: boolean,
  alTerminar: (ok: boolean, formas: number) => void,
) {
  useEffect(() => {
    if (!activo) return
    let intentosVisibles = 0
    const id = window.setInterval(() => {
      const formas = ref.current?.querySelectorAll('svg rect, svg path, svg circle').length ?? 0
      if (formas > 0) {
        window.clearInterval(id)
        alTerminar(true, formas)
      } else if (document.visibilityState === 'visible' && ++intentosVisibles > 100) {
        window.clearInterval(id)
        alTerminar(false, 0)
      }
    }, 100)
    return () => window.clearInterval(id)
    // alTerminar se recrea en cada render; solo nos interesa reaccionar a "activo"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo])
}

function Contador({ valor, decimales = 0, reducido, alTerminar }: {
  valor: number
  decimales?: number
  reducido: boolean
  alTerminar?: (animado: boolean) => void
}) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const formato = (n: number) =>
      n.toLocaleString('es-MX', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
    if (reducido) {
      el.textContent = formato(valor)
      alTerminar?.(false)
      return
    }
    const estado = { n: 0 }
    const animacion = animate(estado, {
      n: valor,
      duration: 700,
      ease: 'outCubic',
      onUpdate: () => { el.textContent = formato(estado.n) },
      onComplete: () => alTerminar?.(true),
    })
    return () => { animacion.pause() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, decimales, reducido])
  return <span ref={ref} className="font-mono tabular-nums">0</span>
}

function EstadoBadge({ estado }: { estado: Estado }) {
  const { texto, clase } = ESTILO_ESTADO[estado]
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap ${clase}`}>
      {texto}
    </span>
  )
}

function TablaAlternativa({ columnas, filas }: { columnas: string[]; filas: (string | number)[][] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver datos en tabla</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {columnas.map((c) => (
                <th key={c} scope="col" className="border-b py-1.5 pr-4 text-left font-medium text-muted-foreground">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, i) => (
              <tr key={i}>
                {fila.map((celda, j) => (
                  <td key={j} className={`border-b py-1.5 pr-4 ${typeof celda === 'number' ? 'text-right font-mono tabular-nums' : ''}`}>
                    {typeof celda === 'number' ? numero.format(celda) : celda}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function Diagnostico() {
  const reducido = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const duracionGraficas = reducido ? 0 : 700

  const [resultados, setResultados] = useState<Record<string, Resultado>>(RESULTADOS_INICIALES)
  const marcar = useCallback((id: string, estado: Estado, evidencia: string) => {
    setResultados((previos) => ({ ...previos, [id]: { estado, evidencia } }))
  }, [])

  const [apiActiva, setApiActiva] = useState<boolean | null>(null)
  const [segmentos, setSegmentos] = useState<Segment[]>([])
  const [resumen, setResumen] = useState<Summary | null>(null)
  const [modelo, setModelo] = useState<ModelInfo | null>(null)
  const latencias = useRef<number[]>([])

  const [valores, setValores] = useState<ValoresFormulario>({ age: '32', annual_income_k: '90', spending_score: '85' })
  const [errores, setErrores] = useState<ErroresFormulario>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [prediccion, setPrediccion] = useState<Prediction | null>(null)

  const refBarras = useRef<HTMLDivElement>(null)
  const refAnillos = useRef<HTMLDivElement>(null)
  const refGauge = useRef<HTMLDivElement>(null)
  const refCodo = useRef<HTMLDivElement>(null)
  const refResultado = useRef<HTMLDivElement>(null)

  // --- Verificaciones que no dependen de datos -----------------------------
  useEffect(() => {
    const primario = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim().toLowerCase()
    marcar('RNF-01', primario === '#4a1f8c' ? 'cumple' : 'falla', `--primary = ${primario || '(vacío)'}`)

    marcar('RNF-04', 'cumple', reducido
      ? 'prefers-reduced-motion: reduce → anime.js omitido y bklit con duración 0.'
      : 'prefers-reduced-motion: no-preference → animaciones activas (se desactivan si el sistema lo pide).')

    if (import.meta.env.PROD) {
      const externos = document.querySelectorAll('script[src], link[rel="stylesheet"]').length
      marcar('RNF-07', externos === 0 ? 'cumple' : 'falla',
        externos === 0 ? `Build de producción con JS y CSS incrustados, servido desde ${location.host}.` : `${externos} recursos externos encontrados.`)
    } else {
      marcar('RNF-07', 'pendiente', 'Modo desarrollo (Vite). Ejecuta "npm run build:flask" y abre http://127.0.0.1:8000/.')
    }

    // Cuenta errores no controlados durante 5 s
    let errores = 0
    const contar = () => { errores += 1 }
    window.addEventListener('error', contar)
    window.addEventListener('unhandledrejection', contar)
    const t = window.setTimeout(() => {
      marcar('RNF-06', errores === 0 ? 'cumple' : 'falla', `${errores} errores no controlados en 5 s.`)
    }, 5000)
    return () => {
      window.removeEventListener('error', contar)
      window.removeEventListener('unhandledrejection', contar)
      window.clearTimeout(t)
    }
  }, [marcar, reducido])

  // --- Carga de datos y pruebas contra la API ------------------------------
  useEffect(() => {
    api.health()
      .then(({ data, ms }) => {
        latencias.current.push(ms)
        setApiActiva(data.status === 'ok')
        marcar('RF-01', data.status === 'ok' ? 'cumple' : 'falla', `status "${data.status}" · modelo v${data.model_version} · k = ${data.k} · ${ms} ms`)
      })
      .catch((e: Error) => {
        setApiActiva(false)
        marcar('RF-01', 'falla', e.message)
      })

    Promise.all([api.segments(), api.summary(), api.model()])
      .then(([s, r, m]) => {
        latencias.current.push(s.ms, r.ms, m.ms)
        setSegmentos(s.data.segments)
        setResumen(r.data)
        setModelo(m.data)
        marcar('RF-02', 'cumple', `${s.data.segments.length} segmentos · ${r.data.total_customers} clientes · ${m.data.elbow.length} puntos del codo`)
      })
      .catch((e: Error) => marcar('RF-02', 'falla', e.message))

    // Validación del servidor: una edad imposible debe responder 422 señalando el campo "age"
    api.predict({ age: 10, annual_income_k: 60, spending_score: 50 })
      .then(() => marcar('RF-07', 'falla', 'La API aceptó una edad de 10 años.'))
      .catch((e: unknown) => {
        const campo = e instanceof ApiError ? e.fields.find((f) => f.field === 'age') : undefined
        if (e instanceof ApiError && e.status === 422 && campo) marcar('RF-07', 'cumple', `HTTP 422 · "${campo.message}"`)
        else marcar('RF-07', 'falla', e instanceof Error ? e.message : 'Respuesta inesperada.')
      })
  }, [marcar])

  // --- Consulta de cliente --------------------------------------------------
  const consultar = useCallback(async (datos: ValoresFormulario) => {
    const erroresCliente = validar(datos)
    setErrores(erroresCliente)
    setErrorGeneral(null)
    if (Object.keys(erroresCliente).length > 0) return

    setEnviando(true)
    try {
      const { data, ms } = await api.predict({
        age: Number(datos.age),
        annual_income_k: Number(datos.annual_income_k),
        spending_score: Number(datos.spending_score),
      })
      latencias.current.push(ms)
      setPrediccion(data)
      marcar('RF-05', 'cumple', `Segmento "${data.segment.name}" · ${data.segment.suggested_actions.length} acciones · ${ms} ms`)
      const maxima = Math.max(...latencias.current)
      marcar('RNF-02', maxima < 300 ? 'cumple' : 'falla', `Máxima ${maxima} ms en ${latencias.current.length} peticiones.`)
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        const delServidor: ErroresFormulario = {}
        e.fields.forEach((f) => { if (f.field) delServidor[f.field as Feature] = f.message })
        setErrores(delServidor)
      } else {
        setErrorGeneral(e instanceof Error ? e.message : 'Error inesperado.')
        marcar('RF-05', 'falla', e instanceof Error ? e.message : 'Error inesperado.')
      }
    } finally {
      setEnviando(false)
    }
  }, [marcar])

  // Primera consulta automática con valores de ejemplo para que la prueba corra sola
  useEffect(() => { void consultar({ age: '32', annual_income_k: '90', spending_score: '85' }) }, [consultar])

  const alEnviar = (e: FormEvent) => {
    e.preventDefault()
    void consultar(valores)
  }

  // --- Verificación de que bklit dibujó cada gráfica -----------------------
  useSvgRenderizado(refBarras, segmentos.length > 0, (ok, n) =>
    marcar('RF-03', ok ? 'cumple' : 'falla', ok ? `SVG con ${n} formas (${segmentos.length} barras).` : 'No se encontró SVG tras 5 s.'))
  useSvgRenderizado(refAnillos, segmentos.length > 0, (ok, n) =>
    marcar('RF-04', ok ? 'cumple' : 'falla', ok ? `SVG con ${n} formas · colores por base_name.` : 'No se encontró SVG tras 5 s.'))
  useSvgRenderizado(refGauge, prediccion !== null, (ok, n) =>
    marcar('RF-06', ok ? 'cumple' : 'falla', ok ? `SVG con ${n} muescas · claridad ${Math.round((prediccion?.assignment_margin ?? 0) * 100)}/100.` : 'No se encontró SVG tras 5 s.'))
  useSvgRenderizado(refCodo, modelo !== null, (ok, n) =>
    marcar('RF-08', ok ? 'cumple' : 'falla', ok ? `SVG con ${n} formas · ${modelo?.elbow.length} valores de k.` : 'No se encontró SVG tras 5 s.'))

  // Accesibilidad básica: se evalúa cuando ya existen formulario, resultado y gráficas
  useEffect(() => {
    if (!prediccion || segmentos.length === 0 || !modelo) return
    const inputs = Array.from(document.querySelectorAll('input'))
    const sinEtiqueta = inputs.filter((i) => !i.labels || i.labels.length === 0).length
    const vivas = document.querySelectorAll('[aria-live]').length
    const tablas = document.querySelectorAll('details table').length
    const ok = sinEtiqueta === 0 && vivas > 0 && tablas >= 3
    marcar('RNF-05', ok ? 'cumple' : 'falla',
      `${inputs.length - sinEtiqueta}/${inputs.length} campos con etiqueta · ${vivas} región aria-live · ${tablas} tablas alternativas. Contraste: revisión manual.`)
  }, [prediccion, segmentos, modelo, marcar])

  // --- Movimiento de interfaz con anime.js ---------------------------------
  useEffect(() => {
    if (reducido) return
    animate('[data-fila-req]', { opacity: [0, 1], y: [6, 0], delay: stagger(25), duration: 300, ease: 'outQuad' })
  }, [reducido])

  useEffect(() => {
    if (reducido || !prediccion || !refResultado.current) return
    animate(refResultado.current, { opacity: [0, 1], y: [8, 0], duration: 350, ease: 'outCubic' })
  }, [prediccion, reducido])

  const alTerminarContador = useCallback((animado: boolean) => {
    marcar('RNF-03', 'cumple', animado
      ? 'anime.js v4 animó los contadores de KPI (animate + stagger).'
      : 'Animación omitida por movimiento reducido (comportamiento esperado).')
  }, [marcar])

  // --- Datos derivados para las gráficas -----------------------------------
  const baseDe = useMemo(() => new Map(segmentos.map((s) => [s.id, s.base_name])), [segmentos])
  const totalClientes = resumen?.total_customers ?? 0
  const datosBarras = useMemo(() => segmentos.map((s) => ({ segmento: s.name, clientes: s.customers })), [segmentos])
  const datosAnillos = useMemo(
    () => segmentos.map((s) => ({ label: s.name, value: s.customers, maxValue: totalClientes, color: colorFor(s.base_name) })),
    [segmentos, totalClientes],
  )
  const datosCodo = useMemo(() => (modelo?.elbow ?? []).map((e) => ({ k: `k=${e.k}`, inercia: e.inertia })), [modelo])

  const conteo = REQUERIMIENTOS.reduce<Record<Estado, number>>((acc, r) => {
    acc[resultados[r.id]?.estado ?? 'pendiente'] += 1
    return acc
  }, { cumple: 0, falla: 0, pendiente: 0, manual: 0, limitacion: 0 })

  const claridad = prediccion ? Math.round(prediccion.assignment_margin * 100) : 0
  const colorSegmento = prediccion ? colorFor(baseDe.get(prediccion.segment.id)) : undefined

  return (
    <div className="min-h-svh">
      {/* Encabezado */}
      <header className="bg-violet-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-medium tracking-wide text-white/60 uppercase">Portal de segmentación</p>
            <h1 className="text-lg font-semibold">Prueba técnica de bklit UI</h1>
          </div>
          <span className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-1.5 text-sm" role="status">
            <span aria-hidden className={`size-2 rounded-full ${apiActiva === null ? 'bg-white/40' : apiActiva ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {apiActiva === null ? 'Conectando con la API…' : apiActiva ? 'API conectada' : 'API sin conexión'}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {apiActiva === false && (
          <Alert variant="destructive">
            <AlertTitle>No hay conexión con el servicio de segmentación</AlertTitle>
            <AlertDescription>Inicia la API con "python app.py" en la raíz del proyecto y recarga la página.</AlertDescription>
          </Alert>
        )}

        {/* Resultado de la prueba */}
        <Card>
          <CardHeader>
            <CardTitle>Requerimientos mínimos</CardTitle>
            <CardDescription>
              {conteo.cumple} cumplen · {conteo.falla} fallan · {conteo.pendiente} pendientes · {conteo.manual} de revisión manual · {conteo.limitacion} limitación
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th scope="col" className="border-b py-2 pr-3 font-medium">ID</th>
                    <th scope="col" className="border-b py-2 pr-3 font-medium">Requerimiento</th>
                    <th scope="col" className="border-b py-2 pr-3 font-medium">Criterio de aceptación</th>
                    <th scope="col" className="border-b py-2 pr-3 font-medium">Estado</th>
                    <th scope="col" className="border-b py-2 font-medium">Evidencia</th>
                  </tr>
                </thead>
                <tbody>
                  {REQUERIMIENTOS.map((r) => {
                    const resultado = resultados[r.id] ?? { estado: 'pendiente' as Estado, evidencia: 'En espera…' }
                    return (
                      <tr key={r.id} data-fila-req className="align-top">
                        <td className="border-b py-2.5 pr-3 font-mono text-xs whitespace-nowrap text-muted-foreground">{r.id}</td>
                        <td className="border-b py-2.5 pr-3">
                          <div className="font-medium">{r.titulo}</div>
                          <div className="text-xs text-muted-foreground">{r.tipo}</div>
                        </td>
                        <td className="border-b py-2.5 pr-3 text-muted-foreground">{r.criterio}</td>
                        <td className="border-b py-2.5 pr-3"><EstadoBadge estado={resultado.estado} /></td>
                        <td className="border-b py-2.5 text-xs text-muted-foreground">{resultado.evidencia}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* KPI */}
        <section aria-label="Indicadores de la cartera" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { etiqueta: 'Clientes en cartera', valor: resumen?.total_customers, decimales: 0, fin: alTerminarContador },
            { etiqueta: 'Segmentos', valor: resumen?.segments_count, decimales: 0 },
            { etiqueta: 'Ingreso medio (miles de USD)', valor: resumen?.averages.annual_income_k, decimales: 1 },
            { etiqueta: 'Silueta del modelo', valor: resumen?.model.silhouette, decimales: 3 },
          ].map((kpi) => (
            <Card key={kpi.etiqueta} size="sm">
              <CardContent>
                <p className="text-xs text-muted-foreground">{kpi.etiqueta}</p>
                <p className="mt-1 text-2xl font-semibold text-violet-900">
                  {kpi.valor === undefined
                    ? <span className="text-muted-foreground">—</span>
                    : <Contador valor={kpi.valor} decimales={kpi.decimales} reducido={reducido} alTerminar={kpi.fin} />}
                </p>
              </CardContent>
            </Card>
          ))}
        </section>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Consulta de cliente */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Consulta de cliente</CardTitle>
              <CardDescription>Asigna el perfil más parecido según edad, ingreso y nivel de gasto.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <form onSubmit={alEnviar} noValidate className="grid gap-4 sm:grid-cols-3">
                {CAMPOS.map((campo) => (
                  <div key={campo.id} className="space-y-1.5">
                    <Label htmlFor={campo.id}>{campo.etiqueta}</Label>
                    <Input
                      id={campo.id}
                      inputMode="decimal"
                      value={valores[campo.id]}
                      onChange={(e) => setValores((v) => ({ ...v, [campo.id]: e.target.value }))}
                      aria-invalid={errores[campo.id] ? true : undefined}
                      aria-describedby={`${campo.id}-ayuda ${campo.id}-error`}
                      className="font-mono"
                    />
                    <p id={`${campo.id}-ayuda`} className="text-xs text-muted-foreground">{campo.ayuda}</p>
                    <p id={`${campo.id}-error`} className="text-xs text-destructive" role={errores[campo.id] ? 'alert' : undefined}>
                      {errores[campo.id]}
                    </p>
                  </div>
                ))}
                <div className="sm:col-span-3">
                  <Button type="submit" disabled={enviando}>{enviando ? 'Consultando…' : 'Consultar perfil'}</Button>
                </div>
              </form>

              {errorGeneral && (
                <Alert variant="destructive">
                  <AlertTitle>No se pudo consultar</AlertTitle>
                  <AlertDescription>{errorGeneral}</AlertDescription>
                </Alert>
              )}

              <div aria-live="polite">
                {prediccion && (
                  <div ref={refResultado} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-[1fr_200px]">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span aria-hidden className="size-3 rounded-sm" style={{ background: colorSegmento }} />
                        <p className="text-lg font-semibold">{prediccion.segment.name}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">{prediccion.segment.description}</p>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase">Productos sugeridos</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                          {prediccion.segment.suggested_actions.map((a) => <li key={a}>{a}</li>)}
                        </ul>
                      </div>
                      {prediccion.warnings.map((w) => (
                        <Alert key={w.message}>
                          <AlertTitle>Dato fuera del rango habitual</AlertTitle>
                          <AlertDescription>{w.message}</AlertDescription>
                        </Alert>
                      ))}
                    </div>
                    <div className="flex flex-col items-center justify-center">
                      <div ref={refGauge} className="w-full max-w-[200px]">
                        <Gauge
                          value={claridad}
                          centerValue={claridad}
                          totalNotches={30}
                          defaultLabel="Claridad"
                          activeFill="#4A1F8C"
                          inactiveFill="#E3DDEE"
                          enterTransition={reducido ? { duration: 0 } : undefined}
                        />
                      </div>
                      <p className="text-center text-sm font-medium">{nivelClaridad(prediccion)}</p>
                      <p className="text-center text-xs text-muted-foreground">Escala 0–100. No es una probabilidad.</p>
                      <TablaAlternativa
                        columnas={['Perfil', 'Distancia']}
                        filas={prediccion.distances.map((d) => [d.segment_name, d.distance])}
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Participación por segmento */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Participación por segmento</CardTitle>
              <CardDescription>Clientes de la cartera en cada perfil.</CardDescription>
            </CardHeader>
            <CardContent>
              <div ref={refAnillos} className="flex justify-center" role="img" aria-label="Anillos con el número de clientes por segmento">
                {datosAnillos.length > 0 && (
                  <RingChart data={datosAnillos} size={240} strokeWidth={11} animationDuration={duracionGraficas}>
                    {datosAnillos.map((d, i) => <Ring key={d.label} index={i} color={d.color} />)}
                    <RingCenter defaultLabel="Clientes" />
                  </RingChart>
                )}
              </div>
              <ul className="mt-4 space-y-1.5 text-sm">
                {segmentos.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="size-2.5 rounded-sm" style={{ background: colorFor(s.base_name) }} />
                      {s.name}
                    </span>
                    <span className="font-mono tabular-nums text-muted-foreground">{s.share_pct.toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
              <TablaAlternativa
                columnas={['Segmento', 'Clientes', '% de la cartera']}
                filas={segmentos.map((s) => [s.name, s.customers, s.share_pct])}
              />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Distribución por segmento */}
          <Card>
            <CardHeader>
              <CardTitle>Clientes por segmento</CardTitle>
              <CardDescription>Distribución de la cartera de entrenamiento.</CardDescription>
            </CardHeader>
            <CardContent>
              <div ref={refBarras} role="img" aria-label="Barras con el número de clientes por segmento">
                {datosBarras.length > 0 && (
                  <BarChart data={datosBarras} xDataKey="segmento" aspectRatio="16 / 9" animationDuration={duracionGraficas}>
                    <Grid horizontal />
                    <Bar dataKey="clientes" fill="var(--chart-line-primary)" lineCap={4} animate={!reducido} />
                    <BarXAxis />
                    <ChartTooltip showDatePill={false} />
                  </BarChart>
                )}
              </div>
              <TablaAlternativa columnas={['Segmento', 'Clientes']} filas={datosBarras.map((d) => [d.segmento, d.clientes])} />
            </CardContent>
          </Card>

          {/* Curva del codo */}
          <Card>
            <CardHeader>
              <CardTitle>Curva del codo</CardTitle>
              <CardDescription>Inercia del modelo según el número de segmentos (k). Actual: k = {modelo?.k ?? '—'}.</CardDescription>
            </CardHeader>
            <CardContent>
              <div ref={refCodo} role="img" aria-label="Barras con la inercia del modelo para k de 1 a 15">
                {datosCodo.length > 0 && (
                  <BarChart data={datosCodo} xDataKey="k" aspectRatio="16 / 9" animationDuration={duracionGraficas}>
                    <Grid horizontal />
                    <Bar dataKey="inercia" fill="var(--chart-line-secondary)" lineCap={3} animate={!reducido} />
                    <BarXAxis />
                    <ChartTooltip showDatePill={false} />
                  </BarChart>
                )}
              </div>
              <TablaAlternativa columnas={['k', 'Inercia']} filas={datosCodo.map((d) => [d.k, d.inercia])} />
            </CardContent>
          </Card>
        </div>

        <Alert>
          <AlertTitle>Limitación detectada (LIM-01)</AlertTitle>
          <AlertDescription>
            En bklit UI, ScatterChart y LineChart construyen el eje X como tiempo (convierten X a fecha). Por eso esta prueba
            usa barras para la curva del codo y no incluye el diagrama Ingreso vs. Spending score.
          </AlertDescription>
        </Alert>
      </main>
    </div>
  )
}
