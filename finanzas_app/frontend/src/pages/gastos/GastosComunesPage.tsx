import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMovimientos } from '@/hooks/useMovimientos'
import { useCategorias } from '@/hooks/useCatalogos'
import { useApi } from '@/hooks/useApi'
import { familiaApi } from '@/api/familia'
import { useAuth } from '@/context/AuthContext'
import { Cargando, ErrorCarga } from '@/components/ui'
import { useConfig } from '@/context/ConfigContext'
import { formatMontoNetoContribucion } from '@/utils/montoClp'
import styles from './GastosComunesPage.module.scss'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos (API snake_case)
// ─────────────────────────────────────────────────────────────────────────────

interface MovimientoComun {
  id: number
  fecha: string
  comentario: string
  categoria_nombre: string
  monto: number | string
  tipo: 'INGRESO' | 'EGRESO'
  metodo_pago_tipo: 'EFECTIVO' | 'DEBITO' | 'CREDITO'
  autor_nombre: string
  usuario?: number
}

interface GrupoFecha {
  fecha:        string
  label:        string
  movimientos:  MovimientoComun[]
}

const METODOS_PAGO: { value: MovimientoComun['metodo_pago_tipo']; label: string }[] = [
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

/** Misma lógica que el subtotal por día: egreso suma salvo TC; ingreso resta. */
function contribucionSaldo(m: MovimientoComun): number {
  const monto = toMontoNumber(m.monto)
  if (m.tipo === 'EGRESO' && m.metodo_pago_tipo === 'CREDITO') return 0
  return m.tipo === 'EGRESO' ? monto : -monto
}

function groupByDate(movimientos: MovimientoComun[]): GrupoFecha[] {
  const today = hoyISO()
  const map = new Map<string, MovimientoComun[]>()
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

const METODO_BADGE: Record<MovimientoComun['metodo_pago_tipo'], { label: string; bg: string; color: string }> = {
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
  categorias,
  usuarios,
  filtrosCategorias,
  filtrosMetodos,
  filtrosUsuarios,
  onToggleCategoria,
  onToggleMetodo,
  onToggleUsuario,
  onClose,
  onLimpiar,
}: {
  abierto:           boolean
  categorias:        { id: number; nombre: string }[]
  usuarios:          { id: number; nombre: string }[]
  filtrosCategorias: string[]
  filtrosMetodos:    string[]
  filtrosUsuarios:   number[]
  onToggleCategoria: (cat: string) => void
  onToggleMetodo:    (met: string) => void
  onToggleUsuario:   (uid: number) => void
  onClose:           () => void
  onLimpiar:         () => void
}) {
  return (
    <>
      <div
        className={`${styles.filterOverlay} ${abierto ? styles.filterOverlayVisible : ''}`}
        onClick={onClose}
      />
      <aside className={`${styles.filterPanel} ${abierto ? styles.filterPanelOpen : ''}`}>
        <div className={styles.filterHeader}>
          <span className={styles.filterTitulo}>Filtros</span>
          <button className={styles.filterClose} onClick={onClose}>✕</button>
        </div>

        <div className={styles.filterBody}>
          <div className={styles.filterSection}>
            <p className={styles.filterSectionLabel}>Categoría</p>
            {categorias.map(cat => (
              <label key={cat.id} className={styles.checkItem}>
                <input
                  type="checkbox"
                  checked={filtrosCategorias.includes(cat.nombre)}
                  onChange={() => onToggleCategoria(cat.nombre)}
                />
                {cat.nombre}
              </label>
            ))}
          </div>

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

          {usuarios.length > 0 && (
            <div className={styles.filterSection}>
              <p className={styles.filterSectionLabel}>Usuario</p>
              {usuarios.map(u => (
                <label key={u.id} className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={filtrosUsuarios.includes(u.id)}
                    onChange={() => onToggleUsuario(u.id)}
                  />
                  {u.nombre}
                </label>
              ))}
            </div>
          )}
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
  mov, usuarioId, onEdit, onDelete,
}: {
  mov:       MovimientoComun
  usuarioId: number | null
  onEdit:    (id: number) => void
  onDelete:  (mov: MovimientoComun) => void
}) {
  const { formatMonto } = useConfig()
  const badge     = METODO_BADGE[mov.metodo_pago_tipo]
  const esIngreso = mov.tipo === 'INGRESO'
  const esCredito = mov.metodo_pago_tipo === 'CREDITO'
  const esPropio  = usuarioId == null || mov.usuario === usuarioId

  return (
    <div className={styles.movRow}>
      <span
        className={styles.movAutor}
        style={{ color: esPropio ? '#0f0f0f' : undefined }}
      >
        {(mov.autor_nombre || '').split(' ')[0] || '—'}
      </span>

      <div className={styles.movInfo}>
        <span className={styles.movDesc}>{mov.comentario || '—'}</span>
        <span className={styles.movCat}>{mov.categoria_nombre}</span>
      </div>

      <span
        className={styles.movMonto}
        style={{
          color: esIngreso ? '#22a06b' : esCredito ? '#6b7280' : '#0f0f0f',
        }}
      >
        {esIngreso ? '+' : esCredito ? '' : '−'}
        {formatMonto(toMontoNumber(mov.monto))}
      </span>

      <span
        className={styles.movBadge}
        style={{ backgroundColor: badge.bg, color: badge.color }}
      >
        {badge.label}
      </span>

      {esPropio && (
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
      )}
    </div>
  )
}

function DateGroup({
  grupo, usuarioId, onEdit, onDelete,
}: {
  grupo:     GrupoFecha
  usuarioId: number | null
  onEdit:    (id: number) => void
  onDelete:  (mov: MovimientoComun) => void
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
          usuarioId={usuarioId}
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
  mov:       MovimientoComun
  onCancel:  () => void
  onConfirm: () => void
}) {
  const { formatMonto } = useConfig()
  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
        <h2 className={styles.modalTitulo}>Eliminar movimiento</h2>
        <p className={styles.modalTexto}>
          ¿Eliminar <strong>"{mov.comentario || '—'}"</strong> por{' '}
          <strong>{formatMonto(toMontoNumber(mov.monto))}</strong>?
          <br />
          Esta acción no se puede deshacer.
        </p>
        <div className={styles.modalBtns}>
          <button className={styles.btnGhost} onClick={onCancel}>Cancelar</button>
          <button className={styles.btnDanger} onClick={onConfirm}>Eliminar</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

export default function GastosComunesPage() {
  const navigate = useNavigate()
  const { formatMonto } = useConfig()
  const { usuario: usuarioAuth } = useAuth()
  const hoy = new Date()
  const [mes,  setMes]  = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [filtroTipo,        setFiltroTipo]        = useState<'TODOS' | 'INGRESO' | 'EGRESO'>('TODOS')
  const [busqueda,          setBusqueda]          = useState('')
  const [filtrosCategorias, setFiltrosCategorias] = useState<string[]>([])
  const [filtrosMetodos,    setFiltrosMetodos]    = useState<string[]>([])
  const [filtrosUsuarios,   setFiltrosUsuarios]   = useState<number[]>([])
  const [sidebarAbierto,    setSidebarAbierto]    = useState(false)
  const [movimientoAEliminar, setMovimientoAEliminar] = useState<MovimientoComun | null>(null)

  const { data: categoriasData } = useCategorias({ ambito: 'FAMILIAR' })
  const categorias = (categoriasData ?? []) as { id: number; nombre: string }[]

  const { data: miembrosRaw } = useApi(() => familiaApi.getMiembros(), [])

  const { movimientos, loading, error, refetch, eliminar } = useMovimientos({
    ambito: 'COMUN',
    mes: mes + 1,
    anio,
    tipo: filtroTipo !== 'TODOS' ? filtroTipo : undefined,
    q: busqueda || undefined,
  })
  const movimientosTyped = useMemo(
    () =>
      ((movimientos ?? []) as MovimientoComun[]).map((m) => ({
        ...m,
        monto: toMontoNumber(m.monto),
      })),
    [movimientos],
  )

  const usuariosFiltro = useMemo(() => {
    const fromApi = (miembrosRaw ?? []) as { id: number; nombre: string }[]
    if (fromApi.length > 0) {
      return fromApi.map(m => ({
        id: m.id,
        nombre: (m.nombre || '').trim().split(/\s+/)[0] || `Usuario ${m.id}`,
      }))
    }
    const map = new Map<number, string>()
    for (const m of movimientosTyped) {
      if (m.usuario != null) {
        const nom = (m.autor_nombre || '').trim().split(/\s+/)[0] || `Usuario ${m.usuario}`
        map.set(m.usuario, nom)
      }
    }
    return Array.from(map.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [miembrosRaw, movimientosTyped])

  const esActual = mes === hoy.getMonth() && anio === hoy.getFullYear()

  const irAnterior = () => {
    if (mes === 0) { setMes(11); setAnio(a => a - 1) }
    else setMes(m => m - 1)
  }
  const irSiguiente = () => {
    if (esActual) return
    if (mes === 11) { setMes(0); setAnio(a => a + 1) }
    else setMes(m => m + 1)
  }

  const filtrosActivos =
    filtrosCategorias.length + filtrosMetodos.length + filtrosUsuarios.length

  const toggleCategoria = (cat: string) =>
    setFiltrosCategorias(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat],
    )

  const toggleMetodo = (met: string) =>
    setFiltrosMetodos(prev =>
      prev.includes(met) ? prev.filter(m => m !== met) : [...prev, met],
    )

  const toggleUsuario = (uid: number) =>
    setFiltrosUsuarios(prev =>
      prev.includes(uid) ? prev.filter(u => u !== uid) : [...prev, uid],
    )

  const limpiarFiltros = () => {
    setFiltrosCategorias([])
    setFiltrosMetodos([])
    setFiltrosUsuarios([])
    setSidebarAbierto(false)
  }

  const confirmarEliminar = async () => {
    if (!movimientoAEliminar) return
    await eliminar(movimientoAEliminar.id)
    setMovimientoAEliminar(null)
  }

  const returnTo = '/gastos/comunes'
  const irNuevo  = () => navigate(`/gastos/nuevo?ambito=COMUN&returnTo=${encodeURIComponent(returnTo)}`)
  const irEditar = (id: number) => navigate(`/gastos/${id}/editar?returnTo=${encodeURIComponent(returnTo)}`)

  const movimientosFiltrados = useMemo(() => {
    return movimientosTyped.filter(m => {
      if (filtrosCategorias.length > 0 && !filtrosCategorias.includes(m.categoria_nombre)) return false
      if (filtrosMetodos.length > 0 && !filtrosMetodos.includes(m.metodo_pago_tipo)) return false
      if (filtrosUsuarios.length > 0) {
        const uid = m.usuario
        if (uid == null || !filtrosUsuarios.includes(uid)) return false
      }
      return true
    })
  }, [movimientosTyped, filtrosCategorias, filtrosMetodos, filtrosUsuarios])

  /** Total neto (egresos − ingresos, sin TC en el neto) según movimientos visibles. */
  const sumaMostrada = useMemo(
    () => movimientosFiltrados.reduce((acc, m) => acc + contribucionSaldo(m), 0),
    [movimientosFiltrados],
  )

  const sinFiltrosRestrictivos =
    filtrosActivos === 0 && filtroTipo === 'TODOS' && busqueda.trim() === ''

  const usuarioId = usuarioAuth?.id ?? null

  const grupos    = groupByDate(movimientosFiltrados)
  const hayFiltros = !sinFiltrosRestrictivos

  if (loading) return <Cargando />
  if (error) return <ErrorCarga mensaje={error} />

  return (
    <div className={styles.page}>

      {/* ── Encabezado ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.titulo}>Gastos comunes</h1>
          <div className={styles.mesNav}>
            <button className={styles.mesBtn} onClick={irAnterior} aria-label="Mes anterior">‹</button>
            <span className={styles.mesLabel}>{MESES[mes]} {anio}</span>
            <button className={styles.mesBtn} onClick={irSiguiente} disabled={esActual} aria-label="Mes siguiente">›</button>
          </div>
        </div>
        <button className={`${styles.btnPrimary} ${styles.btnNuevoHeader}`} onClick={irNuevo}>
          + Nuevo gasto
        </button>
      </div>

      {/* ── Barra de filtros ── */}
      <div className={styles.filterBar}>
        <SegmentedControl value={filtroTipo} onChange={setFiltroTipo} />

        <input
          className={styles.searchInput}
          type="text"
          placeholder="Buscar descripción..."
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

        <button className={`${styles.btnPrimary} ${styles.btnNuevoBar}`} onClick={irNuevo}>
          + Nuevo
        </button>
      </div>

      <div className={styles.totalSuma}>
        <div>
          <div className={styles.totalSumaLabel}>
            {sinFiltrosRestrictivos
              ? `Total ${MESES[mes]} ${anio}`
              : 'Total (filtros activos)'}
          </div>
          {!sinFiltrosRestrictivos && (
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
              usuarioId={usuarioId}
              onEdit={irEditar}
              onDelete={setMovimientoAEliminar}
            />
          ))
        )}
      </div>

      {/* ── Sidebar de filtros ── */}
      <FilterSidebar
        abierto={sidebarAbierto}
        categorias={categorias}
        usuarios={usuariosFiltro}
        filtrosCategorias={filtrosCategorias}
        filtrosMetodos={filtrosMetodos}
        filtrosUsuarios={filtrosUsuarios}
        onToggleCategoria={toggleCategoria}
        onToggleMetodo={toggleMetodo}
        onToggleUsuario={toggleUsuario}
        onClose={() => setSidebarAbierto(false)}
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
