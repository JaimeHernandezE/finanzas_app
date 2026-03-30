/**
 * URL base del API. En monorepo, `process.env.EXPO_PUBLIC_*` en `shared/` puede no sustituirse
 * en release; la app móvil pasa la URL desde `mobile/lib/apiConfig.ts`.
 *
 * Usamos también globalThis: Metro a veces duplica el módulo; `setApiBaseUrl` y `getApiBaseUrl`
 * podrían apuntar a instancias distintas → sin esto volvería `localhost` y Network Error.
 */
const GLOBAL_KEY = '__finanzas_app_api_base_url__'

let _override: string | null = null

function readGlobal(): string | undefined {
  try {
    const g = globalThis as Record<string, string | undefined>
    const v = g[GLOBAL_KEY]
    return v != null && v !== '' ? v : undefined
  } catch {
    return undefined
  }
}

export function setApiBaseUrl(url: string) {
  const u = url.replace(/\/$/, '')
  _override = u
  try {
    const g = globalThis as Record<string, string | undefined>
    g[GLOBAL_KEY] = u
  } catch {
    /* */
  }
}

export function getApiBaseUrl(): string {
  const fromGlobal = readGlobal()
  if (fromGlobal != null) return fromGlobal
  if (_override != null && _override !== '') return _override
  const fromEnv =
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ??
    (typeof import.meta !== 'undefined'
      ? (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL
      : undefined)
  if (fromEnv != null && fromEnv !== '') return String(fromEnv).replace(/\/$/, '')
  return 'http://localhost:8000'
}
