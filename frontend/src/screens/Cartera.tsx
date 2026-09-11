// Pantalla de Cartera (Dashboard)
// Muestra KPIs consolidados, distribución de clientes por perfil,
// análisis bidimensional (ingreso y gasto) mediante barras apiladas,
// radar de centroides normalizados y tabla interactiva con panel lateral (Sheet).
import { useState, useEffect, useMemo, useRef } from "react"
import { animate } from "animejs"
import {
  api,
  type Summary,
  type Segment,
  type SegmentDetail,
  type ModelInfo,
  type CustomerRecord,
} from "@/lib/api"
import { colorFor } from "@/lib/segment-colors"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { BarChart } from "@/components/charts/bar-chart"
import { Bar } from "@/components/charts/bar"
import { BarXAxis } from "@/components/charts/bar-x-axis"
import { BarYAxis } from "@/components/charts/bar-y-axis"
import { Grid } from "@/components/charts/grid"
import { RingChart } from "@/components/charts/ring-chart"
import { Ring } from "@/components/charts/ring"
import { RingCenter } from "@/components/charts/ring-center"
import { ChartTooltip } from "@/components/charts/tooltip"
import { RadarChart } from "@/components/charts/radar-chart"
import { RadarGrid } from "@/components/charts/radar-grid"
import { RadarAxis } from "@/components/charts/radar-axis"
import { RadarLabels } from "@/components/charts/radar-labels"
import { RadarArea } from "@/components/charts/radar-area"
import {
  Users,
  PieChart,
  Layers,
  DollarSign,
  TrendingUp,
  Info,
  CheckCircle2,
  RefreshCw,
  ChevronRight,
} from "lucide-react"

const currFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "USD", maximumFractionDigits: 0 })

const RANGOS_INGRESO = ["15–40k", "41–60k", "61–80k", "81–100k", "101–137k"]
const RANGOS_GASTO = ["1–20", "21–40", "41–60", "61–80", "81–100"]

// Componente Contador animado con anime.js
function Contador({ valor, decimales = 0, reducido }: { valor: number; decimales?: number; reducido: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const formato = (n: number) =>
      n.toLocaleString("es-MX", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
    if (reducido) {
      el.textContent = formato(valor)
      return
    }
    const estado = { n: 0 }
    const animacion = animate(estado, {
      n: valor,
      duration: 650,
      ease: "outCubic",
      onUpdate: () => {
        el.textContent = formato(estado.n)
      },
    })
    return () => {
      animacion.pause()
    }
  }, [valor, decimales, reducido])
  return <span ref={ref} className="font-mono tabular-nums">0</span>
}

export default function Cartera() {
  const reducido = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  )
  const duracionGraficas = reducido ? 0 : 700

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resumen, setResumen] = useState<Summary | null>(null)
  const [segmentos, setSegmentos] = useState<Segment[]>([])
  const [modelo, setModelo] = useState<ModelInfo | null>(null)
  const [clientes, setClientes] = useState<CustomerRecord[]>([])

  // Segmento seleccionado para el Sheet lateral
  const [sheetOpen, setSheetOpen] = useState(false)
  const [segmentoDetalle, setSegmentoDetalle] = useState<SegmentDetail | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)

  // Carga de datos de la API
  const cargarDatos = async () => {
    setCargando(true)
    setError(null)
    try {
      const [rRes, sRes, mRes, cRes] = await Promise.all([
        api.summary(),
        api.segments(),
        api.model(),
        api.customers(),
      ])
      setResumen(rRes.data)
      setSegmentos(sRes.data.segments)
      setModelo(mRes.data)
      setClientes(cRes.data.customers)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al conectar con la API")
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargarDatos()
  }, [])

  // Abrir panel lateral de detalle de segmento
  const abrirDetalle = async (s: Segment) => {
    setSheetOpen(true)
    setCargandoDetalle(true)
    setSegmentoDetalle(null)
    try {
      const res = await api.segment(s.id)
      setSegmentoDetalle(res.data)
    } catch {
      // Fallback si la llamada directa no responde
      setSegmentoDetalle({
        ...s,
        means: s.centroid,
        ranges: {
          age: { min: s.centroid.age, max: s.centroid.age },
          annual_income_k: { min: s.centroid.annual_income_k, max: s.centroid.annual_income_k },
          spending_score: { min: s.centroid.spending_score, max: s.centroid.spending_score },
        },
      })
    } finally {
      setCargandoDetalle(false)
    }
  }

  // Datos para RingChart de participación
  const datosAnillos = useMemo(() => {
    const total = resumen?.total_customers ?? 200
    return segmentos.map((s) => ({
      label: s.name,
      value: s.customers,
      maxValue: total,
      color: colorFor(s.base_name),
    }))
  }, [segmentos, resumen])

  // Datos para BarChart horizontal de clientes por segmento
  const datosBarras = useMemo(() => {
    return segmentos.map((s) => ({
      perfil: s.name,
      clientes: s.customers,
    }))
  }, [segmentos])

  // Datos para Barras Apiladas por Rangos de Ingreso (sustituto de Scatter)
  const datosBarrasIngreso = useMemo(() => {
    if (clientes.length === 0 || segmentos.length === 0) return []

    const conteos: Record<string, Record<string, number>> = {}
    for (const r of RANGOS_INGRESO) {
      conteos[r] = {}
      segmentos.forEach((s) => {
        conteos[r][s.name] = 0
      })
    }

    clientes.forEach((c) => {
      let r = "101–137k"
      if (c.annual_income_k <= 40) r = "15–40k"
      else if (c.annual_income_k <= 60) r = "41–60k"
      else if (c.annual_income_k <= 80) r = "61–80k"
      else if (c.annual_income_k <= 100) r = "81–100k"

      if (conteos[r] && conteos[r][c.segment_name] !== undefined) {
        conteos[r][c.segment_name] += 1
      }
    })

    return RANGOS_INGRESO.map((r) => ({
      rango: r,
      ...conteos[r],
    }))
  }, [clientes, segmentos])

  // Datos para Barras Apiladas por Rangos de Spending Score (sustituto de Scatter)
  const datosBarrasGasto = useMemo(() => {
    if (clientes.length === 0 || segmentos.length === 0) return []

    const conteos: Record<string, Record<string, number>> = {}
    for (const r of RANGOS_GASTO) {
      conteos[r] = {}
      segmentos.forEach((s) => {
        conteos[r][s.name] = 0
      })
    }

    clientes.forEach((c) => {
      let r = "81–100"
      if (c.spending_score <= 20) r = "1–20"
      else if (c.spending_score <= 40) r = "21–40"
      else if (c.spending_score <= 60) r = "41–60"
      else if (c.spending_score <= 80) r = "61–80"

      if (conteos[r] && conteos[r][c.segment_name] !== undefined) {
        conteos[r][c.segment_name] += 1
      }
    })

    return RANGOS_GASTO.map((r) => ({
      rango: r,
      ...conteos[r],
    }))
  }, [clientes, segmentos])

  // Datos para RadarChart de centroides normalizados
  const radarMetrics = [
    { key: "edad", label: "Edad" },
    { key: "ingreso", label: "Ingreso" },
    { key: "gasto", label: "Gasto" },
  ]

  const radarData = useMemo(() => {
    if (!modelo || segmentos.length === 0) return []
    const fEdad = modelo.features.find((f) => f.name === "age")?.training_range ?? { min: 18, max: 70 }
    const fIngreso = modelo.features.find((f) => f.name === "annual_income_k")?.training_range ?? { min: 15, max: 137 }
    const fGasto = modelo.features.find((f) => f.name === "spending_score")?.training_range ?? { min: 1, max: 99 }

    return segmentos.map((s) => {
      const normEdad = Math.round(
        Math.max(0, Math.min(100, ((s.centroid.age - fEdad.min) / (fEdad.max - fEdad.min)) * 100))
      )
      const normIngreso = Math.round(
        Math.max(0, Math.min(100, ((s.centroid.annual_income_k - fIngreso.min) / (fIngreso.max - fIngreso.min)) * 100))
      )
      const normGasto = Math.round(
        Math.max(0, Math.min(100, ((s.centroid.spending_score - fGasto.min) / (fGasto.max - fGasto.min)) * 100))
      )

      return {
        label: s.name,
        color: colorFor(s.base_name),
        values: {
          edad: normEdad,
          ingreso: normIngreso,
          gasto: normGasto,
        },
      }
    })
  }, [modelo, segmentos])

  if (cargando) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertTitle>No hay conexión con el servicio de segmentación</AlertTitle>
          <AlertDescription className="mt-1">{error}</AlertDescription>
        </Alert>
        <Button onClick={cargarDatos} variant="outline" className="gap-2">
          <RefreshCw className="size-4" />
          Reintentar conexión
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-violet-900">Cartera de Clientes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Visión global del comportamiento financiero y composición de los 5 segmentos bancarios.
          </p>
        </div>
        <Button onClick={cargarDatos} variant="outline" size="sm" className="gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className="size-3.5" />
          Actualizar datos
        </Button>
      </div>

      {/* Tarjetas de KPI */}
      <section aria-label="Indicadores clave de la cartera" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-2xs border-border">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Total de Clientes</span>
              <Users className="size-4 text-violet-700" />
            </div>
            <p className="mt-2 text-2xl font-bold text-violet-900">
              <Contador valor={resumen?.total_customers ?? 0} reducido={reducido} />
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Base activa de clientes analizados</p>
          </CardContent>
        </Card>

        <Card className="shadow-2xs border-border">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Segmentos Definidos</span>
              <Layers className="size-4 text-emerald-700" />
            </div>
            <p className="mt-2 text-2xl font-bold text-violet-900">
              <Contador valor={resumen?.segments_count ?? 5} reducido={reducido} />
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Perfiles comerciales homogéneos</p>
          </CardContent>
        </Card>

        <Card className="shadow-2xs border-border">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Ingreso Medio Anual</span>
              <DollarSign className="size-4 text-amber-700" />
            </div>
            <p className="mt-2 text-2xl font-bold text-violet-900">
              $ <Contador valor={resumen?.averages.annual_income_k ?? 0} decimales={1} reducido={reducido} /> k
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Promedio: {currFmt.format((resumen?.averages.annual_income_k ?? 0) * 1000)} USD
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-2xs border-border">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Calidad de Separación</span>
              <TrendingUp className="size-4 text-violet-500" />
            </div>
            <p className="mt-2 text-2xl font-bold text-violet-900">
              <Contador valor={resumen?.model.silhouette ?? 0} decimales={3} reducido={reducido} />
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Coeficiente de silueta del modelo</p>
          </CardContent>
        </Card>
      </section>

      {/* Fila 1: Distribución general (Ring + Barras horizontales) */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Ring Chart: Participación */}
        <Card className="lg:col-span-5 shadow-xs border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="size-4 text-violet-700" />
              Participación por Perfil
            </CardTitle>
            <CardDescription className="text-xs">
              Proporción de clientes en cada perfil dentro de la cartera total.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center" role="img" aria-label="Gráfica circular de participación de cada segmento">
              {datosAnillos.length > 0 && (
                <RingChart data={datosAnillos} size={220} strokeWidth={12} animationDuration={duracionGraficas}>
                  {datosAnillos.map((d, i) => (
                    <Ring key={d.label} index={i} color={d.color} />
                  ))}
                  <RingCenter defaultLabel="Clientes" />
                </RingChart>
              )}
            </div>

            {/* Leyenda interactiva */}
            <ul className="space-y-2 pt-2 text-xs">
              {segmentos.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 border-b border-border/50 pb-1.5 last:border-0">
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 rounded-xs shrink-0" style={{ backgroundColor: colorFor(s.base_name) }} />
                    <span className="font-medium text-foreground">{s.name}</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground font-mono">{s.customers} clientes</span>
                    <span className="font-semibold font-mono text-violet-900 tabular-nums">{s.share_pct.toFixed(1)}%</span>
                  </div>
                </li>
              ))}
            </ul>

            <details className="text-xs text-muted-foreground pt-1">
              <summary className="cursor-pointer hover:text-foreground font-medium">Ver datos en tabla</summary>
              <table className="w-full mt-2 text-xs border-collapse">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1">Perfil</th>
                    <th className="py-1 text-right">Clientes</th>
                    <th className="py-1 text-right">Participación</th>
                  </tr>
                </thead>
                <tbody>
                  {segmentos.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-1">{s.name}</td>
                      <td className="py-1 text-right font-mono">{s.customers}</td>
                      <td className="py-1 text-right font-mono">{s.share_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </CardContent>
        </Card>

        {/* BarChart Horizontal: Clientes por Segmento */}
        <Card className="lg:col-span-7 shadow-xs border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="size-4 text-violet-700" />
              Volumen de Clientes por Perfil
            </CardTitle>
            <CardDescription className="text-xs">
              Cantidad de clientes clasificados en cada segmento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="w-full overflow-hidden"
              role="img"
              aria-label="Gráfica de barras horizontales con el volumen de clientes por segmento"
            >
              <BarChart
                data={datosBarras}
                xDataKey="perfil"
                orientation="horizontal"
                aspectRatio="16 / 9"
                animationDuration={duracionGraficas}
              >
                <Grid vertical />
                <Bar dataKey="clientes" fill="var(--chart-line-primary)" lineCap={4} animate={!reducido} />
                <BarXAxis />
                <BarYAxis />
                <ChartTooltip showDatePill={false} />
              </BarChart>
            </div>

            <details className="text-xs text-muted-foreground pt-1">
              <summary className="cursor-pointer hover:text-foreground font-medium">Ver datos en tabla</summary>
              <table className="w-full mt-2 text-xs border-collapse">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1">Perfil</th>
                    <th className="py-1 text-right">Total Clientes</th>
                  </tr>
                </thead>
                <tbody>
                  {datosBarras.map((d) => (
                    <tr key={d.perfil} className="border-b last:border-0">
                      <td className="py-1">{d.perfil}</td>
                      <td className="py-1 text-right font-mono">{d.clientes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </CardContent>
        </Card>
      </div>

      {/* Fila 2: Dos Gráficas Apiladas (Composición de Ingreso y Gasto por Segmento) */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-violet-900">Composición por Niveles de Ingreso y Consumo</h2>
          <p className="text-xs text-muted-foreground">
            Desglose de la cartera agrupada por tramos monetarios y hábitos de gasto (gráfico apilado por perfil).
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Gráfica 1: Composición por Tramos de Ingreso */}
          <Card className="shadow-xs border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Tramos de Ingreso Anual</CardTitle>
              <CardDescription className="text-xs">
                Distribución de los perfiles en cada rango salarial (miles de USD).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                className="w-full overflow-hidden"
                role="img"
                aria-label="Barras apiladas mostrando la distribución de segmentos en cada rango de ingreso"
              >
                {datosBarrasIngreso.length > 0 && (
                  <BarChart
                    data={datosBarrasIngreso}
                    xDataKey="rango"
                    stacked
                    aspectRatio="16 / 9"
                    animationDuration={duracionGraficas}
                  >
                    <Grid horizontal />
                    <BarXAxis />
                    <BarYAxis />
                    {segmentos.map((s) => (
                      <Bar key={s.name} dataKey={s.name} fill={colorFor(s.base_name)} animate={!reducido} />
                    ))}
                    <ChartTooltip showDatePill={false} />
                  </BarChart>
                )}
              </div>

              {/* Leyenda de series */}
              <div className="flex flex-wrap gap-2 pt-1 text-xs">
                {segmentos.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1.5 bg-muted/50 px-2 py-0.5 rounded-xs">
                    <span className="size-2 rounded-xs" style={{ backgroundColor: colorFor(s.base_name) }} />
                    {s.name}
                  </span>
                ))}
              </div>

              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground font-medium">Ver datos en tabla</summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-1">Rango Ingreso</th>
                        {segmentos.map((s) => (
                          <th key={s.id} className="py-1 text-right">{s.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {datosBarrasIngreso.map((d) => (
                        <tr key={d.rango} className="border-b last:border-0">
                          <td className="py-1 font-medium">{d.rango}</td>
                          {segmentos.map((s) => (
                            <td key={s.id} className="py-1 text-right font-mono">
                              {/* @ts-expect-error dynamic access */}
                              {d[s.name] ?? 0}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </CardContent>
          </Card>

          {/* Gráfica 2: Composición por Puntuación de Gasto */}
          <Card className="shadow-xs border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Tramos de Nivel de Gasto (Spending Score)</CardTitle>
              <CardDescription className="text-xs">
                Distribución de perfiles según su volumen y frecuencia de gasto (1–100).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                className="w-full overflow-hidden"
                role="img"
                aria-label="Barras apiladas mostrando la distribución de segmentos en cada rango de gasto"
              >
                {datosBarrasGasto.length > 0 && (
                  <BarChart
                    data={datosBarrasGasto}
                    xDataKey="rango"
                    stacked
                    aspectRatio="16 / 9"
                    animationDuration={duracionGraficas}
                  >
                    <Grid horizontal />
                    <BarXAxis />
                    <BarYAxis />
                    {segmentos.map((s) => (
                      <Bar key={s.name} dataKey={s.name} fill={colorFor(s.base_name)} animate={!reducido} />
                    ))}
                    <ChartTooltip showDatePill={false} />
                  </BarChart>
                )}
              </div>

              {/* Leyenda de series */}
              <div className="flex flex-wrap gap-2 pt-1 text-xs">
                {segmentos.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1.5 bg-muted/50 px-2 py-0.5 rounded-xs">
                    <span className="size-2 rounded-xs" style={{ backgroundColor: colorFor(s.base_name) }} />
                    {s.name}
                  </span>
                ))}
              </div>

              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground font-medium">Ver datos en tabla</summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-1">Rango Gasto</th>
                        {segmentos.map((s) => (
                          <th key={s.id} className="py-1 text-right">{s.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {datosBarrasGasto.map((d) => (
                        <tr key={d.rango} className="border-b last:border-0">
                          <td className="py-1 font-medium">{d.rango}</td>
                          {segmentos.map((s) => (
                            <td key={s.id} className="py-1 text-right font-mono">
                              {/* @ts-expect-error dynamic access */}
                              {d[s.name] ?? 0}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Fila 3: Radar Chart y Tabla Detallada */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Radar Chart de Centroides Normalizados */}
        <Card className="lg:col-span-5 shadow-xs border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="size-4 text-violet-700" />
              Huella y Perfil de Cada Segmento
            </CardTitle>
            <CardDescription className="text-xs">
              Comparativa de centroides de Edad, Ingreso y Gasto normalizados (0–100).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="w-full aspect-square flex items-center justify-center p-2" role="img" aria-label="Gráfica de radar con los centroides normalizados de cada perfil">
              {radarData.length > 0 && (
                <RadarChart data={radarData} metrics={radarMetrics} levels={5} margin={50} animate={!reducido}>
                  <RadarGrid />
                  <RadarAxis />
                  <RadarLabels />
                  {radarData.map((d, i) => (
                    <RadarArea key={d.label} index={i} color={d.color} />
                  ))}
                </RadarChart>
              )}
            </div>

            {/* Explicación de normalización requerida */}
            <p className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-md leading-relaxed">
              <Info className="size-3.5 inline mr-1 text-violet-700 -mt-0.5" />
              <strong>Nota metodológica:</strong> Los ejes representan edad, ingreso y gasto normalizados en escala de
              0 a 100 respecto a los rangos de entrenamiento de la cartera (Edad: 18–70 años, Ingreso: 15–137 miles USD,
              Gasto: 1–99 score). Permite comparar magnitudes dispares en un mismo plano.
            </p>

            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground font-medium">Ver valores normalizados</summary>
              <table className="w-full mt-2 text-xs border-collapse">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1">Perfil</th>
                    <th className="py-1 text-right">Edad (norm)</th>
                    <th className="py-1 text-right">Ingreso (norm)</th>
                    <th className="py-1 text-right">Gasto (norm)</th>
                  </tr>
                </thead>
                <tbody>
                  {radarData.map((d) => (
                    <tr key={d.label} className="border-b last:border-0">
                      <td className="py-1 font-medium">{d.label}</td>
                      <td className="py-1 text-right font-mono">{d.values.edad}%</td>
                      <td className="py-1 text-right font-mono">{d.values.ingreso}%</td>
                      <td className="py-1 text-right font-mono">{d.values.gasto}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </CardContent>
        </Card>

        {/* Tabla completa de perfiles */}
        <Card className="lg:col-span-7 shadow-xs border-border">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Catálogo de Perfiles y Promedios</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Haz clic en cualquier fila para desplegar la ficha completa del perfil.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs bg-muted/40 font-normal">
                {segmentos.length} perfiles activos
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/40 text-muted-foreground border-b border-border">
                    <th scope="col" className="py-2.5 px-3 text-left font-semibold">Perfil</th>
                    <th scope="col" className="py-2.5 px-3 text-right font-semibold">Clientes</th>
                    <th scope="col" className="py-2.5 px-3 text-right font-semibold">% Cartera</th>
                    <th scope="col" className="py-2.5 px-3 text-right font-semibold">Edad Prom.</th>
                    <th scope="col" className="py-2.5 px-3 text-right font-semibold">Ingreso Prom.</th>
                    <th scope="col" className="py-2.5 px-3 text-right font-semibold">Gasto Prom.</th>
                    <th scope="col" className="py-2.5 px-3 text-right font-semibold">% Mujeres*</th>
                    <th scope="col" className="py-2.5 px-2 text-center font-semibold">Ficha</th>
                  </tr>
                </thead>
                <tbody>
                  {segmentos.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => void abrirDetalle(s)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") void abrirDetalle(s) }}
                      className="border-b border-border/60 hover:bg-muted/50 cursor-pointer transition-colors focus:bg-muted/60 outline-none"
                    >
                      <td className="py-2.5 px-3 font-semibold text-foreground flex items-center gap-2">
                        <span className="size-2.5 rounded-xs shrink-0" style={{ backgroundColor: colorFor(s.base_name) }} />
                        {s.name}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{s.customers}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{s.share_pct.toFixed(1)}%</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{s.centroid.age.toFixed(1)} a</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">${s.centroid.annual_income_k.toFixed(1)}k</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{s.centroid.spending_score.toFixed(1)}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{s.female_pct.toFixed(1)}%</td>
                      <td className="py-2.5 px-2 text-center text-muted-foreground">
                        <ChevronRight className="size-4 inline" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Aclaración obligatoria sobre la variable sexo */}
            <p className="text-[11px] text-muted-foreground">
              * <strong>% Mujeres:</strong> dato puramente descriptivo de la cartera, <u>no usado por el modelo K-means</u>.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sheet / Panel lateral con detalle del segmento */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          title={segmentoDetalle?.name ?? "Detalle de Perfil"}
          description={segmentoDetalle?.description ?? "Información ampliada del perfil"}
          onClose={() => setSheetOpen(false)}
        >
          {cargandoDetalle ? (
            <div className="space-y-4 pt-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : segmentoDetalle ? (
            <div className="space-y-6 pt-1 text-xs">
              {/* Encabezado con color */}
              <div className="p-3.5 rounded-lg border border-border bg-muted/30 flex items-center gap-3">
                <span
                  className="size-5 rounded-xs shrink-0 shadow-2xs"
                  style={{ backgroundColor: colorFor(segmentoDetalle.base_name) }}
                />
                <div>
                  <h4 className="text-sm font-bold text-violet-900">{segmentoDetalle.name}</h4>
                  <p className="text-muted-foreground">
                    Representa el <strong>{segmentoDetalle.share_pct.toFixed(1)}%</strong> ({segmentoDetalle.customers} clientes) de la cartera.
                  </p>
                </div>
              </div>

              {/* Centroides y Promedios */}
              <div className="space-y-2">
                <h5 className="font-semibold text-foreground text-xs uppercase tracking-wider">Centroides y Medias</h5>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 rounded-md border border-border bg-card">
                    <p className="text-muted-foreground text-[11px]">Edad media</p>
                    <p className="font-mono text-sm font-bold text-violet-900 mt-1">
                      {segmentoDetalle.centroid.age.toFixed(1)} años
                    </p>
                  </div>
                  <div className="p-2.5 rounded-md border border-border bg-card">
                    <p className="text-muted-foreground text-[11px]">Ingreso medio</p>
                    <p className="font-mono text-sm font-bold text-violet-900 mt-1">
                      ${segmentoDetalle.centroid.annual_income_k.toFixed(1)}k
                    </p>
                  </div>
                  <div className="p-2.5 rounded-md border border-border bg-card">
                    <p className="text-muted-foreground text-[11px]">Gasto medio</p>
                    <p className="font-mono text-sm font-bold text-violet-900 mt-1">
                      {segmentoDetalle.centroid.spending_score.toFixed(1)} / 100
                    </p>
                  </div>
                </div>
              </div>

              {/* Rangos observados */}
              {segmentoDetalle.ranges && (
                <div className="space-y-2">
                  <h5 className="font-semibold text-foreground text-xs uppercase tracking-wider">Rangos de Concentración</h5>
                  <div className="space-y-1.5 rounded-md border border-border p-3 bg-card">
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Edad observada:</span>
                      <span className="font-mono font-medium">
                        {segmentoDetalle.ranges.age.min} a {segmentoDetalle.ranges.age.max} años
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Ingreso anual:</span>
                      <span className="font-mono font-medium">
                        {currFmt.format(segmentoDetalle.ranges.annual_income_k.min * 1000)} a {currFmt.format(segmentoDetalle.ranges.annual_income_k.max * 1000)} USD
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-muted-foreground">Spending Score:</span>
                      <span className="font-mono font-medium">
                        {segmentoDetalle.ranges.spending_score.min} a {segmentoDetalle.ranges.spending_score.max} pts
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Productos sugeridos */}
              <div className="space-y-2">
                <h5 className="font-semibold text-foreground text-xs uppercase tracking-wider">Estrategia Comercial y Productos</h5>
                <div className="space-y-1.5">
                  {segmentoDetalle.suggested_actions.map((act, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-md border border-border bg-card">
                      <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span className="text-foreground">{act}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dato descriptivo sexo */}
              <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-2.5 text-amber-900">
                <p className="text-[11px] leading-relaxed">
                  <strong>Composición por género:</strong> {segmentoDetalle.female_pct.toFixed(1)}% mujeres en este perfil.
                  Recordatorio de cumplimiento normativo: el sexo no interviene en el agrupamiento matemático.
                </p>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
