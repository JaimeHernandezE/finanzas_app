import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',    // Escucha en todas las interfaces dentro del contenedor
    port: 5173,
    watch: {
      usePolling: true,  // Necesario para detectar cambios en volúmenes Docker
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
          const stylesDir = path.resolve(__dirname, 'src/styles')
          const rel = path.relative(path.dirname(filepath), stylesDir).replace(/\\/g, '/')
          const prefix = rel ? `${rel}/` : ''
          return `@use "${prefix}variables" as *;\n@use "${prefix}mixins" as *;\n${content}`
        },
        loadPaths: [path.resolve(__dirname, 'src/styles').replace(/\\/g, '/')],
      },
    },
  },
})
