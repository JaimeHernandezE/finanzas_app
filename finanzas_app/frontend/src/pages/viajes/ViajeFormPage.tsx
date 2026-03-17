import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useViaje } from '@/context/ViajeContext'
import { MOCK_PRESUPUESTOS, type Viaje } from './mockViajes'
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

const CATEGORIAS_DISPONIBLES: { id: string; nombre: string }[] =
  MOCK_PRESUPUESTOS.map((p) => ({
    id: p.categoriaId,
    nombre: p.categoriaNombre,
  }))

// -----------------------------------------------------------------------------
// Página
// -----------------------------------------------------------------------------

export default function ViajeFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { viajes, setViajes } = useViaje()
  const esEdicion = Boolean(id)

  const [nombre, setNombre] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [colorSeleccionado, setColorSeleccionado] = useState(0)
  const [presupuestoItems, setPresupuestoItems] = useState<PresupuestoItem[]>([])
  const [showAddRow, setShowAddRow] = useState(false)
  const [addCategoriaId, setAddCategoriaId] = useState('')
  const [addMonto, setAddMonto] = useState('')

  const viaje = useMemo(
    () => (id ? viajes.find((v) => v.id === id) : null),
    [id, viajes]
  )

  useEffect(() => {
    if (viaje) {
      setNombre(viaje.nombre)
      setFechaInicio(viaje.fechaInicio)
      setFechaFin(viaje.fechaFin)
      const idx = COLORES_TEMA.indexOf(viaje.colorTema)
      setColorSeleccionado(idx >= 0 ? idx : 0)
      setPresupuestoItems(
        MOCK_PRESUPUESTOS.map((p) => ({
          categoriaId: p.categoriaId,
          categoriaNombre: p.categoriaNombre,
          montoPresupuestado: p.montoPresupuestado,
        }))
      )
    }
  }, [viaje])

  const categoriasNoAgregadas = useMemo(
    () =>
      CATEGORIAS_DISPONIBLES.filter(
        (c) => !presupuestoItems.some((p) => p.categoriaId === c.id)
      ),
    [presupuestoItems]
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

  const handleGuardar = () => {
    if (!puedeGuardar) return
    const colorHex = COLORES_TEMA[colorSeleccionado] ?? COLORES_TEMA[0]
    if (esEdicion && id) {
      setViajes((prev) =>
        prev.map((v) =>
          v.id === id
            ? {
                ...v,
                nombre: nombre.trim(),
                fechaInicio,
                fechaFin,
                colorTema: colorHex,
              }
            : v
        )
      )
      navigate(`/viajes/${id}`)
    } else {
      const nuevoViaje: Viaje = {
        id: String(Date.now()),
        nombre: nombre.trim(),
        fechaInicio,
        fechaFin,
        colorTema: colorHex,
        esActivo: false,
        archivado: false,
      }
      setViajes((prev) => [...prev, nuevoViaje])
      navigate('/viajes')
    }
  }

  const handleArchivar = () => {
    if (!esEdicion || !id) return
    setViajes((prev) =>
      prev.map((v) => (v.id === id ? { ...v, archivado: true } : v))
    )
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
