/**
 * Origen único de la URL del API en la app Expo.
 * Debe vivir bajo `mobile/` para que el transform de `EXPO_PUBLIC_*` aplique en EAS Build.
 */
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000'
).replace(/\/$/, '')
