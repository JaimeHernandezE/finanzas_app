import client from './client'

export const finanzasApi = {
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
