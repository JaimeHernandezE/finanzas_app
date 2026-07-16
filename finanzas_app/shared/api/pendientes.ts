import client from './client'

export interface MovimientoPendienteApi {
  id: number
  origen: 'WHATSAPP' | 'TELEGRAM' | 'EMAIL_BANCO' | 'MANUAL'
  tipo: 'INGRESO' | 'EGRESO'
  monto: string
  fecha: string
  hora: string | null
  comercio: string
  ultimos_4: string
  categoria_sugerida: number | null
  categoria_sugerida_nombre: string | null
  ambito_sugerido: 'PERSONAL' | 'COMUN' | null
  metodo_pago_sugerido: number | null
  metodo_pago_sugerido_tipo: string | null
  metodo_pago_sugerido_nombre: string | null
  tarjeta_sugerida: number | null
  tarjeta_sugerida_nombre: string | null
  tarjeta_sugerida_ultimos_4: string | null
  cuenta_sugerida: number | null
  cuenta_sugerida_nombre: string | null
  confianza: number
  estado: 'PENDIENTE' | 'CONFIRMADO' | 'DESCARTADO' | 'DUPLICADO'
  movimiento: number | null
  creado_at: string
  actualizado_at: string
}

export interface ConfirmarPendienteBody {
  ambito?: 'PERSONAL' | 'COMUN'
  categoria?: number
  metodo_pago?: number
  cuenta?: number | null
  tarjeta?: number | null
  comentario?: string
  num_cuotas?: number
  monto_cuota?: number | null
}

export const pendientesApi = {
  listar: (estado = 'PENDIENTE') =>
    client.get<MovimientoPendienteApi[]>('/api/finanzas/pendientes/', {
      params: { estado },
    }),

  contador: () =>
    client.get<{ count: number }>('/api/finanzas/pendientes/contador/'),

  confirmar: (id: number, body: ConfirmarPendienteBody = {}) =>
    client.post<{ pendiente: MovimientoPendienteApi; movimiento: unknown }>(
      `/api/finanzas/pendientes/${id}/confirmar/`,
      body,
    ),

  descartar: (id: number) =>
    client.post<MovimientoPendienteApi>(`/api/finanzas/pendientes/${id}/descartar/`),

  sincronizarCorreo: () =>
    client.post<{
      ok: boolean
      creados: number
      skip_remitente: number
      skip_parseo: number
      errores: number
      mensaje: string
    }>('/api/finanzas/captura/correo/sincronizar/'),
}
