import client from './client'

/** Respuesta de GET /api/finanzas/cuentas-personales/ */
export interface CuentaPersonalApi {
  id: number
  nombre: string
  descripcion: string
  visible_familia: boolean
  es_propia: boolean
  duenio_nombre: string | null
}

export interface PresupuestoMesFila {
  presupuesto_id: number | null
  categoria_id: number
  categoria_nombre: string
  monto_presupuestado: string | null
  gastado: number
  /** True: fila de categoría padre con montos = suma de hijas (+ presup./gasto directo del padre si aplica) */
  es_agregado_padre?: boolean
  /** FK opcional; si hay padre agregado, las hijas apuntan a su categoria_id */
  categoria_padre_id?: number | null
}

export interface EfectivoDisponibleDesglose {
  a: string
  b: string
  c: string
  d: string
  e: string
  e_personal: string
  e_comun: string
}

export interface CompensacionProyectadaResp {
  periodo: { mes: number; anio: number }
  neto_familiar_comun: string
  miembros: {
    usuario_id: number
    nombre: string
    neto_comun_mes: string
    ingreso_declarado_mes: string
  }[]
}

export interface SueldosEstimadosProrrateoResp {
  mes: number
  anio: number
  /** usuario_id (string) → monto decimal */
  montos: Record<string, string>
}

export const finanzasApi = {
  getCuentasPersonales: () =>
    client.get<CuentaPersonalApi[]>('/api/finanzas/cuentas-personales/'),

  createCuentaPersonal: (data: {
    nombre: string
    descripcion?: string
    visible_familia?: boolean
  }) => client.post<CuentaPersonalApi>('/api/finanzas/cuentas-personales/', data),

  updateCuentaPersonal: (
    id: number,
    data: Partial<{ nombre: string; descripcion: string; visible_familia: boolean }>,
  ) => client.patch<CuentaPersonalApi>(`/api/finanzas/cuentas-personales/${id}/`, data),

  deleteCuentaPersonal: (id: number) =>
    client.delete(`/api/finanzas/cuentas-personales/${id}/`),

  getIngresosComunes: (filtros: { mes?: number; anio?: number } = {}) =>
    client.get('/api/finanzas/ingresos-comunes/', { params: filtros }),

  createIngresoComun: (data: { mes: string; monto: string; origen: string }) =>
    client.post('/api/finanzas/ingresos-comunes/', data),

  updateIngresoComun: (id: number, data: Partial<{ monto: string; origen: string }>) =>
    client.put(`/api/finanzas/ingresos-comunes/${id}/`, data),

  deleteIngresoComun: (id: number) =>
    client.delete(`/api/finanzas/ingresos-comunes/${id}/`),

  getLiquidacion: (mes: number, anio: number) =>
    client.get('/api/finanzas/liquidacion/', { params: { mes, anio } }),

  /** Filas categoría + presupuesto/gastado del mes */
  getPresupuestoMes: (params: { mes: number; anio: number; ambito: 'FAMILIAR' | 'PERSONAL'; cuenta?: number }) =>
    client.get<PresupuestoMesFila[]>('/api/finanzas/presupuesto-mes/', { params }),

  createPresupuesto: (data: {
    categoria: number
    mes: string
    monto: string
    ambito: 'FAMILIAR' | 'PERSONAL'
    cuenta?: number
  }) => client.post('/api/finanzas/presupuestos/', data),

  patchPresupuesto: (id: number, data: { monto: string }) =>
    client.patch(`/api/finanzas/presupuestos/${id}/`, data),

  deletePresupuesto: (id: number) => client.delete(`/api/finanzas/presupuestos/${id}/`),

  /** Efectivo disponible con desglose histórico A+B+C−D+E */
  getEfectivoDisponible: () =>
    client.get<{
      efectivo: string
      desglose: EfectivoDisponibleDesglose
      recalculo: { pendiente: boolean; dirty_from: string | null }
    }>('/api/finanzas/efectivo-disponible/'),

  /** Compensación proyectada por prorrateo para el saldo proyectado */
  getCompensacionProyectada: (mes: number, anio: number) =>
    client.get<CompensacionProyectadaResp>(
      '/api/finanzas/compensacion-proyectada/',
      { params: { mes, anio } },
    ),

  /** Sueldos base para prorrateo (persistidos por mes) */
  getSueldosEstimadosProrrateo: (mes: number, anio: number) =>
    client.get<SueldosEstimadosProrrateoResp>(
      '/api/finanzas/sueldos-estimados-prorrateo/',
      { params: { mes, anio } },
    ),

  putSueldosEstimadosProrrateo: (mes: number, anio: number, montos: Record<string, string>) =>
    client.put<SueldosEstimadosProrrateoResp>(
      '/api/finanzas/sueldos-estimados-prorrateo/',
      { montos },
      { params: { mes, anio } },
    ),
}
