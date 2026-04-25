/** Copia de `shared/utils/sueldoProyectadoIngresos.ts` para builds Docker/Vite que solo incluyen `frontend/`. */

const CATEGORIA_INGRESO_DECLARADO_FONDO_COMUN = 'Ingreso declarado (fondo común)'

function pkIngresoComunDesdePayload(m: Record<string, unknown>): number | null {
  const raw = m.ingreso_comun ?? m.ingresoComun
  if (raw == null || raw === false || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw
  if (typeof raw === 'string') {
    const n = Number(raw.trim())
    return Number.isFinite(n) && n > 0 ? n : null
  }
  if (typeof raw === 'object' && raw !== null && 'id' in raw) {
    const id = (raw as { id: unknown }).id
    if (typeof id === 'number' && id > 0) return id
    if (typeof id === 'string') {
      const n = Number(id.trim())
      return Number.isFinite(n) && n > 0 ? n : null
    }
  }
  return null
}

function categoriaNombreDesdePayload(m: Record<string, unknown>): string {
  const v = m.categoria_nombre ?? m.categoriaNombre
  if (v == null) return ''
  return String(v).trim()
}

/**
 * Ingresos por movimiento que cuentan en «sueldo estimado + ingresos mes actual» del dashboard.
 * Excluye el ingreso espejo de IngresoComun: PK en `ingreso_comun` o categoría declarada.
 */
export function incluirIngresoMovimientoEnSueldoProyectadoMes(m: {
  tipo: string
  metodo_pago_tipo?: string
  ingreso_comun?: number | null
  categoria_nombre?: string | null
}): boolean {
  if (m.tipo !== 'INGRESO') return false
  const row = m as Record<string, unknown>
  const metodo = (row.metodo_pago_tipo ?? row.metodoPagoTipo) as string | undefined
  if (metodo === 'CREDITO') return false
  if (pkIngresoComunDesdePayload(row) != null) return false
  const nom = categoriaNombreDesdePayload(row)
  if (nom === CATEGORIA_INGRESO_DECLARADO_FONDO_COMUN) return false
  return true
}
