import client from './client'

export interface ExportSheetsResumenItem {
  hoja: string
  filas: number
}

export interface ExportSheetsResult {
  ok: boolean
  resumen: ExportSheetsResumenItem[]
}

export const exportApi = {
  sincronizarGoogleSheets: () => {
    const token =
      typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null
    return client.post<ExportSheetsResult>(
      '/api/export/sincronizar/',
      {},
      {
        timeout: 120_000,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    )
  },
}
