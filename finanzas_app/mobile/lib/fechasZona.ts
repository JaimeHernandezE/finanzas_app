/**
 * Fechas de calendario alineadas con `Usuario.zona_horaria` del backend (IANA).
 * Evita usar `Date.toISOString().slice(0, 10)` (UTC), que desplaza el día por la noche.
 */

/** YYYY-MM-DD del instante `ref` en la zona IANA indicada. */
export function fechaIsoEnZonaHoraria(ref: Date, ianaZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: ianaZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(ref)
  } catch {
    const y = ref.getFullYear()
    const m = String(ref.getMonth() + 1).padStart(2, '0')
    const d = String(ref.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
}

/** YYYY-MM-DD de «hoy» en la zona IANA indicada. */
export function hoyIsoEnZonaHoraria(ianaZone: string): string {
  return fechaIsoEnZonaHoraria(new Date(), ianaZone)
}
