import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Select, Textarea } from '@/components/ui'
import type { SelectOption } from '@/components/ui'
import styles from './PagarTarjetaPage.module.scss'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

interface Tarjeta {
  id: string
  nombre: string
  banco: string
}

interface Cuota {
  id: number
  movimientoId: number
  descripcion: string
  numeroCuota: number
  totalCuotas: number
  monto: number
  estado: 'PENDIENTE' | 'FACTURADO' | 'PAGADO'
  incluir: boolean
}

interface CargoAdicional {
  id: number
  descripcion: string
  monto: number
}

type FiltroEstado = 'Pendiente' | 'Facturado' | 'Pagado' | 'Todos'

// ─────────────────────────────────────────────────────────────────────────────
// Datos mock  // TODO: reemplazar por fetch al backend
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_TARJETAS: Tarjeta[] = [
  { id: '1', nombre: 'Visa BCI', banco: 'BCI' },
  { id: '2', nombre: 'Mastercard Santander', banco: 'Santander' },
]

const MOCK_CUOTAS_INIT: Cuota[] = [
  { id: 1, movimientoId: 10, descripcion: 'Supermercado Lider', numeroCuota: 1, totalCuotas: 3, monto: 29133, estado: 'FACTURADO', incluir: true },
  { id: 2, movimientoId: 11, descripcion: 'Netflix', numeroCuota: 1, totalCuotas: 1, monto: 10990, estado: 'PENDIENTE', incluir: true },
  { id: 3, movimientoId: 12, descripcion: 'Televisor Samsung', numeroCuota: 2, totalCuotas: 6, monto: 42000, estado: 'PENDIENTE', incluir: false },
  { id: 4, movimientoId: 13, descripcion: 'Zapatos', numeroCuota: 1, totalCuotas: 2, monto: 24990, estado: 'PAGADO', incluir: true },
]

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

const CUENTAS: SelectOption[] = [
  { value: '1', label: 'Personal' },
  { value: '2', label: 'Arquitecto' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const clp = (n: number) =>
  n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })

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
        aria-label={`Incluir ${cuota.descripcion} en el pago`}
      />
      <div className={styles.cuotaContent}>
        <span className={`${styles.cuotaDesc} ${excluida ? styles.excluida : ''}`}>
          {cuota.descripcion}
        </span>
        <span className={styles.cuotaMeta}>
          cuota {cuota.numeroCuota} / {cuota.totalCuotas}
        </span>
        <span className={`${styles.cuotaMonto} ${excluida ? styles.excluida : ''}`}>
          {clp(cuota.monto)}
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
    const m = parseInt(montoStr.replace(/\D/g, ''), 10)
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
      <input
        type="text"
        className={styles.formCargoMonto}
        placeholder="$ 0"
        value={montoStr}
        onChange={e => setMontoStr(e.target.value)}
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
  return (
    <div className={styles.totalesPanel}>
      <div className={styles.totalRow}>
        <span className={styles.totalLabel}>Incluido</span>
        <span className={styles.totalMonto}>{clp(incluido)}</span>
      </div>
      <div className={styles.totalRow}>
        <span className={`${styles.totalLabel} ${styles.totalLabelExcluido}`}>Excluido</span>
        <span className={styles.totalMonto}>{clp(excluido)}</span>
      </div>
      <div className={styles.totalRow}>
        <span className={styles.totalLabel}>Cargos</span>
        <span className={styles.totalMonto}>{clp(cargos)}</span>
      </div>
      <div className={styles.totalSeparator} />
      <div className={`${styles.totalRow} ${styles.totalRowFinal}`}>
        <span className={styles.totalLabel}>Total a pagar</span>
        <span className={styles.totalMonto}>{clp(total)}</span>
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
  onClose,
  onGuardar,
}: {
  tarjetaNombre: string
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
    if (!monto || parseInt(monto, 10) <= 0) next.monto = 'El monto es obligatorio.'
    if (!data.get('categoria')) next.categoria = 'Selecciona una categoría.'
    const n = parseInt(numCuotas, 10)
    if (!numCuotas || isNaN(n) || n < 1) next.numCuotas = 'Ingresa el número de cuotas.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    const montoTotal = parseInt(String(monto).replace(/\D/g, ''), 10) || 0
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
            {ambito === 'PERSONAL' && (
              <Select name="cuenta" label="Cuenta" options={CUENTAS} placeholder="Selecciona cuenta…" />
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
            <Input
              name="monto"
              label="Monto"
              type="number"
              min="1"
              placeholder="0"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              error={errors.monto}
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
  const navigate = useNavigate()

  const hoy = new Date()
  const [tarjetaSeleccionada, setTarjetaSeleccionada] = useState(MOCK_TARJETAS[0]?.id ?? '1')
  const [mes, setMes] = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('Todos')
  const [cuotas, setCuotas] = useState<Cuota[]>(MOCK_CUOTAS_INIT)
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

  const incluido = cuotas
    .filter(c => c.incluir && c.estado !== 'PAGADO')
    .reduce((s, c) => s + c.monto, 0)
  const excluido = cuotas.filter(c => !c.incluir).reduce((s, c) => s + c.monto, 0)
  const cargos = cargosAdicionales.reduce((s, c) => s + c.monto, 0)
  const total = incluido + cargos

  const toggleIncluir = (id: number) => {
    setCuotas(prev =>
      prev.map(c => (c.id === id ? { ...c, incluir: !c.incluir } : c))
    )
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

  const handleConfirmarPago = () => {
    setTotalPagado(total)
    setCuotas(prev =>
      prev.map(c =>
        c.incluir && c.estado !== 'PAGADO' ? { ...c, estado: 'PAGADO' as const } : c
      )
    )
    setCargosAdicionales([])
    setModalConfirmarPago(false)
    setExitoPostPago(true)
    // TODO: conectar al backend
  }

  const tarjeta = MOCK_TARJETAS.find(t => t.id === tarjetaSeleccionada)
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
          <p className={styles.exitoMonto}>{clp(totalPagado)}</p>
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
              {MOCK_TARJETAS.map(t => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </div>
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
            <span className={styles.cargoMonto}>{clp(cargo.monto)}</span>
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
              <strong>Total a pagar {clp(total)}</strong>
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
          onClose={() => setModalNuevoGasto(false)}
          onGuardar={nuevasCuotas => {
            setCuotas(prev => [...prev, ...nuevasCuotas])
            setModalNuevoGasto(false)
          }}
        />
      )}
    </div>
  )
}
