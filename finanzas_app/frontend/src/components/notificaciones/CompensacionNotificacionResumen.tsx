import type { CompensacionNotificacionData } from '@finanzas/shared/utils/notificacionCompensacion'
import {
  etiquetaDiferenciaCompensacion,
  montoNotifNum,
} from '@finanzas/shared/utils/notificacionCompensacion'
import styles from './CompensacionNotificacionResumen.module.scss'

interface Props {
  compensacion: CompensacionNotificacionData
  formatMonto: (n: number) => string
}

export function CompensacionNotificacionResumen({ compensacion, formatMonto }: Props) {
  const { por_usuario, transferencias_sugeridas } = compensacion

  return (
    <div className={styles.bloque}>
      <p className={styles.tituloBloque}>Compensación entre las partes</p>

      {por_usuario.map((row) => {
        const pagado = montoNotifNum(row.pagado_efectivo)
        const deberia = montoNotifNum(row.gasto_prorrateado)
        const diff = montoNotifNum(row.diferencia)
        const { texto, tipo } = etiquetaDiferenciaCompensacion(diff, formatMonto)
        return (
          <div key={row.usuario_id} className={styles.fila}>
            <span className={styles.nombre}>{row.nombre}</span>
            <span className={styles.detalle}>
              pagó {formatMonto(pagado)} — debería {formatMonto(deberia)} →{' '}
              <span className={styles[tipo]}>{texto}</span>
            </span>
          </div>
        )
      })}

      <div className={styles.transferencias}>
        {transferencias_sugeridas.length > 0 ? (
          transferencias_sugeridas.map((tr) => (
            <p key={`${tr.de_usuario_id}-${tr.a_usuario_id}`} className={styles.transferencia}>
              <strong>{tr.de_nombre}</strong>
              {' le transfiere '}
              <strong>{formatMonto(montoNotifNum(tr.monto))}</strong>
              {' a '}
              <strong>{tr.a_nombre}</strong>
            </p>
          ))
        ) : (
          <p className={styles.sinTransferencias}>Sin transferencias sugeridas este mes</p>
        )}
      </div>
    </div>
  )
}
