import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['axios'],
  },
  server: {
    host: '0.0.0.0',    // Escucha en todas las interfaces dentro del contenedor
    port: 5173,
    watch: {
      usePolling: true, // Necesario para detectar cambios en volúmenes Docker (sobre todo en Windows)
      interval: 1000,
    },
    // Necesario para que el popup de Firebase (signInWithPopup) pueda usar window.closed
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  // Mismas cabeceras en preview (build de producción local)
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // Inyecta variables y mixins en todos los archivos .module.scss
        // sin necesidad de importarlos manualmente en cada uno.
        additionalData: (content: string, filepath: string) => {
          if (filepath.includes('src/styles')) return content
          return `@use "variables" as *;\n@use "mixins" as *;\n${content}`
        },
        // Nota: Vite/Sass usa `includePaths` (no `loadPaths`) para resolver imports sin ruta.
        includePaths: [path.resolve(__dirname, 'src/styles')],
      },
    },
  },
})
