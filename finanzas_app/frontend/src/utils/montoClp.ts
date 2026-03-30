/** Máximo de dígitos para evitar overflow (CLP enteros). */
export const MONTO_CLP_MAX_DIGITOS = 14

/**
 * Valor solo dígitos → texto mostrado tipo $5.000 / $1.234.567
 */
export function formatoMontoClpMostrar(soloDigitos: string): string {
  const d = soloDigitos.replace(/\D/g, '').slice(0, MONTO_CLP_MAX_DIGITOS)
  if (d === '') return '$'
  const n = parseInt(d, 10)
  if (!Number.isFinite(n)) return '$'
  return `$${n.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`
}

/**
 * Lo que el usuario escribe/pega → string de dígitos normalizado ("5000") o ""
 */
export function normalizarDigitosMontoClp(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, MONTO_CLP_MAX_DIGITOS)
  if (d === '') return ''
  return String(parseInt(d, 10))
}

export function montoClpANumero(soloDigitos: string): number {
  const d = normalizarDigitosMontoClp(soloDigitos)
  if (d === '') return 0
  return parseInt(d, 10) || 0
}

/**
 * Suma de `contribucionSaldo` (egreso positivo, ingreso negativo, sin TC en el neto).
 * Devuelve texto con − si predomina egreso y + si predomina ingreso.
 */
export function formatMontoNetoContribucion(
  sumaInterna: number,
  formatMonto: (n: number) => string,
): string {
  if (sumaInterna === 0) return formatMonto(0)
  if (sumaInterna > 0) return `-${formatMonto(sumaInterna)}`
  return `+${formatMonto(-sumaInterna)}`
}
