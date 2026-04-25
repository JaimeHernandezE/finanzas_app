import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { finanzasApi, type PresupuestoMesFila } from '@/api/finanzas'
import { movimientosApi } from '@/api/movimientos'
import { useApi } from '@/hooks/useApi'
import { useCategorias } from '@/hooks/useCatalogos'
import { useCuentasPersonales } from '@/hooks/useCuentasPersonales'
import { Cargando, ErrorCarga, InputMontoClp } from '@/components/ui'
import CategoriaPresupuestoItem from '@/components/presupuesto/CategoriaPresupuestoItem'
import itemPresStyles from '@/components/presupuesto/CategoriaPresupuestoItem.module.scss'
import { montoClpANumero } from '@/utils/montoClp'
import { useConfig } from '@/context/ConfigContext'
import styles from './PresupuestoPage.module.scss'

interface CatPres {
  categoriaId: number
  presupuestoId: number | null
  nombre: string
  presupuestado: number | null
  gastado: number
  esAgregadoPadre: boolean
  categoriaPadreId: number | null
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
    esAgregadoPadre: Boolean(f.es_agregado_padre),
    categoriaPadreId: f.categoria_padre_id ?? null,
  }
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function ResumenCards({
  totalPresupuestado,
  totalGastado,
  disponible,
  porcentajeGeneral,
  gastoReal,
  cuotasPendientesTotal,
  cuotasPendientesPorTarjeta,
}: {
  totalPresupuestado: number
  totalGastado: number
  disponible: number
  porcentajeGeneral: number
  gastoReal: number
  cuotasPendientesTotal: number
  cuotasPendientesPorTarjeta: Array<{ tarjeta: string; total: number }>
}) {
  const { formatMonto } = useConfig()
  const isExcedido = disponible < 0
  const [mostrarDetalleGastado, setMostrarDetalleGastado] = useState(false)
  return (
    <div className={styles.resumenGrid}>
      <div className={styles.resumenCard}>
        <span className={styles.resumenLabel}>Presupuestado</span>
        <span className={styles.resumenValor}>{formatMonto(totalPresupuestado)}</span>
      </div>
      <div className={styles.resumenCard}>
        <span className={styles.resumenLabelRow}>
          <span className={styles.resumenLabel}>Gastado</span>
          <button
            type="button"
            className={styles.resumenHelpBtn}
            onClick={() => setMostrarDetalleGastado((v) => !v)}
            aria-expanded={mostrarDetalleGastado}
            aria-label={mostrarDetalleGastado ? 'Ocultar detalle de gastado' : 'Mostrar detalle de gastado'}
            title="Ver detalle"
          >
            ?
          </button>
        </span>
        <span className={styles.resumenValor}>{formatMonto(totalGastado)}</span>
        <span className={styles.resumenPorcentaje}>
          {porcentajeGeneral.toFixed(1)}%
        </span>
        {mostrarDetalleGastado && (
          <>
            <span className={styles.resumenPorcentaje}>
              Gasto real: {formatMonto(gastoReal)}
            </span>
            <span className={styles.resumenPorcentaje}>
              Cuotas pendientes: {formatMonto(cuotasPendientesTotal)}
            </span>
            {cuotasPendientesPorTarjeta.map((row) => (
              <span key={row.tarjeta} className={styles.resumenPorcentaje}>
                - {row.tarjeta}: {formatMonto(row.total)}
              </span>
            ))}
          </>
        )}
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


function ItemSinPresupuesto({
  cat,
  highlighted,
  onStartAssign,
  assignKey,
  assignValue,
  onAssignChange,
  onAssignConfirm,
  onAssignCancel,
}: {
  cat: CatPres
  highlighted: boolean
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
    <div
      id={`cat-pres-${cat.categoriaId}`}
      className={styles.catItemSinPresupuesto}
      style={highlighted ? { background: 'rgba(96, 200, 240, 0.14)', borderRadius: 8 } : undefined}
    >
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
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const hoy = new Date()
  const mesParam = Number(searchParams.get('mes'))
  const anioParam = Number(searchParams.get('anio'))
  const ambitoParam = searchParams.get('ambito') === 'PERSONAL' ? 'PERSONAL' : 'FAMILIAR'
  const cuentaParam = Number(searchParams.get('cuenta'))
  const categoriaFocusParam = Number(searchParams.get('categoria'))
  const [mes, setMes] = useState(Number.isFinite(mesParam) && mesParam >= 1 && mesParam <= 12 ? mesParam - 1 : hoy.getMonth())
  const [anio, setAnio] = useState(Number.isFinite(anioParam) && anioParam >= 2000 ? anioParam : hoy.getFullYear())
  const [ambito, setAmbito] = useState<'FAMILIAR' | 'PERSONAL'>(ambitoParam)
  const { data: cuentasData } = useCuentasPersonales()
  const cuentasPropias = useMemo(
    () =>
      (cuentasData ?? [])
        .filter(c => c.es_propia)
        .sort((a, b) => {
          const aPersonal = a.nombre.trim().toLowerCase() === 'personal'
          const bPersonal = b.nombre.trim().toLowerCase() === 'personal'
          if (aPersonal && !bPersonal) return -1
          if (!aPersonal && bPersonal) return 1
          return a.nombre.localeCompare(b.nombre, 'es')
        }),
    [cuentasData],
  )
  const [cuentaPersonalId, setCuentaPersonalId] = useState<number | null>(Number.isFinite(cuentaParam) ? cuentaParam : null)
  const [categoriaDestacadaId] = useState<number | null>(Number.isFinite(categoriaFocusParam) ? categoriaFocusParam : null)

  useEffect(() => {
    if (ambito !== 'PERSONAL') return
    if (!cuentasPropias.length) return
    if (cuentaPersonalId === null || !cuentasPropias.some(c => c.id === cuentaPersonalId)) {
      setCuentaPersonalId(cuentasPropias[0].id)
    }
  }, [ambito, cuentasPropias, cuentaPersonalId])

  const { data: rawFilas, loading, error, refetch } = useApi<PresupuestoMesFila[]>(
    () =>
      finanzasApi.getPresupuestoMes({
        mes: mes + 1,
        anio,
        ambito,
        cuenta: ambito === 'PERSONAL' && cuentaPersonalId !== null ? cuentaPersonalId : undefined,
      }),
    [mes, anio, ambito, cuentaPersonalId],
  )
  type MovimientoResumen = {
    id: number
    movimiento?: number | null
    monto: string | number
    metodo_pago_tipo?: 'EFECTIVO' | 'DEBITO' | 'CREDITO'
    tarjeta_nombre?: string | null
  }
  const ambitoMov = ambito === 'FAMILIAR' ? 'COMUN' : 'PERSONAL'
  const { data: gastosMesData } = useApi<MovimientoResumen[]>(
    () =>
      movimientosApi.getMovimientos({
        mes: mes + 1,
        anio,
        tipo: 'EGRESO',
        ambito: ambitoMov,
        cuenta: ambitoMov === 'PERSONAL' && cuentaPersonalId !== null ? cuentaPersonalId : undefined,
      }),
    [mes, anio, ambitoMov, cuentaPersonalId],
  )
  const { data: movCreditosData } = useApi<MovimientoResumen[]>(
    () =>
      movimientosApi.getMovimientos({
        tipo: 'EGRESO',
        ambito: ambitoMov,
        metodo: 'CREDITO',
        cuenta: ambitoMov === 'PERSONAL' && cuentaPersonalId !== null ? cuentaPersonalId : undefined,
      }),
    [ambitoMov, cuentaPersonalId],
  )
  const { data: cuotasPendientesMesData } = useApi<Array<{ movimiento?: number | null; monto: string | number }>>(
    () =>
      movimientosApi.getCuotas({
        mes: mes + 1,
        anio,
      }),
    [mes, anio],
  )

  const { data: categoriasData } = useCategorias({
    ambito,
    tipo: 'EGRESO',
    cuenta: ambito === 'PERSONAL' && cuentaPersonalId !== null ? cuentaPersonalId : undefined,
  })
  const categoriasEgreso = useMemo(
    () =>
      ((categoriasData ?? []) as {
        id: number
        nombre: string
        tipo: string
        es_padre?: boolean
        categoria_padre?: number | null
      }[]).filter(c => c.tipo === 'EGRESO' && !c.es_padre),
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
    () =>
      categorias.filter(c => {
        if (c.esAgregadoPadre) {
          return (c.presupuestado ?? 0) > 0 || c.gastado > 0
        }
        return c.presupuestoId != null
      }),
    [categorias],
  )
  const sinPresupuesto = useMemo(
    () => categorias.filter(c => c.presupuestoId == null && !c.esAgregadoPadre),
    [categorias],
  )

  const totalPresupuestado = categorias
    .filter(c => !c.esAgregadoPadre && c.presupuestoId != null)
    .reduce((s, c) => s + (c.presupuestado ?? 0), 0)
  const gastoReal = useMemo(
    () =>
      ((gastosMesData ?? []) as MovimientoResumen[])
        .filter((m) => m.metodo_pago_tipo !== 'CREDITO')
        .reduce((sum, m) => sum + (Number(m.monto) || 0), 0),
    [gastosMesData],
  )
  const cuotasPendientesPorTarjeta = useMemo(() => {
    const movTarjetaPorId = new Map<number, string>()
    for (const mov of (movCreditosData ?? []) as MovimientoResumen[]) {
      movTarjetaPorId.set(mov.id, String(mov.tarjeta_nombre || 'Tarjeta'))
    }
    const agg = new Map<string, number>()
    for (const cuota of (cuotasPendientesMesData ?? [])) {
      const cuotaEstado = String((cuota as { estado?: string }).estado ?? '').toUpperCase()
      const cuotaIncluir = Boolean((cuota as { incluir?: boolean }).incluir ?? true)
      if (cuotaEstado === 'PAGADO') continue
      if (!cuotaIncluir) continue
      const movId = Number(cuota.movimiento ?? NaN)
      if (!Number.isFinite(movId)) continue
      const tarjeta = movTarjetaPorId.get(movId)
      if (!tarjeta) continue
      agg.set(tarjeta, (agg.get(tarjeta) ?? 0) + (Number(cuota.monto) || 0))
    }
    return Array.from(agg.entries())
      .map(([tarjeta, total]) => ({ tarjeta, total }))
      .sort((a, b) => a.tarjeta.localeCompare(b.tarjeta, 'es'))
  }, [movCreditosData, cuotasPendientesMesData])
  const cuotasPendientesTotal = useMemo(
    () => cuotasPendientesPorTarjeta.reduce((sum, row) => sum + row.total, 0),
    [cuotasPendientesPorTarjeta],
  )
  const totalGastado = Math.round(gastoReal + cuotasPendientesTotal)
  const disponible = totalPresupuestado - totalGastado
  const porcentajeGeneral =
    totalPresupuestado > 0 ? (totalGastado / totalPresupuestado) * 100 : 0

  const bloquesConPresupuesto = useMemo(() => {
    const padreIds = new Set(
      conPresupuesto.filter(c => c.esAgregadoPadre).map(c => c.categoriaId),
    )
    const hijosPorPadre = new Map<number, CatPres[]>()
    for (const c of conPresupuesto) {
      const pid = c.categoriaPadreId
      if (pid != null && padreIds.has(pid)) {
        const arr = hijosPorPadre.get(pid) ?? []
        arr.push(c)
        hijosPorPadre.set(pid, arr)
      }
    }
    hijosPorPadre.forEach(arr =>
      arr.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    )
    const padres = conPresupuesto.filter(c => c.esAgregadoPadre)
    const sueltas = conPresupuesto.filter(
      c =>
        !c.esAgregadoPadre &&
        !(c.categoriaPadreId != null && padreIds.has(c.categoriaPadreId)),
    )
    type Bloque =
      | { tipo: 'grupo'; parent: CatPres; hijos: CatPres[] }
      | { tipo: 'suelta'; cat: CatPres }
    const bloques: Bloque[] = [
      ...padres.map(p => ({
        tipo: 'grupo' as const,
        parent: p,
        hijos: hijosPorPadre.get(p.categoriaId) ?? [],
      })),
      ...sueltas.map(cat => ({ tipo: 'suelta' as const, cat })),
    ]
    // Grupos padre (con subcategorías) primero; luego categorías sueltas; alfabético dentro de cada bloque.
    bloques.sort((a, b) => {
      const rank = (bl: Bloque) => (bl.tipo === 'grupo' ? 0 : 1)
      const rA = rank(a)
      const rB = rank(b)
      if (rA !== rB) return rA - rB
      const na = a.tipo === 'grupo' ? a.parent.nombre : a.cat.nombre
      const nb = b.tipo === 'grupo' ? b.parent.nombre : b.cat.nombre
      return na.localeCompare(nb, 'es', { sensitivity: 'base' })
    })
    return bloques
  }, [conPresupuesto])
  const sinPresupuestoOrdenadas = useMemo(
    () => [...sinPresupuesto].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [sinPresupuesto],
  )

  useEffect(() => {
    if (!categoriaDestacadaId) return
    const el = document.getElementById(`cat-pres-${categoriaDestacadaId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [categoriaDestacadaId, bloquesConPresupuesto.length, sinPresupuestoOrdenadas.length])

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
        cuenta: ambito === 'PERSONAL' && cuentaPersonalId !== null ? cuentaPersonalId : undefined,
      })
      setNewCategoryId('')
      setNewCategoryMonto('')
      setShowAddForm(false)
    })
  }

  const handleStartEdit = (cat: CatPres) => {
    if (cat.presupuestoId == null || cat.esAgregadoPadre) return
    setEditingKey(String(cat.categoriaId))
    setEditMontoValue(String(cat.presupuestado ?? 0))
  }

  const handleEditConfirm = (cat: CatPres) => {
    const presupuestoId = cat.presupuestoId
    if (presupuestoId == null) return
    const monto = montoClpANumero(editMontoValue)
    if (monto < 0) return
    void runAction(async () => {
      await finanzasApi.patchPresupuesto(presupuestoId, { monto: String(monto) })
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
        cuenta: ambito === 'PERSONAL' && cuentaPersonalId !== null ? cuentaPersonalId : undefined,
      })
      setAssignKey(null)
      setAssignMontoValue('')
    })
  }

  const irListadoCategoria = useCallback((categoriaId: number) => {
    const params = new URLSearchParams({ categoria: String(categoriaId) })
    if (ambito === 'FAMILIAR') {
      navigate(`/gastos/comunes?${params.toString()}`)
      return
    }
    const cuentaDestino = cuentaPersonalId ?? cuentasPropias[0]?.id ?? null
    if (cuentaDestino == null) return
    navigate(`/gastos/cuenta/${cuentaDestino}?${params.toString()}`)
  }, [ambito, cuentaPersonalId, cuentasPropias, navigate])

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
        {ambito === 'PERSONAL' && (
          <div className={styles.cuentasTabs}>
            {cuentasPropias.length === 0 ? (
              <span className={styles.cuentaTabHint}>Sin cuentas personales</span>
            ) : (
              cuentasPropias.map(c => (
                <button
                  key={c.id}
                  type="button"
                  className={`${styles.cuentaTab} ${cuentaPersonalId === c.id ? styles.cuentaTabActive : ''}`}
                  onClick={() => setCuentaPersonalId(c.id)}
                >
                  {c.nombre}
                </button>
              ))
            )}
          </div>
        )}
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
          gastoReal={gastoReal}
          cuotasPendientesTotal={cuotasPendientesTotal}
          cuotasPendientesPorTarjeta={cuotasPendientesPorTarjeta}
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

        {bloquesConPresupuesto.length === 0 && sinPresupuestoOrdenadas.length === 0 && (
          <p className={styles.emptyHint}>
            No hay gastos ni presupuestos este mes en este ámbito. Agrega un presupuesto con «+
            Categoría» o registra movimientos.
          </p>
        )}

        {bloquesConPresupuesto.map(bloque => {
          if (bloque.tipo === 'suelta') {
            const cat = bloque.cat
            const isEditing = editingKey === String(cat.categoriaId)
            return (
              <CategoriaPresupuestoItem
                key={cat.categoriaId}
                id={`cat-pres-${cat.categoriaId}`}
                nombre={cat.nombre}
                gastado={cat.gastado}
                presupuestado={cat.presupuestado ?? 0}
                highlighted={categoriaDestacadaId === cat.categoriaId}
                editable
                isEditing={isEditing}
                editValue={editMontoValue}
                onStartEdit={() => handleStartEdit(cat)}
                onEditChange={setEditMontoValue}
                onEditConfirm={() => handleEditConfirm(cat)}
                onEditCancel={() => {
                  setEditingKey(null)
                  setEditMontoValue('')
                }}
                onClick={() => irListadoCategoria(cat.categoriaId)}
              />
            )
          }
          const { parent, hijos } = bloque
          return (
            <details
              key={parent.categoriaId}
              className={styles.grupoPresupuesto}
            >
              <summary className={styles.grupoSummary}>
                <div className={styles.grupoSummaryInner}>
                  <CategoriaPresupuestoItem
                    id={`cat-pres-${parent.categoriaId}`}
                    nombre={`${parent.nombre} (total subcategorías)`}
                    gastado={parent.gastado}
                    presupuestado={parent.presupuestado ?? 0}
                    highlighted={categoriaDestacadaId === parent.categoriaId}
                    className={itemPresStyles.catItemSinBordeInferior}
                    editable={false}
                    isEditing={false}
                    editValue=""
                  />
                </div>
                <span className={styles.grupoChevron} aria-hidden>
                  ▸
                </span>
              </summary>
              {hijos.length > 0 ? (
                <div className={styles.grupoHijos}>
                  {hijos.map(cat => {
                    const isEditing = editingKey === String(cat.categoriaId)
                    return (
                      <div key={cat.categoriaId} className={styles.grupoHijoFila}>
                        <CategoriaPresupuestoItem
                          id={`cat-pres-${cat.categoriaId}`}
                          nombre={cat.nombre}
                          gastado={cat.gastado}
                          presupuestado={cat.presupuestado ?? 0}
                          highlighted={categoriaDestacadaId === cat.categoriaId}
                          className={itemPresStyles.catItemSinBordeInferior}
                          editable
                          isEditing={isEditing}
                          editValue={editMontoValue}
                          onStartEdit={() => handleStartEdit(cat)}
                          onEditChange={setEditMontoValue}
                          onEditConfirm={() => handleEditConfirm(cat)}
                          onEditCancel={() => {
                            setEditingKey(null)
                            setEditMontoValue('')
                          }}
                          onClick={() => irListadoCategoria(cat.categoriaId)}
                        />
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className={styles.grupoSinHijas}>
                  No hay subcategorías con presupuesto o gasto este mes.
                </p>
              )}
            </details>
          )
        })}
        {sinPresupuestoOrdenadas.map(cat => (
          <ItemSinPresupuesto
            key={cat.categoriaId}
            cat={cat}
            highlighted={categoriaDestacadaId === cat.categoriaId}
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
