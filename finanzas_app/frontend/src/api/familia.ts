import client from './client'

export interface MiembroApi {
  id: number
  email: string
  nombre: string
  rol: 'ADMIN' | 'MIEMBRO' | 'LECTURA'
  /** Solo admin; miembro sin datos asociados y no es el único admin restante */
  puede_quitar?: boolean
}

export interface InvitacionApi {
  id: number
  email: string
  fecha_envio: string
}

export const familiaApi = {
  getMiembros: () => client.get<MiembroApi[]>('/api/usuarios/familia/miembros/'),

  patchMiembroRol: (id: number, rol: MiembroApi['rol']) =>
    client.patch<MiembroApi>(`/api/usuarios/familia/miembros/${id}/rol/`, { rol }),

  deleteMiembro: (id: number) =>
    client.delete(`/api/usuarios/familia/miembros/${id}/`),

  getInvitaciones: () => client.get<InvitacionApi[]>('/api/usuarios/familia/invitaciones/'),

  createInvitacion: (email: string) =>
    client.post<InvitacionApi>('/api/usuarios/familia/invitaciones/', { email }),

  deleteInvitacion: (id: number) =>
    client.delete(`/api/usuarios/familia/invitaciones/${id}/`),
}
