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
  sincronizarGoogleSheets: () =>
    client.post<ExportSheetsResult>('/api/export/sincronizar/', {}, { timeout: 120_000 }),
}
