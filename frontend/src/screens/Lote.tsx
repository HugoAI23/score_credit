// Pantalla de Carga y Evaluación por Lote (Batch Prediction)
// Permite importar hasta 1000 registros mediante CSV o archivo de texto,
// previsualizarlos en el navegador, procesarlos en POST /predict/batch,
// visualizar la distribución en RingChart, revisar resultados y motivos de rechazo,
// y exportar los resultados procesados al portapapeles en formato CSV.
import { useState, useMemo, useRef, type ChangeEvent } from "react"
import {
  api,
  type BatchCustomerInput,
  type BatchResponse,
} from "@/lib/api"
import { colorFor } from "@/lib/segment-colors"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { RingChart } from "@/components/charts/ring-chart"
import { Ring } from "@/components/charts/ring"
import { RingCenter } from "@/components/charts/ring-center"
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  FileText,
  RefreshCw,
  PieChart,
} from "lucide-react"

const CSV_EJEMPLO = `customer_ref,age,annual_income_k,spending_score
CLI-001,32,90,85
CLI-002,10,60,50
CLI-003,45,40,30`

export default function Lote() {
  const reducido = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  )
  const duracionGraficas = reducido ? 0 : 700

  const [textoCsv, setTextoCsv] = useState("")
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null)
  const [respuestaLote, setRespuestaLote] = useState<BatchResponse | null>(null)
  const [copiado, setCopiado] = useState(false)

  const inputFileRef = useRef<HTMLInputElement>(null)

  // Parseo del texto CSV en el cliente
  const filasParseadas = useMemo<BatchCustomerInput[]>(() => {
    if (!textoCsv.trim()) return []

    const lineas = textoCsv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    if (lineas.length === 0) return []

    // Detectar si la primera fila es encabezado
    let inicio = 0
    const primeraLinea = lineas[0].toLowerCase()
    if (primeraLinea.includes("age") || primeraLinea.includes("edad") || primeraLinea.includes("customer")) {
      inicio = 1
    }

    const registros: BatchCustomerInput[] = []
    for (let i = inicio; i < lineas.length; i++) {
      const separador = lineas[i].includes(";") ? ";" : ","
      const partes = lineas[i].split(separador).map((p) => p.trim())
      if (partes.length < 3) continue

      if (partes.length === 3) {
        // age, annual_income_k, spending_score
        registros.push({
          customer_ref: `Fila-${i + 1}`,
          age: partes[0],
          annual_income_k: partes[1],
          spending_score: partes[2],
        })
      } else {
        // customer_ref, age, annual_income_k, spending_score
        registros.push({
          customer_ref: partes[0] || `Fila-${i + 1}`,
          age: partes[1],
          annual_income_k: partes[2],
          spending_score: partes[3],
        })
      }
    }

    return registros.slice(0, 1000) // Límite de 1000 filas
  }, [textoCsv])

  // Carga de archivo desde el disco
  const manejarArchivo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setNombreArchivo(file.name)
    const lector = new FileReader()
    lector.onload = (evento) => {
      const contenido = (evento.target?.result as string) || ""
      setTextoCsv(contenido)
    }
    lector.readAsText(file)
  }

  // Cargar ejemplo predeterminado
  const cargarEjemplo = () => {
    setTextoCsv(CSV_EJEMPLO)
    setNombreArchivo("ejemplo_3_clientes.csv")
    setRespuestaLote(null)
    setErrorGlobal(null)
  }

  // Limpiar campos
  const limpiar = () => {
    setTextoCsv("")
    setNombreArchivo(null)
    setRespuestaLote(null)
    setErrorGlobal(null)
    if (inputFileRef.current) inputFileRef.current.value = ""
  }

  // Envío a POST /predict/batch
  const ejecutarLote = async () => {
    if (filasParseadas.length === 0) {
      setErrorGlobal("No hay filas válidas para enviar.")
      return
    }

    setProcesando(true)
    setErrorGlobal(null)
    try {
      const res = await api.predictBatch(filasParseadas)
      setRespuestaLote(res.data)
    } catch (e) {
      setErrorGlobal(e instanceof Error ? e.message : "Error inesperado al procesar el lote.")
    } finally {
      setProcesando(false)
    }
  }

  // Copiar resultados procesados como CSV al portapapeles
  const copiarCsvResultados = () => {
    if (!respuestaLote || respuestaLote.results.length === 0) return

    const encabezados = "customer_ref,age,annual_income_k,spending_score,segment_id,segment_name,clarity"
    const filas = respuestaLote.results.map((r) => {
      const claridad = Math.round(r.assignment_margin * 100)
      return `${r.customer_ref ?? ""},${r.input.age},${r.input.annual_income_k},${r.input.spending_score},${r.segment.id},"${r.segment.name}",${claridad}`
    })

    const contenido = [encabezados, ...filas].join("\n")
    void navigator.clipboard.writeText(contenido)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  // Datos para RingChart del resumen de segmentos
  const datosAnillosLote = useMemo(() => {
    if (!respuestaLote?.summary?.by_segment) return []
    const total = respuestaLote.summary.processed || 1
    return Object.entries(respuestaLote.summary.by_segment).map(([segNombre, count]) => ({
      label: segNombre,
      value: count,
      maxValue: total,
      color: colorFor(segNombre),
    }))
  }, [respuestaLote])

  return (
    <div className="space-y-8">
      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-violet-900">Carga por Lote</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Clasificación masiva de cartera mediante CSV (hasta 1,000 registros simultáneos).
        </p>
      </div>

      {/* Entrada de datos */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        <Card className="lg:col-span-7 shadow-xs border-border">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="size-4 text-violet-700" />
                Ingreso de Datos CSV
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button onClick={cargarEjemplo} variant="outline" size="xs" className="text-xs">
                  Cargar ejemplo de prueba
                </Button>
                {textoCsv && (
                  <Button onClick={limpiar} variant="ghost" size="xs" className="text-xs text-muted-foreground">
                    Limpiar
                  </Button>
                )}
              </div>
            </div>
            <CardDescription className="text-xs">
              Formato: <code>customer_ref,age,annual_income_k,spending_score</code> (la primera columna de referencia es opcional).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Selector de archivo */}
            <div className="flex items-center gap-3">
              <input
                ref={inputFileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={manejarArchivo}
                className="hidden"
                id="file-upload"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => inputFileRef.current?.click()}
                className="gap-2 text-xs"
              >
                <UploadCloud className="size-4 text-violet-700" />
                {nombreArchivo ? "Cambiar archivo" : "Cargar archivo .csv"}
              </Button>
              {nombreArchivo && (
                <span className="text-xs font-mono text-muted-foreground truncate max-w-xs">
                  {nombreArchivo}
                </span>
              )}
            </div>

            {/* Textarea para pegar o editar directamente */}
            <div className="space-y-1.5">
              <label htmlFor="csv-input" className="text-xs font-medium text-muted-foreground">
                O pega el contenido en texto:
              </label>
              <textarea
                id="csv-input"
                rows={7}
                value={textoCsv}
                onChange={(e) => setTextoCsv(e.target.value)}
                placeholder={"customer_ref,age,annual_income_k,spending_score\nCLI-001,32,90,85\nCLI-002,10,60,50"}
                className="w-full rounded-md border border-input bg-card p-3 font-mono text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {errorGlobal && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle className="text-xs font-semibold">Error al procesar el lote</AlertTitle>
                <AlertDescription className="text-xs">{errorGlobal}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted-foreground font-mono">
                {filasParseadas.length} {filasParseadas.length === 1 ? "registro detectado" : "registros detectados"} (máx. 1000)
              </span>
              <Button
                onClick={() => void ejecutarLote()}
                disabled={procesando || filasParseadas.length === 0}
                className="bg-violet-700 hover:bg-violet-900 text-white text-xs font-medium px-4"
              >
                {procesando ? (
                  <>
                    <RefreshCw className="size-3.5 mr-1.5 animate-spin" />
                    Procesando lote…
                  </>
                ) : (
                  `Evaluar ${filasParseadas.length} ${filasParseadas.length === 1 ? "cliente" : "clientes"}`
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Resumen del Lote o Vista Previa */}
        <div className="lg:col-span-5 space-y-4">
          {respuestaLote ? (
            <Card className="shadow-xs border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <PieChart className="size-4 text-violet-700" />
                  Resumen de Procesamiento
                </CardTitle>
                <CardDescription className="text-xs">
                  Balance de registros evaluados exitosamente y rechazados.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* KPIs de lote */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 rounded-md border border-border bg-muted/30">
                    <p className="text-[11px] text-muted-foreground">Recibidos</p>
                    <p className="text-lg font-bold font-mono text-foreground mt-0.5">
                      {respuestaLote.summary.received}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-md border border-emerald-500/20 bg-emerald-500/10">
                    <p className="text-[11px] text-emerald-800">Clasificados</p>
                    <p className="text-lg font-bold font-mono text-emerald-900 mt-0.5">
                      {respuestaLote.summary.processed}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-md border border-destructive/20 bg-destructive/10">
                    <p className="text-[11px] text-destructive">Rechazados</p>
                    <p className="text-lg font-bold font-mono text-destructive mt-0.5">
                      {respuestaLote.summary.rejected}
                    </p>
                  </div>
                </div>

                {/* Gráfica de Anillos con la distribución del lote */}
                {datosAnillosLote.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="flex justify-center" role="img" aria-label="Distribución de segmentos en el lote procesado">
                      <RingChart data={datosAnillosLote} size={180} strokeWidth={10} animationDuration={duracionGraficas}>
                        {datosAnillosLote.map((d, i) => (
                          <Ring key={d.label} index={i} color={d.color} />
                        ))}
                        <RingCenter defaultLabel="Lote" />
                      </RingChart>
                    </div>

                    <div className="flex flex-wrap justify-center gap-2 text-xs">
                      {Object.entries(respuestaLote.summary.by_segment).map(([seg, cnt]) => (
                        <span key={seg} className="inline-flex items-center gap-1.5 bg-muted px-2 py-0.5 rounded-xs font-medium">
                          <span className="size-2 rounded-xs" style={{ backgroundColor: colorFor(seg) }} />
                          {seg}: <strong className="font-mono">{cnt}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : filasParseadas.length > 0 ? (
            /* Vista previa de los datos parseados */
            <Card className="shadow-xs border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Vista Previa de Filas ({filasParseadas.length})</CardTitle>
                <CardDescription className="text-xs">
                  Revisa que los datos correspondan a las columnas esperadas antes de enviar.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto max-h-60 rounded-md border border-border">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/50 text-muted-foreground border-b border-border text-left">
                        <th className="p-2 font-semibold">Ref</th>
                        <th className="p-2 font-semibold">Edad</th>
                        <th className="p-2 font-semibold">Ingreso (k$)</th>
                        <th className="p-2 font-semibold">Gasto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filasParseadas.slice(0, 10).map((f, i) => (
                        <tr key={i} className="border-b border-border/50 font-mono text-[11px] last:border-0">
                          <td className="p-2 text-foreground font-medium">{f.customer_ref}</td>
                          <td className="p-2">{f.age}</td>
                          <td className="p-2">{f.annual_income_k}</td>
                          <td className="p-2">{f.spending_score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filasParseadas.length > 10 && (
                  <p className="text-[11px] text-muted-foreground mt-2 text-center">
                    Mostrando las primeras 10 de {filasParseadas.length} filas.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed border-2 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <FileText className="size-8 mb-2 opacity-30" />
              <p className="text-xs font-medium">Carga o pega un archivo CSV para visualizar el resumen.</p>
            </Card>
          )}
        </div>
      </div>

      {/* Tablas de Resultados y Rechazos */}
      {respuestaLote && (
        <div className="space-y-6">
          {/* Tabla de Clientes Clasificados con Éxito */}
          {respuestaLote.results.length > 0 && (
            <Card className="shadow-xs border-border">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-600" />
                      Clientes Clasificados Exitosamente ({respuestaLote.results.length})
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Resultados individuales con asignación de perfil, índice de claridad y acciones comerciales.
                    </CardDescription>
                  </div>
                  <Button
                    onClick={copiarCsvResultados}
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs text-violet-900 border-violet-300 hover:bg-violet-50"
                  >
                    {copiado ? (
                      <>
                        <Check className="size-3.5 text-emerald-600" />
                        ¡Copiado al portapapeles!
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" />
                        Copiar resultados como CSV
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/40 text-muted-foreground border-b border-border text-left">
                        <th scope="col" className="py-2.5 px-3 font-semibold">Ref</th>
                        <th scope="col" className="py-2.5 px-3 font-semibold text-right">Edad</th>
                        <th scope="col" className="py-2.5 px-3 font-semibold text-right">Ingreso (k$)</th>
                        <th scope="col" className="py-2.5 px-3 font-semibold text-right">Gasto</th>
                        <th scope="col" className="py-2.5 px-3 font-semibold">Perfil Asignado</th>
                        <th scope="col" className="py-2.5 px-3 font-semibold text-right">Claridad</th>
                        <th scope="col" className="py-2.5 px-3 font-semibold">Acciones Recomendadas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {respuestaLote.results.map((r) => {
                        const claridad = Math.round(r.assignment_margin * 100)
                        const segNombre = r.segment.name
                        return (
                          <tr key={r.index} className="border-b border-border/50 hover:bg-muted/40">
                            <td className="py-2 px-3 font-mono font-medium text-foreground">{r.customer_ref ?? `#${r.index}`}</td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums">{r.input.age}</td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums">${r.input.annual_income_k}k</td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums">{r.input.spending_score}</td>
                            <td className="py-2 px-3 font-semibold">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="size-2 rounded-xs shrink-0" style={{ backgroundColor: colorFor(segNombre) }} />
                                {segNombre}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums font-medium text-violet-900">
                              {claridad} / 100
                            </td>
                            <td className="py-2 px-3 text-muted-foreground truncate max-w-xs">
                              {r.segment.suggested_actions.join(", ")}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabla de Registros Rechazados */}
          {respuestaLote.errors.length > 0 && (
            <Card className="shadow-xs border-destructive/30 bg-destructive/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-destructive flex items-center gap-2">
                  <AlertCircle className="size-4" />
                  Registros Rechazados ({respuestaLote.errors.length})
                </CardTitle>
                <CardDescription className="text-xs">
                  Filas que no pudieron clasificarse debido a valores fuera de rango o formato erróneo.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border border-destructive/20 bg-card">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-destructive/10 text-destructive border-b border-destructive/20 text-left">
                        <th scope="col" className="py-2 px-3 font-semibold">Fila</th>
                        <th scope="col" className="py-2 px-3 font-semibold">Referencia</th>
                        <th scope="col" className="py-2 px-3 font-semibold">Campo Afectado</th>
                        <th scope="col" className="py-2 px-3 font-semibold">Motivo del Rechazo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {respuestaLote.errors.map((e) => (
                        <tr key={e.index} className="border-b border-destructive/10 last:border-0">
                          <td className="py-2 px-3 font-mono text-muted-foreground">{e.index + 1}</td>
                          <td className="py-2 px-3 font-mono font-medium text-foreground">{e.customer_ref ?? "—"}</td>
                          <td className="py-2 px-3 font-mono text-destructive font-medium">
                            {e.errors.map((err) => err.field).filter(Boolean).join(", ") || "General"}
                          </td>
                          <td className="py-2 px-3 text-destructive">
                            {e.errors.map((err) => err.message).join("; ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
