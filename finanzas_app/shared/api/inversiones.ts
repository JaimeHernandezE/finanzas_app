import client from './client'

export const inversionesApi = {
  getFondos: () =>
    client.get('/api/inversiones/fondos/'),

  getFondo: (id: number) =>
    client.get(`/api/inversiones/fondos/${id}/`),

  createFondo: (data: { nombre: string; descripcion: string; es_compartido: boolean }) =>
    client.post('/api/inversiones/fondos/', data),

  updateFondo: (id: number, data: Partial<{ nombre: string; descripcion: string }>) =>
    client.put(`/api/inversiones/fondos/${id}/`, data),

  deleteFondo: (id: number) =>
    client.delete(`/api/inversiones/fondos/${id}/`),

  agregarAporte: (fondoId: number, data: { fecha: string; monto: string; nota?: string }) =>
    client.post(`/api/inversiones/fondos/${fondoId}/aportes/`, data),

  eliminarAporte: (id: number) =>
    client.delete(`/api/inversiones/aportes/${id}/`),

  agregarValor: (fondoId: number, data: { fecha: string; valor_cuota: string }) =>
    client.post(`/api/inversiones/fondos/${fondoId}/valores/`, data),

  eliminarValor: (id: number) =>
    client.delete(`/api/inversiones/valores/${id}/`),
}
