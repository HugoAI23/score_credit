// Layout principal de la aplicación bancaria
// Integra navegación lateral fija para escritorio, barra inferior para móvil,
// indicador de salud de la API en el encabezado y enrutamiento nativo por hash.
import { useState, useEffect, useMemo, useRef, type ReactNode } from "react"
import { animate } from "animejs"
import { api, type Health } from "@/lib/api"
import {
  UserCheck,
  Briefcase,
  UploadCloud,
  Cpu,
  Activity,
  RefreshCw,
  Building2,
} from "lucide-react"

export type Ruta = "consulta" | "cartera" | "lote" | "modelo" | "diagnostico"

interface NavItem {
  id: Ruta
  hash: string
  label: string
  descripcion: string
  icono: typeof UserCheck
}

const ITEMS_NAVEGACION: NavItem[] = [
  {
    id: "consulta",
    hash: "#/consulta",
    label: "Consulta de Cliente",
    descripcion: "Evaluación individual",
    icono: UserCheck,
  },
  {
    id: "cartera",
    hash: "#/cartera",
    label: "Cartera",
    descripcion: "Dashboard y distribución",
    icono: Briefcase,
  },
  {
    id: "lote",
    hash: "#/lote",
    label: "Carga por Lote",
    descripcion: "Evaluación masiva CSV",
    icono: UploadCloud,
  },
  {
    id: "modelo",
    hash: "#/modelo",
    label: "Modelo y Codo",
    descripcion: "Gobernanza y métricas",
    icono: Cpu,
  },
  {
    id: "diagnostico",
    hash: "#/diagnostico",
    label: "Diagnóstico",
    descripcion: "17 pruebas técnicas",
    icono: Activity,
  },
]

interface AppLayoutProps {
  rutaActual: Ruta
  onCambiarRuta: (r: Ruta) => void
  children: ReactNode
}

export function AppLayout({ rutaActual, onCambiarRuta, children }: AppLayoutProps) {
  const reducido = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  )

  const [salud, setSalud] = useState<Health | null>(null)
  const [comprobandoSalud, setComprobandoSalud] = useState(false)
  const [errorSalud, setErrorSalud] = useState(false)

  const refContenedorPantalla = useRef<HTMLDivElement>(null)

  // Verificación de estado de la API
  const verificarApi = async () => {
    setComprobandoSalud(true)
    setErrorSalud(false)
    try {
      const res = await api.health()
      setSalud(res.data)
    } catch {
      setErrorSalud(true)
    } finally {
      setComprobandoSalud(false)
    }
  }

  useEffect(() => {
    void verificarApi()
  }, [])

  // Animación de cambio de pantalla con anime.js
  useEffect(() => {
    if (reducido || !refContenedorPantalla.current) return
    animate(refContenedorPantalla.current, {
      opacity: [0.3, 1],
      y: [6, 0],
      duration: 250,
      ease: "outQuad",
    })
  }, [rutaActual, reducido])

  return (
    <div className="min-h-svh flex bg-[#FBFAFD] text-[#1D1030]">
      {/* ------------------------------------------------------------------ */}
      {/* Barra de Navegación Lateral Fija (Escritorio)                     */}
      {/* ------------------------------------------------------------------ */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-[#2A1250] text-white select-none fixed inset-y-0 left-0 z-30 shadow-md">
        {/* Identidad de la Institución */}
        <div className="p-5 border-b border-white/10 flex items-center gap-3">
          <div className="size-9 rounded-lg bg-white/10 flex items-center justify-center text-violet-200 shrink-0">
            <Building2 className="size-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-wide text-white">BANCO AUSTRAL</h2>
            <p className="text-[11px] text-violet-200/70 font-medium">Banca Privada · Segmentación</p>
          </div>
        </div>

        {/* Lista de navegación */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-violet-300/60 uppercase">
            Módulos del Sistema
          </p>
          {ITEMS_NAVEGACION.map((item) => {
            const activo = rutaActual === item.id
            const Icono = item.icono
            return (
              <a
                key={item.id}
                href={item.hash}
                onClick={(e) => {
                  e.preventDefault()
                  window.location.hash = item.hash
                  onCambiarRuta(item.id)
                }}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-md text-xs transition-colors ${
                  activo
                    ? "bg-[#6D3FC4] text-white font-semibold shadow-xs"
                    : "text-violet-100/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icono className={`size-4 shrink-0 ${activo ? "text-white" : "text-violet-300 group-hover:text-white"}`} />
                <div className="flex-1 min-w-0">
                  <p className="truncate">{item.label}</p>
                  <p className={`text-[10px] truncate ${activo ? "text-violet-200" : "text-violet-300/60"}`}>
                    {item.descripcion}
                  </p>
                </div>
              </a>
            )
          })}
        </nav>

        {/* Pie de navegación con estado del modelo */}
        <div className="p-4 border-t border-white/10 text-[11px] text-violet-200/70 space-y-1">
          <div className="flex justify-between items-center">
            <span>Modelo Activo:</span>
            <span className="font-mono text-white">v{salud?.model_version ?? "1.0.0"}</span>
          </div>
          <div className="flex justify-between items-center">
            <span>Segmentos:</span>
            <span className="font-mono text-white">k = {salud?.k ?? 5}</span>
          </div>
          <div className="pt-2 text-[10px] text-violet-300/50">
            Escuela de IA · Proyecto K-means
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* Contenedor Principal (con margen izquierdo para el sidebar)       */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 flex flex-col md:pl-64 min-w-0 pb-16 md:pb-6">
        {/* Encabezado Superior */}
        <header className="sticky top-0 z-20 h-14 bg-white/90 backdrop-blur-xs border-b border-[#E3DDEE] px-4 md:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="md:hidden font-bold text-sm text-violet-950 flex items-center gap-1.5">
              <Building2 className="size-4 text-violet-700" />
              Banco Austral
            </span>
            <span className="hidden md:inline text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Portal de Segmentación Comercial
            </span>
          </div>

          {/* Indicador de conexión con la API */}
          <div className="flex items-center gap-2 text-xs">
            {errorSalud ? (
              <div className="flex items-center gap-2 text-destructive bg-destructive/10 px-2.5 py-1 rounded-md">
                <span className="size-2 rounded-full bg-destructive animate-pulse" />
                <span className="font-medium">Sin conexión</span>
                <button
                  type="button"
                  onClick={() => void verificarApi()}
                  disabled={comprobandoSalud}
                  className="ml-1 hover:underline flex items-center gap-1 cursor-pointer"
                  title="Reintentar conexión"
                >
                  <RefreshCw className={`size-3 ${comprobandoSalud ? "animate-spin" : ""}`} />
                  Reintentar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                <span className="size-2 rounded-full bg-emerald-500" />
                <span className="font-medium">API Conectada</span>
                <span className="hidden sm:inline font-mono text-[11px] text-emerald-600">
                  (127.0.0.1:8000)
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Contenido Dinámico de la Pantalla */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
          <div ref={refContenedorPantalla} className="w-full">
            {children}
          </div>
        </main>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Barra de Navegación Inferior Fija (Móvil de 360 px a 767 px)       */}
      {/* ------------------------------------------------------------------ */}
      <nav
        aria-label="Navegación móvil"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#2A1250] text-white border-t border-white/10 shadow-lg px-2 py-1.5 flex items-center justify-around"
      >
        {ITEMS_NAVEGACION.map((item) => {
          const activo = rutaActual === item.id
          const Icono = item.icono
          return (
            <a
              key={item.id}
              href={item.hash}
              onClick={(e) => {
                e.preventDefault()
                window.location.hash = item.hash
                onCambiarRuta(item.id)
              }}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-sm text-[10px] transition-colors ${
                activo ? "text-violet-200 font-bold" : "text-violet-300/70 hover:text-white"
              }`}
            >
              <Icono className={`size-4 mb-0.5 ${activo ? "text-violet-200" : "text-violet-300/70"}`} />
              <span className="truncate max-w-[60px] text-center">{item.label.split(" ")[0]}</span>
            </a>
          )
        })}
      </nav>
    </div>
  )
}
