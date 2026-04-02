import client from './client'

export interface BackupSubirDriveResult {
  ok: boolean
  archivo: string
  eliminados_en_drive: number
}

export interface BackupImportarResult {
  ok: boolean
  mensaje: string
}

export const backupBdApi = {
  descargarDump: () =>
    client.get<Blob>('/api/backup-bd/descargar/', {
      responseType: 'blob',
      timeout: 600_000,
    }),

  subirDumpADrive: () =>
    client.post<BackupSubirDriveResult>('/api/backup-bd/subir-drive/', {}, { timeout: 600_000 }),

  importarDump: (archivo: File, confirmacion: string) => {
    const fd = new FormData()
    fd.append('archivo', archivo)
    fd.append('confirmacion', confirmacion)
    return client.post<BackupImportarResult>('/api/backup-bd/importar/', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600_000,
    })
  },
}
