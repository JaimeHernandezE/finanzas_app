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
  }) => client.post('/api/finanzas/presupuestos/', data),

  patchPresupuesto: (id: number, data: { monto: string }) =>
    client.patch(`/api/finanzas/presupuestos/${id}/`, data),

  deletePresupuesto: (id: number) => client.delete(`/api/finanzas/presupuestos/${id}/`),
}
