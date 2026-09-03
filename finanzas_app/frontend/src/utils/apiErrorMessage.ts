import type { AxiosError } from 'axios'

/** Aplana errores de validación DRF: `{campo: ["msg", ...], ...}`. */
function mensajeDesdeErroresDeCampo(data: Record<string, unknown>): string | null {
  const partes: string[] = []
  for (const valor of Object.values(data)) {
    if (typeof valor === 'string' && valor) {
      partes.push(valor)
    } else if (Array.isArray(valor)) {
      for (const x of valor) {
        if (typeof x === 'string' && x) partes.push(x)
      }
    }
  }
  return partes.length ? partes.join(' ') : null
}

/** Mensaje legible desde respuestas DRF (`detail`, `error`, errores por campo). */
export function apiErrorMessage(err: unknown): string {
  // `AxiosError` sólo define `response` cuando hubo respuesta; en fallos de red
  // y timeouts no existe, por eso no sirve como guarda única.
  if (
    err &&
    typeof err === 'object' &&
    ('response' in err || 'config' in err || 'isAxiosError' in err)
  ) {
    const ax = err as AxiosError<{ detail?: unknown; error?: string }>
    const status = ax.response?.status
    const d = ax.response?.data
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      if (typeof d.error === 'string' && d.error) return d.error
      if (d.detail != null) {
        if (typeof d.detail === 'string' && d.detail) return d.detail
        if (Array.isArray(d.detail) && d.detail.length) {
          return d.detail
            .map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))
            .join(' ')
        }
      }
      const porCampo = mensajeDesdeErroresDeCampo(d as Record<string, unknown>)
      if (porCampo) return porCampo
    }
    if (ax.response == null) {
      if (ax.code === 'ECONNABORTED' || ax.code === 'ETIMEDOUT') {
        return 'La conexión tardó demasiado. Reintenta en unos segundos.'
      }
      return 'Sin conexión al servidor. Comprueba internet e inténtalo de nuevo.'
    }
    if (status === 404) {
      return 'El recurso no existe en el servidor (404). Puede que la función esté deshabilitada.'
    }
    if (status === 401) {
      return 'No autorizado (401). Tu sesión puede haber expirado: cierra sesión y vuelve a entrar, o reintenta el respaldo.'
    }
    if (status === 403) {
      return 'No tienes permiso para esta acción (403). Solo administradores pueden usar el respaldo a Drive.'
    }
    if (status === 429) {
      return 'Demasiadas consultas al asistente (429). Espera un momento e intenta de nuevo.'
    }
    if (status === 503) {
      return 'El asistente no está disponible (503). Puede estar deshabilitado o sin cuota del proveedor LLM.'
    }
    if (status != null) {
      return `El servidor respondió con error ${status}.`
    }
  }
  if (err instanceof Error) {
    const code = (err as { code?: string }).code
    if (code === 'ECONNABORTED' || /timeout/i.test(err.message)) {
      return 'La consulta al asistente tardó demasiado. Intenta de nuevo o revisa la clave/cuota de NVIDIA.'
    }
    return err.message
  }
  return 'Error desconocido'
}
