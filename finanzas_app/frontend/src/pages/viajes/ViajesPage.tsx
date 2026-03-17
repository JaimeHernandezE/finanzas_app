import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useViaje } from '@/context/ViajeContext'
import { MOCK_PRESUPUESTOS, type Viaje } from './mockViajes'
import styles from './ViajesPage.module.scss'

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const clp = (n: number) =>
  n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })

function formatRangoFechas(fechaInicio: string, fechaFin: string): string {
  const d1 = new Date(fechaInicio + 'T12:00:00')
  const d2 = new Date(fechaFin + 'T12:00:00')
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
  return `${d1.toLocaleDateString('es-CL', opts)} – ${d2.toLocaleDateString('es-CL', opts)}`
}

const TOTAL_PRESUPUESTADO_EJEMPLO = MOCK_PRESUPUESTOS.reduce(
  (s, p) => s + p.montoPresupuestado,
  0
)

// -----------------------------------------------------------------------------
// Subcomponentes internos
// -----------------------------------------------------------------------------

function TarjetaViaje({
  viaje,
  totalPresupuestado,
  onActivar,
  onDesactivar,
}: {
  viaje: Viaje
  totalPresupuestado: number
  onActivar: (id: string) => void
  onDesactivar: (id: string) => void
}) {
  const esActivo = viaje.esActivo

  return (
    <div
      className={`${styles.card} ${esActivo ? styles.cardActivo : ''}`}
      style={
        esActivo
          ? ({ '--card-color-tema': viaje.colorTema } as React.CSSProperties)
          : undefined
      }
    >
      <div className={styles.cardInner}>
        <div className={styles.cardLeft}>
          <div className={styles.cardTop}>
            <span
              className={styles.cardDot}
              style={{ color: viaje.colorTema }}
              aria-hidden
            >
              ●
            </span>
            <Link to={`/viajes/${viaje.id}`} className={styles.cardNombre}>
              {viaje.nombre}
            </Link>
            {esActivo && <span className={styles.badgeEnCurso}>En curso</span>}
          </div>
          <div className={styles.cardFechas}>
            {formatRangoFechas(viaje.fechaInicio, viaje.fechaFin)}
          </div>
          <div className={styles.cardPresupuesto}>
            {clp(totalPresupuestado)} presupuestado
          </div>
        </div>
        <div className={styles.cardActions}>
          {esActivo ? (
            <button
              type="button"
              className={styles.btnGhostDanger}
              onClick={() => onDesactivar(viaje.id)}
            >
              Desactivar
            </button>
          ) : (
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => onActivar(viaje.id)}
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
    </div>
  )
}

function TarjetaArchivado({ viaje }: { viaje: Viaje }) {
  return (
    <div className={styles.cardArchivado}>
      <span
        className={styles.cardArchivadoDot}
        style={{ color: viaje.colorTema }}
        aria-hidden
      >
        ●
      </span>
      <Link to={`/viajes/${viaje.id}`} className={styles.cardArchivadoNombre}>
        {viaje.nombre}
      </Link>
      <span className={styles.cardArchivadoFechas}>
        {formatRangoFechas(viaje.fechaInicio, viaje.fechaFin)}
      </span>
      <Link
        to={`/viajes/${viaje.id}/editar`}
        className={styles.cardArchivadoEdit}
        aria-label="Editar viaje"
      >
        ✎
      </Link>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Página
// -----------------------------------------------------------------------------

export default function ViajesPage() {
  const { viajes, activarViaje, desactivarViaje } = useViaje()
  const [expandirArchivados, setExpandirArchivados] = useState(false)

  const activosYProximos = useMemo(
    () =>
      [...viajes]
        .filter((v) => !v.archivado)
        .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio)),
    [viajes]
  )

  const archivados = useMemo(
    () => [...viajes].filter((v) => v.archivado),
    [viajes]
  )

  const archivadosVisibles = expandirArchivados
    ? archivados
    : archivados.slice(0, 3)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.titulo}>Viajes</h1>
        <Link to="/viajes/nuevo" className={styles.btnPrimary}>
          + Nuevo
        </Link>
      </header>

      <section className={styles.sectionList}>
        <h2 className={styles.sectionHeader}>PRÓXIMOS Y EN CURSO</h2>
        {activosYProximos.map((viaje) => (
          <TarjetaViaje
            key={viaje.id}
            viaje={viaje}
            totalPresupuestado={TOTAL_PRESUPUESTADO_EJEMPLO}
            onActivar={activarViaje}
            onDesactivar={desactivarViaje}
          />
        ))}
      </section>

      <section className={styles.sectionList}>
        <div className={styles.sectionHeaderRow}>
          <h2 className={styles.sectionTitle}>ARCHIVADOS</h2>
          {archivados.length > 3 && (
            <button
              type="button"
              className={styles.btnVerTodos}
              onClick={() => setExpandirArchivados((v) => !v)}
            >
              {expandirArchivados ? 'ver menos' : 'ver todos'}
            </button>
          )}
        </div>
        {archivadosVisibles.map((viaje) => (
          <TarjetaArchivado key={viaje.id} viaje={viaje} />
        ))}
      </section>
    </div>
  )
}
