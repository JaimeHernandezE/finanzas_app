/**
 * Base del backend sin barra final.
 * Si VITE_API_URL termina en /, evita URLs del tipo https://host.com//api/... (rompe CORS/proxy en algunos hosts).
 */
export function getApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').trim()
  return raw.replace(/\/+$/, '')
}
