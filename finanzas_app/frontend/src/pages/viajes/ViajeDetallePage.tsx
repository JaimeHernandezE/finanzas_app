import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useViaje } from '@/context/ViajeContext'
import { useViajeDetalle } from '@/hooks/useViajes'
import { viajesApi } from '@/api'
import { Cargando, ErrorCarga } from '@/components/ui'
import { useConfig } from '@/context/ConfigContext'
import type { PresupuestoViaje, MovimientoViaje } from './mockViajes'
import styles from './ViajeDetallePage.module.scss'

interface ViajeDetalleApi {
  id: number
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  color_tema: string
  es_activo: boolean
  total_presupuestado: string
  total_gastado: string
  presupuestos: { id: number; categoria: number; categoria_nombre: string; monto_planificado: string }[]
  movimientos?: unknown[]
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

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
  const { formatMonto } = useConfig()
  const presup = p.montoPresupuestado
  const gastado = p.montoGastado ?? 0
  const pct = presup > 0 ? (gastado / presup) * 100 : 0
  const color = presup > 0 ? colorBarra(gastado, presup) : '#22a06b'
  const barWidth = Math.min(pct, 100)
  const sinPresupuestoConGasto = presup === 0 && gastado > 0

  return (
    <div className={styles.catItem}>
      <div className={styles.catItemRow}>
        <span className={styles.catItemNombre}>{p.categoriaNombre}</span>
        <span className={styles.catItemMontos}>
          {formatMonto(gastado)} / {formatMonto(presup)}
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
  const { formatMonto } = useConfig()
  return (
    <div className={styles.movimientoItem}>
      <span className={styles.movimientoFecha}>{formatFechaCorta(m.fecha)}</span>
      <span className={styles.movimientoAutor}>{m.autor}</span>
      <div className={styles.movimientoCenter}>
        <div className={styles.movimientoDescripcion}>{m.descripcion}</div>
        <div className={styles.movimientoCategoria}>{m.categoria}</div>
      </div>
      <span className={styles.movimientoMonto}>{formatMonto(m.monto)}</span>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Página
// -----------------------------------------------------------------------------

export default function ViajeDetallePage() {
  const { formatMonto } = useConfig()
  const { id } = useParams<{ id: string }>()
  const { refetchViajes } = useViaje()
  const { data: viajeData, loading, error, refetch } = useViajeDetalle(Number(id))
  const viajeApi = viajeData as ViajeDetalleApi | null | undefined

  const viaje = useMemo(() => {
    if (!viajeApi) return null
    return {
      id: String(viajeApi.id),
      nombre: viajeApi.nombre,
      fechaInicio: viajeApi.fecha_inicio,
      fechaFin: viajeApi.fecha_fin,
      colorTema: viajeApi.color_tema || '#2E86AB',
      esActivo: viajeApi.es_activo,
      archivado: false,
    }
  }, [viajeApi])

  const presupuestos: PresupuestoViaje[] = useMemo(() => {
    const list = viajeApi?.presupuestos ?? []
    return list.map((p) => ({
      categoriaId: String(p.categoria),
      categoriaNombre: p.categoria_nombre,
      montoPresupuestado: Number(p.monto_planificado) || 0,
      montoGastado: 0,
    }))
  }, [viajeApi?.presupuestos])

  const totalPresupuestado = Number(viajeApi?.total_presupuestado ?? 0)
  const totalGastado = Number(viajeApi?.total_gastado ?? 0)
  const diferencia = totalPresupuestado - totalGastado
  const diferenciaPct = totalPresupuestado > 0 ? ((totalGastado - totalPresupuestado) / totalPresupuestado) * 100 : 0
  const esExcedido = totalGastado > totalPresupuestado

  const movimientosOrdenados: MovimientoViaje[] = useMemo(
    () => [],
    []
  )

  if (loading) return <Cargando />
  if (error) return <ErrorCarga mensaje={error} />
  if (!viaje) {
    return (
      <div className={styles.page}>
        <p>Viaje no encontrado.</p>
        <Link to="/viajes">← Viajes</Link>
      </div>
    )
  }

  const esActivo = viaje.esActivo

  const handleActivarDesactivar = async () => {
    await viajesApi.activarViaje(Number(viaje.id))
    refetch()
    refetchViajes()
  }

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
                onClick={handleActivarDesactivar}
              >
                Desactivar
              </button>
            ) : (
              <button
                type="button"
                className={styles.btnGhost}
                onClick={handleActivarDesactivar}
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
              {formatMonto(totalPresupuestado)}
            </span>
          </div>
          <div className={styles.resumenItem}>
            <span className={styles.resumenLabel}>Gastado</span>
            <span className={styles.resumenValor}>
              {formatMonto(totalGastado)}
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
              {formatMonto(Math.abs(diferencia))} (
              {diferenciaPct >= 0 ? '+' : ''}
              {diferenciaPct.toFixed(1)}%)
            </span>
          </div>
        </div>
      </section>

      <section className={styles.categoriaSection}>
        <h2 className={styles.sectionTitle}>POR CATEGORÍA</h2>
        {presupuestos.map((p) => (
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
