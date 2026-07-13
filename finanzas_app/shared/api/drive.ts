import client from './client'

export interface DriveStatus {
  connected: boolean
  email: string
  folder_id: string
  sheet_id: string
}

export interface DriveBackupResult {
  ok: boolean
  archivo: { id: string; nombre: string; tamaño: string }
  eliminados: number
  folder_id?: string
}

export const driveApi = {
  status: () => client.get<DriveStatus>('/api/espacios/drive/status/'),
  connect: () => client.post<{ auth_url: string }>('/api/espacios/drive/connect/'),
  disconnect: () => client.post<{ ok: boolean }>('/api/espacios/drive/disconnect/'),
  updateConfig: (payload: { folder_id?: string; sheet_id?: string }) =>
    client.patch<DriveStatus>('/api/espacios/drive/config/', payload),
  backupEspacio: (espacioId: number) =>
    client.post<DriveBackupResult>(`/api/espacios/${espacioId}/backup-drive/`, {}, { timeout: 120_000 }),
}
