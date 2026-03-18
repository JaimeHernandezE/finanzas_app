import { useState, useMemo, useCallback } from 'react'
import { finanzasApi, type PresupuestoMesFila } from '@/api/finanzas'
import { useApi } from '@/hooks/useApi'
import { useCategorias } from '@/hooks/useCatalogos'
import { Cargando, ErrorCarga, InputMontoClp } from '@/components/ui'
import { montoClpANumero } from '@/utils/montoClp'
import { useConfig } from '@/context/ConfigContext'
import styles from './PresupuestoPage.module.scss'

interface CatPres {
  categoriaId: number
  presupuestoId: number | null
  nombre: string
  presupuestado: number | null
  gastado: number
}

function filaToCat(f: PresupuestoMesFila): CatPres {
  const pres =
    f.monto_presupuestado != null
      ? Math.round(Number(f.monto_presupuestado) || 0)
      : null
  return {
    categoriaId: f.categoria_id,
    presupuestoId: f.presupuesto_id,
    nombre: f.categoria_nombre,
    presupuestado: pres,
    gastado: Math.round(Number(f.gastado) || 0),
  }
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function toPesos(n: unknown): number {
  const x = Number(n)
  return Number.isFinite(x) ? Math.round(x) : 0
}

function colorBarra(gastado: number, presupuestado: number): string {
  if (presupuestado <= 0) return gastado > 0 ? '#f59e0b' : '#94a3b8'
  const pct = (gastado / presupuestado) * 100
  if (pct <= 80) return '#22a06b'
  if (pct <= 100) return '#f59e0b'
  return '#ff4d4d'
}

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
  const { formatMonto } = useConfig()
  const isExcedido = disponible < 0
  return (
    <div className={styles.resumenGrid}>
      <div className={styles.resumenCard}>
        <span className={styles.resumenLabel}>Presupuestado</span>
        <span className={styles.resumenValor}>{formatMonto(totalPresupuestado)}</span>
      </div>
      <div className={styles.resumenCard}>
        <span className={styles.resumenLabel}>Gastado</span>
        <span className={styles.resumenValor}>{formatMonto(totalGastado)}</span>
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
          {formatMonto(Math.abs(disponible))}
        </span>
      </div>
    </div>
  )
}

function ItemConPresupuesto({
  cat,
  onStartEdit,
  editingKey,
  editValue,
  onEditChange,
  onEditConfirm,
  onEditCancel,
}: {
  cat: CatPres
  onStartEdit: (cat: CatPres) => void
  editingKey: string | null
  editValue: string
  onEditChange: (v: string) => void
  onEditConfirm: (cat: CatPres) => void
  onEditCancel: () => void
}) {
  const { formatMonto } = useConfig()
  const key = String(cat.categoriaId)
  const presup = cat.presupuestado ?? 0
  const pct = presup > 0 ? (cat.gastado / presup) * 100 : cat.gastado > 0 ? 999 : 0
  const color = colorBarra(cat.gastado, presup)
  const barWidth = presup > 0 ? Math.min(pct, 100) : cat.gastado > 0 ? 100 : 0
  const excedido = presup > 0 && cat.gastado > presup ? cat.gastado - presup : 0
  const isEditing = editingKey === key

  return (
    <div className={styles.catItem}>
      <div className={styles.catItemHeader}>
        <span className={styles.catItemNombre}>{cat.nombre}</span>
        {!isEditing && cat.presupuestoId != null && (
          <button
            type="button"
            className={styles.btnEdit}
            onClick={() => onStartEdit(cat)}
            aria-label="Editar monto"
          >
            ✎
          </button>
        )}
      </div>
      {isEditing ? (
        <div className={styles.catItemEditRow}>
          <span className={styles.catItemMontos}>
            {formatMonto(cat.gastado)} de{' '}
            <InputMontoClp
              soloInput
              inputClassName={styles.catItemEditInput}
              value={editValue}
              onChange={onEditChange}
              autoFocus
              aria-label="Monto presupuestado"
            />
          </span>
          <button
            type="button"
            className={styles.btnFormConfirm}
            onClick={() => onEditConfirm(cat)}
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
            {formatMonto(cat.gastado)} de {formatMonto(presup)}
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
            <span className={styles.catItemPct} style={{ color }}>
              {presup > 0 ? `${pct.toFixed(1)}%` : cat.gastado > 0 ? '—' : '0%'}
            </span>
            {excedido > 0 ? (
              <span className={styles.catItemIndicadorExcedido}>
                Excedido +{formatMonto(excedido)}
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
  assignKey,
  assignValue,
  onAssignChange,
  onAssignConfirm,
  onAssignCancel,
}: {
  cat: CatPres
  onStartAssign: (cat: CatPres) => void
  assignKey: string | null
  assignValue: string
  onAssignChange: (v: string) => void
  onAssignConfirm: (cat: CatPres) => void
  onAssignCancel: () => void
}) {
  const { formatMonto } = useConfig()
  const key = String(cat.categoriaId)
  const isAssigning = assignKey === key

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
            onClick={() => onStartAssign(cat)}
          >
            + Asignar presupuesto
          </button>
        )}
      </div>
      {isAssigning ? (
        <div className={styles.addForm}>
          <InputMontoClp
            soloInput
            inputClassName={styles.addFormInput}
            value={assignValue}
            onChange={onAssignChange}
            autoFocus
            aria-label="Monto presupuestado"
          />
          <button
            type="button"
            className={styles.btnFormConfirm}
            onClick={() => onAssignConfirm(cat)}
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
            {formatMonto(cat.gastado)} gastado
          </span>
          <div className={styles.catItemSinBarWrap}>
            <div className={styles.barTrackEmpty} />
          </div>
        </>
      )}
    </div>
  )
}

export default function PresupuestoPage() {
  const hoy = new Date()
  const [mes, setMes] = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [ambito, setAmbito] = useState<'FAMILIAR' | 'PERSONAL'>('FAMILIAR')

  const { data: rawFilas, loading, error, refetch } = useApi<PresupuestoMesFila[]>(
    () =>
      finanzasApi.getPresupuestoMes({
        mes: mes + 1,
        anio,
        ambito,
      }),
    [mes, anio, ambito],
  )

  const { data: categoriasData } = useCategorias()
  const categoriasEgreso = useMemo(
    () =>
      ((categoriasData ?? []) as { id: number; nombre: string; tipo: string }[]).filter(
        c => c.tipo === 'EGRESO',
      ),
    [categoriasData],
  )

  const categorias = useMemo(
    () => (rawFilas ?? []).map(filaToCat),
    [rawFilas],
  )

  const [showAddForm, setShowAddForm] = useState(false)
  const [newCategoryId, setNewCategoryId] = useState('')
  const [newCategoryMonto, setNewCategoryMonto] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editMontoValue, setEditMontoValue] = useState('')

  const [assignKey, setAssignKey] = useState<string | null>(null)
  const [assignMontoValue, setAssignMontoValue] = useState('')

  const esActual = mes === hoy.getMonth() && anio === hoy.getFullYear()

  const mesApi = `${anio}-${String(mes + 1).padStart(2, '0')}-01`

  const irAnterior = () => {
    if (mes === 0) {
      setMes(11)
      setAnio(a => a - 1)
    } else setMes(m => m - 1)
  }

  const irSiguiente = () => {
    if (esActual) return
    if (mes === 11) {
      setMes(0)
      setAnio(a => a + 1)
    } else setMes(m => m + 1)
  }

  const conPresupuesto = useMemo(
    () => categorias.filter(c => c.presupuestoId != null),
    [categorias],
  )
  const sinPresupuesto = useMemo(
    () => categorias.filter(c => c.presupuestoId == null),
    [categorias],
  )

  const totalPresupuestado = conPresupuesto.reduce(
    (s, c) => s + (c.presupuestado ?? 0),
    0,
  )
  const totalGastado = conPresupuesto.reduce((s, c) => s + c.gastado, 0)
  const disponible = totalPresupuestado - totalGastado
  const porcentajeGeneral =
    totalPresupuestado > 0 ? (totalGastado / totalPresupuestado) * 100 : 0

  const conPresupuestoOrdenadas = useMemo(
    () =>
      [...conPresupuesto].sort((a, b) => {
        const pa = a.presupuestado ?? 1
        const pb = b.presupuestado ?? 1
        const pctA = pa > 0 ? (a.gastado / pa) * 100 : 0
        const pctB = pb > 0 ? (b.gastado / pb) * 100 : 0
        return pctB - pctA
      }),
    [conPresupuesto],
  )
  const sinPresupuestoOrdenadas = useMemo(
    () => [...sinPresupuesto].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [sinPresupuesto],
  )

  const idsEnLista = useMemo(() => new Set(categorias.map(c => c.categoriaId)), [categorias])
  const categoriasDisponiblesParaAgregar = useMemo(
    () => categoriasEgreso.filter(c => !idsEnLista.has(c.id)),
    [categoriasEgreso, idsEnLista],
  )

  const runAction = useCallback(
    async (fn: () => Promise<void>) => {
      setActionError(null)
      try {
        await fn()
        await refetch()
      } catch (e: unknown) {
        const ax = e as { response?: { data?: Record<string, unknown> } }
        const d = ax.response?.data
        const msg =
          d && typeof d === 'object' && 'error' in d
            ? String(d.error)
            : 'No se pudo guardar. Revisa la consola.'
        setActionError(msg)
      }
    },
    [refetch],
  )

  const handleAddCategory = () => {
    const cid = parseInt(newCategoryId, 10)
    const monto = montoClpANumero(newCategoryMonto)
    if (!Number.isFinite(cid) || monto <= 0) return
    void runAction(async () => {
      await finanzasApi.createPresupuesto({
        categoria: cid,
        mes: mesApi,
        monto: String(monto),
        ambito,
      })
      setNewCategoryId('')
      setNewCategoryMonto('')
      setShowAddForm(false)
    })
  }

  const handleStartEdit = (cat: CatPres) => {
    if (cat.presupuestoId == null) return
    setEditingKey(String(cat.categoriaId))
    setEditMontoValue(String(cat.presupuestado ?? 0))
  }

  const handleEditConfirm = (cat: CatPres) => {
    if (cat.presupuestoId == null) return
    const monto = montoClpANumero(editMontoValue)
    if (monto < 0) return
    void runAction(async () => {
      await finanzasApi.patchPresupuesto(cat.presupuestoId, { monto: String(monto) })
      setEditingKey(null)
      setEditMontoValue('')
    })
  }

  const handleAssignConfirm = (cat: CatPres) => {
    const monto = montoClpANumero(assignMontoValue)
    if (monto <= 0) return
    void runAction(async () => {
      await finanzasApi.createPresupuesto({
        categoria: cat.categoriaId,
        mes: mesApi,
        monto: String(monto),
        ambito,
      })
      setAssignKey(null)
      setAssignMontoValue('')
    })
  }

  if (loading) return <Cargando />
  if (error) return <ErrorCarga mensaje={error} />

  return (
    <div className={styles.page}>
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

      {actionError && (
        <p className={styles.actionError} role="alert">
          {actionError}
        </p>
      )}

      <section className={styles.resumenSection}>
        <h2 className={styles.resumenTitle}>Resumen</h2>
        <ResumenCards
          totalPresupuestado={totalPresupuestado}
          totalGastado={totalGastado}
          disponible={disponible}
          porcentajeGeneral={porcentajeGeneral}
        />
      </section>

      <section className={styles.categoriaSection}>
        <div className={styles.categoriaHeader}>
          <h2 className={styles.categoriaTitle}>Por categoría</h2>
          <button
            type="button"
            className={styles.btnAddCat}
            onClick={() => setShowAddForm(v => !v)}
          >
            + Categoría
          </button>
        </div>

        {showAddForm && (
          <div className={styles.addForm}>
            <select
              className={styles.addFormSelect}
              value={newCategoryId}
              onChange={e => setNewCategoryId(e.target.value)}
              aria-label="Seleccionar categoría"
            >
              <option value="">Seleccionar categoría ▾</option>
              {categoriasDisponiblesParaAgregar.map(c => (
                <option key={c.id} value={String(c.id)}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <InputMontoClp
              soloInput
              inputClassName={styles.addFormInput}
              value={newCategoryMonto}
              onChange={setNewCategoryMonto}
              aria-label="Monto presupuestado"
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
                setNewCategoryId('')
                setNewCategoryMonto('')
              }}
              aria-label="Cancelar"
            >
              ✕
            </button>
          </div>
        )}

        {conPresupuestoOrdenadas.length === 0 && sinPresupuestoOrdenadas.length === 0 && (
          <p className={styles.emptyHint}>
            No hay gastos ni presupuestos este mes en este ámbito. Agrega un presupuesto con «+
            Categoría» o registra movimientos.
          </p>
        )}

        {conPresupuestoOrdenadas.map(cat => (
          <ItemConPresupuesto
            key={cat.categoriaId}
            cat={cat}
            onStartEdit={handleStartEdit}
            editingKey={editingKey}
            editValue={editMontoValue}
            onEditChange={setEditMontoValue}
            onEditConfirm={handleEditConfirm}
            onEditCancel={() => {
              setEditingKey(null)
              setEditMontoValue('')
            }}
          />
        ))}
        {sinPresupuestoOrdenadas.map(cat => (
          <ItemSinPresupuesto
            key={cat.categoriaId}
            cat={cat}
            onStartAssign={c => {
              setAssignKey(String(c.categoriaId))
              setAssignMontoValue('')
            }}
            assignKey={assignKey}
            assignValue={assignMontoValue}
            onAssignChange={setAssignMontoValue}
            onAssignConfirm={handleAssignConfirm}
            onAssignCancel={() => {
              setAssignKey(null)
              setAssignMontoValue('')
            }}
          />
        ))}
      </section>
    </div>
  )
}
