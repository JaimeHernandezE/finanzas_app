import client from './client'

export type ModoReparto = 'PROPORCIONAL' | 'PARTES_IGUALES' | 'SIN_REPARTO'

export interface EspacioDetalle {
  id: number
  nombre: string
  tipo: string
  modo_reparto: ModoReparto
  activo: boolean
  archivado: boolean
  rol?: string
}

export interface ImportEspacioResult {
  mensaje: string
  conteos: Record<string, number>
}

export const espaciosApi = {
  exportar: (espacioId: number) =>
    client.get<Record<string, unknown>>(`/api/espacios/${espacioId}/exportar/`, {
      timeout: 120_000,
    }),

  importar: (espacioId: number, archivo: File) => {
    const fd = new FormData()
    fd.append('archivo', archivo)
    return client.post<ImportEspacioResult>(`/api/espacios/${espacioId}/importar/`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300_000,
    })
  },

  actualizar: (espacioId: number, data: { nombre?: string; modo_reparto?: ModoReparto }) =>
    client.patch<EspacioDetalle>(`/api/espacios/${espacioId}/`, data),
}
