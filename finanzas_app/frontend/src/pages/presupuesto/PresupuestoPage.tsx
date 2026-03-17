import { useState, useMemo } from 'react'
import styles from './PresupuestoPage.module.scss'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

interface CategoriaPresupuesto {
  id: string
  nombre: string
  presupuestado: number | null
  gastado: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Datos mock  // TODO: reemplazar por fetch al backend
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_FAMILIAR: CategoriaPresupuesto[] = [
  { id: '1', nombre: 'Alimentación', presupuestado: 150000, gastado: 115400 },
  { id: '2', nombre: 'Servicios', presupuestado: 80000, gastado: 62300 },
  { id: '3', nombre: 'Educación', presupuestado: 300000, gastado: 320000 },
  { id: '4', nombre: 'Salud', presupuestado: 50000, gastado: 15600 },
  { id: '5', nombre: 'Transporte', presupuestado: null, gastado: 45000 },
  { id: '6', nombre: 'Entretención', presupuestado: null, gastado: 10990 },
]

const MOCK_PERSONAL: CategoriaPresupuesto[] = [
  { id: '7', nombre: 'Alimentación', presupuestado: 80000, gastado: 52000 },
  { id: '8', nombre: 'Transporte', presupuestado: 60000, gastado: 45000 },
  { id: '9', nombre: 'Entretención', presupuestado: 30000, gastado: 38500 },
]

// Categorías disponibles para agregar al presupuesto  // TODO: reemplazar por fetch al backend
const MOCK_CATEGORIAS_DISPONIBLES = [
  'Alimentación', 'Transporte', 'Servicios', 'Salud',
  'Educación', 'Entretención', 'Honorarios',
]

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const clp = (n: number) =>
  n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })

function colorBarra(gastado: number, presupuestado: number): string {
  const pct = (gastado / presupuestado) * 100
  if (pct <= 80) return '#22a06b'
  if (pct <= 100) return '#f59e0b'
  return '#ff4d4d'
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponentes internos
// ─────────────────────────────────────────────────────────────────────────────

function ResumenCards({
  totalPresupuestado,
  totalGastado,
  disponible,
  porcentajeGeneral,
}: {
  totalPresupuestado: number
  totalGastado: number
  disponible: number
  porcentajeGeneral: number
}) {
  const isExcedido = disponible < 0
  return (
    <div className={styles.resumenGrid}>
      <div className={styles.resumenCard}>
        <span className={styles.resumenLabel}>Presupuestado</span>
        <span className={styles.resumenValor}>{clp(totalPresupuestado)}</span>
      </div>
      <div className={styles.resumenCard}>
        <span className={styles.resumenLabel}>Gastado</span>
        <span className={styles.resumenValor}>{clp(totalGastado)}</span>
        <span className={styles.resumenPorcentaje}>
          {porcentajeGeneral.toFixed(1)}%
        </span>
      </div>
      <div className={styles.resumenCard}>
        <span className={styles.resumenLabel}>
          {isExcedido ? 'Excedido' : 'Disponible'}
        </span>
        <span
          className={`${styles.resumenValor} ${
            isExcedido ? styles.resumenValorDanger : styles.resumenValorSuccess
          }`}
        >
          {clp(Math.abs(disponible))}
        </span>
      </div>
    </div>
  )
}

function ItemConPresupuesto({
  cat,
  onStartEdit,
  editingId,
  editValue,
  onEditChange,
  onEditConfirm,
  onEditCancel,
}: {
  cat: CategoriaPresupuesto
  onStartEdit: (id: string) => void
  editingId: string | null
  editValue: string
  onEditChange: (v: string) => void
  onEditConfirm: (id: string) => void
  onEditCancel: () => void
}) {
  const presup = cat.presupuestado ?? 0
  const pct = presup > 0 ? (cat.gastado / presup) * 100 : 0
  const color = colorBarra(cat.gastado, presup)
  const barWidth = Math.min(pct, 100)
  const excedido = pct > 100 ? cat.gastado - presup : 0
  const isEditing = editingId === cat.id

  return (
    <div className={styles.catItem}>
      <div className={styles.catItemHeader}>
        <span className={styles.catItemNombre}>{cat.nombre}</span>
        {!isEditing && (
          <button
            type="button"
            className={styles.btnEdit}
            onClick={() => onStartEdit(cat.id)}
            aria-label="Editar monto"
          >
            ✎
          </button>
        )}
      </div>
      {isEditing ? (
        <div className={styles.catItemEditRow}>
          <span className={styles.catItemMontos}>
            {clp(cat.gastado)} de{' '}
            <input
              type="number"
              className={styles.catItemEditInput}
              value={editValue}
              onChange={(e) => onEditChange(e.target.value)}
              min={0}
              step={1000}
              autoFocus
            />
          </span>
          <button
            type="button"
            className={styles.btnFormConfirm}
            onClick={() => onEditConfirm(cat.id)}
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
            {clp(cat.gastado)} de {clp(presup)}
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
            <span
              className={styles.catItemPct}
              style={{ color }}
            >
              {pct.toFixed(1)}%
            </span>
            {excedido > 0 ? (
              <span className={styles.catItemIndicadorExcedido}>
                Excedido +{clp(excedido)}
              </span>
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
      )}
    </div>
  )
}

function ItemSinPresupuesto({
  cat,
  onStartAssign,
  assignPresupuestoId,
  assignValue,
  onAssignChange,
  onAssignConfirm,
  onAssignCancel,
}: {
  cat: CategoriaPresupuesto
  onStartAssign: (id: string) => void
  assignPresupuestoId: string | null
  assignValue: string
  onAssignChange: (v: string) => void
  onAssignConfirm: (id: string) => void
  onAssignCancel: () => void
}) {
  const isAssigning = assignPresupuestoId === cat.id

  return (
    <div className={styles.catItemSinPresupuesto}>
      <div className={styles.catItemSinHeader}>
        <div className={styles.catItemSinLeft}>
          <span className={styles.catItemSinNombre}>{cat.nombre}</span>
          <span className={styles.badgeSinPresupuesto}>sin presupuesto</span>
        </div>
        {!isAssigning && (
          <button
            type="button"
            className={styles.btnAsignar}
            onClick={() => onStartAssign(cat.id)}
          >
            + Asignar presupuesto
          </button>
        )}
      </div>
      {isAssigning ? (
        <div className={styles.addForm}>
          <input
            type="number"
            className={styles.addFormInput}
            placeholder="Monto"
            value={assignValue}
            onChange={(e) => onAssignChange(e.target.value)}
            min={0}
            step={1000}
            autoFocus
          />
          <button
            type="button"
            className={styles.btnFormConfirm}
            onClick={() => onAssignConfirm(cat.id)}
            aria-label="Confirmar"
          >
            ✓
          </button>
          <button
            type="button"
            className={styles.btnFormCancel}
            onClick={onAssignCancel}
            aria-label="Cancelar"
          >
            ✕
          </button>
        </div>
      ) : (
        <>
          <span className={styles.catItemSinGastado}>
            {clp(cat.gastado)} gastado
          </span>
          <div className={styles.catItemSinBarWrap}>
            <div className={styles.barTrackEmpty} />
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

export default function PresupuestoPage() {
  const hoy = new Date()
  const [mes, setMes] = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [ambito, setAmbito] = useState<'FAMILIAR' | 'PERSONAL'>('FAMILIAR')
  const [categoriasFamiliar, setCategoriasFamiliar] =
    useState<CategoriaPresupuesto[]>(MOCK_FAMILIAR)
  const [categoriasPersonal, setCategoriasPersonal] =
    useState<CategoriaPresupuesto[]>(MOCK_PERSONAL)

  const [showAddForm, setShowAddForm] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryMonto, setNewCategoryMonto] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editMontoValue, setEditMontoValue] = useState('')

  const [assignPresupuestoId, setAssignPresupuestoId] = useState<string | null>(
    null
  )
  const [assignMontoValue, setAssignMontoValue] = useState('')

  const esActual = mes === hoy.getMonth() && anio === hoy.getFullYear()

  const irAnterior = () => {
    if (mes === 0) {
      setMes(11)
      setAnio((a) => a - 1)
    } else setMes((m) => m - 1)
  }

  const irSiguiente = () => {
    if (esActual) return
    if (mes === 11) {
      setMes(0)
      setAnio((a) => a + 1)
    } else setMes((m) => m + 1)
  }

  const categorias =
    ambito === 'FAMILIAR' ? categoriasFamiliar : categoriasPersonal
  const setCategorias =
    ambito === 'FAMILIAR' ? setCategoriasFamiliar : setCategoriasPersonal

  const conPresupuesto = useMemo(
    () => categorias.filter((c) => c.presupuestado !== null),
    [categorias]
  )
  const totalPresupuestado = conPresupuesto.reduce(
    (s, c) => s + (c.presupuestado ?? 0),
    0
  )
  const totalGastado = conPresupuesto.reduce((s, c) => s + c.gastado, 0)
  const disponible = totalPresupuestado - totalGastado
  const porcentajeGeneral =
    totalPresupuestado > 0
      ? (totalGastado / totalPresupuestado) * 100
      : 0

  const conPresupuestoOrdenadas = useMemo(
    () =>
      [...conPresupuesto].sort((a, b) => {
        const pctA = ((a.presupuestado ?? 0) > 0)
          ? (a.gastado / (a.presupuestado ?? 1)) * 100
          : 0
        const pctB = ((b.presupuestado ?? 0) > 0)
          ? (b.gastado / (b.presupuestado ?? 1)) * 100
          : 0
        return pctB - pctA
      }),
    [conPresupuesto]
  )
  const sinPresupuestoOrdenadas = useMemo(
    () =>
      [...categorias.filter((c) => c.presupuestado === null)].sort((a, b) =>
        a.nombre.localeCompare(b.nombre)
      ),
    [categorias]
  )

  const categoriasNombres = categorias.map((c) => c.nombre)
  const categoriasDisponiblesParaAgregar = MOCK_CATEGORIAS_DISPONIBLES.filter(
    (nombre) => !categoriasNombres.includes(nombre)
  )

  const handleAddCategory = () => {
    const monto = parseInt(newCategoryMonto, 10)
    if (!newCategoryName.trim() || !Number.isFinite(monto) || monto <= 0) return
    const nuevoId = String(Date.now())
    setCategorias((prev) => [
      ...prev,
      {
        id: nuevoId,
        nombre: newCategoryName.trim(),
        presupuestado: monto,
        gastado: 0,
      },
    ])
    setNewCategoryName('')
    setNewCategoryMonto('')
    setShowAddForm(false)
  }

  const handleStartEdit = (id: string) => {
    const cat = categorias.find((c) => c.id === id)
    if (cat?.presupuestado != null) {
      setEditingId(id)
      setEditMontoValue(String(cat.presupuestado))
    }
  }

  const handleEditConfirm = (id: string) => {
    const monto = parseInt(editMontoValue, 10)
    if (!Number.isFinite(monto) || monto < 0) return
    setCategorias((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, presupuestado: monto } : c
      )
    )
    setEditingId(null)
    setEditMontoValue('')
  }

  const handleEditCancel = () => {
    setEditingId(null)
    setEditMontoValue('')
  }

  const handleStartAssign = (id: string) => {
    setAssignPresupuestoId(id)
    setAssignMontoValue('')
  }

  const handleAssignConfirm = (id: string) => {
    const monto = parseInt(assignMontoValue, 10)
    if (!Number.isFinite(monto) || monto < 0) return
    setCategorias((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, presupuestado: monto } : c
      )
    )
    setAssignPresupuestoId(null)
    setAssignMontoValue('')
  }

  const handleAssignCancel = () => {
    setAssignPresupuestoId(null)
    setAssignMontoValue('')
  }

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.titulo}>Presupuesto</h1>
          <div className={styles.mesNav}>
            <button
              type="button"
              className={styles.mesBtn}
              onClick={irAnterior}
              aria-label="Mes anterior"
            >
              ‹
            </button>
            <span className={styles.mesLabel}>
              {MESES[mes]} {anio}
            </span>
            <button
              type="button"
              className={styles.mesBtn}
              onClick={irSiguiente}
              disabled={esActual}
              aria-label="Mes siguiente"
            >
              ›
            </button>
          </div>
        </div>
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${ambito === 'FAMILIAR' ? styles.tabActive : ''}`}
            onClick={() => setAmbito('FAMILIAR')}
          >
            Familiar
          </button>
          <button
            type="button"
            className={`${styles.tab} ${ambito === 'PERSONAL' ? styles.tabActive : ''}`}
            onClick={() => setAmbito('PERSONAL')}
          >
            Personal
          </button>
        </div>
      </div>

      {/* ── Resumen ── */}
      <section className={styles.resumenSection}>
        <h2 className={styles.resumenTitle}>Resumen</h2>
        <ResumenCards
          totalPresupuestado={totalPresupuestado}
          totalGastado={totalGastado}
          disponible={disponible}
          porcentajeGeneral={porcentajeGeneral}
        />
      </section>

      {/* ── Por categoría ── */}
      <section className={styles.categoriaSection}>
        <div className={styles.categoriaHeader}>
          <h2 className={styles.categoriaTitle}>Por categoría</h2>
          <button
            type="button"
            className={styles.btnAddCat}
            onClick={() => setShowAddForm((v) => !v)}
          >
            + Categoría
          </button>
        </div>

        {showAddForm && (
          <div className={styles.addForm}>
            <select
              className={styles.addFormSelect}
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              aria-label="Seleccionar categoría"
            >
              <option value="">Seleccionar categoría ▾</option>
              {categoriasDisponiblesParaAgregar.map((nombre) => (
                <option key={nombre} value={nombre}>
                  {nombre}
                </option>
              ))}
            </select>
            <input
              type="number"
              className={styles.addFormInput}
              placeholder="Monto presupuestado"
              value={newCategoryMonto}
              onChange={(e) => setNewCategoryMonto(e.target.value)}
              min={0}
              step={1000}
            />
            <button
              type="button"
              className={styles.btnFormConfirm}
              onClick={handleAddCategory}
              aria-label="Agregar"
            >
              ✓
            </button>
            <button
              type="button"
              className={styles.btnFormCancel}
              onClick={() => {
                setShowAddForm(false)
                setNewCategoryName('')
                setNewCategoryMonto('')
              }}
              aria-label="Cancelar"
            >
              ✕
            </button>
          </div>
        )}

        {conPresupuestoOrdenadas.map((cat) => (
          <ItemConPresupuesto
            key={cat.id}
            cat={cat}
            onStartEdit={handleStartEdit}
            editingId={editingId}
            editValue={editMontoValue}
            onEditChange={setEditMontoValue}
            onEditConfirm={handleEditConfirm}
            onEditCancel={handleEditCancel}
          />
        ))}
        {sinPresupuestoOrdenadas.map((cat) => (
          <ItemSinPresupuesto
            key={cat.id}
            cat={cat}
            onStartAssign={handleStartAssign}
            assignPresupuestoId={assignPresupuestoId}
            assignValue={assignMontoValue}
            onAssignChange={setAssignMontoValue}
            onAssignConfirm={handleAssignConfirm}
            onAssignCancel={handleAssignCancel}
          />
        ))}
      </section>
    </div>
  )
}
