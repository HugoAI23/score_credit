// Pantalla de Información y Gobernanza del Modelo
// Muestra versión, fecha de calibración, algoritmo y variables,
// curvas de inercia (codo) y coeficiente de silueta con k=5 resaltado,
// tablas alternativas de datos y explicación metodológica accesible sin jerga de ML.
import { useState, useEffect, useMemo } from "react"
import { api, type ModelInfo } from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { BarChart } from "@/components/charts/bar-chart"
import { Bar } from "@/components/charts/bar"
import { BarXAxis } from "@/components/charts/bar-x-axis"
import { BarYAxis } from "@/components/charts/bar-y-axis"
import { Grid } from "@/components/charts/grid"
import { ChartTooltip } from "@/components/charts/tooltip"
import {
  Cpu,
  TrendingDown,
  Sparkles,
  Calendar,
  Layers,
  HelpCircle,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
} from "lucide-react"

const numFmt = new Intl.NumberFormat("es-MX")

export default function Modelo() {
  const reducido = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  )
  const duracionGraficas = reducido ? 0 : 700

  const [modelo, setModelo] = useState<ModelInfo | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargarModelo = async () => {
    setCargando(true)
    setError(null)
    try {
      const res = await api.model()
      setModelo(res.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al conectar con la API")
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargarModelo()
  }, [])

  // Datos para gráfico de Inercia resaltando k actual (k=5)
  const datosInercia = useMemo(() => {
    if (!modelo?.elbow) return []
    return modelo.elbow.map((e) => ({
      k: String(e.k),
      inercia_otros: e.k === modelo.k ? 0 : Number(e.inertia.toFixed(1)),
      inercia_actual: e.k === modelo.k ? Number(e.inertia.toFixed(1)) : 0,
      inercia_total: Number(e.inertia.toFixed(1)),
    }))
  }, [modelo])

  // Datos para gráfico de Silueta resaltando k actual (k=5)
  const datosSilueta = useMemo(() => {
    if (!modelo?.elbow) return []
    return modelo.elbow
      .filter((e) => e.silhouette !== null)
      .map((e) => ({
        k: String(e.k),
        silueta_otros: e.k === modelo.k ? 0 : Number((e.silhouette as number).toFixed(3)),
        silueta_actual: e.k === modelo.k ? Number((e.silhouette as number).toFixed(3)) : 0,
        silueta_total: Number((e.silhouette as number).toFixed(3)),
      }))
  }, [modelo])

  // Formato de fecha de entrenamiento
  const fechaEntrenamiento = useMemo(() => {
    if (!modelo?.trained_at) return "—"
    try {
      const d = new Date(modelo.trained_at)
      return new Intl.DateTimeFormat("es-MX", {
        dateStyle: "long",
        timeStyle: "short",
      }).format(d)
    } catch {
      return modelo.trained_at
    }
  }, [modelo])

  if (cargando) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
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

  if (error || !modelo) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertTitle>No se pudo cargar la información del modelo</AlertTitle>
          <AlertDescription className="mt-1">{error || "Servicio no disponible"}</AlertDescription>
        </Alert>
        <Button onClick={cargarModelo} variant="outline" className="gap-2">
          <RefreshCw className="size-4" />
          Reintentar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-violet-900">Gobernanza y Ficha del Modelo</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Especificaciones matemáticas, variables de entrada y validación estadística del agrupador.
          </p>
        </div>
        <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 gap-1 px-3 py-1">
          <CheckCircle2 className="size-3.5 text-emerald-600" />
          Modelo en Producción v{modelo.model_version}
        </Badge>
      </div>

      {/* Tarjetas informativas de versión y metadatos */}
      <section aria-label="Metadatos principales del modelo" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-2xs border-border">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Versión del Modelo</span>
              <Cpu className="size-4 text-violet-700" />
            </div>
            <p className="mt-2 text-xl font-bold font-mono text-violet-900">v{modelo.model_version}</p>
            <p className="text-xs text-muted-foreground mt-0.5">K-Means con StandardScaler</p>
          </CardContent>
        </Card>

        <Card className="shadow-2xs border-border">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Segmentos Óptimos</span>
              <Layers className="size-4 text-emerald-700" />
            </div>
            <p className="mt-2 text-xl font-bold font-mono text-violet-900">k = {modelo.k}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Determinado por método del codo</p>
          </CardContent>
        </Card>

        <Card className="shadow-2xs border-border">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Fecha de Calibración</span>
              <Calendar className="size-4 text-amber-700" />
            </div>
            <p className="mt-2 text-sm font-semibold text-foreground truncate" title={fechaEntrenamiento}>
              {fechaEntrenamiento}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{modelo.n_training_samples} clientes calibrados</p>
          </CardContent>
        </Card>

        <Card className="shadow-2xs border-border">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">Coeficiente de Silueta</span>
              <Sparkles className="size-4 text-violet-500" />
            </div>
            <p className="mt-2 text-xl font-bold font-mono text-violet-900">
              {modelo.metrics.silhouette.toFixed(4)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Inercia: {modelo.metrics.inertia.toFixed(1)}</p>
          </CardContent>
        </Card>
      </section>

      {/* Explicación ejecutiva sin jerga técnica */}
      <Card className="shadow-xs border-border bg-violet-50/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-violet-950">
            <HelpCircle className="size-4 text-violet-700" />
            ¿Cómo funciona este modelo de segmentación?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs leading-relaxed text-violet-950">
          <p>
            <strong>1. Agrupación por afinidad financiera:</strong> El sistema analiza simultáneamente la edad del titular,
            su volumen de ingresos anuales y sus hábitos de consumo para agrupar a los clientes en perfiles comerciales homogéneos.
          </p>
          <p>
            <strong>2. Asignación matemática objetiva:</strong> Cuando se evalúa un cliente nuevo, se calcula matemáticamente
            a qué grupo se parece más y se le asigna de manera automática el perfil más cercano.
          </p>
          <p>
            <strong>3. Sin sesgo ni discriminación:</strong> El modelo no utiliza el sexo ni atributos sociodemográficos sensibles;
            únicamente procesa los tres factores económicos y transaccionales definidos.
          </p>
          <p>
            <strong>4. Uso comercial y asesoría, no crediticio:</strong> Esta herramienta está diseñada para personalizar ofertas
            de tarjetas y programas de fidelidad. No constituye bajo ninguna circunstancia una aprobación o rechazo de crédito bancario.
          </p>
          <p>
            <strong>5. Calibración periódica:</strong> Los perfiles se reentrenan y actualizan periódicamente para adaptarse
            a la evolución natural de la cartera de clientes del banco.
          </p>
        </CardContent>
      </Card>

      {/* Variables consideradas por el modelo */}
      <Card className="shadow-xs border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-700" />
            Variables de Entrada del Algoritmo
          </CardTitle>
          <CardDescription className="text-xs">
            Parámetros utilizados activamente por el pipeline matemático.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {modelo.features.map((f) => (
              <div key={f.name} className="p-3.5 rounded-lg border border-border bg-card space-y-1.5 shadow-2xs">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-foreground text-xs">{f.label}</span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {f.name}
                  </Badge>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground pt-1">
                  <div className="flex justify-between">
                    <span>Rango aceptado:</span>
                    <span className="font-mono text-foreground">{f.validation.min} a {f.validation.max}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rango de entrenamiento:</span>
                    <span className="font-mono text-foreground">{f.training_range.min} a {f.training_range.max}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Media ± Desv:</span>
                    <span className="font-mono text-foreground">{f.training_range.mean.toFixed(1)} ± {f.training_range.std.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-900">
            <p>
              <strong>Aclaración de auditoría:</strong> La variable <em>Sexo (Gender)</em> se encuentra registrada en los
              sistemas bancarios pero <u>ha sido excluida deliberadamente del modelo</u> para garantizar total equidad algorítmica.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Gráficas de validación técnica: Inercia y Silueta */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Curva del Codo (Inercia por k) */}
        <Card className="shadow-xs border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingDown className="size-4 text-violet-700" />
                Inercia según Número de Grupos (k = 1 a 15)
              </CardTitle>
              <Badge className="bg-violet-900 text-white text-[11px]">
                k = {modelo.k} (Actual)
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Mide la dispersión interna de los grupos. La barra resaltada en morado oscuro corresponde a la configuración activa (k = 5).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className="w-full overflow-hidden"
              role="img"
              aria-label="Gráfica de barras mostrando la curva del codo de inercia para k de 1 a 15 con k=5 resaltado"
            >
              {datosInercia.length > 0 && (
                <BarChart
                  data={datosInercia}
                  xDataKey="k"
                  stacked
                  aspectRatio="16 / 9"
                  animationDuration={duracionGraficas}
                >
                  <Grid horizontal />
                  <BarXAxis />
                  <BarYAxis />
                  <Bar dataKey="inercia_otros" fill="#C6B1EA" lineCap={3} animate={!reducido} />
                  <Bar dataKey="inercia_actual" fill="#4A1F8C" lineCap={3} animate={!reducido} />
                  <ChartTooltip showDatePill={false} />
                </BarChart>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs pt-1 text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-xs bg-[#4A1F8C]" />
                k seleccionado (k = 5, inercia: {modelo.metrics.inertia.toFixed(1)})
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-xs bg-[#C6B1EA]" />
                Otras opciones evaluadas
              </span>
            </div>

            <details className="text-xs text-muted-foreground pt-1">
              <summary className="cursor-pointer hover:text-foreground font-medium">Ver valores de inercia</summary>
              <table className="w-full mt-2 text-xs border-collapse">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1">k</th>
                    <th className="py-1 text-right">Inercia</th>
                    <th className="py-1 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {datosInercia.map((d) => (
                    <tr key={d.k} className="border-b last:border-0">
                      <td className="py-1 font-mono">k = {d.k}</td>
                      <td className="py-1 text-right font-mono tabular-nums">{numFmt.format(d.inercia_total)}</td>
                      <td className="py-1 text-right">
                        {d.k === String(modelo.k) ? (
                          <strong className="text-violet-900 font-semibold">Seleccionado</strong>
                        ) : (
                          <span className="text-muted-foreground">Evaluado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </CardContent>
        </Card>

        {/* Coeficiente de Silueta por k */}
        <Card className="shadow-xs border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="size-4 text-emerald-700" />
                Coeficiente de Silueta (k = 2 a 15)
              </CardTitle>
              <Badge variant="outline" className="text-[11px] font-mono">
                Silueta k={modelo.k}: {modelo.metrics.silhouette.toFixed(4)}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Mide la separación entre grupos (valores más altos indican perfiles más diferenciados).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className="w-full overflow-hidden"
              role="img"
              aria-label="Gráfica de barras con el coeficiente de silueta para k de 2 a 15 con k=5 resaltado"
            >
              {datosSilueta.length > 0 && (
                <BarChart
                  data={datosSilueta}
                  xDataKey="k"
                  stacked
                  aspectRatio="16 / 9"
                  animationDuration={duracionGraficas}
                >
                  <Grid horizontal />
                  <BarXAxis />
                  <BarYAxis />
                  <Bar dataKey="silueta_otros" fill="#C6B1EA" lineCap={3} animate={!reducido} />
                  <Bar dataKey="silueta_actual" fill="#1B7F79" lineCap={3} animate={!reducido} />
                  <ChartTooltip showDatePill={false} />
                </BarChart>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs pt-1 text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-xs bg-[#1B7F79]" />
                k seleccionado (k = 5, silueta: {modelo.metrics.silhouette.toFixed(4)})
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-xs bg-[#C6B1EA]" />
                Otras opciones evaluadas
              </span>
            </div>

            <details className="text-xs text-muted-foreground pt-1">
              <summary className="cursor-pointer hover:text-foreground font-medium">Ver valores de silueta</summary>
              <table className="w-full mt-2 text-xs border-collapse">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1">k</th>
                    <th className="py-1 text-right">Silueta</th>
                    <th className="py-1 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {datosSilueta.map((d) => (
                    <tr key={d.k} className="border-b last:border-0">
                      <td className="py-1 font-mono">k = {d.k}</td>
                      <td className="py-1 text-right font-mono tabular-nums">{d.silueta_total.toFixed(4)}</td>
                      <td className="py-1 text-right">
                        {d.k === String(modelo.k) ? (
                          <strong className="text-emerald-800 font-semibold">Seleccionado</strong>
                        ) : (
                          <span className="text-muted-foreground">Evaluado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
