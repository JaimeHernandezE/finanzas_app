import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { finanzasApi, type CuentaPersonalApi } from '@/api/finanzas'
import { useCuentasPersonales } from '@/hooks/useCuentasPersonales'
import { Cargando, ErrorCarga } from '@/components/ui'
import styles from './CuentasPage.module.scss'

export default function CuentasPage() {
  const { data, loading, error, refetch } = useCuentasPersonales()
  const cuentas = (data ?? []) as CuentaPersonalApi[]

  const [editingId, setEditingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [addingCuenta, setAddingCuenta] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editNombre, setEditNombre] = useState('')
  const [editDescripcion, setEditDescripcion] = useState('')
  const [editVisible, setEditVisible] = useState(false)
  const [addNombre, setAddNombre] = useState('')
  const [addDescripcion, setAddDescripcion] = useState('')
  const [addVisible, setAddVisible] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const propias = useMemo(() => cuentas.filter(c => c.es_propia), [cuentas])
  const tuteladas = useMemo(() => cuentas.filter(c => !c.es_propia), [cuentas])

  const startEdit = (c: CuentaPersonalApi) => {
    setEditingId(c.id)
    setEditNombre(c.nombre)
    setEditDescripcion(c.descripcion || '')
    setEditVisible(c.visible_familia)
    setDeletingId(null)
    setAddingCuenta(false)
    setFormError(null)
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async () => {
    if (!editingId || !editNombre.trim()) return
    setSaving(true)
    setFormError(null)
    try {
      await finanzasApi.updateCuentaPersonal(editingId, {
        nombre: editNombre.trim(),
        descripcion: editDescripcion.trim(),
        visible_familia: editVisible,
      })
      await refetch()
      setEditingId(null)
    } catch (e: unknown) {
      const ax = e as { response?: { data?: Record<string, unknown> } }
      setFormError(JSON.stringify(ax.response?.data ?? 'Error al guardar'))
    } finally {
      setSaving(false)
    }
  }

  const startDelete = (id: number) => {
    setDeletingId(id)
    setEditingId(null)
  }

  const confirmDelete = async (id: number) => {
    setSaving(true)
    setFormError(null)
    try {
      await finanzasApi.deleteCuentaPersonal(id)
      await refetch()
      setDeletingId(null)
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } }
      setFormError(ax.response?.data?.error ?? 'No se pudo eliminar (¿tiene movimientos asociados?)')
    } finally {
      setSaving(false)
    }
  }

  const cancelDelete = () => setDeletingId(null)

  const startAdd = () => {
    setAddingCuenta(true)
    setAddNombre('')
    setAddDescripcion('')
    setAddVisible(false)
    setEditingId(null)
    setDeletingId(null)
    setFormError(null)
  }

  const cancelAdd = () => setAddingCuenta(false)

  const saveAdd = async () => {
    if (!addNombre.trim()) return
    setSaving(true)
    setFormError(null)
    try {
      await finanzasApi.createCuentaPersonal({
        nombre: addNombre.trim(),
        descripcion: addDescripcion.trim() || undefined,
        visible_familia: addVisible,
      })
      await refetch()
      setAddingCuenta(false)
    } catch (e: unknown) {
      const ax = e as { response?: { data?: Record<string, unknown> } }
      setFormError(JSON.stringify(ax.response?.data ?? 'Error al crear'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Cargando />
  if (error) return <ErrorCarga mensaje={error} />

  return (
    <div className={`${styles.page} ${styles.fadeUp}`}>
      <Link to="/configuracion" className={styles.backLink}>← Configuración</Link>
      <h1 className={styles.titulo}>Cuentas personales</h1>

      {formError && (
        <p className={styles.msgError} style={{ marginBottom: '1rem' }}>{formError}</p>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <h2 className={styles.groupHeader}>MIS CUENTAS</h2>
          <button type="button" className={styles.btnAgregar} onClick={startAdd} disabled={saving}>
            + Agregar
          </button>
        </div>
        <div className={styles.block}>
          {propias.length === 0 && !addingCuenta && (
            <p className={styles.filaDesc} style={{ padding: '0.75rem 0' }}>
              Aún no tienes cuentas. Agrega una para organizar tus gastos personales (ej. «Personal», «Trabajo»).
            </p>
          )}
          {propias.map((c) => {
            if (deletingId === c.id) {
              return (
                <div key={c.id} className={styles.fila}>
                  <span className={styles.confirmText}>¿Eliminar «{c.nombre}»?</span>
                  <button type="button" className={styles.btnConfirmSi} onClick={() => confirmDelete(c.id)} disabled={saving}>Sí</button>
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
                  <button type="button" className={styles.btnOk} onClick={saveEdit} disabled={saving}>✓</button>
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
              <button type="button" className={styles.btnOk} onClick={saveAdd} disabled={saving}>✓</button>
              <button type="button" className={styles.btnCancel} onClick={cancelAdd}>✕</button>
            </div>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.groupHeader}>CUENTAS QUE TUTELO</h2>
        <p className={styles.filaDesc} style={{ marginBottom: '0.75rem' }}>
          Son cuentas de otros miembros de la familia donde te delegaron acceso (tutoría). Se gestionan desde el administrador Django o un flujo futuro en la app.
        </p>
        <div className={styles.block}>
          {tuteladas.length === 0 ? (
            <p className={styles.filaDesc} style={{ padding: '0.75rem 0' }}>No tutelas ninguna cuenta.</p>
          ) : (
            tuteladas.map((c) => (
              <div key={c.id} className={styles.fila}>
                <div className={styles.filaMain}>
                  <span className={styles.filaNombre}>{c.nombre}</span>
                  {c.duenio_nombre && (
                    <span className={styles.filaDuenio}>({c.duenio_nombre})</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
