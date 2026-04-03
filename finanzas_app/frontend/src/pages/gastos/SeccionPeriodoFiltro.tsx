import type { ModoPeriodo } from './periodoMovimientos'
import { MESES_ETIQUETAS, rangoAniosSelect } from './periodoMovimientos'
import styles from './SeccionPeriodoFiltro.module.scss'

type Props = {
  modo: ModoPeriodo
  onModoChange: (m: ModoPeriodo) => void
  mes: number
  anio: number
  onMesAnioChange: (mes: number, anio: number) => void
  rangoDesde: string
  rangoHasta: string
  onRangoChange: (desde: string, hasta: string) => void
  anioMaximo: number
}

export function SeccionPeriodoFiltro({
  modo,
  onModoChange,
  mes,
  anio,
  onMesAnioChange,
  rangoDesde,
  rangoHasta,
  onRangoChange,
  anioMaximo,
}: Props) {
  const anos = rangoAniosSelect(anioMaximo, 18)

  return (
    <div className={styles.section}>
      <p className={styles.sectionLabel}>Periodo</p>

      <label className={styles.radioItem}>
        <input
          type="radio"
          name="modo-periodo"
          checked={modo === 'MES'}
          onChange={() => onModoChange('MES')}
        />
        Mes
      </label>
      {modo === 'MES' && (
        <div className={styles.rowControls}>
          <select
            className={styles.select}
            value={mes}
            onChange={(e) => onMesAnioChange(Number(e.target.value), anio)}
            aria-label="Mes"
          >
            {MESES_ETIQUETAS.map((nombre, i) => (
              <option key={nombre} value={i}>
                {nombre}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={anio}
            onChange={(e) => onMesAnioChange(mes, Number(e.target.value))}
            aria-label="Año"
          >
            {anos.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      )}

      <label className={styles.radioItem}>
        <input
          type="radio"
          name="modo-periodo"
          checked={modo === 'ANIO'}
          onChange={() => onModoChange('ANIO')}
        />
        Año completo
      </label>
      {modo === 'ANIO' && (
        <div className={styles.rowControls}>
          <select
            className={styles.select}
            value={anio}
            onChange={(e) => onMesAnioChange(mes, Number(e.target.value))}
            aria-label="Año del periodo"
          >
            {anos.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      )}

      <label className={styles.radioItem}>
        <input
          type="radio"
          name="modo-periodo"
          checked={modo === 'RANGO'}
          onChange={() => onModoChange('RANGO')}
        />
        Entre fechas
      </label>
      {modo === 'RANGO' && (
        <div className={styles.dateRow}>
          <label className={styles.dateField}>
            <span className={styles.dateFieldLabel}>Desde</span>
            <input
              type="date"
              className={styles.dateInput}
              value={rangoDesde}
              onChange={(e) => onRangoChange(e.target.value, rangoHasta)}
            />
          </label>
          <label className={styles.dateField}>
            <span className={styles.dateFieldLabel}>Hasta</span>
            <input
              type="date"
              className={styles.dateInput}
              value={rangoHasta}
              onChange={(e) => onRangoChange(rangoDesde, e.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  )
}
