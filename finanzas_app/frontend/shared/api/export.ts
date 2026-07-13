import client from './client'

export interface ExportSheetsResumenItem {
  hoja: string
  filas: number
}

export interface ExportSheetsResult {
  ok: boolean
  resumen: ExportSheetsResumenItem[]
}

/** POST /api/export/sincronizar/ — JWT, solo ADMIN. Timeout largo por volumen de datos. */
export const exportApi = {
  sincronizarGoogleSheets: () =>
    client.post<ExportSheetsResult>('/api/export/sincronizar/', {}, { timeout: 120_000 }),
}
