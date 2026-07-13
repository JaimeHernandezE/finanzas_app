export interface PresupuestoNotificacionData {
  mes: number
  anio: number
  categoria_id: number
  categoria_nombre: string
  ambito: 'FAMILIAR' | 'PERSONAL'
  monto_presupuestado: string
  gastado: string
  porcentaje: number
  umbral_disparado: number
  cuenta_id?: number | null
}

export function parsePresupuestoNotificacion(
  payload: Record<string, unknown> | undefined | null,
): PresupuestoNotificacionData | null {
  if (!payload) return null
  const mes = Number(payload.mes)
  const anio = Number(payload.anio)
  const categoriaId = Number(payload.categoria_id)
  if (!Number.isFinite(mes) || !Number.isFinite(anio) || !Number.isFinite(categoriaId)) {
    return null
  }
  const ambitoRaw = String(payload.ambito ?? 'FAMILIAR')
  const ambito = ambitoRaw === 'PERSONAL' ? 'PERSONAL' : 'FAMILIAR'
  const cuentaRaw = payload.cuenta_id
  const cuentaId =
    cuentaRaw == null || cuentaRaw === ''
      ? null
      : Number(cuentaRaw)
  return {
    mes,
    anio,
    categoria_id: categoriaId,
    categoria_nombre: String(payload.categoria_nombre ?? 'Categoría'),
    ambito,
    monto_presupuestado: String(payload.monto_presupuestado ?? '0'),
    gastado: String(payload.gastado ?? '0'),
    porcentaje: Number(payload.porcentaje ?? 0),
    umbral_disparado: Number(payload.umbral_disparado ?? 0),
    cuenta_id: Number.isFinite(cuentaId) ? cuentaId : null,
  }
}

export function linkPresupuestoNotificacion(
  data: PresupuestoNotificacionData,
  basePath = '/presupuesto',
): string {
  const params = new URLSearchParams({
    mes: String(data.mes),
    anio: String(data.anio),
    ambito: data.ambito,
    categoria: String(data.categoria_id),
  })
  if (data.cuenta_id != null) {
    params.set('cuenta', String(data.cuenta_id))
  }
  return `${basePath}?${params.toString()}`
}
