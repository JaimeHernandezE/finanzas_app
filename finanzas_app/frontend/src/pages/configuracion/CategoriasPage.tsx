import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useCategorias } from '@/hooks/useCatalogos'
import { useCuentasPersonales } from '@/hooks/useCuentasPersonales'
import { catalogosApi } from '@/api'
import { Cargando, ErrorCarga } from '@/components/ui'
import styles from './CategoriasPage.module.scss'

// -----------------------------------------------------------------------------
// Tipos (API: id, nombre, tipo, es_inversion, familia, usuario)
// -----------------------------------------------------------------------------

interface Categoria {
  id: string
  nombre: string
  tipo: 'INGRESO' | 'EGRESO'
  esInversion: boolean
  ambito: 'GLOBAL' | 'FAMILIAR' | 'PERSONAL'
  cuentaPersonal: number | null
  categoriaPadre: number | null
  esPadre: boolean
}

function mapApiToCategoria(c: {
  id: number
  nombre: string
  tipo: string
  es_inversion?: boolean
  familia?: number | null
  usuario?: number | null
  cuenta_personal?: number | null
  categoria_padre?: number | null
  es_padre?: boolean
}): Categoria {
  const ambito: Categoria['ambito'] =
    !c.familia && !c.usuario ? 'GLOBAL'
    : c.familia && !c.usuario ? 'FAMILIAR'
    : 'PERSONAL'
  return {
    id: String(c.id),
    nombre: c.nombre,
    tipo: c.tipo as 'INGRESO' | 'EGRESO',
    esInversion: !!c.es_inversion,
    ambito,
    cuentaPersonal: c.cuenta_personal ?? null,
    categoriaPadre: c.categoria_padre ?? null,
    esPadre: !!c.es_padre,
  }
}

type AmbitoEditable = 'FAMILIAR' | 'PERSONAL'

/** Orden: padres alfabético; bajo cada padre, hijas alfabético. Huérfanas (padre fuera del grupo) como raíz. */
function buildJerarquiaCategorias(lista: Categoria[]): { c: Categoria; esHija: boolean }[] {
  const ids = new Set(lista.map(c => c.id))
  const hijosPorPadre = new Map<string, Categoria[]>()
  for (const c of lista) {
    if (c.categoriaPadre != null && ids.has(String(c.categoriaPadre))) {
      const pid = String(c.categoriaPadre)
      if (!hijosPorPadre.has(pid)) hijosPorPadre.set(pid, [])
      hijosPorPadre.get(pid)!.push(c)
    }
  }
  hijosPorPadre.forEach(arr =>
    arr.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })),
  )
  const raices = lista
    .filter(c => c.categoriaPadre == null || !ids.has(String(c.categoriaPadre)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
  const out: { c: Categoria; esHija: boolean }[] = []
  const walk = (c: Categoria, esHija: boolean) => {
    out.push({ c, esHija })
    for (const h of hijosPorPadre.get(c.id) ?? []) walk(h, true)
  }
  for (const r of raices) walk(r, false)
  return out
}

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
  const { data: categoriasRaw, loading, error, refetch } = useCategorias()
  const { data: cuentasData } = useCuentasPersonales()
  const categorias = useMemo(
    () => ((categoriasRaw ?? []) as {
      id: number
      nombre: string
      tipo: string
      es_inversion?: boolean
      familia?: number | null
      usuario?: number | null
      cuenta_personal?: number | null
      categoria_padre?: number | null
      es_padre?: boolean
    }[]).map(mapApiToCategoria),
    [categoriasRaw],
  )

  const [filtroTipo, setFiltroTipo] = useState<'INGRESO' | 'EGRESO'>('EGRESO')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [addingInGroup, setAddingInGroup] = useState<AmbitoEditable | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editTipo, setEditTipo] = useState<'INGRESO' | 'EGRESO'>('EGRESO')
  const [editEsInversion, setEditEsInversion] = useState(false)
  const [editCuentaPersonal, setEditCuentaPersonal] = useState<string>('')
  const [editCategoriaPadre, setEditCategoriaPadre] = useState<string>('')
  const [addNombre, setAddNombre] = useState('')
  const [addTipo, setAddTipo] = useState<'INGRESO' | 'EGRESO'>('EGRESO')
  const [addEsInversion, setAddEsInversion] = useState(false)
  const [addCuentaPersonal, setAddCuentaPersonal] = useState<string>('')
  const [addCategoriaPadre, setAddCategoriaPadre] = useState<string>('')

  const filtradas = useMemo(
    () => categorias.filter((c) => c.tipo === filtroTipo),
    [categorias, filtroTipo]
  )
  const globales = useMemo(() => filtradas.filter((c) => c.ambito === 'GLOBAL'), [filtradas])
  const familiares = useMemo(() => filtradas.filter((c) => c.ambito === 'FAMILIAR'), [filtradas])
  const personales = useMemo(() => filtradas.filter((c) => c.ambito === 'PERSONAL'), [filtradas])
  const cuentasPropias = useMemo(
    () => (cuentasData ?? []).filter(c => c.es_propia),
    [cuentasData],
  )
  const cuentaPersonalPrincipalId = useMemo(
    () =>
      cuentasPropias.find(
        c => c.nombre.trim().toLowerCase() === 'personal',
      )?.id ?? null,
    [cuentasPropias],
  )
  const cuentasPorId = useMemo(
    () => new Map(cuentasPropias.map(c => [c.id, c.nombre])),
    [cuentasPropias],
  )
  const personalesCuentaPrincipal = useMemo(
    () =>
      cuentaPersonalPrincipalId == null
        ? []
        : personales.filter(c => c.cuentaPersonal === cuentaPersonalPrincipalId),
    [personales, cuentaPersonalPrincipalId],
  )
  const personalesSinCuenta = useMemo(
    () => personales.filter(c => c.cuentaPersonal == null),
    [personales],
  )
  const personalesOtrasCuentas = useMemo(() => {
    const agrupadas: { cuentaId: number; nombreCuenta: string; categorias: Categoria[] }[] = []
    const porCuenta = new Map<number, Categoria[]>()
    for (const c of personales) {
      if (c.cuentaPersonal == null) continue
      if (cuentaPersonalPrincipalId != null && c.cuentaPersonal === cuentaPersonalPrincipalId) continue
      porCuenta.set(c.cuentaPersonal, [...(porCuenta.get(c.cuentaPersonal) ?? []), c])
    }
    for (const [cuentaId, categoriasCuenta] of porCuenta.entries()) {
      agrupadas.push({
        cuentaId,
        nombreCuenta: cuentasPorId.get(cuentaId) ?? `Cuenta ${cuentaId}`,
        categorias: categoriasCuenta,
      })
    }
    agrupadas.sort((a, b) =>
      a.nombreCuenta.localeCompare(b.nombreCuenta, 'es', { sensitivity: 'base' }),
    )
    return agrupadas
  }, [personales, cuentaPersonalPrincipalId, cuentasPorId])

  if (loading) return <Cargando />
  if (error) return <ErrorCarga mensaje={error} />

  const startEdit = (c: Categoria) => {
    setEditingId(c.id)
    setEditNombre(c.nombre)
    setEditTipo(c.tipo)
    setEditEsInversion(c.esInversion)
    setEditCuentaPersonal(c.cuentaPersonal ? String(c.cuentaPersonal) : '')
    setEditCategoriaPadre(c.categoriaPadre ? String(c.categoriaPadre) : '')
    setDeletingId(null)
    setAddingInGroup(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const saveEdit = async () => {
    if (!editingId) return
    const c = categorias.find((x) => x.id === editingId)
    if (!c) return
    try {
      await catalogosApi.updateCategoria(Number(editingId), {
        nombre: editNombre,
        tipo: editTipo,
        es_inversion: editEsInversion,
        cuenta_personal: c.ambito === 'PERSONAL' ? (editCuentaPersonal ? Number(editCuentaPersonal) : null) : null,
        categoria_padre: editCategoriaPadre ? Number(editCategoriaPadre) : null,
      })
      setEditingId(null)
      refetch()
    } catch {
      // Error genérico: el interceptor ya puede redirigir a login
    }
  }

  const startDelete = (id: string) => {
    setDeletingId(id)
    setEditingId(null)
    setAddingInGroup(null)
  }

  const confirmDelete = async (id: string) => {
    try {
      await catalogosApi.deleteCategoria(Number(id))
      refetch()
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } }
      const msg = ax.response?.data?.error ?? 'No se pudo eliminar la categoría.'
      window.alert(msg)
    } finally {
      setDeletingId(null)
    }
  }

  const cancelDelete = () => setDeletingId(null)

  const startAdd = (ambito: AmbitoEditable) => {
    setAddingInGroup(ambito)
    setAddNombre('')
    setAddTipo(filtroTipo)
    setAddEsInversion(false)
    setAddCuentaPersonal('')
    setAddCategoriaPadre('')
    setEditingId(null)
    setDeletingId(null)
  }

  const cancelAdd = () => setAddingInGroup(null)

  const saveAdd = async () => {
    if (!addingInGroup || !addNombre.trim()) return
    await catalogosApi.createCategoria({
      nombre: addNombre.trim(),
      tipo: addTipo,
      ambito: addingInGroup,
      es_inversion: addEsInversion,
      cuenta_personal: addingInGroup === 'PERSONAL' && addCuentaPersonal ? Number(addCuentaPersonal) : null,
      categoria_padre: addCategoriaPadre ? Number(addCategoriaPadre) : null,
    })
    setAddingInGroup(null)
    refetch()
  }

  const renderFila = (c: Categoria, esHija = false) => {
    const isEditing = editingId === c.id
    const isDeleting = deletingId === c.id
    const clsFila = `${styles.fila}${esHija ? ` ${styles.filaHija}` : ''}`
    const clsEdicion = `${styles.filaEdicion}${esHija ? ` ${styles.filaHija}` : ''}`

    if (isDeleting) {
      return (
        <div key={c.id} className={clsFila}>
          <span className={styles.confirmText}>¿Eliminar «{c.nombre}»?</span>
          <div className={styles.confirmActions}>
            <button type="button" className={styles.btnConfirmSi} onClick={() => confirmDelete(c.id)}>Sí</button>
            <button type="button" className={styles.btnConfirmNo} onClick={cancelDelete}>No</button>
          </div>
        </div>
      )
    }

    if (isEditing) {
      const padresEditables = categorias.filter(x =>
        x.ambito === c.ambito &&
        x.tipo === editTipo &&
        x.categoriaPadre == null &&
        x.id !== c.id,
      )
      return (
        <div key={c.id} className={clsEdicion}>
          <input
            type="text"
            className={styles.inputNombre}
            value={editNombre}
            onChange={(e) => setEditNombre(e.target.value)}
          />
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
          <select
            className={styles.selectTipo}
            value={editCategoriaPadre}
            onChange={(e) => setEditCategoriaPadre(e.target.value)}
          >
            <option value="">Sin padre</option>
            {padresEditables.map(p => (
              <option key={p.id} value={p.id}>
                Padre: {p.nombre}
              </option>
            ))}
          </select>
          {c.ambito === 'PERSONAL' && (
            <select
              className={styles.selectTipo}
              value={editCuentaPersonal}
              onChange={(e) => setEditCuentaPersonal(e.target.value)}
            >
              <option value="">Sin cuenta</option>
              {cuentasPropias.map(cp => (
                <option key={cp.id} value={cp.id}>
                  Cuenta: {cp.nombre}
                </option>
              ))}
            </select>
          )}
          <button type="button" className={styles.btnOk} onClick={saveEdit} title="Guardar">✓</button>
          <button type="button" className={styles.btnCancel} onClick={cancelEdit} title="Cancelar">✕</button>
        </div>
      )
    }

    return (
      <div key={c.id} className={clsFila}>
        <span className={styles.filaNombre}>
          {c.nombre}
          {c.esInversion && <span className={styles.badgeInversion}>💼 inversión</span>}
        </span>
        <span className={styles.filaTipo}>{c.tipo === 'EGRESO' ? 'Egreso' : 'Ingreso'}</span>
        <div className={styles.filaActions}>
          <button type="button" className={styles.btnEdit} onClick={() => startEdit(c)} title="Editar">✎</button>
          <button type="button" className={styles.btnDelete} onClick={() => startDelete(c.id)} title="Eliminar">🗑</button>
        </div>
      </div>
    )
  }

  const renderAddForm = (ambito: AmbitoEditable) => {
    if (addingInGroup !== ambito) return null
    const padresDisponibles = categorias.filter(c =>
      c.ambito === ambito &&
      c.tipo === addTipo &&
      c.categoriaPadre == null,
    )
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
        <select
          className={styles.selectTipo}
          value={addCategoriaPadre}
          onChange={(e) => setAddCategoriaPadre(e.target.value)}
        >
          <option value="">Sin padre</option>
          {padresDisponibles.map(p => (
            <option key={p.id} value={p.id}>
              Padre: {p.nombre}
            </option>
          ))}
        </select>
        {ambito === 'PERSONAL' && (
          <select
            className={styles.selectTipo}
            value={addCuentaPersonal}
            onChange={(e) => setAddCuentaPersonal(e.target.value)}
          >
            <option value="">Sin cuenta</option>
            {cuentasPropias.map(cp => (
              <option key={cp.id} value={cp.id}>
                Cuenta: {cp.nombre}
              </option>
            ))}
          </select>
        )}
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
          {buildJerarquiaCategorias(globales).map(({ c, esHija }) => renderFila(c, esHija))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.groupHeader}>DE LA FAMILIA</h2>
        <div className={styles.block}>
          {buildJerarquiaCategorias(familiares).map(({ c, esHija }) => renderFila(c, esHija))}
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
        <h3 className={styles.groupHeader}>PERSONALES</h3>
        <div className={styles.block}>
          {buildJerarquiaCategorias(personalesCuentaPrincipal).map(({ c, esHija }) =>
            renderFila(c, esHija),
          )}
        </div>

        <h3 className={styles.groupHeader} style={{ marginTop: 12 }}>OTRAS CUENTAS</h3>
        {personalesOtrasCuentas.map(g => (
          <div key={g.cuentaId} style={{ marginBottom: 12 }}>
            <h3 className={styles.groupHeader}>{g.nombreCuenta}</h3>
            <div className={styles.block}>
              {buildJerarquiaCategorias(g.categorias).map(({ c, esHija }) => renderFila(c, esHija))}
            </div>
          </div>
        ))}

        <h3 className={styles.groupHeader}>SIN CUENTA</h3>
        <div className={styles.block}>
          {buildJerarquiaCategorias(personalesSinCuenta).map(({ c, esHija }) => renderFila(c, esHija))}
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
