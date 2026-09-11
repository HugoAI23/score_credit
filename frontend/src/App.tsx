// Router principal y punto de entrada de la aplicación de segmentación
// Gestiona la navegación por hash (#/consulta, #/cartera, #/lote, #/modelo, #/diagnostico)
import { useState, useEffect } from "react"
import { AppLayout, type Ruta } from "@/components/layout/AppLayout"
import Consulta from "@/screens/Consulta"
import Cartera from "@/screens/Cartera"
import Lote from "@/screens/Lote"
import Modelo from "@/screens/Modelo"
import Diagnostico from "@/screens/Diagnostico"

function obtenerRutaDesdeHash(): Ruta {
  const hash = (typeof window !== "undefined" ? window.location.hash : "").toLowerCase()
  if (hash.includes("cartera")) return "cartera"
  if (hash.includes("lote")) return "lote"
  if (hash.includes("modelo")) return "modelo"
  if (hash.includes("diagnostico")) return "diagnostico"
  return "consulta"
}

export default function App() {
  const [ruta, setRuta] = useState<Ruta>(obtenerRutaDesdeHash)

  useEffect(() => {
    const alCambiarHash = () => {
      setRuta(obtenerRutaDesdeHash())
    }
    window.addEventListener("hashchange", alCambiarHash)

    // Si no hay hash en la URL, asignar #/consulta por defecto
    if (!window.location.hash) {
      window.location.hash = "#/consulta"
    }

    return () => window.removeEventListener("hashchange", alCambiarHash)
  }, [])

  return (
    <AppLayout rutaActual={ruta} onCambiarRuta={setRuta}>
      {ruta === "consulta" && <Consulta />}
      {ruta === "cartera" && <Cartera />}
      {ruta === "lote" && <Lote />}
      {ruta === "modelo" && <Modelo />}
      {ruta === "diagnostico" && <Diagnostico />}
    </AppLayout>
  )
}
