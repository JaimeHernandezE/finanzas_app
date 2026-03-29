/**
 * URL base del API. En Expo (monorepo) `process.env.EXPO_PUBLIC_*` dentro de `shared/`
 * a veces NO se sustituye en el bundle de release → `localhost` y Network Error.
 * La app móvil debe llamar `setApiBaseUrl()` con un valor definido en `mobile/` (sí inyectado).
 */
let _override: string | null = null

export function setApiBaseUrl(url: string) {
  _override = url.replace(/\/$/, '')
}

export function getApiBaseUrl(): string {
  if (_override != null && _override !== '') return _override
  const fromEnv =
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ??
    (typeof import.meta !== 'undefined'
      ? (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL
      : undefined)
  if (fromEnv != null && fromEnv !== '') return String(fromEnv).replace(/\/$/, '')
  return 'http://localhost:8000'
}
