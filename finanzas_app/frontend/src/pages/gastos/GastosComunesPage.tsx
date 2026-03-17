import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './GastosComunesPage.module.scss'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

interface MovimientoComun {
  id:          number
  fecha:       string
  descripcion: string
  categoria:   string
  monto:       number
  tipo:        'INGRESO' | 'EGRESO'
  metodo:      'EFECTIVO' | 'DEBITO' | 'CREDITO'
  autor:       string
  autorId:     string
}

interface GrupoFecha {
  fecha:        string
  label:        string
  movimientos:  MovimientoComun[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Datos mock  // TODO: reemplazar por fetch al backend
// ─────────────────────────────────────────────────────────────────────────────

const USUARIO_ACTUAL = { id: 'jaime', nombre: 'Jaime' }

const MOCK_MOVIMIENTOS_INIT: MovimientoComun[] = [
  { id: 1, fecha: '2026-03-17', descripcion: 'Supermercado Lider',  categoria: 'Alimentación', monto: 87400,  tipo: 'EGRESO', metodo: 'DEBITO',   autor: 'Jaime', autorId: 'jaime' },
  { id: 2, fecha: '2026-03-17', descripcion: 'Farmacia Cruz Verde', categoria: 'Salud',        monto: 15600,  tipo: 'EGRESO', metodo: 'EFECTIVO', autor: 'Glori', autorId: 'glori' },
  { id: 3, fecha: '2026-03-15', descripcion: 'Agua + Luz',          categoria: 'Servicios',    monto: 62300,  tipo: 'EGRESO', metodo: 'EFECTIVO', autor: 'Jaime', autorId: 'jaime' },
  { id: 4, fecha: '2026-03-13', descripcion: 'Feria semanal',       categoria: 'Alimentación', monto: 28000,  tipo: 'EGRESO', metodo: 'EFECTIVO', autor: 'Glori', autorId: 'glori' },
  { id: 5, fecha: '2026-03-10', descripcion: 'Gas',                 categoria: 'Servicios',    monto: 18500,  tipo: 'EGRESO', metodo: 'EFECTIVO', autor: 'Jaime', autorId: 'jaime' },
  { id: 6, fecha: '2026-03-08', descripcion: 'Matrícula U',         categoria: 'Educación',    monto: 320000, tipo: 'EGRESO', metodo: 'CREDITO',  autor: 'Glori', autorId: 'glori' },
]

const MOCK_CATEGORIAS = [
  'Alimentación', 'Transporte', 'Servicios', 'Salud',
  'Educación', 'Entretención',
]

const METODOS_PAGO: { value: MovimientoComun['metodo']; label: string }[] = [
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

const clp = (n: number) =>
  n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })

const fechaGrupo = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES_CORTOS[m - 1]}`
}

const hoyISO = () => {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`
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

const METODO_BADGE: Record<MovimientoComun['metodo'], { label: string; bg: string; color: string }> = {
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
  filtrosCategorias,
  filtrosMetodos,
  onToggleCategoria,
  onToggleMetodo,
  onClose,
  onLimpiar,
}: {
  abierto:           boolean
  filtrosCategorias: string[]
  filtrosMetodos:    string[]
  onToggleCategoria: (cat: string) => void
  onToggleMetodo:    (met: string) => void
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
            {MOCK_CATEGORIAS.map(cat => (
              <label key={cat} className={styles.checkItem}>
                <input
                  type="checkbox"
                  checked={filtrosCategorias.includes(cat)}
                  onChange={() => onToggleCategoria(cat)}
                />
                {cat}
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
  mov, onEdit, onDelete,
}: {
  mov:      MovimientoComun
  onEdit:   (id: number) => void
  onDelete: (mov: MovimientoComun) => void
}) {
  const badge     = METODO_BADGE[mov.metodo]
  const esIngreso = mov.tipo === 'INGRESO'
  const esPropio  = mov.autorId === USUARIO_ACTUAL.id

  return (
    <div className={styles.movRow}>
      <span
        className={styles.movAutor}
        style={{ color: esPropio ? '#0f0f0f' : undefined }}
      >
        {mov.autor.split(' ')[0]}
      </span>

      <div className={styles.movInfo}>
        <span className={styles.movDesc}>{mov.descripcion}</span>
        <span className={styles.movCat}>{mov.categoria}</span>
      </div>

      <span
        className={styles.movMonto}
        style={{ color: esIngreso ? '#22a06b' : '#0f0f0f' }}
      >
        {esIngreso ? '+' : '−'}{clp(mov.monto)}
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
  grupo, onEdit, onDelete,
}: {
  grupo:    GrupoFecha
  onEdit:   (id: number) => void
  onDelete: (mov: MovimientoComun) => void
}) {
  const subtotal = grupo.movimientos.reduce(
    (acc, m) => acc + (m.tipo === 'EGRESO' ? m.monto : -m.monto), 0,
  )

  return (
    <div className={styles.grupo}>
      <div className={styles.grupoHeader}>
        <span className={styles.grupoLabel}>{grupo.label.toUpperCase()}</span>
        <span className={styles.grupoSep}> — </span>
        <span className={styles.grupoSubtotal}>{clp(subtotal)}</span>
      </div>
      {grupo.movimientos.map(m => (
        <MovimientoRow
          key={m.id}
          mov={m}
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
  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
        <h2 className={styles.modalTitulo}>Eliminar movimiento</h2>
        <p className={styles.modalTexto}>
          ¿Eliminar <strong>"{mov.descripcion}"</strong> por{' '}
          <strong>{clp(mov.monto)}</strong>?
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

  // Movimientos (TODO: fetch al backend)
  const [movimientos, setMovimientos] = useState<MovimientoComun[]>(MOCK_MOVIMIENTOS_INIT)

  // Navegador de mes
  const hoy = new Date()
  const [mes,  setMes]  = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())
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

  // Filtros
  const [filtroTipo,        setFiltroTipo]        = useState<'TODOS' | 'INGRESO' | 'EGRESO'>('TODOS')
  const [busqueda,          setBusqueda]          = useState('')
  const [filtrosCategorias, setFiltrosCategorias] = useState<string[]>([])
  const [filtrosMetodos,    setFiltrosMetodos]    = useState<string[]>([])
  const [sidebarAbierto,    setSidebarAbierto]    = useState(false)

  const filtrosActivos = filtrosCategorias.length + filtrosMetodos.length

  const toggleCategoria = (cat: string) =>
    setFiltrosCategorias(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat],
    )

  const toggleMetodo = (met: string) =>
    setFiltrosMetodos(prev =>
      prev.includes(met) ? prev.filter(m => m !== met) : [...prev, met],
    )

  const limpiarFiltros = () => {
    setFiltrosCategorias([])
    setFiltrosMetodos([])
    setSidebarAbierto(false)
  }

  // Modal de eliminación
  const [movimientoAEliminar, setMovimientoAEliminar] = useState<MovimientoComun | null>(null)

  const confirmarEliminar = () => {
    if (!movimientoAEliminar) return
    setMovimientos(prev => prev.filter(m => m.id !== movimientoAEliminar.id))
    setMovimientoAEliminar(null)
    // TODO: llamar al backend para eliminar
  }

  const irNuevo  = () => navigate('/gastos/nuevo?ambito=COMUN')
  const irEditar = (id: number) => navigate(`/gastos/${id}/editar`)

  // Movimientos filtrados
  const movimientosFiltrados = useMemo(() => {
    return movimientos.filter(m => {
      const [y, mo] = m.fecha.split('-').map(Number)
      if (mo - 1 !== mes || y !== anio) return false
      if (filtroTipo !== 'TODOS' && m.tipo !== filtroTipo) return false
      if (busqueda && !m.descripcion.toLowerCase().includes(busqueda.toLowerCase())) return false
      if (filtrosCategorias.length > 0 && !filtrosCategorias.includes(m.categoria)) return false
      if (filtrosMetodos.length > 0 && !filtrosMetodos.includes(m.metodo)) return false
      return true
    })
  }, [movimientos, mes, anio, filtroTipo, busqueda, filtrosCategorias, filtrosMetodos])

  const grupos    = groupByDate(movimientosFiltrados)
  const hayFiltros = filtrosActivos > 0 || filtroTipo !== 'TODOS' || busqueda.length > 0

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

      {/* ── Listado ── */}
      <div className={styles.lista}>
        {grupos.length === 0 ? (
          <EmptyState hayFiltros={hayFiltros} onLimpiar={limpiarFiltros} />
        ) : (
          grupos.map(grupo => (
            <DateGroup
              key={grupo.fecha}
              grupo={grupo}
              onEdit={irEditar}
              onDelete={setMovimientoAEliminar}
            />
          ))
        )}
      </div>

      {/* ── Sidebar de filtros ── */}
      <FilterSidebar
        abierto={sidebarAbierto}
        filtrosCategorias={filtrosCategorias}
        filtrosMetodos={filtrosMetodos}
        onToggleCategoria={toggleCategoria}
        onToggleMetodo={toggleMetodo}
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
