import client from './client'

export const viajesApi = {
  getViajes: (archivado = false) =>
    client.get('/api/viajes/', { params: { archivado } }),

  getViaje: (id: number) =>
    client.get(`/api/viajes/${id}/`),

  createViaje: (data: Record<string, unknown>) =>
    client.post('/api/viajes/', data),

  updateViaje: (id: number, data: Record<string, unknown>) =>
    client.put(`/api/viajes/${id}/`, data),

  archivarViaje: (id: number) =>
    client.delete(`/api/viajes/${id}/`),

  activarViaje: (id: number) =>
    client.post(`/api/viajes/${id}/activar/`),

  getPresupuestos: (viajeId: number) =>
    client.get(`/api/viajes/${viajeId}/presupuestos/`),

  createPresupuesto: (viajeId: number, data: { categoria: number; monto_planificado: string }) =>
    client.post(`/api/viajes/${viajeId}/presupuestos/`, data),

  updatePresupuesto: (id: number, data: { monto_planificado: string }) =>
    client.put(`/api/viajes/presupuestos/${id}/`, data),

  deletePresupuesto: (id: number) =>
    client.delete(`/api/viajes/presupuestos/${id}/`),
}
