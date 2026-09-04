import client from './client'

/**
 * Las escrituras no toleran el fail-fast de móvil (10s): si la petición llega
 * al servidor y se aborta antes de la respuesta, el registro queda creado pero
 * la UI reporta error y el usuario reintenta, duplicando el movimiento.
 * Para las lecturas se mantiene el timeout global.
 */
const TIMEOUT_ESCRITURA_MS = 30_000

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
    client.post(`/api/inversiones/fondos/${fondoId}/aportes/`, data, {
      timeout: TIMEOUT_ESCRITURA_MS,
    }),

  eliminarAporte: (id: number) =>
    client.delete(`/api/inversiones/aportes/${id}/`, { timeout: TIMEOUT_ESCRITURA_MS }),

  agregarValor: (fondoId: number, data: { fecha: string; valor_cuota: string }) =>
    client.post(`/api/inversiones/fondos/${fondoId}/valores/`, data, {
      timeout: TIMEOUT_ESCRITURA_MS,
    }),

  eliminarValor: (id: number) =>
    client.delete(`/api/inversiones/valores/${id}/`, { timeout: TIMEOUT_ESCRITURA_MS }),
}
