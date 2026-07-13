/**
 * URL base del API. En monorepo, `process.env.EXPO_PUBLIC_*` en `shared/` puede no sustituirse
 * en release; la app móvil pasa la URL desde `mobile/lib/apiConfig.ts`.
 *
 * Usamos también globalThis: Metro a veces duplica el módulo; `setApiBaseUrl` y `getApiBaseUrl`
 * podrían apuntar a instancias distintas → sin esto volvería `localhost` y Network Error.
 */
const GLOBAL_KEY = '__finanzas_app_api_base_url__'
const GLOBAL_TIMEOUT_KEY = '__finanzas_app_api_timeout_ms__'

let _override: string | null = null
let _timeoutOverrideMs: number | null = null

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

export function setApiTimeoutMs(timeoutMs: number) {
  const value = Number(timeoutMs)
  if (!Number.isFinite(value) || value <= 0) return
  const normalized = Math.round(value)
  _timeoutOverrideMs = normalized
  try {
    const g = globalThis as Record<string, number | undefined>
    g[GLOBAL_TIMEOUT_KEY] = normalized
  } catch {
    /* */
  }
}

export function getApiTimeoutMs(): number {
  try {
    const g = globalThis as Record<string, number | undefined>
    const fromGlobal = g[GLOBAL_TIMEOUT_KEY]
    if (typeof fromGlobal === 'number' && Number.isFinite(fromGlobal) && fromGlobal > 0) {
      return fromGlobal
    }
  } catch {
    /* */
  }
  if (
    typeof _timeoutOverrideMs === 'number' &&
    Number.isFinite(_timeoutOverrideMs) &&
    _timeoutOverrideMs > 0
  ) {
    return _timeoutOverrideMs
  }
  return 25_000
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
