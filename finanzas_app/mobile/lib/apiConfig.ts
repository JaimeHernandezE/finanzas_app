/**
 * Origen único de la URL del API en la app Expo.
 * Debe vivir bajo `mobile/` para que el transform de `EXPO_PUBLIC_*` aplique en EAS Build.
 * Efecto lateral: sincroniza `shared/api/baseUrl` (y globalThis por si Metro duplica el módulo).
 */
import { setApiBaseUrl } from '@finanzas/shared/api/baseUrl'

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000'
).replace(/\/$/, '')

setApiBaseUrl(API_BASE_URL)
