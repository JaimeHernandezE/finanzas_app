import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, InputMontoClp, Select, Textarea } from '@/components/ui'
import { montoClpANumero } from '@/utils/montoClp'
import type { SelectOption } from '@/components/ui'
import { useTarjetas } from '@/hooks/useCatalogos'
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
  numero?: number
  monto: number
  mes_facturacion?: string
  estado: 'PENDIENTE' | 'FACTURADO' | 'PAGADO'
  incluir: boolean
  /** Solo en flujo "nuevo gasto" local */
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

type FiltroEstado = 'Pendiente' | 'Facturado' | 'Pagado' | 'Todos'

const CATEGORIAS_EGRESO: SelectOption[] = [
  { value: 'alimentacion', label: 'Alimentación' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'vivienda', label: 'Vivienda' },
  { value: 'salud', label: 'Salud' },
  { value: 'entretenimiento', label: 'Entretenimiento' },
  { value: 'ropa', label: 'Ropa' },
  { value: 'educacion', label: 'Educación' },
  { value: 'otros', label: 'Otros' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponentes
// ─────────────────────────────────────────────────────────────────────────────

function SegmentedControl({
  value,
  onChange,
}: {
  value: FiltroEstado
  onChange: (v: FiltroEstado) => void
}) {
  const opts: { value: FiltroEstado; label: string }[] = [
    { value: 'Pendiente', label: 'Pendiente' },
    { value: 'Facturado', label: 'Facturado' },
    { value: 'Pagado', label: 'Pagado' },
    { value: 'Todos', label: 'Todos' },
  ]
  return (
    <div className={styles.segmented}>
      {opts.map(o => (
        <button
          key={o.value}
          type="button"
          className={`${styles.segBtn} ${value === o.value ? styles.segBtnActive : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function CuotaRow({
  cuota,
  onToggleIncluir,
}: {
  cuota: Cuota
  onToggleIncluir: (id: number) => void
}) {
  const { formatMonto } = useConfig()
  const excluida = !cuota.incluir
  const deshabilitado = cuota.estado === 'PAGADO'
  const badgeClass =
    cuota.estado === 'PENDIENTE' ? styles.badgePendiente
    : cuota.estado === 'FACTURADO' ? styles.badgeFacturado
    : styles.badgePagado

  return (
    <div className={styles.cuotaRow}>
      <input
        type="checkbox"
        className={styles.cuotaCheckbox}
        checked={cuota.incluir}
        disabled={deshabilitado}
        onChange={() => onToggleIncluir(cuota.id)}
        aria-label={`Incluir cuota ${cuota.numero ?? cuota.numeroCuota ?? ''} en el pago`}
      />
      <div className={styles.cuotaContent}>
        <span className={`${styles.cuotaDesc} ${excluida ? styles.excluida : ''}`}>
          Cuota {cuota.numero ?? cuota.numeroCuota}
        </span>
        <span className={styles.cuotaMeta}>
          cuota {cuota.numero ?? cuota.numeroCuota}
        </span>
        <span className={`${styles.cuotaMonto} ${excluida ? styles.excluida : ''}`}>
          {formatMonto(cuota.monto)}
        </span>
        <span className={`${styles.badgeEstado} ${badgeClass}`}>
          {cuota.estado}
        </span>
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
  tarjetaNombre,
  cuentaOptions,
  onClose,
  onGuardar,
}: {
  tarjetaNombre: string
  cuentaOptions: SelectOption[]
  onClose: () => void
  onGuardar: (cuotas: Cuota[]) => void
}) {
  const [tipo, setTipo] = useState<TipoGasto>('EGRESO')
  const [ambito, setAmbito] = useState<AmbitoGasto>('PERSONAL')
  const [monto, setMonto] = useState('')
  const [numCuotas, setNumCuotas] = useState('1')
  const [errors, setErrors] = useState<{ monto?: string; categoria?: string; numCuotas?: string }>({})

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const descripcion = (data.get('comentario') as string)?.trim() || 'Nuevo gasto'
    const next: typeof errors = {}
    const montoTotalVal = montoClpANumero(monto)
    if (!monto || montoTotalVal <= 0) next.monto = 'El monto es obligatorio.'
    if (!data.get('categoria')) next.categoria = 'Selecciona una categoría.'
    const n = parseInt(numCuotas, 10)
    if (!numCuotas || isNaN(n) || n < 1) next.numCuotas = 'Ingresa el número de cuotas.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    const montoTotal = montoTotalVal
    const totalCuotas = Math.max(1, n)
    const montoPorCuota = Math.ceil(montoTotal / totalCuotas)
    const baseId = Date.now()
    const nuevasCuotas: Cuota[] = []
    for (let i = 0; i < totalCuotas; i++) {
      nuevasCuotas.push({
        id: baseId + i,
        movimientoId: 0,
        descripcion: totalCuotas > 1 ? `${descripcion} (cuota ${i + 1}/${totalCuotas})` : descripcion,
        numeroCuota: i + 1,
        totalCuotas,
        monto: montoPorCuota,
        estado: 'PENDIENTE',
        incluir: true,
      })
    }
    onGuardar(nuevasCuotas)
    onClose()
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={`${styles.modalCard} ${styles.modalCardWide} ${styles.modalCardWithClose}`}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          className={styles.modalClose}
          onClick={onClose}
          aria-label="Cerrar"
        >
          ✕
        </button>
        <h2 className={styles.modalTitulo}>Nuevo gasto</h2>
        <p className={styles.modalTexto}>
          Método: Crédito — Tarjeta: {tarjetaNombre}
        </p>
        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>Tipo</span>
                <div style={{ display: 'flex', marginTop: 4 }}>
                  <button type="button" onClick={() => setTipo('EGRESO')} style={{ flex: 1, padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4, background: tipo === 'EGRESO' ? '#dc2626' : undefined, color: tipo === 'EGRESO' ? '#fff' : undefined }}>
                    Egreso
                  </button>
                  <button type="button" onClick={() => setTipo('INGRESO')} style={{ flex: 1, padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4, background: tipo === 'INGRESO' ? '#16a34a' : undefined, color: tipo === 'INGRESO' ? '#fff' : undefined }}>
                    Ingreso
                  </button>
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>Ámbito</span>
                <div style={{ display: 'flex', marginTop: 4 }}>
                  <button type="button" onClick={() => setAmbito('PERSONAL')} style={{ flex: 1, padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4, background: ambito === 'PERSONAL' ? '#0d6461' : undefined, color: ambito === 'PERSONAL' ? '#fff' : undefined }}>
                    Personal
                  </button>
                  <button type="button" onClick={() => setAmbito('COMUN')} style={{ flex: 1, padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4, background: ambito === 'COMUN' ? '#0d6461' : undefined, color: ambito === 'COMUN' ? '#fff' : undefined }}>
                    Común
                  </button>
                </div>
              </div>
            </div>
            {ambito === 'PERSONAL' && cuentaOptions.length > 0 && (
              <Select
                name="cuenta"
                label="Cuenta"
                options={cuentaOptions}
                placeholder="Selecciona cuenta…"
                defaultValue={cuentaOptions[0]?.value}
              />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Select
                name="categoria"
                label="Categoría"
                options={CATEGORIAS_EGRESO}
                placeholder="Selecciona…"
                error={errors.categoria}
                required
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
            <Textarea name="comentario" label="Descripción / Comentario" placeholder="Ej: Supermercado Lider…" rows={2} />
          </div>
          <div className={styles.modalBtns}>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit">Guardar movimiento</Button>
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
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('Todos')
  const { data: cuotasData, loading: cuotasLoading, error: cuotasError, refetch } = useApi(
    () => movimientosApi.getCuotas({
      tarjeta: tarjetas.find(t => String(t.id) === tarjetaSeleccionada)?.id ?? tarjetas[0]?.id,
      mes: mes + 1,
      anio,
    }),
    [tarjetaSeleccionada, tarjetas, mes, anio],
  )
  const cuotas = (cuotasData ?? []) as Cuota[]
  const [cargosAdicionales, setCargosAdicionales] = useState<CargoAdicional[]>([])
  const [formularioCargoVisible, setFormularioCargoVisible] = useState(false)
  const [modalConfirmarPago, setModalConfirmarPago] = useState(false)
  const [exitoPostPago, setExitoPostPago] = useState(false)
  const [totalPagado, setTotalPagado] = useState(0)
  const [modalNuevoGasto, setModalNuevoGasto] = useState(false)

  const esActual = mes === hoy.getMonth() && anio === hoy.getFullYear()
  const irAnterior = () => {
    if (mes === 0) { setMes(11); setAnio(a => a - 1) }
    else setMes(m => m - 1)
  }
  const irSiguiente = () => {
    if (esActual) return
    if (mes === 11) { setMes(0); setAnio(a => a + 1) }
    else setMes(m => m + 1)
  }

  // Filtrado por estado (mock: todas las cuotas son del mes/tarjeta seleccionados)
  const cuotasFiltradas = cuotas.filter(c => {
    if (filtroEstado === 'Todos') return true
    if (filtroEstado === 'Pendiente') return c.estado === 'PENDIENTE'
    if (filtroEstado === 'Facturado') return c.estado === 'FACTURADO'
    if (filtroEstado === 'Pagado') return c.estado === 'PAGADO'
    return true
  })

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
    setTotalPagado(total)
    const aMarcar = cuotas.filter(c => c.incluir && c.estado !== 'PAGADO')
    await Promise.all(
      aMarcar.map(c => movimientosApi.updateCuota(c.id, { estado: 'PAGADO' })),
    )
    setCargosAdicionales([])
    setModalConfirmarPago(false)
    setExitoPostPago(true)
    refetch()
  }

  const tarjeta = tarjetas.find(t => String(t.id) === tarjetaSeleccionada)

  if (cuotasLoading) return <Cargando />
  if (cuotasError) return <ErrorCarga mensaje={cuotasError} />
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
                if (mes === 11) { setMes(0); setAnio(a => a + 1) }
                else setMes(m => m + 1)
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
              disabled={esActual}
              aria-label="Mes siguiente"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* Sección 2 — Barra de filtros */}
      <div className={styles.filterBar}>
        <SegmentedControl value={filtroEstado} onChange={setFiltroEstado} />
        <div className={styles.filterBarSpacer} />
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={() => setModalNuevoGasto(true)}
        >
          + Gasto
        </button>
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
        onRegistrar={() => setModalConfirmarPago(true)}
      />

      {/* Modal de confirmación de pago */}
      {modalConfirmarPago && (
        <div
          className={styles.modalOverlay}
          onClick={() => setModalConfirmarPago(false)}
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
            <div className={styles.modalBtns}>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setModalConfirmarPago(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleConfirmarPago}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de nuevo gasto — Sección 6 */}
      {modalNuevoGasto && (
        <ModalNuevoGasto
          tarjetaNombre={tarjeta?.nombre ?? ''}
          cuentaOptions={cuentaOptionsModal}
          onClose={() => setModalNuevoGasto(false)}
          onGuardar={() => {
            refetch()
            setModalNuevoGasto(false)
          }}
        />
      )}
    </div>
  )
}
