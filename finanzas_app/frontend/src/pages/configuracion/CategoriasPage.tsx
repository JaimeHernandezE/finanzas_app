import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import styles from './CategoriasPage.module.scss'

// -----------------------------------------------------------------------------
// Tipos y mock — TODO: reemplazar por fetch al backend
// -----------------------------------------------------------------------------

interface Categoria {
  id: string
  nombre: string
  tipo: 'INGRESO' | 'EGRESO'
  esInversion: boolean
  ambito: 'GLOBAL' | 'FAMILIAR' | 'PERSONAL'
}

const MOCK_CATEGORIAS: Categoria[] = [
  { id: '1', nombre: 'Alimentación', tipo: 'EGRESO', esInversion: false, ambito: 'GLOBAL' },
  { id: '2', nombre: 'Transporte', tipo: 'EGRESO', esInversion: false, ambito: 'GLOBAL' },
  { id: '3', nombre: 'Servicios', tipo: 'EGRESO', esInversion: false, ambito: 'GLOBAL' },
  { id: '4', nombre: 'Salud', tipo: 'EGRESO', esInversion: false, ambito: 'GLOBAL' },
  { id: '5', nombre: 'Educación', tipo: 'EGRESO', esInversion: false, ambito: 'GLOBAL' },
  { id: '6', nombre: 'Entretención', tipo: 'EGRESO', esInversion: false, ambito: 'GLOBAL' },
  { id: '7', nombre: 'Sueldo', tipo: 'INGRESO', esInversion: false, ambito: 'GLOBAL' },
  { id: '8', nombre: 'Gastos Casa', tipo: 'EGRESO', esInversion: false, ambito: 'FAMILIAR' },
  { id: '9', nombre: 'Honorarios', tipo: 'INGRESO', esInversion: false, ambito: 'PERSONAL' },
  { id: '10', nombre: 'Fondo Mutuo', tipo: 'EGRESO', esInversion: true, ambito: 'PERSONAL' },
]

type AmbitoEditable = 'FAMILIAR' | 'PERSONAL'

// -----------------------------------------------------------------------------
// Subcomponentes internos
// -----------------------------------------------------------------------------

function SegmentedControl({
  value,
  onChange,
}: {
  value: 'INGRESO' | 'EGRESO'
  onChange: (v: 'INGRESO' | 'EGRESO') => void
}) {
  return (
    <div className={styles.segmented}>
      <button
        type="button"
        className={value === 'EGRESO' ? styles.segmentedActive : ''}
        onClick={() => onChange('EGRESO')}
      >
        Egreso
      </button>
      <button
        type="button"
        className={value === 'INGRESO' ? styles.segmentedActive : ''}
        onClick={() => onChange('INGRESO')}
      >
        Ingreso
      </button>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Página
// -----------------------------------------------------------------------------

export default function CategoriasPage() {
  const [categorias, setCategorias] = useState<Categoria[]>(MOCK_CATEGORIAS)
  const [filtroTipo, setFiltroTipo] = useState<'INGRESO' | 'EGRESO'>('EGRESO')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [addingInGroup, setAddingInGroup] = useState<AmbitoEditable | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editTipo, setEditTipo] = useState<'INGRESO' | 'EGRESO'>('EGRESO')
  const [editEsInversion, setEditEsInversion] = useState(false)
  const [addNombre, setAddNombre] = useState('')
  const [addTipo, setAddTipo] = useState<'INGRESO' | 'EGRESO'>('EGRESO')
  const [addEsInversion, setAddEsInversion] = useState(false)

  const filtradas = useMemo(
    () => categorias.filter((c) => c.tipo === filtroTipo),
    [categorias, filtroTipo]
  )
  const globales = useMemo(() => filtradas.filter((c) => c.ambito === 'GLOBAL'), [filtradas])
  const familiares = useMemo(() => filtradas.filter((c) => c.ambito === 'FAMILIAR'), [filtradas])
  const personales = useMemo(() => filtradas.filter((c) => c.ambito === 'PERSONAL'), [filtradas])

  const startEdit = (c: Categoria) => {
    setEditingId(c.id)
    setEditNombre(c.nombre)
    setEditTipo(c.tipo)
    setEditEsInversion(c.esInversion)
    setDeletingId(null)
    setAddingInGroup(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const saveEdit = () => {
    if (!editingId) return
    setCategorias((prev) =>
      prev.map((c) =>
        c.id === editingId
          ? { ...c, nombre: editNombre, tipo: editTipo, esInversion: editEsInversion }
          : c
      )
    )
    setEditingId(null)
  }

  const startDelete = (id: string) => {
    setDeletingId(id)
    setEditingId(null)
    setAddingInGroup(null)
  }

  const confirmDelete = (id: string) => {
    setCategorias((prev) => prev.filter((c) => c.id !== id))
    setDeletingId(null)
  }

  const cancelDelete = () => setDeletingId(null)

  const startAdd = (ambito: AmbitoEditable) => {
    setAddingInGroup(ambito)
    setAddNombre('')
    setAddTipo(filtroTipo)
    setAddEsInversion(false)
    setEditingId(null)
    setDeletingId(null)
  }

  const cancelAdd = () => setAddingInGroup(null)

  const saveAdd = () => {
    if (!addingInGroup || !addNombre.trim()) return
    const nueva: Categoria = {
      id: `n-${Date.now()}`,
      nombre: addNombre.trim(),
      tipo: addTipo,
      esInversion: addEsInversion,
      ambito: addingInGroup,
    }
    setCategorias((prev) => [...prev, nueva])
    setAddingInGroup(null)
  }

  const renderFila = (c: Categoria) => {
    const isGlobal = c.ambito === 'GLOBAL'
    const isEditing = editingId === c.id
    const isDeleting = deletingId === c.id

    if (isDeleting) {
      return (
        <div key={c.id} className={styles.fila}>
          <span className={styles.confirmText}>¿Eliminar «{c.nombre}»?</span>
          <div className={styles.confirmActions}>
            <button type="button" className={styles.btnConfirmSi} onClick={() => confirmDelete(c.id)}>Sí</button>
            <button type="button" className={styles.btnConfirmNo} onClick={cancelDelete}>No</button>
          </div>
        </div>
      )
    }

    if (isEditing) {
      return (
        <div key={c.id} className={styles.filaEdicion}>
          <input
            type="text"
            className={styles.inputNombre}
            value={editNombre}
            onChange={(e) => setEditNombre(e.target.value)}
          />
          {!isGlobal && (
            <>
              <select
                className={styles.selectTipo}
                value={editTipo}
                onChange={(e) => setEditTipo(e.target.value as 'INGRESO' | 'EGRESO')}
              >
                <option value="EGRESO">Egreso</option>
                <option value="INGRESO">Ingreso</option>
              </select>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={editEsInversion}
                  onChange={(e) => setEditEsInversion(e.target.checked)}
                />
                inversión
              </label>
            </>
          )}
          <button type="button" className={styles.btnOk} onClick={saveEdit} title="Guardar">✓</button>
          <button type="button" className={styles.btnCancel} onClick={cancelEdit} title="Cancelar">✕</button>
        </div>
      )
    }

    return (
      <div key={c.id} className={styles.fila}>
        <span className={styles.filaNombre}>
          {c.nombre}
          {c.esInversion && <span className={styles.badgeInversion}>💼 inversión</span>}
        </span>
        <span className={styles.filaTipo}>{c.tipo === 'EGRESO' ? 'Egreso' : 'Ingreso'}</span>
        <div className={styles.filaActions}>
          <button type="button" className={styles.btnEdit} onClick={() => startEdit(c)} title="Editar">✎</button>
          {!isGlobal && (
            <button type="button" className={styles.btnDelete} onClick={() => startDelete(c.id)} title="Eliminar">🗑</button>
          )}
        </div>
      </div>
    )
  }

  const renderAddForm = (ambito: AmbitoEditable) => {
    if (addingInGroup !== ambito) return null
    return (
      <div className={styles.filaEdicion}>
        <input
          type="text"
          className={styles.inputNombre}
          placeholder="Nombre"
          value={addNombre}
          onChange={(e) => setAddNombre(e.target.value)}
        />
        <select
          className={styles.selectTipo}
          value={addTipo}
          onChange={(e) => setAddTipo(e.target.value as 'INGRESO' | 'EGRESO')}
        >
          <option value="EGRESO">Egreso</option>
          <option value="INGRESO">Ingreso</option>
        </select>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={addEsInversion}
            onChange={(e) => setAddEsInversion(e.target.checked)}
          />
          inversión
        </label>
        <button type="button" className={styles.btnOk} onClick={saveAdd} title="Guardar">✓</button>
        <button type="button" className={styles.btnCancel} onClick={cancelAdd} title="Cancelar">✕</button>
      </div>
    )
  }

  return (
    <div className={`${styles.page} ${styles.fadeUp}`}>
      <Link to="/configuracion" className={styles.backLink}>← Configuración</Link>
      <h1 className={styles.titulo}>Categorías</h1>

      <section className={styles.section}>
        <SegmentedControl value={filtroTipo} onChange={setFiltroTipo} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.groupHeader}>GLOBALES DEL SISTEMA</h2>
        <div className={styles.block}>
          {globales.map(renderFila)}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.groupHeader}>DE LA FAMILIA</h2>
        <div className={styles.block}>
          {familiares.map(renderFila)}
          {renderAddForm('FAMILIAR')}
          <div className={styles.addRow}>
            <button type="button" className={styles.btnAgregar} onClick={() => startAdd('FAMILIAR')}>
              + Agregar
            </button>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.groupHeader}>PERSONALES (MÍS)</h2>
        <div className={styles.block}>
          {personales.map(renderFila)}
          {renderAddForm('PERSONAL')}
          <div className={styles.addRow}>
            <button type="button" className={styles.btnAgregar} onClick={() => startAdd('PERSONAL')}>
              + Agregar
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
