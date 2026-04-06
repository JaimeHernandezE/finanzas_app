import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useViaje } from '@/context/ViajeContext'
import { useViajes } from '@/hooks/useViajes'
import { useConfig } from '@/context/ConfigContext'
import { viajesApi } from '@/api'
import { Cargando, ErrorCarga } from '@/components/ui'
import type { Viaje } from './mockViajes'
import styles from './ViajesPage.module.scss'

function formatRangoFechas(fechaInicio: string, fechaFin: string): string {
  const d1 = new Date(fechaInicio + 'T12:00:00')
  const d2 = new Date(fechaFin + 'T12:00:00')
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
  return `${d1.toLocaleDateString('es-CL', opts)} – ${d2.toLocaleDateString('es-CL', opts)}`
}

function mapViajeApiToViaje(v: { id: number; nombre: string; fecha_inicio: string; fecha_fin: string; color_tema: string; es_activo: boolean; archivado: boolean; total_presupuestado?: string }): Viaje {
  return {
    id: String(v.id),
    nombre: v.nombre,
    fechaInicio: v.fecha_inicio,
    fechaFin: v.fecha_fin,
    colorTema: v.color_tema || '#2E86AB',
    esActivo: v.es_activo,
    archivado: v.archivado,
  }
}

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
            {formatMonto(totalPresupuestado)} presupuestado
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
  const { refetchViajes } = useViaje()
  const { formatMonto } = useConfig()
  const { data: activosData, loading: loadingActivos, error: errorActivos, refetch: refetchActivos } = useViajes(false)
  const { data: archivadosData, loading: loadingArchivados } = useViajes(true)
  const [expandirArchivados, setExpandirArchivados] = useState(false)

  const activosRaw = (activosData ?? []) as { id: number; nombre: string; fecha_inicio: string; fecha_fin: string; color_tema: string; es_activo: boolean; archivado: boolean; total_presupuestado?: string }[]
  const archivadosRaw = (archivadosData ?? []) as { id: number; nombre: string; fecha_inicio: string; fecha_fin: string; color_tema: string; es_activo: boolean; archivado: boolean }[]

  const activosYProximos = useMemo(
    () =>
      activosRaw
        .map(mapViajeApiToViaje)
        .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio)),
    [activosRaw]
  )

  const archivados = useMemo(() => archivadosRaw.map(mapViajeApiToViaje), [archivadosRaw])

  const archivadosVisibles = expandirArchivados
    ? archivados
    : archivados.slice(0, 3)

  const handleActivar = async (id: string) => {
    await viajesApi.activarViaje(Number(id))
    refetchActivos()
    refetchViajes()
  }

  const handleDesactivar = async (id: string) => {
    await viajesApi.activarViaje(Number(id))
    refetchActivos()
    refetchViajes()
  }

  if (loadingActivos && !activosRaw.length) return <Cargando />
  if (errorActivos) return <ErrorCarga mensaje={errorActivos} />

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
        {activosYProximos.map((viaje) => {
          const raw = activosRaw.find((v) => String(v.id) === viaje.id)
          const totalPresupuestado = raw?.total_presupuestado != null ? Number(raw.total_presupuestado) : 0
          return (
            <TarjetaViaje
              key={viaje.id}
              viaje={viaje}
              totalPresupuestado={totalPresupuestado}
              onActivar={handleActivar}
              onDesactivar={handleDesactivar}
            />
          )
        })}
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
