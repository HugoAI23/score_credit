# Frontend — Portal de segmentación (prueba técnica de bklit UI)

React + TypeScript + Vite + Tailwind v4 + shadcn/ui + **bklit UI** (gráficas) + **anime.js v4** (movimiento de la interfaz).

La página actual (`src/App.tsx`) es una **prueba técnica**: comprueba que bklit UI corre dentro del proyecto y evalúa en pantalla los requerimientos mínimos funcionales (RF) y no funcionales (RNF), con su evidencia.

## Comandos

Desde la raíz del proyecto, con el entorno `.sc` activo:

```bash
pip install -r requirements.txt
python train_model.py          # solo si no existen los artefactos en models/
python app.py                  # API en http://127.0.0.1:8000 (puerto por defecto)
```

> En macOS **no uses el puerto 5000**: lo ocupa el Receptor AirPlay (ControlCenter).

Desde `frontend/`:

```bash
npm install
npm run dev          # http://localhost:5173 (reenvía /api a 127.0.0.1:8000; cambia con API_PORT=xxxx)
npm run build:flask  # compila a UN solo index.html y lo copia a la raíz; Flask lo sirve en GET /
```

## Estructura

| Ruta | Contenido |
|---|---|
| `src/App.tsx` | Página de prueba con el catálogo de requerimientos y sus verificaciones automáticas |
| `src/lib/api.ts` | Cliente HTTP único y tipos del contrato (`../API.md`) |
| `src/lib/segment-colors.ts` | Color por `base_name` del segmento (nunca por id) |
| `src/components/charts/` | Código fuente de bklit UI instalado con `npx shadcn@latest add @bklit/<gráfica>` |
| `src/components/ui/` | Componentes de shadcn/ui |
| `src/index.css` | Tokens de tema (paleta morada) para shadcn y bklit |

## Correcciones aplicadas tras instalar bklit (errores del CLI/registro)

1. `components.json` venía con `"registries": {}`; se registró `"@bklit": "https://ui.bklit.com/r/{name}.json"`.
2. `index.css` traía las variables de bklit como `var(----chart-grid)` (cuatro guiones); se corrigieron a `var(--chart-grid)`.
3. Los componentes de shadcn importaban `cn` del paquete npm `cn`; se cambió a `@/lib/utils` y se desinstaló ese paquete.
4. `charts/chart-loading-label.tsx` importaba `../components/shimmering-text`; se corrigió a `@/components/shimmering-text`.
5. El gauge se instala como `@bklit/gauge-chart` (no `@bklit/gauge`).

## Limitación conocida (LIM-01)

`ScatterChart` y `LineChart` de bklit crean el eje X con `scaleTime` y convierten X a `Date`. No sirven para ejes numéricos (ingreso vs. spending score, k vs. inercia). Por eso la curva del codo usa `BarChart`. Alternativas: barras por rangos, `@bklit/heatmap-chart` (por verificar) o un SVG propio.

## Nota sobre la verificación automática

Las comprobaciones de las gráficas esperan a que bklit dibuje el SVG. Si la pestaña está oculta, el navegador frena los temporizadores y las animaciones, y los estados pueden tardar varios segundos más en pasar a "Cumple".
