import type { AxiosError } from 'axios'

/** Mensaje legible desde respuestas DRF (`detail`, `error`) o Error genérico. */
export function apiErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const ax = err as AxiosError<{ detail?: unknown; error?: string }>
    const status = ax.response?.status
    const d = ax.response?.data
    if (d && typeof d === 'object') {
      if (typeof d.error === 'string' && d.error) return d.error
      if (d.detail != null) {
        if (typeof d.detail === 'string' && d.detail) return d.detail
        if (Array.isArray(d.detail) && d.detail.length) {
          return d.detail
            .map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))
            .join(' ')
        }
      }
    }
    if (status === 401) {
      return 'No autorizado (401). Tu sesión puede haber expirado: cierra sesión y vuelve a entrar, o reintenta el respaldo.'
    }
    if (status === 403) {
      return 'No tienes permiso para esta acción (403). Solo administradores pueden usar el respaldo a Drive.'
    }
  }
  if (err instanceof Error) return err.message
  return 'Error desconocido'
}
