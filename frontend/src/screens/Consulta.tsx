// Pantalla de Consulta Individual de Cliente
// Permite a los ejecutivos bancarios ingresar edad, ingreso y score de gasto para
// obtener el perfil asignado, nivel de claridad y productos sugeridos.
import { useState, useMemo, useEffect, useRef, type FormEvent } from "react"
import { animate } from "animejs"
import { api, ApiError, type Feature, type Prediction } from "@/lib/api"
import { colorFor } from "@/lib/segment-colors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Gauge } from "@/components/charts/gauge"
import { BarChart } from "@/components/charts/bar-chart"
import { Bar } from "@/components/charts/bar"
import { BarXAxis } from "@/components/charts/bar-x-axis"
import { BarYAxis } from "@/components/charts/bar-y-axis"
import { Grid } from "@/components/charts/grid"
import { ChartTooltip } from "@/components/charts/tooltip"
import { AlertTriangle, CheckCircle2, CreditCard, Sparkles, UserCheck } from "lucide-react"

// Formato de números con localización de México
const numFmt = new Intl.NumberFormat("es-MX")

interface FormValores {
  age: string
  annual_income_k: string
  spending_score: string
}

type FormErrores = Partial<Record<Feature, string>>

export default function Consulta() {
  const reducido = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, [])
  const duracionGraficas = reducido ? 0 : 700

  // Estado del formulario
  const [valores, setValores] = useState<FormValores>({
    age: "32",
    annual_income_k: "90",
    spending_score: "85",
  })
  const [errores, setErrores] = useState<FormErrores>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [prediccion, setPrediccion] = useState<Prediction | null>(null)

  const refResultado = useRef<HTMLDivElement>(null)

  // Validación en el cliente según rangos aceptados en API.md
  function validarCliente(v: FormValores): FormErrores {
    const errs: FormErrores = {}
    const edad = Number(v.age.trim())
    const ingreso = Number(v.annual_income_k.trim())
    const gasto = Number(v.spending_score.trim())

    if (v.age.trim() === "") errs.age = "Edad es obligatoria."
    else if (!Number.isFinite(edad)) errs.age = "Edad debe ser un número."
    else if (edad < 18 || edad > 100) errs.age = "Edad debe estar entre 18 y 100."

    if (v.annual_income_k.trim() === "") errs.annual_income_k = "Ingreso anual es obligatorio."
    else if (!Number.isFinite(ingreso)) errs.annual_income_k = "Ingreso anual (miles de USD) debe ser numérico."
    else if (ingreso < 1 || ingreso > 1000) errs.annual_income_k = "Ingreso debe estar entre 1 y 1000."

    if (v.spending_score.trim() === "") errs.spending_score = "Spending score es obligatorio."
    else if (!Number.isFinite(gasto)) errs.spending_score = "Spending score debe ser un número."
    else if (gasto < 1 || gasto > 100) errs.spending_score = "Spending score debe estar entre 1 y 100."

    return errs
  }

  // Envío a la API para predecir segmento
  const evaluarCliente = async (e?: FormEvent) => {
    if (e) e.preventDefault()
    const errs = validarCliente(valores)
    setErrores(errs)
    setErrorGeneral(null)
    if (Object.keys(errs).length > 0) return

    setEnviando(true)
    try {
      const { data } = await api.predict({
        age: Number(valores.age),
        annual_income_k: Number(valores.annual_income_k),
        spending_score: Number(valores.spending_score),
      })
      setPrediccion(data)
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const delServidor: FormErrores = {}
        err.fields.forEach((f) => {
          if (f.field) delServidor[f.field as Feature] = f.message
        })
        setErrores(delServidor)
      } else {
        setErrorGeneral(err instanceof Error ? err.message : "Error inesperado al conectar con el servicio.")
      }
    } finally {
      setEnviando(false)
    }
  }

  // Carga inicial automática de ejemplo para que la vista no esté vacía
  useEffect(() => {
    void evaluarCliente()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Animación de entrada suave del resultado con anime.js
  useEffect(() => {
    if (reducido || !prediccion || !refResultado.current) return
    animate(refResultado.current, {
      opacity: [0, 1],
      y: [10, 0],
      duration: 350,
      ease: "outCubic",
    })
  }, [prediccion, reducido])

  // Datos calculados de claridad y distancias
  const claridad = prediccion ? Math.round(prediccion.assignment_margin * 100) : 0
  const colorSegmento = prediccion ? colorFor(prediccion.segment.name) : undefined

  // Categorización textual de la claridad de asignación
  const textoClaridad = useMemo(() => {
    if (!prediccion) return ""
    if (claridad >= 50) return "Clara"
    if (claridad >= 20) return "Moderada"
    const segundo = prediccion.distances[1]?.segment_name ?? "otro perfil"
    return `En frontera con ${segundo}`
  }, [prediccion, claridad])

  // Datos para el gráfico horizontal de distancias/similitud
  const datosDistancias = useMemo(() => {
    if (!prediccion) return []
    return prediccion.distances.map((d) => ({
      perfil: d.segment_name,
      distancia: Number(d.distance.toFixed(2)),
    }))
  }, [prediccion])

  return (
    <div className="space-y-6">
      {/* Título de la pantalla */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-violet-900">Consulta de Cliente</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Identificación de perfil comercial y recomendación de productos para un cliente individual.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Formulario de entrada */}
        <Card className="lg:col-span-5 shadow-xs border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserCheck className="size-4 text-violet-700" />
              Datos del Cliente
            </CardTitle>
            <CardDescription>
              Introduce los 3 atributos financieros básicos del cliente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={evaluarCliente} noValidate className="space-y-4">
              {/* Campo: Edad */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label htmlFor="age" className="text-xs font-semibold">Edad</Label>
                  <span className="text-xs text-muted-foreground">18 – 100 años</span>
                </div>
                <Input
                  id="age"
                  type="number"
                  min={18}
                  max={100}
                  inputMode="numeric"
                  value={valores.age}
                  onChange={(e) => setValores((prev) => ({ ...prev, age: e.target.value }))}
                  aria-invalid={!!errores.age}
                  aria-describedby="age-ayuda age-error"
                  className="font-mono tabular-nums"
                  placeholder="Ej. 35"
                />
                <p id="age-ayuda" className="text-xs text-muted-foreground">Edad cumplida del titular.</p>
                {errores.age && (
                  <p id="age-error" className="text-xs text-destructive font-medium" role="alert">
                    {errores.age}
                  </p>
                )}
              </div>

              {/* Campo: Ingreso Anual */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label htmlFor="annual_income_k" className="text-xs font-semibold">
                    Ingreso Anual (miles de USD)
                  </Label>
                  <span className="text-xs text-muted-foreground">1 – 1000 k$</span>
                </div>
                <Input
                  id="annual_income_k"
                  type="number"
                  min={1}
                  max={1000}
                  step="any"
                  inputMode="decimal"
                  value={valores.annual_income_k}
                  onChange={(e) => setValores((prev) => ({ ...prev, annual_income_k: e.target.value }))}
                  aria-invalid={!!errores.annual_income_k}
                  aria-describedby="income-ayuda income-error"
                  className="font-mono tabular-nums"
                  placeholder="Ej. 60"
                />
                <p id="income-ayuda" className="text-xs text-muted-foreground">
                  60 equivale a 60,000 USD anuales.
                </p>
                {errores.annual_income_k && (
                  <p id="income-error" className="text-xs text-destructive font-medium" role="alert">
                    {errores.annual_income_k}
                  </p>
                )}
              </div>

              {/* Campo: Spending Score sincronizado con Slider */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="spending_score" className="text-xs font-semibold">
                    Puntuación de Gasto (Spending Score)
                  </Label>
                  <span className="text-xs font-mono font-medium text-violet-700">
                    {valores.spending_score || 0} / 100
                  </span>
                </div>
                <Input
                  id="spending_score"
                  type="number"
                  min={1}
                  max={100}
                  inputMode="numeric"
                  value={valores.spending_score}
                  onChange={(e) => setValores((prev) => ({ ...prev, spending_score: e.target.value }))}
                  aria-invalid={!!errores.spending_score}
                  aria-describedby="spending-ayuda spending-error"
                  className="font-mono tabular-nums"
                  placeholder="1 a 100"
                />
                <Slider
                  min={1}
                  max={100}
                  step={1}
                  value={Number(valores.spending_score) || 1}
                  onValueChange={(val) => {
                    const num = Array.isArray(val) ? val[0] : val
                    setValores((prev) => ({ ...prev, spending_score: String(num) }))
                  }}
                  aria-label="Ajustar puntuación de gasto"
                  className="pt-1"
                />
                <p id="spending-ayuda" className="text-xs text-muted-foreground">
                  Índice de 1 a 100 asignado por transaccionalidad con tarjeta bancaria.
                </p>
                {errores.spending_score && (
                  <p id="spending-error" className="text-xs text-destructive font-medium" role="alert">
                    {errores.spending_score}
                  </p>
                )}
              </div>

              {errorGeneral && (
                <Alert variant="destructive">
                  <AlertTitle>No se pudo evaluar el cliente</AlertTitle>
                  <AlertDescription>{errorGeneral}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                disabled={enviando}
                className="w-full bg-violet-700 hover:bg-violet-900 text-white font-medium"
              >
                {enviando ? "Evaluando cliente…" : "Consultar perfil de cliente"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Panel de resultados */}
        <div className="lg:col-span-7 space-y-6" aria-live="polite">
          {prediccion ? (
            <div ref={refResultado} className="space-y-6">
              {/* Tarjeta principal con Segmento y Gauge */}
              <Card className="shadow-xs border-border overflow-hidden">
                <div
                  className="h-1.5 w-full"
                  style={{ backgroundColor: colorSegmento }}
                  aria-hidden="true"
                />
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="size-3.5 rounded-xs shrink-0"
                        style={{ backgroundColor: colorSegmento }}
                        aria-hidden="true"
                      />
                      <CardTitle className="text-xl text-foreground">
                        Perfil Asignado: <span className="text-violet-900 font-bold">{prediccion.segment.name}</span>
                      </CardTitle>
                    </div>
                    <Badge variant="outline" className="text-xs font-mono">
                      ID #{prediccion.segment.id}
                    </Badge>
                  </div>
                  <CardDescription className="text-sm pt-1">
                    {prediccion.segment.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-6 pt-2">
                  {/* Avisos de extrapolación */}
                  {prediccion.warnings && prediccion.warnings.length > 0 && (
                    <div className="space-y-2">
                      {prediccion.warnings.map((w, idx) => (
                        <Alert key={idx} className="bg-amber-500/10 border-amber-500/30 text-amber-950">
                          <AlertTriangle className="size-4 text-amber-600 shrink-0" />
                          <div className="ml-2">
                            <AlertTitle className="text-xs font-semibold text-amber-900">
                              Dato fuera del rango habitual
                            </AlertTitle>
                            <AlertDescription className="text-xs text-amber-800">
                              {w.message}
                            </AlertDescription>
                          </div>
                        </Alert>
                      ))}
                    </div>
                  )}

                  {/* Sección de Claridad con Gauge */}
                  <div className="rounded-lg border border-border bg-muted/30 p-4 flex flex-col sm:flex-row items-center gap-6">
                    <div className="w-48 shrink-0 flex justify-center" role="img" aria-label={`Claridad de asignación: ${claridad} de 100`}>
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
                    <div className="space-y-1.5 text-center sm:text-left">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Claridad de la asignación
                      </p>
                      <p className="text-lg font-semibold text-violet-900">
                        {claridad} / 100 — {textoClaridad}
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Indica la nitidez con la que el cliente pertenece a este perfil respecto al segundo más cercano.
                        Escala descriptiva de 0 a 100 (no es una probabilidad).
                      </p>
                    </div>
                  </div>

                  {/* Productos y Acciones Sugeridas */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-violet-900">
                      <CreditCard className="size-4" />
                      <h3>Oferta Comercial y Productos Sugeridos</h3>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {prediccion.segment.suggested_actions.map((accion, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2.5 rounded-md border border-border bg-card p-3 text-xs shadow-2xs"
                        >
                          <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                          <span className="text-foreground font-medium">{accion}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Gráfico de similitud / distancias */}
              <Card className="shadow-xs border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="size-4 text-violet-700" />
                    Afinidad con Todos los Perfiles de la Cartera
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Distancia euclidiana normalizada al centroide de cada perfil. Una barra más corta indica mayor similitud.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div
                    className="w-full overflow-hidden"
                    role="img"
                    aria-label="Gráfica de barras horizontales mostrando la distancia del cliente con cada uno de los 5 segmentos"
                  >
                    <BarChart
                      data={datosDistancias}
                      xDataKey="perfil"
                      orientation="horizontal"
                      aspectRatio="16 / 9"
                      animationDuration={duracionGraficas}
                    >
                      <Grid vertical />
                      <Bar dataKey="distancia" fill="var(--chart-line-primary)" lineCap={4} animate={!reducido} />
                      <BarXAxis />
                      <BarYAxis />
                      <ChartTooltip showDatePill={false} />
                    </BarChart>
                  </div>

                  {/* Tabla accesible alternativa */}
                  <details className="text-xs text-muted-foreground pt-1">
                    <summary className="cursor-pointer hover:text-foreground font-medium">
                      Ver distancias en formato de tabla
                    </summary>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full border-collapse border-b text-xs">
                        <thead>
                          <tr className="border-b text-muted-foreground text-left">
                            <th scope="col" className="py-1.5 pr-4 font-semibold">Perfil</th>
                            <th scope="col" className="py-1.5 text-right font-semibold">Distancia (desv. est.)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {datosDistancias.map((d) => (
                            <tr key={d.perfil} className="border-b last:border-0">
                              <td className="py-1.5 pr-4">{d.perfil}</td>
                              <td className="py-1.5 text-right font-mono tabular-nums">{numFmt.format(d.distancia)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="border-dashed border-2 flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
              <UserCheck className="size-10 mb-2 opacity-30" />
              <p className="text-sm font-medium">Ingresa los datos y haz clic en "Consultar perfil"</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
