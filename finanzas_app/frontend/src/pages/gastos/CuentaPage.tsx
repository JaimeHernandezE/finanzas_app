import { useState, useMemo, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMovimientos } from '@/hooks/useMovimientos'
import { useCategorias } from '@/hooks/useCatalogos'
import { useCuentasPersonales } from '@/hooks/useCuentasPersonales'
import { Cargando, ErrorCarga } from '@/components/ui'
import { useConfig } from '@/context/ConfigContext'
import { formatMontoNetoContribucion } from '@/utils/montoClp'
import { SeccionPeriodoFiltro } from './SeccionPeriodoFiltro'
import {
  etiquetaEncabezadoRango,
  etiquetaTotalPeriodo,
  movimientosParamsPeriodo,
  primerUltimoDiaMesISO,
  type ModoPeriodo,
} from './periodoMovimientos'
import { CategoriaSidebarChecks } from './CategoriaSidebarChecks'
import { toggleCategoriaConJerarquia, type CategoriaFiltroFila } from './categoriasFiltroSidebar'
import styles from './CuentaPage.module.scss'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos (API snake_case)
// ─────────────────────────────────────────────────────────────────────────────

interface Movimiento {
  id: number
  fecha: string
  comentario: string
  categoria_nombre: string
  categoria_es_inversion?: boolean
  monto: number | string
  tipo: 'INGRESO' | 'EGRESO'
  metodo_pago_tipo: 'EFECTIVO' | 'DEBITO' | 'CREDITO'
  autor_nombre?: string
  /** PK de IngresoComun si el movimiento es el ingreso declarado al fondo común (sueldo). */
  ingreso_comun?: number | null
}

interface Cuenta {
  id:         string
  nombre:     string
  esPropia:   boolean
  esTutelada: boolean
  duenio?:    string
  esComun:    boolean
}

interface GrupoFecha {
  fecha:        string
  label:        string
  movimientos:  Movimiento[]
}

const METODOS_PAGO: { value: Movimiento['metodo_pago_tipo']; label: string }[] = [
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'DEBITO',   label: 'Débito'   },
  { value: 'CREDITO',  label: 'Crédito'  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

const fechaGrupo = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES_CORTOS[m - 1]}`
}

const hoyISO = () => {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`
}

function toMontoNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const txt = value.trim()
    if (!txt) return 0
    const parsed = Number(txt)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

/**
 * Alineado al backend: no cuenta sueldos (ingreso vinculado a ingreso común);
 * egresos solo gastos corrientes (no categoría inversión). TC no entra al neto.
 */
function contribucionSaldo(m: Movimiento): number {
  if (m.tipo === 'INGRESO' && m.ingreso_comun != null) return 0
  if (m.tipo === 'EGRESO' && m.categoria_es_inversion) return 0
  const monto = toMontoNumber(m.monto)
  if (m.tipo === 'EGRESO' && m.metodo_pago_tipo === 'CREDITO') return 0
  return m.tipo === 'EGRESO' ? monto : -monto
}

function groupByDate(movimientos: Movimiento[]): GrupoFecha[] {
  const today = hoyISO()
  const map = new Map<string, Movimiento[]>()
  for (const m of movimientos) {
    if (!map.has(m.fecha)) map.set(m.fecha, [])
    map.get(m.fecha)!.push(m)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([fecha, movs]) => ({
      fecha,
      label: fecha === today ? 'Hoy' : fechaGrupo(fecha),
      movimientos: movs,
    }))
}

const METODO_BADGE: Record<Movimiento['metodo_pago_tipo'], { label: string; bg: string; color: string }> = {
  EFECTIVO: { label: 'EF', bg: '#f0f0ec', color: '#6b7280' },
  DEBITO:   { label: 'TD', bg: '#e8f4ff', color: '#3b82f6' },
  CREDITO:  { label: 'TC', bg: '#fff0f0', color: '#ff4d4d' },
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────────

function SegmentedControl({
  value, onChange,
}: {
  value:    'TODOS' | 'INGRESO' | 'EGRESO'
  onChange: (v: 'TODOS' | 'INGRESO' | 'EGRESO') => void
}) {
  const opts = [
    { value: 'TODOS',   label: 'Todos'   },
    { value: 'INGRESO', label: 'Ingreso' },
    { value: 'EGRESO',  label: 'Egreso'  },
  ] as const

  return (
    <div className={styles.segmented}>
      {opts.map(o => (
        <button
          key={o.value}
          className={`${styles.segBtn} ${value === o.value ? styles.segBtnActive : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function FilterSidebar({
  abierto,
  periodoSlot,
  categorias,
  filtrosCategorias,
  filtrosMetodos,
  onToggleCategoria,
  onToggleMetodo,
  onClose,
  onLimpiar,
}: {
  abierto:           boolean
  periodoSlot:       ReactNode
  categorias:        CategoriaFiltroFila[]
  filtrosCategorias: string[]
  filtrosMetodos:    string[]
  onToggleCategoria: (cat: CategoriaFiltroFila) => void
  onToggleMetodo:    (met: string) => void
  onClose:           () => void
  onLimpiar:         () => void
}) {
  return (
    <>
      {/* Overlay */}
      <div
        className={`${styles.filterOverlay} ${abierto ? styles.filterOverlayVisible : ''}`}
        onClick={onClose}
      />

      {/* Panel */}
      <aside className={`${styles.filterPanel} ${abierto ? styles.filterPanelOpen : ''}`}>
        <div className={styles.filterHeader}>
          <span className={styles.filterTitulo}>Filtros</span>
          <button className={styles.filterClose} onClick={onClose}>✕</button>
        </div>

        <div className={styles.filterBody}>
          {periodoSlot}

          {/* Categorías */}
          <div className={styles.filterSection}>
            <p className={styles.filterSectionLabel}>Categoría</p>
            <CategoriaSidebarChecks
              categorias={categorias}
              filtrosCategorias={filtrosCategorias}
              onToggleCategoria={onToggleCategoria}
              classNameItem={styles.checkItem}
              classNameItemIndented={styles.checkItemIndented}
            />
          </div>

          {/* Método de pago */}
          <div className={styles.filterSection}>
            <p className={styles.filterSectionLabel}>Método de pago</p>
            {METODOS_PAGO.map(m => (
              <label key={m.value} className={styles.checkItem}>
                <input
                  type="checkbox"
                  checked={filtrosMetodos.includes(m.value)}
                  onChange={() => onToggleMetodo(m.value)}
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>

        <div className={styles.filterFooter}>
          <button className={styles.btnGhost} onClick={onLimpiar}>
            Limpiar filtros
          </button>
          <button className={styles.btnPrimary} onClick={onClose}>
            Aplicar
          </button>
        </div>
      </aside>
    </>
  )
}

function MovimientoRow({
  mov, esComun, onEdit, onDelete,
}: {
  mov:      Movimiento
  esComun:  boolean
  onEdit:   (id: number) => void
  onDelete: (mov: Movimiento) => void
}) {
  const { formatMonto } = useConfig()
  const badge     = METODO_BADGE[mov.metodo_pago_tipo]
  const esIngreso = mov.tipo === 'INGRESO'
  const esCredito = mov.metodo_pago_tipo === 'CREDITO'
  const monto = toMontoNumber(mov.monto)

  return (
    <div className={styles.movRow}>
      <div className={styles.movInfo}>
        <span className={styles.movDesc}>{mov.comentario || '—'}</span>
        <span className={styles.movCat}>{mov.categoria_nombre}</span>
      </div>

      {esComun && (
        <span className={styles.movAutor}>{mov.autor_nombre ?? '—'}</span>
      )}

      <span
        className={styles.movMonto}
        style={{ color: esIngreso ? '#22a06b' : esCredito ? '#6b7280' : '#0f0f0f' }}
      >
        {esIngreso ? '+' : esCredito ? '' : '−'}
        {formatMonto(monto)}
      </span>

      <span
        className={styles.movBadge}
        style={{ backgroundColor: badge.bg, color: badge.color }}
      >
        {badge.label}
      </span>

      <div className={styles.movActions}>
        <button
          className={styles.actionBtn}
          onClick={() => onEdit(mov.id)}
          title="Editar"
        >
          ✎
        </button>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
          onClick={() => onDelete(mov)}
          title="Eliminar"
        >
          🗑
        </button>
      </div>
    </div>
  )
}

function DateGroup({
  grupo, esComun, onEdit, onDelete,
}: {
  grupo:    GrupoFecha
  esComun:  boolean
  onEdit:   (id: number) => void
  onDelete: (mov: Movimiento) => void
}) {
  const { formatMonto } = useConfig()
  const subtotal = grupo.movimientos.reduce((acc, m) => acc + contribucionSaldo(m), 0)

  return (
    <div className={styles.grupo}>
      <div className={styles.grupoHeader}>
        <span className={styles.grupoLabel}>{grupo.label.toUpperCase()}</span>
        <span className={styles.grupoSep}> — </span>
        <span className={styles.grupoSubtotal}>
          {formatMontoNetoContribucion(subtotal, formatMonto)}
        </span>
      </div>
      {grupo.movimientos.map(m => (
        <MovimientoRow
          key={m.id}
          mov={m}
          esComun={esComun}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

function EmptyState({ hayFiltros, onLimpiar }: { hayFiltros: boolean; onLimpiar: () => void }) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon}>○</span>
      <p className={styles.emptyTitulo}>Sin movimientos</p>
      <p className={styles.emptySubtitulo}>para este período</p>
      {hayFiltros && (
        <button className={styles.btnGhost} onClick={onLimpiar} style={{ marginTop: '1rem' }}>
          Limpiar filtros
        </button>
      )}
    </div>
  )
}

function DeleteModal({
  mov,
  onCancel,
  onConfirm,
}: {
  mov:       Movimiento
  onCancel:  () => void
  onConfirm: () => void
}) {
  const { formatMonto } = useConfig()
  const monto = toMontoNumber(mov.monto)
  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
        <h2 className={styles.modalTitulo}>Eliminar movimiento</h2>
        <p className={styles.modalTexto}>
          ¿Eliminar{' '}
          <strong>"{mov.comentario || '—'}"</strong>{' '}
          por <strong>{formatMonto(monto)}</strong>?
          <br />
          Esta acción no se puede deshacer.
        </p>
        <div className={styles.modalBtns}>
          <button className={styles.btnGhost} onClick={onCancel}>
            Cancelar
          </button>
          <button className={styles.btnDanger} onClick={onConfirm}>
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

export default function CuentaPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { formatMonto } = useConfig()
  const { data: cuentasData, loading: cuentasLoading, error: cuentasError } =
    useCuentasPersonales()

  const cuenta: Cuenta | null = useMemo(() => {
    const c = cuentasData?.find(x => String(x.id) === id)
    if (!c) return null
    return {
      id: String(c.id),
      nombre: c.nombre,
      esPropia: c.es_propia,
      esTutelada: !c.es_propia,
      duenio: c.duenio_nombre ?? undefined,
      esComun: false,
    }
  }, [cuentasData, id])

  const hoy = new Date()
  const [mes,  setMes]  = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [modoPeriodo, setModoPeriodo] = useState<ModoPeriodo>('MES')
  const iniMes = primerUltimoDiaMesISO(hoy.getFullYear(), hoy.getMonth())
  const [rangoDesde, setRangoDesde] = useState(iniMes.desde)
  const [rangoHasta, setRangoHasta] = useState(iniMes.hasta)
  const [filtroTipo,         setFiltroTipo]         = useState<'TODOS' | 'INGRESO' | 'EGRESO'>('TODOS')
  const [busqueda,           setBusqueda]           = useState('')
  const [filtrosCategorias,  setFiltrosCategorias]  = useState<string[]>([])
  const [filtrosMetodos,     setFiltrosMetodos]     = useState<string[]>([])
  const [sidebarAbierto,     setSidebarAbierto]     = useState(false)
  const [movimientoAEliminar, setMovimientoAEliminar] = useState<Movimiento | null>(null)

  const { data: categoriasData } = useCategorias({
    ambito: 'PERSONAL',
    cuenta: id ? Number(id) : undefined,
  })
  const categorias = (categoriasData ?? []) as CategoriaFiltroFila[]

  const paramsPeriodo = useMemo(
    () => movimientosParamsPeriodo(modoPeriodo, mes, anio, rangoDesde, rangoHasta),
    [modoPeriodo, mes, anio, rangoDesde, rangoHasta],
  )

  const { movimientos, loading, error, refetch, eliminar } = useMovimientos({
    cuenta: id ? Number(id) : undefined,
    ambito: 'PERSONAL',
    ...paramsPeriodo,
    tipo: filtroTipo !== 'TODOS' ? filtroTipo : undefined,
    q: busqueda || undefined,
  })
  const movimientosTyped = (movimientos ?? []) as Movimiento[]

  const esActualMes = mes === hoy.getMonth() && anio === hoy.getFullYear()
  const esAnioMaximo = anio >= hoy.getFullYear()

  const irAnteriorMes = () => {
    if (mes === 0) { setMes(11); setAnio(a => a - 1) }
    else setMes(m => m - 1)
  }
  const irSiguienteMes = () => {
    if (esActualMes) return
    if (mes === 11) { setMes(0); setAnio(a => a + 1) }
    else setMes(m => m + 1)
  }

  const irAnteriorAnio = () => setAnio(a => a - 1)
  const irSiguienteAnio = () => {
    if (esAnioMaximo) return
    setAnio(a => a + 1)
  }

  const handleModoPeriodo = (m: ModoPeriodo) => {
    setModoPeriodo((prev) => {
      if (m === 'RANGO') {
        if (prev === 'ANIO') {
          setRangoDesde(`${anio}-01-01`)
          setRangoHasta(`${anio}-12-31`)
        } else {
          const x = primerUltimoDiaMesISO(anio, mes)
          setRangoDesde(x.desde)
          setRangoHasta(x.hasta)
        }
      }
      return m
    })
  }

  const cerrarSidebarAplicar = () => {
    if (modoPeriodo === 'RANGO' && rangoDesde && rangoHasta && rangoDesde > rangoHasta) {
      setRangoDesde(rangoHasta)
      setRangoHasta(rangoDesde)
    }
    setSidebarAbierto(false)
  }

  const filtrosActivos = filtrosCategorias.length + filtrosMetodos.length

  const toggleCategoria = (cat: CategoriaFiltroFila) =>
    setFiltrosCategorias((prev) => toggleCategoriaConJerarquia(prev, cat, categorias))

  const toggleMetodo = (met: string) =>
    setFiltrosMetodos(prev =>
      prev.includes(met) ? prev.filter(m => m !== met) : [...prev, met],
    )

  const limpiarFiltros = () => {
    setFiltrosCategorias([])
    setFiltrosMetodos([])
    setSidebarAbierto(false)
  }

  const confirmarEliminar = async () => {
    if (!movimientoAEliminar) return
    await eliminar(movimientoAEliminar.id)
    setMovimientoAEliminar(null)
  }

  const returnTo = `/gastos/cuenta/${id}`
  const irNuevo = () =>
    navigate(`/gastos/nuevo?ambito=PERSONAL&cuenta=${id}&returnTo=${encodeURIComponent(returnTo)}`)
  const irResumen = () => navigate(`/gastos/cuenta/${id}/resumen`)
  const irEditar = (movId: number) =>
    navigate(`/gastos/${movId}/editar?returnTo=${encodeURIComponent(returnTo)}`)

  const movimientosFiltrados = useMemo(() => {
    return movimientosTyped.filter(m => {
      if (filtrosCategorias.length > 0 && !filtrosCategorias.includes(m.categoria_nombre)) return false
      if (filtrosMetodos.length > 0 && !filtrosMetodos.includes(m.metodo_pago_tipo)) return false
      return true
    })
  }, [movimientosTyped, filtrosCategorias, filtrosMetodos])

  const grupos = groupByDate(movimientosFiltrados)

  const puedeMostrarEtiquetaPeriodo =
    filtrosActivos === 0 && filtroTipo === 'TODOS' && busqueda.trim() === ''

  const sumaMostrada = useMemo(
    () => movimientosFiltrados.reduce((acc, m) => acc + contribucionSaldo(m), 0),
    [movimientosFiltrados],
  )

  const totalLabel = puedeMostrarEtiquetaPeriodo
    ? etiquetaTotalPeriodo(modoPeriodo, mes, anio, rangoDesde, rangoHasta)
    : 'Total (filtros activos)'

  const hayFiltros =
    filtrosActivos > 0 || filtroTipo !== 'TODOS' || busqueda.trim() !== ''

  if (cuentasLoading) return <Cargando />
  if (cuentasError) return <ErrorCarga mensaje={cuentasError} />
  if (!cuenta) {
    return (
      <ErrorCarga
        mensaje="Cuenta no encontrada o sin acceso. Crea una cuenta en Configuración o elige otra en el menú."
      />
    )
  }

  if (loading) return <Cargando />
  if (error) return <ErrorCarga mensaje={error} />

  return (
    <div className={styles.page}>

      {/* ── Encabezado ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.tituloWrap}>
            <h1 className={styles.titulo}>{cuenta.nombre}</h1>
            {cuenta.esTutelada && cuenta.duenio && (
              <span className={styles.duenio}>({cuenta.duenio})</span>
            )}
          </div>
          {modoPeriodo === 'MES' && (
            <div className={styles.mesNav}>
              <button type="button" className={styles.mesBtn} onClick={irAnteriorMes} aria-label="Mes anterior">‹</button>
              <span className={styles.mesLabel}>{MESES[mes]} {anio}</span>
              <button type="button" className={styles.mesBtn} onClick={irSiguienteMes} disabled={esActualMes} aria-label="Mes siguiente">›</button>
            </div>
          )}
          {modoPeriodo === 'ANIO' && (
            <div className={styles.mesNav}>
              <button type="button" className={styles.mesBtn} onClick={irAnteriorAnio} aria-label="Año anterior">‹</button>
              <span className={styles.mesLabel}>{anio}</span>
              <button type="button" className={styles.mesBtn} onClick={irSiguienteAnio} disabled={esAnioMaximo} aria-label="Año siguiente">›</button>
            </div>
          )}
          {modoPeriodo === 'RANGO' && (
            <div className={styles.mesNav}>
              <span className={`${styles.mesLabel} ${styles.mesLabelRango}`}>
                {etiquetaEncabezadoRango(rangoDesde, rangoHasta)}
              </span>
            </div>
          )}
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.btnGhost} onClick={irResumen}>
            Resumen
          </button>
          <button
            type="button"
            className={`${styles.btnPrimary} ${styles.btnNuevoHeader}`}
            onClick={irNuevo}
          >
            + Nuevo gasto
          </button>
        </div>
      </div>

      {/* ── Barra de filtros ── */}
      <div className={styles.filterBar}>
        <SegmentedControl value={filtroTipo} onChange={setFiltroTipo} />

        <input
          className={styles.searchInput}
          type="text"
          placeholder="Buscar en descripción o categoría…"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />

        <button
          className={styles.btnGhost}
          onClick={() => setSidebarAbierto(true)}
          style={{ position: 'relative' }}
        >
          Filtros
          {filtrosActivos > 0 && (
            <span className={styles.filterBadge}>{filtrosActivos}</span>
          )}
        </button>

        <button type="button" className={`${styles.btnGhost} ${styles.btnNuevoBar}`} onClick={irResumen}>
          Resumen
        </button>

        <button className={`${styles.btnPrimary} ${styles.btnNuevoBar}`} onClick={irNuevo}>
          + Nuevo
        </button>
      </div>

      <div className={styles.totalSuma}>
        <div>
          <div className={styles.totalSumaLabel}>{totalLabel}</div>
          {!puedeMostrarEtiquetaPeriodo && (
            <div className={styles.totalSumaHint}>
              Tipo, búsqueda o panel lateral
            </div>
          )}
        </div>
        <span className={styles.totalSumaMonto}>
          {formatMontoNetoContribucion(sumaMostrada, formatMonto)}
        </span>
      </div>

      {/* ── Listado ── */}
      <div className={styles.lista}>
        {grupos.length === 0 ? (
          <EmptyState hayFiltros={hayFiltros} onLimpiar={limpiarFiltros} />
        ) : (
          grupos.map(grupo => (
            <DateGroup
              key={grupo.fecha}
              grupo={grupo}
              esComun={cuenta.esComun}
              onEdit={irEditar}
              onDelete={setMovimientoAEliminar}
            />
          ))
        )}
      </div>

      {/* ── Sidebar de filtros ── */}
      <FilterSidebar
        abierto={sidebarAbierto}
        periodoSlot={(
          <SeccionPeriodoFiltro
            modo={modoPeriodo}
            onModoChange={handleModoPeriodo}
            mes={mes}
            anio={anio}
            onMesAnioChange={(m, a) => { setMes(m); setAnio(a) }}
            rangoDesde={rangoDesde}
            rangoHasta={rangoHasta}
            onRangoChange={(desde, hasta) => { setRangoDesde(desde); setRangoHasta(hasta) }}
            anioMaximo={hoy.getFullYear()}
          />
        )}
        categorias={categorias}
        filtrosCategorias={filtrosCategorias}
        filtrosMetodos={filtrosMetodos}
        onToggleCategoria={toggleCategoria}
        onToggleMetodo={toggleMetodo}
        onClose={cerrarSidebarAplicar}
        onLimpiar={limpiarFiltros}
      />

      {/* ── Modal de eliminación ── */}
      {movimientoAEliminar && (
        <DeleteModal
          mov={movimientoAEliminar}
          onCancel={() => setMovimientoAEliminar(null)}
          onConfirm={confirmarEliminar}
        />
      )}
    </div>
  )
}
