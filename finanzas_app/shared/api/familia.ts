import client from './client'

export interface MiembroApi {
  id: number
  email: string
  nombre: string
  rol: 'ADMIN' | 'MIEMBRO' | 'LECTURA'
  activo?: boolean
  puede_cambiar_activo?: boolean
  puede_quitar?: boolean
}

export interface InvitacionApi {
  id: number
  email: string
  fecha_envio: string
}

export interface InvitacionRecibidaApi {
  id: number
  familia: { id: number; nombre: string }
  fecha_envio: string
  invitador_nombre: string
}

export interface UsuarioMeApi {
  id: number
  email: string
  nombre: string
  rol: string
  activo?: boolean
  foto: string | null
  familia: { id: number; nombre: string } | null
}

export const familiaApi = {
  getMiembros: () => client.get<MiembroApi[]>('/api/usuarios/familia/miembros/'),

  patchMiembroRol: (id: number, rol: MiembroApi['rol']) =>
    client.patch<MiembroApi>(`/api/usuarios/familia/miembros/${id}/rol/`, { rol }),

  patchMiembroActivo: (id: number, activo: boolean) =>
    client.patch<MiembroApi>(`/api/usuarios/familia/miembros/${id}/activo/`, { activo }),

  getInvitaciones: () => client.get<InvitacionApi[]>('/api/usuarios/familia/invitaciones/'),

  createInvitacion: (email: string) =>
    client.post<InvitacionApi>('/api/usuarios/familia/invitaciones/', { email }),

  deleteInvitacion: (id: number) =>
    client.delete(`/api/usuarios/familia/invitaciones/${id}/`),

  getInvitacionesRecibidas: () =>
    client.get<InvitacionRecibidaApi[]>('/api/usuarios/familia/invitaciones-recibidas/'),

  aceptarInvitacionRecibida: (id: number) =>
    client.post<UsuarioMeApi>(`/api/usuarios/familia/invitaciones-recibidas/${id}/aceptar/`, {}),

  rechazarInvitacionRecibida: (id: number) =>
    client.delete(`/api/usuarios/familia/invitaciones-recibidas/${id}/rechazar/`),
}
