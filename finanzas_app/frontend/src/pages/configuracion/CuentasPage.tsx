import { useState } from 'react'
import { Link } from 'react-router-dom'
import styles from './CuentasPage.module.scss'

// -----------------------------------------------------------------------------
// Tipos y mock — TODO: reemplazar por fetch al backend
// -----------------------------------------------------------------------------

interface CuentaPersonal {
  id: string
  nombre: string
  descripcion: string
  visibleFamilia: boolean
  esPropia: boolean
  duenio?: string
  duenioId?: string
}

const MOCK_CUENTAS: CuentaPersonal[] = [
  { id: '1', nombre: 'Personal', descripcion: 'Cuenta cotidiana', visibleFamilia: false, esPropia: true },
  { id: '2', nombre: 'Arquitecto', descripcion: 'Honorarios y gastos profesionales', visibleFamilia: false, esPropia: true },
  { id: '3', nombre: 'Gastos Sofía', descripcion: '', visibleFamilia: false, esPropia: false, duenio: 'Sofía Herrera', duenioId: 'sofia' },
]

// Mock: miembros por email para "agregar tutoría"
const MOCK_MIEMBROS_EMAIL: Record<string, { id: string; nombre: string; cuentas: { id: string; nombre: string }[] }> = {
  'sofia@gmail.com': { id: 'sofia', nombre: 'Sofía Herrera', cuentas: [{ id: '3', nombre: 'Gastos Sofía' }, { id: '4', nombre: 'Ahorros Sofía' }] },
}

// -----------------------------------------------------------------------------
// Página
// -----------------------------------------------------------------------------

export default function CuentasPage() {
  const [cuentas, setCuentas] = useState<CuentaPersonal[]>(MOCK_CUENTAS)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [addingCuenta, setAddingCuenta] = useState(false)
  const [addTutoriaEmail, setAddTutoriaEmail] = useState('')
  const [addTutoriaBusqueda, setAddTutoriaBusqueda] = useState<{ nombre: string; cuentas: { id: string; nombre: string }[] } | null>(null)
  const [addTutoriaCuentasSel, setAddTutoriaCuentasSel] = useState<Record<string, boolean>>({})
  const [addTutoriaSearchAttempted, setAddTutoriaSearchAttempted] = useState(false)
  const [showAddTutoria, setShowAddTutoria] = useState(false)
  const [editNombre, setEditNombre] = useState('')
  const [editDescripcion, setEditDescripcion] = useState('')
  const [editVisible, setEditVisible] = useState(false)
  const [addNombre, setAddNombre] = useState('')
  const [addDescripcion, setAddDescripcion] = useState('')
  const [addVisible, setAddVisible] = useState(false)

  const propias = cuentas.filter((c) => c.esPropia)
  const tuteladas = cuentas.filter((c) => !c.esPropia)

  const startEdit = (c: CuentaPersonal) => {
    setEditingId(c.id)
    setEditNombre(c.nombre)
    setEditDescripcion(c.descripcion)
    setEditVisible(c.visibleFamilia)
    setDeletingId(null)
    setAddingCuenta(false)
    setAddTutoriaBusqueda(null)
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = () => {
    if (!editingId) return
    setCuentas((prev) =>
      prev.map((c) =>
        c.id === editingId
          ? { ...c, nombre: editNombre, descripcion: editDescripcion, visibleFamilia: editVisible }
          : c
      )
    )
    setEditingId(null)
  }

  const startDelete = (id: string) => {
    setDeletingId(id)
    setEditingId(null)
  }

  const confirmDelete = (id: string) => {
    setCuentas((prev) => prev.filter((c) => c.id !== id))
    setDeletingId(null)
  }

  const cancelDelete = () => setDeletingId(null)

  const startAdd = () => {
    setAddingCuenta(true)
    setAddNombre('')
    setAddDescripcion('')
    setAddVisible(false)
    setEditingId(null)
    setDeletingId(null)
  }

  const cancelAdd = () => setAddingCuenta(false)

  const saveAdd = () => {
    if (!addNombre.trim()) return
    const nueva: CuentaPersonal = {
      id: `n-${Date.now()}`,
      nombre: addNombre.trim(),
      descripcion: addDescripcion.trim(),
      visibleFamilia: addVisible,
      esPropia: true,
    }
    setCuentas((prev) => [...prev, nueva])
    setAddingCuenta(false)
  }

  const quitarTutoria = (id: string) => {
    setCuentas((prev) => prev.filter((c) => c.id !== id))
    setEditingId(null)
  }

  const buscarTutoria = () => {
    setAddTutoriaSearchAttempted(true)
    const email = addTutoriaEmail.trim().toLowerCase()
    const miembro = MOCK_MIEMBROS_EMAIL[email]
    if (miembro) {
      setAddTutoriaBusqueda({ nombre: miembro.nombre, cuentas: miembro.cuentas })
      const sel: Record<string, boolean> = {}
      miembro.cuentas.forEach((q) => { sel[q.id] = false })
      setAddTutoriaCuentasSel(sel)
    } else {
      setAddTutoriaBusqueda(null)
    }
  }

  const confirmarTutoria = () => {
    if (!addTutoriaBusqueda) return
    const ids = Object.entries(addTutoriaCuentasSel).filter(([, v]) => v).map(([id]) => id)
    if (ids.length === 0) return
    const nombreDuenio = addTutoriaBusqueda.nombre
    const nuevas = ids.map((id) => {
      const q = addTutoriaBusqueda.cuentas.find((c) => c.id === id)
      return { id: `t-${id}-${Date.now()}`, nombre: q?.nombre ?? id, descripcion: '', visibleFamilia: false, esPropia: false, duenio: nombreDuenio, duenioId: id }
    })
    setCuentas((prev) => [...prev, ...nuevas])
    setAddTutoriaEmail('')
    setAddTutoriaBusqueda(null)
    setShowAddTutoria(false)
  }

  return (
    <div className={`${styles.page} ${styles.fadeUp}`}>
      <Link to="/configuracion" className={styles.backLink}>← Configuración</Link>
      <h1 className={styles.titulo}>Cuentas personales</h1>

      {/* Mis cuentas */}
      <section className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <h2 className={styles.groupHeader}>MIS CUENTAS</h2>
          <button type="button" className={styles.btnAgregar} onClick={startAdd}>+ Agregar</button>
        </div>
        <div className={styles.block}>
          {propias.map((c) => {
            if (deletingId === c.id) {
              return (
                <div key={c.id} className={styles.fila}>
                  <span className={styles.confirmText}>¿Eliminar «{c.nombre}»?</span>
                  <button type="button" className={styles.btnConfirmSi} onClick={() => confirmDelete(c.id)}>Sí</button>
                  <button type="button" className={styles.btnConfirmNo} onClick={cancelDelete}>No</button>
                </div>
              )
            }
            if (editingId === c.id) {
              return (
                <div key={c.id} className={styles.filaEdicion}>
                  <input className={styles.inputNombre} value={editNombre} onChange={(e) => setEditNombre(e.target.value)} placeholder="Nombre" />
                  <input className={styles.inputDesc} value={editDescripcion} onChange={(e) => setEditDescripcion(e.target.value)} placeholder="Descripción" />
                  <label className={styles.checkLabel}>
                    <input type="checkbox" checked={editVisible} onChange={(e) => setEditVisible(e.target.checked)} />
                    visible para familia
                  </label>
                  <button type="button" className={styles.btnOk} onClick={saveEdit}>✓</button>
                  <button type="button" className={styles.btnCancel} onClick={cancelEdit}>✕</button>
                </div>
              )
            }
            return (
              <div key={c.id} className={styles.fila}>
                <div className={styles.filaMain}>
                  <span className={styles.filaNombre}>{c.nombre}</span>
                  <span className={styles.filaDesc}>{c.descripcion || ''}</span>
                </div>
                <div className={styles.filaActions}>
                  <button type="button" className={styles.btnEdit} onClick={() => startEdit(c)}>✎</button>
                  <button type="button" className={styles.btnDelete} onClick={() => startDelete(c.id)}>🗑</button>
                </div>
              </div>
            )
          })}
          {addingCuenta && (
            <div className={styles.filaEdicion}>
              <input className={styles.inputNombre} value={addNombre} onChange={(e) => setAddNombre(e.target.value)} placeholder="Nombre" />
              <input className={styles.inputDesc} value={addDescripcion} onChange={(e) => setAddDescripcion(e.target.value)} placeholder="Descripción (opcional)" />
              <label className={styles.checkLabel}>
                <input type="checkbox" checked={addVisible} onChange={(e) => setAddVisible(e.target.checked)} />
                visible para familia
              </label>
              <button type="button" className={styles.btnOk} onClick={saveAdd}>✓</button>
              <button type="button" className={styles.btnCancel} onClick={cancelAdd}>✕</button>
            </div>
          )}
        </div>
      </section>

      {/* Cuentas que tutelo */}
      <section className={styles.section}>
        <h2 className={styles.groupHeader}>CUENTAS QUE TUTELO</h2>
        <div className={styles.block}>
          {tuteladas.map((c) => {
            if (editingId === c.id) {
              return (
                <div key={c.id} className={styles.filaEdicion}>
                  <input className={styles.inputNombre} value={editNombre} onChange={(e) => setEditNombre(e.target.value)} placeholder="Nombre cuenta" />
                  <button type="button" className={styles.btnOk} onClick={saveEdit}>✓</button>
                  <button type="button" className={styles.btnCancel} onClick={cancelEdit}>✕</button>
                  <button type="button" className={styles.btnQuitarTutoria} onClick={() => quitarTutoria(c.id)}>Quitar tutoría</button>
                </div>
              )
            }
            return (
              <div key={c.id} className={styles.fila}>
                <div className={styles.filaMain}>
                  <span className={styles.filaNombre}>{c.nombre}</span>
                  {c.duenio && <span className={styles.filaDuenio}>({c.duenio})</span>}
                </div>
                <button type="button" className={styles.btnEdit} onClick={() => startEdit(c)}>✎</button>
              </div>
            )
          })}
        </div>
        <div className={styles.addTutoriaRow}>
          <button type="button" className={styles.btnAgregarTutoria} onClick={() => setShowAddTutoria((v) => !v)}>
            + Agregar tutoría
          </button>
        </div>
        {showAddTutoria && (
          <>
            <div className={styles.addTutoria}>
              <input
                type="email"
                className={styles.inputEmail}
                placeholder="email@gmail.com"
                value={addTutoriaEmail}
                onChange={(e) => { setAddTutoriaEmail(e.target.value); setAddTutoriaSearchAttempted(false) }}
              />
              <button type="button" className={styles.btnBuscar} onClick={buscarTutoria}>Buscar</button>
            </div>
            {addTutoriaBusqueda && (
              <div className={styles.tutoriaResult}>
                <p className={styles.tutoriaTitulo}>Cuentas de {addTutoriaBusqueda.nombre}:</p>
                {addTutoriaBusqueda.cuentas.map((q) => (
                  <label key={q.id} className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={addTutoriaCuentasSel[q.id] ?? false}
                      onChange={(e) => setAddTutoriaCuentasSel((s) => ({ ...s, [q.id]: e.target.checked }))}
                    />
                    {q.nombre}
                  </label>
                ))}
                <button type="button" className={styles.btnConfirmar} onClick={confirmarTutoria}>Confirmar</button>
              </div>
            )}
            {addTutoriaSearchAttempted && addTutoriaEmail.trim() && addTutoriaBusqueda === null && (
              <p className={styles.msgError}>Este email no pertenece a ningún miembro de la familia</p>
            )}
          </>
        )}
      </section>
    </div>
  )
}
