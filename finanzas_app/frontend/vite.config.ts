import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

/** ../shared en host; shared/ cuando Docker monta el paquete; node_modules tras npm ci. */
function resolveSharedDir(): string {
  const candidates = [
    path.resolve(__dirname, 'shared'),
    path.resolve(__dirname, '../shared'),
    path.resolve(__dirname, 'node_modules/@finanzas/shared'),
  ]
  for (const dir of candidates) {
    const marker = path.join(dir, 'package.json')
    try {
      if (fs.existsSync(marker) && fs.statSync(marker).isFile()) {
        return dir
      }
    } catch {
      /* symlink roto (p. ej. Railway con root solo en frontend) */
    }
  }
  throw new Error(
    'No se encontró @finanzas/shared. Ejecuta npm run sync-shared y commitea frontend/shared/.',
  )
}

const sharedDir = resolveSharedDir()

export default defineConfig({  plugins: [react()],
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
      '@finanzas/shared': sharedDir,
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
