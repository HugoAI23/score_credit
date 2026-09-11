import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Incrusta JS y CSS en un solo index.html para que Flask lo sirva sin configurar archivos estáticos
    viteSingleFile(),
  ],
  resolve: {
    // Alias "@/..." que usan shadcn/ui y los componentes de bklit
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    // En desarrollo, las llamadas a /api se reenvían a Flask (PORT=8000 python app.py).
    // No se usa 5000: en macOS ese puerto lo ocupa el Receptor AirPlay.
    proxy: { '/api': `http://127.0.0.1:${process.env.API_PORT ?? '8000'}` },
  },
})
