export interface CompensacionNotifUsuario {
  usuario_id: number
  nombre: string
  pagado_efectivo: string
  gasto_prorrateado: string
  diferencia: string
}

export interface CompensacionNotifTransferencia {
  de_usuario_id: number
  de_nombre: string
  a_usuario_id: number
  a_nombre: string
  monto: string
}

export interface CompensacionNotificacionData {
  por_usuario: CompensacionNotifUsuario[]
  transferencias_sugeridas: CompensacionNotifTransferencia[]
}

export function montoNotifNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export function parseCompensacionNotificacion(
  payload: Record<string, unknown> | undefined | null,
): CompensacionNotificacionData | null {
  const raw = payload?.compensacion
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  return {
    por_usuario: Array.isArray(c.por_usuario)
      ? (c.por_usuario as CompensacionNotifUsuario[])
      : [],
    transferencias_sugeridas: Array.isArray(c.transferencias_sugeridas)
      ? (c.transferencias_sugeridas as CompensacionNotifTransferencia[])
      : [],
  }
}

export function etiquetaDiferenciaCompensacion(
  diff: number,
  formatMonto: (n: number) => string,
): { texto: string; tipo: 'debe' | 'recibe' | 'aldia' } {
  if (diff < -0.5) {
    return { texto: `debe ${formatMonto(Math.abs(diff))}`, tipo: 'debe' }
  }
  if (diff > 0.5) {
    return { texto: `recibe ${formatMonto(diff)}`, tipo: 'recibe' }
  }
  return { texto: 'está al día', tipo: 'aldia' }
}
