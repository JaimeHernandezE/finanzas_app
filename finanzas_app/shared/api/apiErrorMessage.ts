/** Mensaje legible desde respuestas DRF (`detail`, `error`) o Error genérico. */
export function apiErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const r = err as { response?: { data?: { detail?: unknown; error?: string } } }
    const d = r.response?.data
    if (d && typeof d === 'object') {
      if (typeof d.error === 'string' && d.error) return d.error
      if (d.detail != null) {
        if (typeof d.detail === 'string') return d.detail
        if (Array.isArray(d.detail) && d.detail.length) {
          return d.detail
            .map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))
            .join(' ')
        }
      }
    }
  }
  if (err instanceof Error) return err.message
  return 'Error desconocido'
}
