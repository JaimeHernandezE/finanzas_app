import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Input, InputMontoClp, Select, Textarea, CategoriaSelect } from '@/components/ui'
import { montoClpANumero } from '@/utils/montoClp'
import type { SelectOption } from '@/components/ui'
import { useTarjetas, useCategorias, useMetodosPago } from '@/hooks/useCatalogos'
import { useCuentasPersonales } from '@/hooks/useCuentasPersonales'
import { useApi } from '@/hooks/useApi'
import { movimientosApi } from '@/api'
import { Cargando, ErrorCarga } from '@/components/ui'
import { useConfig } from '@/context/ConfigContext'
import styles from './PagarTarjetaPage.module.scss'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos (API devuelve id, numero, monto, mes_facturacion, estado, incluir)
// ─────────────────────────────────────────────────────────────────────────────

interface Tarjeta {
  id: number
  nombre: string
  banco: string
  dia_facturacion: number | null
  dia_vencimiento: number | null
}

interface Cuota {
  id: number
  movimiento?: number
  numero?: number
  monto: number
  mes_facturacion?: string
  estado: 'PENDIENTE' | 'FACTURADO' | 'PAGADO'
  incluir: boolean
  /** Comentario del movimiento origen (API `movimiento_comentario`) */
  movimiento_comentario?: string | null
  /** Categoría del movimiento origen (API `movimiento_categoria_nombre`) */
  movimiento_categoria_nombre?: string | null
  /** Solo en flujo legacy local */
  descripcion?: string
  movimientoId?: number
  numeroCuota?: number
  totalCuotas?: number
}

interface CargoAdicional {
  id: number
  descripcion: string
  monto: number
}

interface MovimientoAsociado {
  id: number
  fecha: string
  comentario: string
  categoria_nombre: string
  monto: number
  ambito: 'PERSONAL' | 'COMUN'
  metodo_pago_tipo: 'EFECTIVO' | 'DEBITO' | 'CREDITO'
  cuenta: number | null
  cuenta_nombre?: string | null
  tarjeta: number | null
  autor_nombre?: string
  deudaEstado?: 'ACTIVO' | 'PAGADO'
}

type VistaTarjeta = 'UTILIZADO' | 'FACTURADO'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const fechaCorta = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', {
    day: '2-digit', month: 'short',
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponentes
// ─────────────────────────────────────────────────────────────────────────────

function CuotaRow({
  cuota,
  totalCuotas,
  onToggleIncluir,
}: {
  cuota: Cuota
  totalCuotas?: number
  onToggleIncluir: (id: number) => void
}) {
  const { formatMonto } = useConfig()
  const excluida = !cuota.incluir
  const deshabilitado = cuota.estado === 'PAGADO'
  const badgeClass =
    cuota.estado === 'PENDIENTE' ? styles.badgePendiente
    : cuota.estado === 'FACTURADO' ? styles.badgeFacturado
    : styles.badgePagado

  const cat =
    (cuota.movimiento_categoria_nombre != null && String(cuota.movimiento_categoria_nombre).trim()) || ''
  const com =
    (cuota.movimiento_comentario != null && String(cuota.movimiento_comentario).trim()) ||
    (cuota.descripcion != null && String(cuota.descripcion).trim()) ||
    ''
  const lineaCategoriaComentario =
    cat && com ? `${cat} - ${com}` : cat || com || null

  return (
    <div className={styles.cuotaRow}>
      <input
        type="checkbox"
        className={styles.cuotaCheckbox}
        checked={cuota.incluir}
        disabled={deshabilitado}
        onChange={() => onToggleIncluir(cuota.id)}
        aria-label={`Incluir cuota ${cuota.numero ?? cuota.numeroCuota ?? ''}${totalCuotas ? ` de ${totalCuotas}` : ''} en el pago`}
      />
      <div className={styles.cuotaContent}>
        <div className={styles.cuotaLinePrimaria}>
          <span className={`${styles.cuotaDesc} ${excluida ? styles.excluida : ''}`}>
            Cuota {cuota.numero ?? cuota.numeroCuota}{totalCuotas ? `/${totalCuotas}` : ''}
          </span>
          <span className={`${styles.cuotaMonto} ${excluida ? styles.excluida : ''}`}>
            {formatMonto(cuota.monto)}
          </span>
          <span className={`${styles.badgeEstado} ${badgeClass}`}>
            {cuota.estado}
          </span>
        </div>
        {lineaCategoriaComentario ? (
          <p className={styles.cuotaMovLinea}>{lineaCategoriaComentario}</p>
        ) : null}
      </div>
    </div>
  )
}

function EmptyStateCuotas() {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon}>○</span>
      <p className={styles.emptyTitulo}>Sin cuotas para este período</p>
    </div>
  )
}

function FormCargoInline({
  onConfirm,
  onCancel,
}: {
  onConfirm: (descripcion: string, monto: number) => void
  onCancel: () => void
}) {
  const [desc, setDesc] = useState('')
  const [montoStr, setMontoStr] = useState('')

  const handleConfirm = () => {
    const m = montoClpANumero(montoStr)
    if (!desc.trim() || isNaN(m) || m <= 0) return
    onConfirm(desc.trim(), m)
    setDesc('')
    setMontoStr('')
  }

  return (
    <div className={styles.formCargoInline}>
      <input
        type="text"
        className={styles.formCargoDesc}
        placeholder="Ej: Interés marzo"
        value={desc}
        onChange={e => setDesc(e.target.value)}
        aria-label="Descripción del cargo"
      />
      <InputMontoClp
        soloInput
        inputClassName={styles.formCargoMonto}
        value={montoStr}
        onChange={setMontoStr}
        aria-label="Monto del cargo"
      />
      <div className={styles.formCargoBtns}>
        <button
          type="button"
          className={`${styles.formCargoBtn} ${styles.formCargoBtnConfirm}`}
          onClick={handleConfirm}
          aria-label="Confirmar"
        >
          ✓
        </button>
        <button
          type="button"
          className={styles.formCargoBtn}
          onClick={onCancel}
          aria-label="Cancelar"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

function TotalesPanel({
  incluido,
  excluido,
  cargos,
  total,
  onRegistrar,
}: {
  incluido: number
  excluido: number
  cargos: number
  total: number
  onRegistrar: () => void
}) {
  const { formatMonto } = useConfig()
  return (
    <div className={styles.totalesPanel}>
      <div className={styles.totalRow}>
        <span className={styles.totalLabel}>Incluido</span>
        <span className={styles.totalMonto}>{formatMonto(incluido)}</span>
      </div>
      <div className={styles.totalRow}>
        <span className={`${styles.totalLabel} ${styles.totalLabelExcluido}`}>Excluido</span>
        <span className={styles.totalMonto}>{formatMonto(excluido)}</span>
      </div>
      <div className={styles.totalRow}>
        <span className={styles.totalLabel}>Cargos</span>
        <span className={styles.totalMonto}>{formatMonto(cargos)}</span>
      </div>
      <div className={styles.totalSeparator} />
      <div className={`${styles.totalRow} ${styles.totalRowFinal}`}>
        <span className={styles.totalLabel}>Total a pagar</span>
        <span className={styles.totalMonto}>{formatMonto(total)}</span>
      </div>
      <button
        type="button"
        className={`${styles.btnPrimary} ${styles.btnRegistrar}`}
        disabled={total === 0}
        onClick={onRegistrar}
      >
        Registrar pago
      </button>
    </div>
  )
}

type TipoGasto = 'EGRESO' | 'INGRESO'
type AmbitoGasto = 'PERSONAL' | 'COMUN'

function ModalNuevoGasto({
  tarjetaId,
  tarjetaNombre,
  cuentaOptions,
  onClose,
  onCreated,
}: {
  tarjetaId: number
  tarjetaNombre: string
  cuentaOptions: SelectOption[]
  onClose: () => void
  onCreated: () => void | Promise<void>
}) {
  const [tipo, setTipo] = useState<TipoGasto>('EGRESO')
  const [ambito, setAmbito] = useState<AmbitoGasto>('PERSONAL')
  const [cuentaSel, setCuentaSel] = useState(cuentaOptions[0]?.value ?? '')
  const [categoriaId, setCategoriaId] = useState('')
  const [monto, setMonto] = useState('')
  const [numCuotas, setNumCuotas] = useState('1')
  const [errors, setErrors] = useState<{
    monto?: string
    categoria?: string
    numCuotas?: string
    cuenta?: string
  }>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { data: metodosData } = useMetodosPago()
  const metodos = (metodosData ?? []) as { id: number; tipo: string; nombre: string }[]
  const metodoCreditoId = useMemo(
    () => metodos.find(m => m.tipo === 'CREDITO')?.id ?? null,
    [metodos],
  )

  const { data: categoriasData } = useCategorias({
    ambito: ambito === 'COMUN' ? 'FAMILIAR' : 'PERSONAL',
    tipo,
    cuenta: ambito === 'PERSONAL' && cuentaSel ? Number(cuentaSel) : undefined,
  })
  const categorias = (categoriasData ?? []) as {
    id: number
    nombre: string
    tipo: string
    categoria_padre: number | null
    es_padre: boolean
  }[]

  useEffect(() => {
    setCategoriaId('')
  }, [tipo, ambito, cuentaSel])

  useEffect(() => {
    const first = cuentaOptions[0]?.value ?? ''
    if (ambito !== 'PERSONAL' || !first) return
    if (!cuentaOptions.some(o => o.value === cuentaSel)) setCuentaSel(first)
  }, [ambito, cuentaOptions, cuentaSel])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setGeneral(null)
    const data = new FormData(e.currentTarget)
    const comentario = ((data.get('comentario') as string) ?? '').trim()
    const next: typeof errors = {}
    const montoTotalVal = montoClpANumero(monto)
    if (!monto || montoTotalVal <= 0) next.monto = 'El monto es obligatorio.'
    if (!categoriaId) next.categoria = 'Selecciona una categoría.'
    const n = parseInt(numCuotas, 10)
    if (!numCuotas || Number.isNaN(n) || n < 1) next.numCuotas = 'Ingresa el número de cuotas.'
    if (ambito === 'PERSONAL' && cuentaOptions.length > 0 && !cuentaSel) {
      next.cuenta = 'Selecciona una cuenta personal.'
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return
    if (metodoCreditoId == null) {
      setGeneral('No hay método de pago «Crédito» configurado. Revísalo en configuración.')
      return
    }

    const montoPorCuota = n > 0 ? Math.ceil(montoTotalVal / n) : montoTotalVal
    setLoading(true)
    try {
      await movimientosApi.createMovimiento({
        fecha: (data.get('fecha') as string) || new Date().toISOString().split('T')[0],
        tipo,
        ambito,
        categoria: Number(categoriaId),
        cuenta: ambito === 'PERSONAL' && cuentaSel ? Number(cuentaSel) : null,
        monto: String(montoTotalVal),
        comentario,
        metodo_pago: metodoCreditoId,
        tarjeta: tarjetaId,
        num_cuotas: n,
        monto_cuota: montoPorCuota,
      })
      await Promise.resolve(onCreated())
    } catch (err: unknown) {
      const ax = err as { response?: { data?: Record<string, string[] | string> } }
      const payload = ax.response?.data
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        const msgs = Object.entries(payload).map(([, v]) =>
          Array.isArray(v) ? v.join(' ') : String(v),
        )
        setGeneral(msgs.join(' ') || 'No se pudo guardar.')
      } else {
        setGeneral('No se pudo guardar el movimiento.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={loading ? undefined : onClose}>
      <div
        className={`${styles.modalCard} ${styles.modalCardWide} ${styles.modalCardWithClose}`}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          className={styles.modalClose}
          onClick={onClose}
          disabled={loading}
          aria-label="Cerrar"
        >
          ✕
        </button>
        <h2 className={styles.modalTitulo}>Nuevo movimiento con tarjeta</h2>
        <p className={styles.modalTexto}>
          Método: Crédito — Tarjeta: {tarjetaNombre}
        </p>
        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>Tipo</span>
                <div style={{ display: 'flex', marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => setTipo('EGRESO')}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: 4,
                      background: tipo === 'EGRESO' ? '#dc2626' : undefined,
                      color: tipo === 'EGRESO' ? '#fff' : undefined,
                    }}
                  >
                    Egreso
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipo('INGRESO')}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: 4,
                      background: tipo === 'INGRESO' ? '#16a34a' : undefined,
                      color: tipo === 'INGRESO' ? '#fff' : undefined,
                    }}
                  >
                    Ingreso
                  </button>
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>Ámbito</span>
                <div style={{ display: 'flex', marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => setAmbito('PERSONAL')}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: 4,
                      background: ambito === 'PERSONAL' ? '#0d6461' : undefined,
                      color: ambito === 'PERSONAL' ? '#fff' : undefined,
                    }}
                  >
                    Personal
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmbito('COMUN')}
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: 4,
                      background: ambito === 'COMUN' ? '#0d6461' : undefined,
                      color: ambito === 'COMUN' ? '#fff' : undefined,
                    }}
                  >
                    Común
                  </button>
                </div>
              </div>
            </div>
            {ambito === 'PERSONAL' && cuentaOptions.length > 0 && (
              <Select
                label="Cuenta"
                options={cuentaOptions}
                placeholder="Selecciona cuenta…"
                value={cuentaSel}
                onChange={e => setCuentaSel(e.target.value)}
                error={errors.cuenta}
              />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <CategoriaSelect
                categorias={categorias}
                tipo={tipo}
                value={categoriaId}
                onChange={setCategoriaId}
                label="Categoría"
                error={errors.categoria}
                placeholder="Selecciona…"
              />
              <Input
                name="fecha"
                label="Fecha"
                type="date"
                defaultValue={new Date().toISOString().split('T')[0]}
              />
            </div>
            <InputMontoClp
              name="monto"
              label="Monto"
              value={monto}
              onChange={setMonto}
              error={errors.monto}
              helperText="Pesos chilenos (CLP)"
              required
            />
            <Input
              name="numCuotas"
              label="N° cuotas"
              type="number"
              min="1"
              max="48"
              placeholder="Ej: 12"
              value={numCuotas}
              onChange={e => setNumCuotas(e.target.value)}
              error={errors.numCuotas}
              required
            />
            <Textarea
              name="comentario"
              label="Descripción / comentario"
              placeholder="Ej: Supermercado Líder…"
              rows={2}
            />
            {general && (
              <p style={{ color: '#b91c1c', fontSize: 14, margin: 0 }}>{general}</p>
            )}
          </div>
          <div className={styles.modalBtns}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Guardando…' : 'Guardar movimiento'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

export default function PagarTarjetaPage() {
  const { formatMonto } = useConfig()
  const navigate = useNavigate()
  const { data: cuentasData } = useCuentasPersonales()
  const cuentaOptionsModal = useMemo(
    () =>
      (cuentasData ?? [])
        .filter(c => c.es_propia)
        .map(c => ({ value: String(c.id), label: c.nombre })),
    [cuentasData],
  )

  const hoy = new Date()
  const { data: tarjetasData } = useTarjetas()
  const tarjetas = (tarjetasData ?? []) as Tarjeta[]
  const [tarjetaSeleccionada, setTarjetaSeleccionada] = useState('')
  useEffect(() => {
    if (tarjetas[0] && !tarjetaSeleccionada) setTarjetaSeleccionada(String(tarjetas[0].id))
  }, [tarjetas, tarjetaSeleccionada])
  const [mes, setMes] = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [vistaActiva, setVistaActiva] = useState<VistaTarjeta>('UTILIZADO')
  const { data: cuotasData, loading: cuotasLoading, error: cuotasError, refetch } = useApi(
    () => movimientosApi.getCuotas({
      tarjeta: tarjetas.find(t => String(t.id) === tarjetaSeleccionada)?.id ?? tarjetas[0]?.id,
      mes: mes + 1,
      anio,
    }),
    [tarjetaSeleccionada, tarjetas, mes, anio],
  )
  const cuotas = (cuotasData ?? []) as Cuota[]
  const { data: cuotasTarjetaData, loading: cuotasTarjetaLoading, error: cuotasTarjetaError, refetch: refetchCuotasTarjeta } = useApi(
    () => movimientosApi.getCuotas({
      tarjeta: tarjetas.find(t => String(t.id) === tarjetaSeleccionada)?.id ?? tarjetas[0]?.id,
    }),
    [tarjetaSeleccionada, tarjetas],
  )
  const cuotasTarjeta = (cuotasTarjetaData ?? []) as Cuota[]

  const { data: movPersonalData, loading: movPersonalLoading, error: movPersonalError, refetch: refetchMovPersonal } = useApi(
    () => movimientosApi.getMovimientos({
      tipo: 'EGRESO',
      ambito: 'PERSONAL',
      solo_mios: true,
      metodo: 'CREDITO',
    }),
    [],
  )
  const { data: movComunData, loading: movComunLoading, error: movComunError, refetch: refetchMovComun } = useApi(
    () => movimientosApi.getMovimientos({
      tipo: 'EGRESO',
      ambito: 'COMUN',
      metodo: 'CREDITO',
    }),
    [],
  )

  const [cargosAdicionales, setCargosAdicionales] = useState<CargoAdicional[]>([])
  const [formularioCargoVisible, setFormularioCargoVisible] = useState(false)
  const [modalConfirmarPago, setModalConfirmarPago] = useState(false)
  const [exitoPostPago, setExitoPostPago] = useState(false)
  const [totalPagado, setTotalPagado] = useState(0)
  const [modalNuevoGasto, setModalNuevoGasto] = useState(false)
  const [guardandoPago, setGuardandoPago] = useState(false)
  const [errorPago, setErrorPago] = useState<string | null>(null)

  const toMonthIndex = (fecha: string | undefined) => {
    if (!fecha) return null
    const [y, m] = fecha.split('-').map(Number)
    if (!Number.isFinite(y) || !Number.isFinite(m)) return null
    return y * 12 + (m - 1)
  }
  const mesSeleccionadoIdx = anio * 12 + mes
  const maxMesActivoIdx = useMemo(() => {
    const activos = cuotasTarjeta.filter(c => c.estado !== 'PAGADO')
    if (activos.length === 0) return null
    const idxs = activos
      .map(c => toMonthIndex(c.mes_facturacion))
      .filter((v): v is number => v !== null)
    if (idxs.length === 0) return null
    return Math.max(...idxs)
  }, [cuotasTarjeta])
  const puedeAvanzar = maxMesActivoIdx !== null && mesSeleccionadoIdx < maxMesActivoIdx

  const irAnterior = () => {
    if (mes === 0) { setMes(11); setAnio(a => a - 1) }
    else setMes(m => m - 1)
  }
  const irSiguiente = () => {
    if (!puedeAvanzar) return
    if (mes === 11) { setMes(0); setAnio(a => a + 1) }
    else setMes(m => m + 1)
  }

  // Filtrado por estado (mock: todas las cuotas son del mes/tarjeta seleccionados)
  const cuotasFiltradas = cuotas

  const montoNum = (c: Cuota) => typeof c.monto === 'number' ? c.monto : Number(c.monto)
  const incluido = cuotas
    .filter(c => c.incluir && c.estado !== 'PAGADO')
    .reduce((s, c) => s + montoNum(c), 0)
  const excluido = cuotas.filter(c => !c.incluir).reduce((s, c) => s + montoNum(c), 0)
  const cargos = cargosAdicionales.reduce((s, c) => s + c.monto, 0)
  const total = incluido + cargos

  const toggleIncluir = async (id: number) => {
    const c = cuotas.find(x => x.id === id)
    if (!c) return
    await movimientosApi.updateCuota(id, { incluir: !c.incluir })
    refetch()
  }

  const agregarCargo = (descripcion: string, monto: number) => {
    setCargosAdicionales(prev => [
      ...prev,
      { id: Date.now(), descripcion, monto },
    ])
    setFormularioCargoVisible(false)
  }

  const eliminarCargo = (id: number) => {
    setCargosAdicionales(prev => prev.filter(c => c.id !== id))
  }

  const handleConfirmarPago = async () => {
    const aMarcar = cuotas.filter(c => c.incluir && c.estado !== 'PAGADO')
    if (!tarjetaId || aMarcar.length === 0) {
      setErrorPago('No hay cuotas seleccionadas para pagar.')
      return
    }
    setGuardandoPago(true)
    setErrorPago(null)
    try {
      await movimientosApi.pagarTarjeta({
        tarjeta_id: tarjetaId,
        mes: mes + 1,
        anio,
        fecha_pago: new Date().toISOString().slice(0, 10),
        cuota_ids: aMarcar.map(c => c.id),
      })
      const totalCuotasPagadas = aMarcar.reduce((s, c) => s + montoNum(c), 0)
      setTotalPagado(totalCuotasPagadas)
      setCargosAdicionales([])
      setModalConfirmarPago(false)
      setExitoPostPago(true)
      void refetch()
      void refetchCuotasTarjeta()
      void refetchMovPersonal()
      void refetchMovComun()
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } }
      setErrorPago(ax.response?.data?.error ?? 'No se pudo registrar el pago.')
    } finally {
      setGuardandoPago(false)
    }
  }

  const tarjeta = tarjetas.find(t => String(t.id) === tarjetaSeleccionada)
  const tarjetaId = tarjeta?.id ?? null

  const movimientosPersonalesTarjeta = useMemo(
    () =>
      ((movPersonalData ?? []) as MovimientoAsociado[])
        .filter(m => m.tarjeta === tarjetaId)
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [movPersonalData, tarjetaId],
  )
  const movimientosComunesTarjeta = useMemo(
    () =>
      ((movComunData ?? []) as MovimientoAsociado[])
        .filter(m => m.tarjeta === tarjetaId)
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [movComunData, tarjetaId],
  )

  const estadoPorMovimiento = useMemo(() => {
    const map = new Map<number, 'ACTIVO' | 'PAGADO'>()
    for (const c of cuotasTarjeta) {
      if (!c.movimiento) continue
      const prev = map.get(c.movimiento)
      if (c.estado !== 'PAGADO') {
        map.set(c.movimiento, 'ACTIVO')
      } else if (!prev) {
        map.set(c.movimiento, 'PAGADO')
      }
    }
    return map
  }, [cuotasTarjeta])
  const utilizadoPersonalVisible = useMemo(
    () => movimientosPersonalesTarjeta.filter(m => estadoPorMovimiento.has(m.id)).slice(0, 10),
    [movimientosPersonalesTarjeta, estadoPorMovimiento],
  )
  const utilizadoComunVisible = useMemo(
    () => movimientosComunesTarjeta.filter(m => estadoPorMovimiento.has(m.id)).slice(0, 10),
    [movimientosComunesTarjeta, estadoPorMovimiento],
  )
  const estadoFacturado = cuotas.some(c => c.estado !== 'PAGADO') ? 'PENDIENTE' : 'PAGADO'
  const totalCuotasPorMovimiento = useMemo(() => {
    const map = new Map<number, number>()
    for (const c of cuotasTarjeta) {
      if (!c.movimiento || !c.numero) continue
      const prev = map.get(c.movimiento) ?? 0
      map.set(c.movimiento, Math.max(prev, c.numero))
    }
    return map
  }, [cuotasTarjeta])
  const totalDeudaActiva = useMemo(
    () =>
      cuotasTarjeta
        .filter(c => c.estado !== 'PAGADO')
        .reduce((acc, c) => acc + Number(c.monto || 0), 0),
    [cuotasTarjeta],
  )
  const totalDeudaActivaPersonal = useMemo(
    () =>
      cuotasTarjeta
        .filter(c => c.estado !== 'PAGADO')
        .reduce((acc, c) => {
          const mov = c.movimiento ? ((movPersonalData ?? []) as MovimientoAsociado[]).find(m => m.id === c.movimiento) : null
          return acc + (mov ? Number(c.monto || 0) : 0)
        }, 0),
    [cuotasTarjeta, movPersonalData],
  )
  const totalDeudaActivaComun = Math.max(0, totalDeudaActiva - totalDeudaActivaPersonal)
  const personalesPorCuenta = useMemo(() => {
    const map = new Map<string, { cuentaNombre: string; total: number; movimientos: MovimientoAsociado[] }>()
    for (const mov of utilizadoPersonalVisible) {
      const cuentaNombre = mov.cuenta_nombre || 'Sin cuenta'
      const key = String(mov.cuenta ?? 'sin-cuenta')
      const entry = map.get(key) ?? { cuentaNombre, total: 0, movimientos: [] }
      entry.total += Number(mov.monto || 0)
      entry.movimientos.push(mov)
      map.set(key, entry)
    }
    return Array.from(map.values()).sort((a, b) => a.cuentaNombre.localeCompare(b.cuentaNombre))
  }, [utilizadoPersonalVisible])

  if (cuotasLoading || cuotasTarjetaLoading || movPersonalLoading || movComunLoading) return <Cargando />
  if (cuotasError || cuotasTarjetaError || movPersonalError || movComunError) {
    return <ErrorCarga mensaje={cuotasError || cuotasTarjetaError || movPersonalError || movComunError || 'Error al cargar datos.'} />
  }
  const cuotasIncluidasCount = cuotas.filter(c => c.incluir && c.estado !== 'PAGADO').length
  const cuotasExcluidasCount = cuotas.filter(c => !c.incluir).length

  // ── Pantalla de éxito post-pago ─────────────────────────────────────────────
  if (exitoPostPago) {
    return (
      <div className={styles.page}>
        <div className={styles.exitoScreen}>
          <div className={styles.exitoIcon}>✓</div>
          <h2 className={styles.exitoTitulo}>Pago registrado</h2>
          <p className={styles.exitoSubtitulo}>
            {tarjeta?.nombre} — {MESES[mes]} {anio}
          </p>
          <p className={styles.exitoMonto}>{formatMonto(totalPagado)}</p>
          <div className={styles.exitoActions}>
            <Button
              variant="ghost"
              onClick={() => {
                setExitoPostPago(false)
                if (puedeAvanzar) {
                  if (mes === 11) { setMes(0); setAnio(a => a + 1) }
                  else setMes(m => m + 1)
                }
              }}
            >
              Ver otro mes
            </Button>
            <Button variant="primary" onClick={() => navigate('/')}>
              Ir al dashboard
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Vista principal ────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      {/* Sección 1 — Encabezado */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerTop}>
            <h1 className={styles.titulo}>Pagar tarjeta</h1>
            <select
              className={styles.tarjetaSelect}
              value={tarjetaSeleccionada}
              onChange={e => setTarjetaSeleccionada(e.target.value)}
              aria-label="Seleccionar tarjeta"
            >
              {tarjetas.map(t => (
                <option key={t.id} value={String(t.id)}>{t.nombre}</option>
              ))}
            </select>
          </div>
          {tarjeta?.dia_facturacion && (
            <p className={styles.cicloInfo}>
              Ciclo: del {tarjeta.dia_facturacion + 1} del mes anterior al {tarjeta.dia_facturacion} de este mes
              {tarjeta.dia_vencimiento ? ` · Vence el ${tarjeta.dia_vencimiento} del mes siguiente` : ''}
            </p>
          )}
          <div className={styles.mesNav}>
            <button
              type="button"
              className={styles.mesBtn}
              onClick={irAnterior}
              aria-label="Mes anterior"
            >
              ‹
            </button>
            <span className={styles.mesLabel}>{MESES[mes]} {anio}</span>
            <button
              type="button"
              className={styles.mesBtn}
              onClick={irSiguiente}
              disabled={!puedeAvanzar}
              aria-label="Mes siguiente"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* Sección 2 — Barra de pestañas */}
      <div className={styles.filterBar}>
        <div className={styles.segmented}>
          <button
            type="button"
            className={`${styles.segBtn} ${vistaActiva === 'UTILIZADO' ? styles.segBtnActive : ''}`}
            onClick={() => setVistaActiva('UTILIZADO')}
          >
            Utilizado
          </button>
          <button
            type="button"
            className={`${styles.segBtn} ${vistaActiva === 'FACTURADO' ? styles.segBtnActive : ''}`}
            onClick={() => setVistaActiva('FACTURADO')}
          >
            Facturado
          </button>
        </div>
        <div className={styles.filterBarSpacer} />
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={tarjetaId == null}
          onClick={() => setModalNuevoGasto(true)}
        >
          + Gasto
        </button>
      </div>

      {vistaActiva === 'UTILIZADO' && (
        <>
          <div className={styles.utilizadoCard}>
            <div className={styles.utilizadoHeader}>
              <span className={styles.utilizadoLabel}>Utilizado</span>
              <span className={styles.utilizadoTotal}>{formatMonto(totalDeudaActiva)}</span>
            </div>
            <div className={styles.utilizadoBreakdown}>
              <span>Personales: {formatMonto(totalDeudaActivaPersonal)}</span>
              <span>Comunes: {formatMonto(totalDeudaActivaComun)}</span>
            </div>
          </div>

          <div className={styles.movimientosAgrupados}>
            <div className={styles.movGrupo}>
              <div className={styles.movGrupoHeader}>
                <span className={styles.movGrupoTitulo}>Gastos personales</span>
                <span className={styles.movGrupoTotal}>{formatMonto(totalDeudaActivaPersonal)}</span>
              </div>
              {utilizadoPersonalVisible.length === 0 ? (
                <p className={styles.movGrupoVacio}>Sin movimientos personales para este período.</p>
              ) : (
                personalesPorCuenta.map(grupo => (
                  <div key={grupo.cuentaNombre} className={styles.movSubGrupo}>
                    <div className={styles.movSubGrupoHeader}>
                      <span className={styles.movSubGrupoTitulo}>{grupo.cuentaNombre}</span>
                      <span className={styles.movSubGrupoTotal}>{formatMonto(grupo.total)}</span>
                    </div>
                    {grupo.movimientos.slice(0, 10).map(mov => (
                      <div key={mov.id} className={styles.movItem}>
                        <span className={styles.movFecha}>{fechaCorta(mov.fecha)}</span>
                        <div className={styles.movInfo}>
                          <span className={styles.movDesc}>{mov.comentario || '—'}</span>
                          <span className={styles.movCat}>{mov.categoria_nombre}</span>
                        </div>
                        <span className={`${styles.movBadgeEstado} ${estadoPorMovimiento.get(mov.id) === 'ACTIVO' ? styles.movBadgeActivo : styles.movBadgePagado}`}>
                          {estadoPorMovimiento.get(mov.id) === 'ACTIVO' ? 'Activo' : 'Pagado'}
                        </span>
                        <span className={styles.movMonto}>{formatMonto(Number(mov.monto || 0))}</span>
                      </div>
                    ))}
                  </div>
                ))
              )}
              <div className={styles.movDetalleFooter}>
                <Link to={(cuentasData ?? []).find(c => c.es_propia)?.id ? `/gastos/cuenta/${(cuentasData ?? []).find(c => c.es_propia)!.id}` : '/configuracion/cuentas'} className={styles.movDetalleLink}>
                  Ver detalle
                </Link>
              </div>
            </div>

            <div className={styles.movGrupo}>
              <div className={styles.movGrupoHeader}>
                <span className={styles.movGrupoTitulo}>Gastos comunes</span>
                <span className={styles.movGrupoTotal}>{formatMonto(totalDeudaActivaComun)}</span>
              </div>
              {utilizadoComunVisible.length === 0 ? (
                <p className={styles.movGrupoVacio}>Sin movimientos comunes para este período.</p>
              ) : (
                utilizadoComunVisible.slice(0, 10).map(mov => (
                  <div key={mov.id} className={styles.movItem}>
                    <span className={styles.movFecha}>{fechaCorta(mov.fecha)}</span>
                    <div className={styles.movInfo}>
                      <span className={styles.movDesc}>{mov.comentario || '—'}</span>
                      <span className={styles.movCat}>
                        {mov.categoria_nombre}
                        {mov.autor_nombre ? ` · ${mov.autor_nombre}` : ''}
                      </span>
                    </div>
                    <span className={`${styles.movBadgeEstado} ${estadoPorMovimiento.get(mov.id) === 'ACTIVO' ? styles.movBadgeActivo : styles.movBadgePagado}`}>
                      {estadoPorMovimiento.get(mov.id) === 'ACTIVO' ? 'Activo' : 'Pagado'}
                    </span>
                    <span className={styles.movMonto}>{formatMonto(Number(mov.monto || 0))}</span>
                  </div>
                ))
              )}
              <div className={styles.movDetalleFooter}>
                <Link to="/gastos/comunes" className={styles.movDetalleLink}>
                  Ver detalle
                </Link>
              </div>
            </div>
          </div>
        </>
      )}

      {vistaActiva === 'FACTURADO' && (
        <>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>FACTURADO</span>
            <span
              className={`${styles.badgeFacturado} ${
                estadoFacturado === 'PAGADO' ? styles.badgeFacturadoPagado : styles.badgeFacturadoPendiente
              }`}
            >
              {estadoFacturado === 'PAGADO' ? 'Pagado' : 'Pendiente'}
            </span>
          </div>

          {/* Sección 3 — Listado de cuotas */}
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>CUOTAS DEL MES</span>
          </div>
          <div className={styles.listaCuotas}>
            {cuotasFiltradas.length === 0 ? (
              <EmptyStateCuotas />
            ) : (
              cuotasFiltradas.map(cuota => (
                <CuotaRow
                  key={cuota.id}
                  cuota={cuota}
                  totalCuotas={cuota.movimiento ? totalCuotasPorMovimiento.get(cuota.movimiento) : undefined}
                  onToggleIncluir={toggleIncluir}
                />
              ))
            )}
          </div>

          {/* Sección 4 — Cargos adicionales */}
          <div className={styles.cargosSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>CARGOS ADICIONALES</span>
              <div className={styles.sectionHeaderAction}>
                {!formularioCargoVisible ? (
                  <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={() => setFormularioCargoVisible(true)}
                  >
                    + Agregar
                  </button>
                ) : null}
              </div>
            </div>
            {formularioCargoVisible && (
              <FormCargoInline
                onConfirm={agregarCargo}
                onCancel={() => setFormularioCargoVisible(false)}
              />
            )}
            {cargosAdicionales.map(cargo => (
              <div key={cargo.id} className={styles.cargoRow}>
                <span className={styles.cargoDesc}>{cargo.descripcion}</span>
                <span className={styles.cargoCat}>Intereses TC</span>
                <span className={styles.cargoMonto}>{formatMonto(cargo.monto)}</span>
                <button
                  type="button"
                  className={styles.cargoDelete}
                  onClick={() => eliminarCargo(cargo.id)}
                  aria-label="Eliminar cargo"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>

          {/* Sección 5 — Totales y botón Registrar pago */}
          <TotalesPanel
            incluido={incluido}
            excluido={excluido}
            cargos={cargos}
            total={total}
            onRegistrar={() => {
              setErrorPago(null)
              setModalConfirmarPago(true)
            }}
          />

          <section className={styles.nuevoMovSection} aria-labelledby="pagar-tc-nuevo-mov">
            <h2 id="pagar-tc-nuevo-mov" className={styles.nuevoMovSectionTitulo}>
              Nuevo movimiento en esta tarjeta
            </h2>
            <p className={styles.nuevoMovSectionTexto}>
              Registra un gasto o ingreso con método crédito; se asociará a {tarjeta?.nombre ?? 'la tarjeta seleccionada'} y
              se generarán las cuotas automáticamente.
            </p>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={tarjetaId == null}
              onClick={() => setModalNuevoGasto(true)}
            >
              + Nuevo movimiento con esta tarjeta
            </button>
          </section>
        </>
      )}

      {/* Modal de confirmación de pago */}
      {modalConfirmarPago && (
        <div
          className={styles.modalOverlay}
          onClick={() => !guardandoPago && setModalConfirmarPago(false)}
        >
          <div
            className={styles.modalCard}
            onClick={e => e.stopPropagation()}
          >
            <h2 className={styles.modalTitulo}>Registrar pago</h2>
            <p className={styles.modalTexto}>
              {tarjeta?.nombre} — {MESES[mes]} {anio}
              <br />
              {cuotasIncluidasCount} cuota(s) incluidas
              {cuotasExcluidasCount > 0 && (
                <>
                  <br />
                  {cuotasExcluidasCount} cuota(s) pasa(n) al mes siguiente
                </>
              )}
              <br />
              <strong>Total a pagar {formatMonto(total)}</strong>
            </p>
            {errorPago && (
              <p style={{ color: '#b91c1c', fontSize: 14, marginTop: 8 }}>{errorPago}</p>
            )}
            <div className={styles.modalBtns}>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={guardandoPago}
                onClick={() => setModalConfirmarPago(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={guardandoPago}
                onClick={handleConfirmarPago}
              >
                {guardandoPago ? 'Registrando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de nuevo gasto — Sección 6 */}
      {modalNuevoGasto && tarjetaId != null && (
        <ModalNuevoGasto
          tarjetaId={tarjetaId}
          tarjetaNombre={tarjeta?.nombre ?? ''}
          cuentaOptions={cuentaOptionsModal}
          onClose={() => setModalNuevoGasto(false)}
          onCreated={async () => {
            await Promise.all([
              refetch(),
              refetchCuotasTarjeta(),
              refetchMovPersonal(),
              refetchMovComun(),
            ])
            setModalNuevoGasto(false)
          }}
        />
      )}
    </div>
  )
}
