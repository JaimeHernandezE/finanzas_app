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

  getPresupuestos: () =>
    client.get('/api/finanzas/presupuestos/'), // TODO: implementar endpoint en backend
}
