/**
 * Base del backend sin barra final.
 * Si VITE_API_URL termina en /, evita URLs del tipo https://host.com//api/... (rompe CORS/proxy en algunos hosts).
 */
export function getApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').trim()
  const base = raw || 'http://localhost:8000'

  // Permite configurar VITE_API_URL sin protocolo (ej: backend.up.railway.app)
  // y lo normaliza para evitar requests relativas al frontend.
  const withProtocol = /^https?:\/\//i.test(base)
    ? base
    : /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(base)
      ? `http://${base}`
      : `https://${base}`

  return withProtocol.replace(/\/+$/, '')
}
