import { InputMontoClp } from '@/components/ui'
import { useConfig } from '@/context/ConfigContext'
import styles from './CategoriaPresupuestoItem.module.scss'

function colorBarra(gastado: number, presupuestado: number): string {
  if (presupuestado <= 0) return gastado > 0 ? '#f59e0b' : '#94a3b8'
  const pct = (gastado / presupuestado) * 100
  if (pct <= 80) return '#22a06b'
  if (pct <= 100) return '#f59e0b'
  return '#ff4d4d'
}

interface Props {
  id?: string
  nombre: string
  gastado: number
  presupuestado: number
  highlighted?: boolean
  onClick?: () => void
  editable?: boolean
  isEditing?: boolean
  editValue?: string
  onStartEdit?: () => void
  onEditChange?: (value: string) => void
  onEditConfirm?: () => void
  onEditCancel?: () => void
}

export default function CategoriaPresupuestoItem({
  id,
  nombre,
  gastado,
  presupuestado,
  highlighted = false,
  onClick,
  editable = false,
  isEditing = false,
  editValue = '',
  onStartEdit,
  onEditChange,
  onEditConfirm,
  onEditCancel,
}: Props) {
  const { formatMonto } = useConfig()
  const pct = presupuestado > 0 ? (gastado / presupuestado) * 100 : gastado > 0 ? 999 : 0
  const color = colorBarra(gastado, presupuestado)
  const barWidth = presupuestado > 0 ? Math.min(pct, 100) : gastado > 0 ? 100 : 0
  const excedido = presupuestado > 0 && gastado > presupuestado ? gastado - presupuestado : 0
  const clickable = !editable && !!onClick

  return (
    <div
      id={id}
      className={`${styles.catItem} ${highlighted ? styles.catItemHighlighted : ''} ${clickable ? styles.catItemClickable : ''}`}
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
    >
      <div className={styles.catItemHeader}>
        <span className={styles.catItemNombre}>{nombre}</span>
        {editable && !isEditing && (
          <button
            type="button"
            className={styles.btnEdit}
            onClick={onStartEdit}
            aria-label="Editar monto"
          >
            ✎
          </button>
        )}
      </div>
      {editable && isEditing ? (
        <div className={styles.catItemEditRow}>
          <span className={styles.catItemMontos}>
            {formatMonto(gastado)} de{' '}
            <InputMontoClp
              soloInput
              inputClassName={styles.catItemEditInput}
              value={editValue}
              onChange={v => onEditChange?.(v)}
              autoFocus
              aria-label="Monto presupuestado"
            />
          </span>
          <button
            type="button"
            className={styles.btnFormConfirm}
            onClick={onEditConfirm}
            aria-label="Confirmar"
          >
            ✓
          </button>
          <button
            type="button"
            className={styles.btnFormCancel}
            onClick={onEditCancel}
            aria-label="Cancelar"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className={styles.catItemRow}>
          <span className={styles.catItemMontos}>
            {formatMonto(gastado)} de {formatMonto(presupuestado)}
          </span>
          <div className={styles.catItemBarWrap}>
            <div className={styles.barTrack}>
              <div
                className={styles.barFill}
                style={
                  {
                    '--target-width': `${barWidth}%`,
                    backgroundColor: color,
                  } as React.CSSProperties
                }
              />
            </div>
            <span className={styles.catItemPct} style={{ color }}>
              {presupuestado > 0 ? `${pct.toFixed(1)}%` : gastado > 0 ? '—' : '0%'}
            </span>
            {excedido > 0 ? (
              <span className={styles.catItemIndicadorExcedido}>
                Excedido +{formatMonto(excedido)}
              </span>
            ) : (
              <span className={styles.catItemIndicador} style={{ color }} aria-hidden>
                ●
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
