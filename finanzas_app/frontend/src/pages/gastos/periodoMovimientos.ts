import type { MovimientoFiltros } from '@/api/movimientos'

/** Copia de `shared/utils/periodoMovimientos.ts` para builds que solo incluyen `frontend/` (p. ej. Docker /app). */

export type ModoPeriodo = 'MES' | 'ANIO' | 'RANGO'

const MESES_NOMBRE = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

export function primerUltimoDiaMesISO(anio: number, mes0: number): { desde: string; hasta: string } {
  const desde = `${anio}-${String(mes0 + 1).padStart(2, '0')}-01`
  const ultimo = new Date(anio, mes0 + 1, 0).getDate()
  const hasta = `${anio}-${String(mes0 + 1).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`
  return { desde, hasta }
}

export function rangoAniosSelect(anioCentro: number, span = 18): number[] {
  const min = anioCentro - span
  const out: number[] = []
  for (let y = anioCentro; y >= min; y -= 1) out.push(y)
  return out
}

export function movimientosParamsPeriodo(
  modo: ModoPeriodo,
  mes0: number,
  anio: number,
  rangoDesde: string,
  rangoHasta: string,
): Pick<MovimientoFiltros, 'mes' | 'anio' | 'fecha_desde' | 'fecha_hasta'> {
  if (modo === 'MES') {
    return { mes: mes0 + 1, anio }
  }
  if (modo === 'ANIO') {
    return { anio }
  }
  const d = rangoDesde.trim()
  const h = rangoHasta.trim()
  if (!d && !h) {
    return { mes: mes0 + 1, anio }
  }
  return {
    ...(d ? { fecha_desde: d } : {}),
    ...(h ? { fecha_hasta: h } : {}),
  }
}

export function etiquetaTotalPeriodo(
  modo: ModoPeriodo,
  mes0: number,
  anio: number,
  rangoDesde: string,
  rangoHasta: string,
): string {
  if (modo === 'MES') {
    return `Total ${MESES_NOMBRE[mes0]} ${anio}`
  }
  if (modo === 'ANIO') {
    return `Total año ${anio}`
  }
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    if (!y || !m || !d) return iso
    return `${d} ${MESES_CORTOS[m - 1]} ${y}`
  }
  return `Total ${fmt(rangoDesde)} – ${fmt(rangoHasta)}`
}

export function etiquetaEncabezadoRango(rangoDesde: string, rangoHasta: string): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    if (!y || !m || !d) return iso
    return `${d} ${MESES_CORTOS[m - 1]} ${y}`
  }
  return `${fmt(rangoDesde)} – ${fmt(rangoHasta)}`
}

export { MESES_NOMBRE as MESES_ETIQUETAS }
