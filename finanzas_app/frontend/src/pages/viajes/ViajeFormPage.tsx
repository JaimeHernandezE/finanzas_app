import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useViajeDetalle } from '@/hooks/useViajes'
import { useCategorias } from '@/hooks/useCatalogos'
import { viajesApi } from '@/api'
import styles from './ViajeFormPage.module.scss'

// -----------------------------------------------------------------------------
// Constantes
// -----------------------------------------------------------------------------

const COLORES_TEMA = [
  '#2E86AB',
  '#c8f060',
  '#f060c8',
  '#f0c860',
  '#22a06b',
  '#ff4d4d',
  '#f59e0b',
  '#60c8f0',
]

interface PresupuestoItem {
  categoriaId: string
  categoriaNombre: string
  montoPresupuestado: number
}

// -----------------------------------------------------------------------------
// Página
// -----------------------------------------------------------------------------

export default function ViajeFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const esEdicion = Boolean(id)

  const { data: viajeData } = useViajeDetalle(esEdicion && id ? Number(id) : 0)
  const { data: categoriasData } = useCategorias()
  const categoriasApi = (categoriasData ?? []) as { id: number; nombre: string }[]
  const CATEGORIAS_DISPONIBLES = useMemo(
    () => categoriasApi.map((c) => ({ id: String(c.id), nombre: c.nombre })),
    [categoriasApi],
  )

  const [nombre, setNombre] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [colorSeleccionado, setColorSeleccionado] = useState(0)
  const [presupuestoItems, setPresupuestoItems] = useState<PresupuestoItem[]>([])
  const [showAddRow, setShowAddRow] = useState(false)
  const [addCategoriaId, setAddCategoriaId] = useState('')
  const [addMonto, setAddMonto] = useState('')
  const [saving, setSaving] = useState(false)

  const viajeApi = viajeData as { id: number; nombre: string; fecha_inicio: string; fecha_fin: string; color_tema: string; presupuestos?: { id: number; categoria: number; categoria_nombre: string; monto_planificado: string }[] } | null | undefined

  useEffect(() => {
    if (viajeApi) {
      setNombre(viajeApi.nombre)
      setFechaInicio(viajeApi.fecha_inicio)
      setFechaFin(viajeApi.fecha_fin)
      const idx = COLORES_TEMA.indexOf(viajeApi.color_tema || '')
      setColorSeleccionado(idx >= 0 ? idx : 0)
      setPresupuestoItems(
        (viajeApi.presupuestos ?? []).map((p) => ({
          categoriaId: String(p.categoria),
          categoriaNombre: p.categoria_nombre,
          montoPresupuestado: Number(p.monto_planificado) || 0,
        }))
      )
    }
  }, [viajeApi])

  const categoriasNoAgregadas = useMemo(
    () =>
      CATEGORIAS_DISPONIBLES.filter(
        (c) => !presupuestoItems.some((p) => p.categoriaId === c.id)
      ),
    [CATEGORIAS_DISPONIBLES, presupuestoItems]
  )

  const puedeGuardar =
    nombre.trim() !== '' && fechaInicio !== '' && fechaFin !== '' && fechaFin >= fechaInicio

  const handleAgregarCategoria = () => {
    const cat = CATEGORIAS_DISPONIBLES.find((c) => c.id === addCategoriaId)
    const monto = parseInt(addMonto, 10)
    if (!cat || !Number.isFinite(monto) || monto < 0) return
    setPresupuestoItems((prev) => [
      ...prev,
      { categoriaId: cat.id, categoriaNombre: cat.nombre, montoPresupuestado: monto },
    ])
    setAddCategoriaId('')
    setAddMonto('')
    setShowAddRow(false)
  }

  const handleEliminarPresupuesto = (categoriaId: string) => {
    setPresupuestoItems((prev) => prev.filter((p) => p.categoriaId !== categoriaId))
  }

  const handleActualizarMonto = (categoriaId: string, valor: number) => {
    setPresupuestoItems((prev) =>
      prev.map((p) =>
        p.categoriaId === categoriaId
          ? { ...p, montoPresupuestado: valor }
          : p
      )
    )
  }

  const handleGuardar = async () => {
    if (!puedeGuardar) return
    setSaving(true)
    const colorHex = COLORES_TEMA[colorSeleccionado] ?? COLORES_TEMA[0]
    try {
      if (esEdicion && id) {
        await viajesApi.updateViaje(Number(id), {
          nombre: nombre.trim(),
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          color_tema: colorHex,
        })
        for (const p of presupuestoItems) {
          const existing = (viajeApi?.presupuestos ?? []).find((x) => String(x.categoria) === p.categoriaId)
          if (existing) {
            await viajesApi.updatePresupuesto(existing.id, { monto_planificado: String(p.montoPresupuestado) })
          } else {
            await viajesApi.createPresupuesto(Number(id), { categoria: Number(p.categoriaId), monto_planificado: String(p.montoPresupuestado) })
          }
        }
        navigate(`/viajes/${id}`)
      } else {
        const res = await viajesApi.createViaje({
          nombre: nombre.trim(),
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          color_tema: colorHex,
        })
        const nuevoId = (res.data as { id: number }).id
        for (const p of presupuestoItems) {
          await viajesApi.createPresupuesto(nuevoId, { categoria: Number(p.categoriaId), monto_planificado: String(p.montoPresupuestado) })
        }
        navigate(`/viajes/${nuevoId}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleArchivar = async () => {
    if (!esEdicion || !id) return
    await viajesApi.archivarViaje(Number(id))
    navigate('/viajes')
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.titulo}>
        {esEdicion ? 'Editar viaje' : 'Nuevo viaje'}
      </h1>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="viaje-nombre">
          Nombre del viaje
        </label>
        <input
          id="viaje-nombre"
          type="text"
          className={styles.input}
          placeholder="Ej: Vacaciones Llanquihue 2026"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Fechas</span>
        <div className={styles.inputRow}>
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="viaje-desde">
              Desde
            </label>
            <input
              id="viaje-desde"
              type="date"
              className={styles.input}
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="viaje-hasta">
              Hasta
            </label>
            <input
              id="viaje-hasta"
              type="date"
              className={styles.input}
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className={styles.colorSection}>
        <span className={styles.label}>Color del tema</span>
        <div className={styles.colorGrid}>
          {COLORES_TEMA.map((hex, idx) => (
            <button
              key={hex}
              type="button"
              className={`${styles.colorOption} ${
                colorSeleccionado === idx ? styles.colorOptionSelected : ''
              }`}
              style={{ backgroundColor: hex }}
              onClick={() => setColorSeleccionado(idx)}
              aria-label={`Color ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      <div className={styles.presupuestoSection}>
        <div className={styles.presupuestoHeader}>
          <span className={styles.presupuestoTitle}>
            PRESUPUESTO POR CATEGORÍA
          </span>
          <button
            type="button"
            className={styles.btnAgregar}
            onClick={() => setShowAddRow(true)}
          >
            + Agregar
          </button>
        </div>

        {showAddRow && (
          <div className={styles.addRow}>
            <select
              className={styles.addSelect}
              value={addCategoriaId}
              onChange={(e) => setAddCategoriaId(e.target.value)}
              aria-label="Seleccionar categoría"
            >
              <option value="">Seleccionar categoría ▾</option>
              {categoriasNoAgregadas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <input
              type="number"
              className={styles.addInput}
              placeholder="Monto"
              value={addMonto}
              onChange={(e) => setAddMonto(e.target.value)}
              min={0}
              step={1000}
            />
            <button
              type="button"
              className={styles.btnConfirmAdd}
              onClick={handleAgregarCategoria}
              aria-label="Agregar"
            >
              ✓
            </button>
            <button
              type="button"
              className={styles.btnCancelAdd}
              onClick={() => {
                setShowAddRow(false)
                setAddCategoriaId('')
                setAddMonto('')
              }}
              aria-label="Cancelar"
            >
              ✕
            </button>
          </div>
        )}

        {presupuestoItems.map((item) => (
          <div key={item.categoriaId} className={styles.presupuestoItem}>
            <span className={styles.presupuestoItemNombre}>
              {item.categoriaNombre}
            </span>
            <input
              type="number"
              className={styles.presupuestoItemInput}
              value={item.montoPresupuestado || ''}
              onChange={(e) =>
                handleActualizarMonto(
                  item.categoriaId,
                  parseInt(e.target.value, 10) || 0
                )
              }
              min={0}
              step={1000}
            />
            <button
              type="button"
              className={styles.btnEliminar}
              onClick={() => handleEliminarPresupuesto(item.categoriaId)}
              aria-label="Eliminar"
            >
              🗑
            </button>
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        <Link to="/viajes" className={styles.btnCancel}>
          Cancelar
        </Link>
        <button
          type="button"
          className={styles.btnGuardar}
          disabled={!puedeGuardar}
          onClick={handleGuardar}
        >
          Guardar viaje
        </button>
      </div>

      {esEdicion && (
        <button
          type="button"
          className={styles.btnArchivar}
          onClick={handleArchivar}
        >
          Archivar viaje
        </button>
      )}
    </div>
  )
}
