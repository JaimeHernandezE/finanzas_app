import type { PresupuestoNotificacionData } from '@finanzas/shared/utils/notificacionPresupuesto'
import styles from './PresupuestoNotificacionResumen.module.scss'

export function PresupuestoNotificacionResumen({
  presupuesto,
  formatMonto,
}: {
  presupuesto: PresupuestoNotificacionData
  formatMonto: (n: number) => string
}) {
  const gastado = Number(presupuesto.gastado) || 0
  const pres = Number(presupuesto.monto_presupuestado) || 0
  const pct = presupuesto.porcentaje

  return (
    <div className={styles.box}>
      <p className={styles.fila}>
        <span className={styles.etiqueta}>Categoría</span>
        <span className={styles.valor}>{presupuesto.categoria_nombre}</span>
      </p>
      <p className={styles.fila}>
        <span className={styles.etiqueta}>Ámbito</span>
        <span className={styles.valor}>
          {presupuesto.ambito === 'FAMILIAR' ? 'Familiar' : 'Personal'}
        </span>
      </p>
      <p className={styles.fila}>
        <span className={styles.etiqueta}>Gastado</span>
        <span className={styles.valor}>
          {formatMonto(gastado)} de {formatMonto(pres)} ({pct.toFixed(0)}%)
        </span>
      </p>
    </div>
  )
}
