/**
 * Mensaje legible desde respuestas DRF (`detail`, `error`, errores por campo)
 * o Error genérico.
 *
 * Ojo: en axios, `AxiosError` sólo asigna `this.response` cuando hubo respuesta.
 * En fallos de red y timeouts la propiedad no existe, así que no se puede usar
 * `'response' in err` como guarda: hay que detectar la forma de axios por otras
 * señales o los mensajes de "sin conexión" quedan inalcanzables y el usuario ve
 * el texto crudo de axios ("Network Error").
 */

interface ErrorTipoAxios {
  response?: { status?: number; data?: unknown }
  message?: string
  code?: string
  config?: unknown
  isAxiosError?: boolean
}

function esErrorAxios(err: unknown): err is ErrorTipoAxios {
  if (!err || typeof err !== 'object') return false
  const e = err as ErrorTipoAxios
  return (
    e.isAxiosError === true ||
    'response' in e ||
    'config' in e ||
    typeof e.code === 'string'
  )
}

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

export function apiErrorMessage(err: unknown): string {
  if (esErrorAxios(err)) {
    // Sin respuesta: la petición no llegó o no volvió (red caída, DNS, CORS, timeout).
    if (!err.response) {
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        return 'La conexión tardó demasiado. Reintenta en unos segundos.'
      }
      return 'Sin conexión al servidor. Comprueba internet e inténtalo de nuevo.'
    }

    const status = err.response.status
    const d = err.response.data

    if (d && typeof d === 'object' && !Array.isArray(d)) {
      const obj = d as Record<string, unknown>
      if (typeof obj.error === 'string' && obj.error) return obj.error
      if (typeof obj.detail === 'string' && obj.detail) return obj.detail
      if (Array.isArray(obj.detail) && obj.detail.length) {
        return obj.detail
          .map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))
          .join(' ')
      }
      const porCampo = mensajeDesdeErroresDeCampo(obj)
      if (porCampo) return porCampo
    }

    // Cuerpo no útil (p. ej. página HTML de error): al menos informar el estado.
    if (status === 404) {
      return 'El recurso no existe en el servidor (404). Puede que la función esté deshabilitada.'
    }
    if (status != null) {
      return `El servidor respondió con error ${status}.`
    }
  }

  if (err instanceof Error) return err.message
  return 'Error desconocido'
}
