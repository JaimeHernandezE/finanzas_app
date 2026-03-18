import client from './client'

export interface MovimientoFiltros {
  cuenta?: number
  ambito?: 'PERSONAL' | 'COMUN'
  mes?: number
  anio?: number
  tipo?: 'INGRESO' | 'EGRESO'
  categoria?: number
  metodo?: 'EFECTIVO' | 'DEBITO' | 'CREDITO'
  q?: string
}

export const movimientosApi = {
  getMovimientos: (filtros: MovimientoFiltros = {}) =>
    client.get('/api/finanzas/movimientos/', { params: filtros }),

  getMovimiento: (id: number) =>
    client.get(`/api/finanzas/movimientos/${id}/`),

  createMovimiento: (data: Record<string, unknown>) =>
    client.post('/api/finanzas/movimientos/', data),

  updateMovimiento: (id: number, data: Record<string, unknown>) =>
    client.put(`/api/finanzas/movimientos/${id}/`, data),

  deleteMovimiento: (id: number) =>
    client.delete(`/api/finanzas/movimientos/${id}/`),

  getCuotas: (filtros: { tarjeta?: number; mes?: number; anio?: number; estado?: string } = {}) =>
    client.get('/api/finanzas/cuotas/', { params: filtros }),

  /** Suma de cuotas TC no pagadas (familia) */
  getCuotasDeudaPendiente: () =>
    client.get<{ total: string }>('/api/finanzas/cuotas/deuda-pendiente/'),

  updateCuota: (id: number, data: { incluir?: boolean; estado?: string }) =>
    client.put(`/api/finanzas/cuotas/${id}/`, data),
}
