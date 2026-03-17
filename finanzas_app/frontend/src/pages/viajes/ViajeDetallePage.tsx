import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useViaje } from '@/context/ViajeContext'
import {
  MOCK_PRESUPUESTOS,
  MOCK_MOVIMIENTOS_VIAJE,
  type PresupuestoViaje,
  type MovimientoViaje,
} from './mockViajes'
import styles from './ViajeDetallePage.module.scss'

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const clp = (n: number) =>
  n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })

function formatFechaCorta(fecha: string): string {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
  })
}

function colorBarra(gastado: number, presupuestado: number): string {
  if (presupuestado <= 0) return '#22a06b'
  const pct = (gastado / presupuestado) * 100
  if (pct <= 80) return '#22a06b'
  if (pct <= 100) return '#f59e0b'
  return '#ff4d4d'
}

// -----------------------------------------------------------------------------
// Subcomponentes internos
// -----------------------------------------------------------------------------

function FilaCategoria({ p }: { p: PresupuestoViaje }) {
  const presup = p.montoPresupuestado
  const pct = presup > 0 ? (p.montoGastado / presup) * 100 : 0
  const color = presup > 0 ? colorBarra(p.montoGastado, presup) : '#22a06b'
  const barWidth = Math.min(pct, 100)
  const sinPresupuestoConGasto = presup === 0 && p.montoGastado > 0

  return (
    <div className={styles.catItem}>
      <div className={styles.catItemRow}>
        <span className={styles.catItemNombre}>{p.categoriaNombre}</span>
        <span className={styles.catItemMontos}>
          {clp(p.montoGastado)} / {clp(presup)}
        </span>
        <div className={styles.catItemBarWrap}>
          <div className={styles.barTrack}>
            <div
              className={styles.barFill}
              style={
                {
                  '--target-width': `${barWidth}%`,
                  backgroundColor: presup > 0 ? color : 'transparent',
                } as React.CSSProperties
              }
            />
          </div>
          <span className={styles.catItemPct} style={{ color }}>
            {presup > 0 ? `${pct.toFixed(1)}%` : '—'}
          </span>
          {sinPresupuestoConGasto ? (
            <span className={styles.badgeSinPresupuesto}>sin presupuesto</span>
          ) : (
            <span
              className={styles.catItemIndicador}
              style={{ color }}
              aria-hidden
            >
              ●
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function FilaMovimiento({ m }: { m: MovimientoViaje }) {
  return (
    <div className={styles.movimientoItem}>
      <span className={styles.movimientoFecha}>{formatFechaCorta(m.fecha)}</span>
      <span className={styles.movimientoAutor}>{m.autor}</span>
      <div className={styles.movimientoCenter}>
        <div className={styles.movimientoDescripcion}>{m.descripcion}</div>
        <div className={styles.movimientoCategoria}>{m.categoria}</div>
      </div>
      <span className={styles.movimientoMonto}>{clp(m.monto)}</span>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Página
// -----------------------------------------------------------------------------

export default function ViajeDetallePage() {
  const { id } = useParams<{ id: string }>()
  const { viajes, activarViaje, desactivarViaje } = useViaje()

  const viaje = useMemo(
    () => (id ? viajes.find((v) => v.id === id) : null),
    [id, viajes]
  )

  const { totalPresupuestado, totalGastado, diferencia, diferenciaPct, esExcedido } =
    useMemo(() => {
      const presup = MOCK_PRESUPUESTOS.reduce((s, p) => s + p.montoPresupuestado, 0)
      const gastado = MOCK_PRESUPUESTOS.reduce((s, p) => s + p.montoGastado, 0)
      const diff = presup - gastado
      const pct = presup > 0 ? ((gastado - presup) / presup) * 100 : 0
      return {
        totalPresupuestado: presup,
        totalGastado: gastado,
        diferencia: diff,
        diferenciaPct: pct,
        esExcedido: gastado > presup,
      }
    }, [])

  const movimientosOrdenados = useMemo(
    () =>
      [...MOCK_MOVIMIENTOS_VIAJE].sort((a, b) =>
        b.fecha.localeCompare(a.fecha)
      ),
    []
  )

  if (!viaje) {
    return (
      <div className={styles.page}>
        <p>Viaje no encontrado.</p>
        <Link to="/viajes">← Viajes</Link>
      </div>
    )
  }

  const esActivo = viaje.esActivo

  return (
    <div className={styles.page}>
      <Link to="/viajes" className={styles.backLink}>
        ← Viajes
      </Link>

      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.headerLeft}>
            <div className={styles.tituloRow}>
              <span
                className={styles.dot}
                style={{ color: viaje.colorTema }}
                aria-hidden
              >
                ●
              </span>
              <h1 className={styles.titulo}>{viaje.nombre}</h1>
            </div>
            <div className={styles.fechas}>
              {new Date(viaje.fechaInicio + 'T12:00:00').toLocaleDateString(
                'es-CL',
                { day: 'numeric', month: 'short', year: 'numeric' }
              )}{' '}
              –{' '}
              {new Date(viaje.fechaFin + 'T12:00:00').toLocaleDateString(
                'es-CL',
                { day: 'numeric', month: 'short', year: 'numeric' }
              )}
            </div>
          </div>
          <div className={styles.headerActions}>
            {esActivo ? (
              <button
                type="button"
                className={styles.btnGhostDanger}
                onClick={() => desactivarViaje(viaje.id)}
              >
                Desactivar
              </button>
            ) : (
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => activarViaje(viaje.id)}
              >
                Activar
              </button>
            )}
            <Link
              to={`/viajes/${viaje.id}/editar`}
              className={styles.btnEdit}
              aria-label="Editar viaje"
            >
              ✎
            </Link>
          </div>
        </div>
      </header>

      <section>
        <h2 className={styles.sectionTitle}>RESUMEN</h2>
        <div className={styles.resumenGrid}>
          <div className={styles.resumenItem}>
            <span className={styles.resumenLabel}>Presupuestado</span>
            <span className={styles.resumenValor}>
              {clp(totalPresupuestado)}
            </span>
          </div>
          <div className={styles.resumenItem}>
            <span className={styles.resumenLabel}>Gastado</span>
            <span className={styles.resumenValor}>
              {clp(totalGastado)}
            </span>
          </div>
          <div className={styles.resumenItem}>
            <span className={styles.resumenLabel}>
              {esExcedido ? 'Excedido' : 'Ahorro'}
            </span>
            <span
              className={`${styles.resumenValor} ${
                esExcedido ? styles.resumenValorDanger : styles.resumenValorSuccess
              }`}
            >
              {clp(Math.abs(diferencia))} (
              {diferenciaPct >= 0 ? '+' : ''}
              {diferenciaPct.toFixed(1)}%)
            </span>
          </div>
        </div>
      </section>

      <section className={styles.categoriaSection}>
        <h2 className={styles.sectionTitle}>POR CATEGORÍA</h2>
        {MOCK_PRESUPUESTOS.map((p) => (
          <FilaCategoria key={p.categoriaId} p={p} />
        ))}
      </section>

      <section className={styles.movimientosSection}>
        <h2 className={styles.sectionTitle}>MOVIMIENTOS DEL VIAJE</h2>
        {movimientosOrdenados.length === 0 ? (
          <div className={styles.emptyMovimientos}>
            <span className={styles.emptyIcon} aria-hidden>
              ○
            </span>
            Sin movimientos registrados para este viaje
          </div>
        ) : (
          movimientosOrdenados.map((m) => <FilaMovimiento key={m.id} m={m} />)
        )}
      </section>
    </div>
  )
}
