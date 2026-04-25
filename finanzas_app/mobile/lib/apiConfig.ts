/**
 * Origen único de la URL del API en la app Expo.
 * Debe vivir bajo `mobile/` para que el transform de `EXPO_PUBLIC_*` aplique en EAS Build.
 * Efecto lateral: sincroniza `shared/api/baseUrl` (y globalThis por si Metro duplica el módulo).
 */
import { setApiBaseUrl, setApiTimeoutMs } from '@finanzas/shared/api/baseUrl'

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000'
).replace(/\/$/, '')

setApiBaseUrl(API_BASE_URL)
if (__DEV__) {
  console.info('[apiConfig] API base URL:', API_BASE_URL)
}

// En móvil preferimos fail-fast para no dejar la UI "colgada" 20-25s en mala red.
const timeoutRaw = process.env.EXPO_PUBLIC_API_TIMEOUT_MS
const timeoutMs = Number(timeoutRaw ?? '10000')
setApiTimeoutMs(Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000)
