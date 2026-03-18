import client from './client'

export const catalogosApi = {
  getCategorias: () =>
    client.get('/api/finanzas/categorias/'),

  createCategoria: (data: {
    nombre: string
    tipo: 'INGRESO' | 'EGRESO'
    ambito: 'FAMILIAR' | 'PERSONAL'
    es_inversion?: boolean
  }) => client.post('/api/finanzas/categorias/', data),

  updateCategoria: (
    id: number,
    data: Partial<{ nombre: string; tipo: string; es_inversion: boolean }>
  ) => client.put(`/api/finanzas/categorias/${id}/`, data),

  deleteCategoria: (id: number) =>
    client.delete(`/api/finanzas/categorias/${id}/`),

  getMetodosPago: () =>
    client.get('/api/finanzas/metodos-pago/'),

  getTarjetas: () =>
    client.get('/api/finanzas/tarjetas/'),

  createTarjeta: (data: { nombre: string; banco: string }) =>
    client.post('/api/finanzas/tarjetas/', data),

  updateTarjeta: (id: number, data: Partial<{ nombre: string; banco: string }>) =>
    client.put(`/api/finanzas/tarjetas/${id}/`, data),

  deleteTarjeta: (id: number) =>
    client.delete(`/api/finanzas/tarjetas/${id}/`),
}
