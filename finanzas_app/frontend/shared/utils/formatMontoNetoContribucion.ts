/**
 * Suma de contribución al neto (egreso positivo, ingreso negativo, sin TC en el neto).
 * Texto con − si predominan egresos y + si predominan ingresos (misma lógica que la web).
 */
export function formatMontoNetoContribucion(
  sumaInterna: number,
  formatMonto: (n: number) => string,
): string {
  if (sumaInterna === 0) return formatMonto(0)
  if (sumaInterna > 0) return `-${formatMonto(sumaInterna)}`
  return `+${formatMonto(-sumaInterna)}`
}
