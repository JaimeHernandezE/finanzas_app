import { useState, useMemo, useId } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './PagarTarjetaPage.module.scss'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

interface Tarjeta {
  id:     string
  nombre: string
  banco:  string
}

interface Cuota {
  id:           number
  movimientoId: number
  descripcion:  string
  numeroCuota:  number
  totalCuotas:  number
  monto:        number
  estado:       'PENDIENTE' | 'FACTURADO' | 'PAGADO'
  incluir:      boolean
}

interface CargoAdicional {
  id:          number
  descripcion: string
  monto:       number
}

// ─────────────────────────────────────────────────────────────────────────────
// Datos mock  // TODO: reemplazar por fetch al backend
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_TARJETAS: Tarjeta[] = [
  { id: '1', nombre: 'Visa BCI',             banco: 'BCI'       },
  { id: '2', nombre: 'Mastercard Santander', banco: 'Santander' },
]

const MOCK_CUOTAS_INIT: Cuota[] = [
  { id: 1, movimientoId: 10, descripcion: 'Supermercado Lider', numeroCuota: 1, totalCuotas: 3, monto: 29133,  estado: 'FACTURADO', incluir: true  },
  { id: 2, movimientoId: 11, descripcion: 'Netflix',            numeroCuota: 1, totalCuotas: 1, monto: 10990,  estado: 'PENDIENTE', incluir: true  },
  { id: 3, movimientoId: 12, descripcion: 'Televisor Samsung',  numeroCuota: 2, totalCuotas: 6, monto: 42000,  estado: 'PENDIENTE', incluir: false },
  { id: 4, movimientoId: 13, descripcion: 'Zapatos',            numeroCuota: 1, totalCuotas: 2, monto: 24990,  estado: 'PAGADO',    incluir: true  },
]

const MOCK_CATEGORIAS = [
  'Alimentación', 'Transporte', 'Tecnología', 'Ropa', 'Salud',
  'Educación', 'Entretención', 'Servicios', 'Honorarios', 'Sueldo',
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

const ESTADO_BADGE: Record<Cuota['estado'], { label: string; cls: string }> = {
  PENDIENTE: { label: 'Pendiente', cls: styles.estadoPendiente },
  FACTURADO: { label: 'Facturado', cls: styles.estadoFacturado },
  PAGADO:    { label: 'Pagado',    cls: styles.estadoPagado    },
}

type FiltroEstado = 'TODOS' | 'PENDIENTE' | 'FACTURADO' | 'PAGADO'

const FILTRO_OPTS: { value: FiltroEstado; label: string }[] = [
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'FACTURADO', label: 'Facturado' },
  { value: 'PAGADO',    label: 'Pagado'    },
  { value: 'TODOS',     label: 'Todos'     },
]

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: item de cuota
// ─────────────────────────────────────────────────────────────────────────────

function CuotaItem({
  cuota, onToggle,
}: {
  cuota:    Cuota
  onToggle: (id: number) => void
}) {
  const badge   = ESTADO_BADGE[cuota.estado]
  const pagada  = cuota.estado === 'PAGADO'
  const excluida = !cuota.incluir

  return (
    <div className={`${styles.cuotaItem} ${excluida ? styles.cuotaItemExcluida : ''}`}>
      <label className={styles.cuotaCheck}>
        <input
          type="checkbox"
          checked={cuota.incluir}
          disabled={pagada}
          onChange={() => onToggle(cuota.id)}
        />
      </label>

      <div className={styles.cuotaInfo}>
        <span className={`${styles.cuotaNombre} ${excluida ? styles.tachado : ''}`}>
          {cuota.descripcion}
        </span>
        <span className={styles.cuotaDetalle}>
          cuota {cuota.numeroCuota} / {cuota.totalCuotas}
        </span>
      </div>

      <span className={`${styles.cuotaMonto} ${excluida ? styles.tachado : ''}`}>
        {clp(cuota.monto)}
      </span>

      <span className={`${styles.estadoBadge} ${badge.cls}`}>{badge.label}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: cargo adicional
// ─────────────────────────────────────────────────────────────────────────────

function CargoItem({
  cargo, onEliminar,
}: {
  cargo:      CargoAdicional
  onEliminar: (id: number) => void
}) {
  return (
    <div className={styles.cargoItem}>
      <div className={styles.cargoInfo}>
        <span className={styles.cargoNombre}>{cargo.descripcion}</span>
        <span className={styles.cargoCat}>Intereses TC</span>
      </div>
      <span className={styles.cargoMonto}>{clp(cargo.monto)}</span>
      <button
        className={styles.actionBtn}
        onClick={() => onEliminar(cargo.id)}
        title="Eliminar cargo"
      >
        🗑
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: formulario inline de cargo
// ─────────────────────────────────────────────────────────────────────────────

function CargoForm({
  onConfirmar, onCancelar,
}: {
  onConfirmar: (descripcion: string, monto: number) => void
  onCancelar:  () => void
}) {
  const [desc,  setDesc]  = useState('')
  const [monto, setMonto] = useState('')

  const confirmar = () => {
    const n = parseFloat(monto.replace(/\./g, '').replace(',', '.'))
    if (!desc.trim() || isNaN(n) || n <= 0) return
    onConfirmar(desc.trim(), Math.round(n))
  }

  return (
    <div className={styles.cargoFormRow}>
      <input
        className={styles.cargoFormInput}
        type="text"
        placeholder="Ej: Interés marzo"
        value={desc}
        onChange={e => setDesc(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && confirmar()}
        autoFocus
      />
      <div className={styles.cargoFormMonto}>
        <span className={styles.cargoFormPrefix}>$</span>
        <input
          className={styles.cargoFormInputMonto}
          type="number"
          placeholder="0"
          value={monto}
          onChange={e => setMonto(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && confirmar()}
          min={0}
        />
      </div>
      <button className={styles.cargoFormOk}   onClick={confirmar}>✓</button>
      <button className={styles.cargoFormCancel} onClick={onCancelar}>✕</button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: modal confirmar pago
// ─────────────────────────────────────────────────────────────────────────────

function ModalConfirmarPago({
  tarjeta, mes, anio,
  numIncluidas, numExcluidas,
  total,
  onCancelar, onConfirmar,
}: {
  tarjeta:      Tarjeta
  mes:          number
  anio:         number
  numIncluidas: number
  numExcluidas: number
  total:        number
  onCancelar:   () => void
  onConfirmar:  () => void
}) {
  return (
    <div className={styles.modalOverlay} onClick={onCancelar}>
      <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
        <h2 className={styles.modalTitulo}>Registrar pago</h2>

        <p className={styles.modalSub}>
          {tarjeta.nombre} — {MESES[mes]} {anio}
        </p>

        <div className={styles.modalDetalles}>
          <span>{numIncluidas} cuota{numIncluidas !== 1 ? 's' : ''} incluida{numIncluidas !== 1 ? 's' : ''}</span>
          {numExcluidas > 0 && (
            <span className={styles.modalExcluidas}>
              {numExcluidas} cuota{numExcluidas !== 1 ? 's' : ''} pasa{numExcluidas !== 1 ? 'n' : ''} al mes siguiente
            </span>
          )}
        </div>

        <div className={styles.modalTotal}>
          <span>Total a pagar</span>
          <span className={styles.modalTotalMonto}>{clp(total)}</span>
        </div>

        <div className={styles.modalBtns}>
          <button className={styles.btnGhost}   onClick={onCancelar}>Cancelar</button>
          <button className={styles.btnPrimary}  onClick={onConfirmar}>Confirmar</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: pantalla de éxito
// ─────────────────────────────────────────────────────────────────────────────

function PantallaExito({
  tarjeta, mes, anio, total,
  onVerOtroMes, onDashboard,
}: {
  tarjeta:       Tarjeta
  mes:           number
  anio:          number
  total:         number
  onVerOtroMes:  () => void
  onDashboard:   () => void
}) {
  return (
    <div className={styles.exitoWrap}>
      <div className={styles.exitoIcono}>✓</div>
      <h2 className={styles.exitoTitulo}>Pago registrado</h2>
      <p className={styles.exitoSub}>{tarjeta.nombre} — {MESES[mes]} {anio}</p>
      <p className={styles.exitoMonto}>{clp(total)}</p>
      <div className={styles.exitoBtns}>
        <button className={styles.btnGhost}   onClick={onVerOtroMes}>Ver otro mes</button>
        <button className={styles.btnPrimary} onClick={onDashboard}>Ir al dashboard</button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: modal nuevo gasto (método bloqueado a CREDITO)
// ─────────────────────────────────────────────────────────────────────────────

interface GastoForm {
  tipo:        'INGRESO' | 'EGRESO'
  ambito:      'PERSONAL' | 'COMUN'
  descripcion: string
  categoria:   string
  fecha:       string
  monto:       string
  numCuotas:   string
  comentario:  string
}

const GASTO_FORM_DEFAULT: GastoForm = {
  tipo:        'EGRESO',
  ambito:      'PERSONAL',
  descripcion: '',
  categoria:   '',
  fecha:       new Date().toISOString().slice(0, 10),
  monto:       '',
  numCuotas:   '1',
  comentario:  '',
}

function ModalNuevoGasto({
  tarjeta,
  onCerrar,
  onConfirmar,
}: {
  tarjeta:     Tarjeta
  onCerrar:    () => void
  onConfirmar: (cuota: Cuota) => void
}) {
  const [form, setForm] = useState<GastoForm>(GASTO_FORM_DEFAULT)
  const id = useId()

  const set = (field: keyof GastoForm, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const confirmar = () => {
    const montoN = parseFloat(form.monto.replace(/\./g, '').replace(',', '.'))
    const cuotasN = Math.max(1, parseInt(form.numCuotas) || 1)
    if (!form.descripcion.trim() || isNaN(montoN) || montoN <= 0) return

    onConfirmar({
      id:           Date.now(),
      movimientoId: Date.now(),
      descripcion:  form.descripcion.trim(),
      numeroCuota:  1,
      totalCuotas:  cuotasN,
      monto:        Math.round(montoN / cuotasN),
      estado:       'PENDIENTE',
      incluir:      true,
    })
    // TODO: conectar al backend
  }

  return (
    <div className={styles.modalOverlay} onClick={onCerrar}>
      <div className={styles.modalCard} onClick={e => e.stopPropagation()}>

        <div className={styles.modalHeaderRow}>
          <h2 className={styles.modalTitulo}>Nuevo gasto — {tarjeta.nombre}</h2>
          <button className={styles.modalClose} onClick={onCerrar}>✕</button>
        </div>

        <div className={styles.gastoForm}>

          {/* Tipo */}
          <div className={styles.gastoField}>
            <label className={styles.gastoLabel}>Tipo</label>
            <div className={styles.segmented}>
              {(['EGRESO', 'INGRESO'] as const).map(v => (
                <button
                  key={v}
                  className={`${styles.segBtn} ${form.tipo === v ? styles.segBtnActive : ''}`}
                  onClick={() => set('tipo', v)}
                  type="button"
                >
                  {v === 'EGRESO' ? 'Egreso' : 'Ingreso'}
                </button>
              ))}
            </div>
          </div>

          {/* Ámbito */}
          <div className={styles.gastoField}>
            <label className={styles.gastoLabel}>Ámbito</label>
            <div className={styles.segmented}>
              {(['PERSONAL', 'COMUN'] as const).map(v => (
                <button
                  key={v}
                  className={`${styles.segBtn} ${form.ambito === v ? styles.segBtnActive : ''}`}
                  onClick={() => set('ambito', v)}
                  type="button"
                >
                  {v === 'PERSONAL' ? 'Personal' : 'Común'}
                </button>
              ))}
            </div>
          </div>

          {/* Descripción */}
          <div className={styles.gastoField}>
            <label className={styles.gastoLabel} htmlFor={`${id}-desc`}>Descripción</label>
            <input
              id={`${id}-desc`}
              className={styles.gastoInput}
              type="text"
              placeholder="Ej: Zapatillas"
              value={form.descripcion}
              onChange={e => set('descripcion', e.target.value)}
            />
          </div>

          {/* Categoría */}
          <div className={styles.gastoField}>
            <label className={styles.gastoLabel} htmlFor={`${id}-cat`}>Categoría</label>
            <select
              id={`${id}-cat`}
              className={styles.gastoSelect}
              value={form.categoria}
              onChange={e => set('categoria', e.target.value)}
            >
              <option value="">Seleccionar...</option>
              {MOCK_CATEGORIAS.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Fecha y Monto en fila */}
          <div className={styles.gastoRow}>
            <div className={styles.gastoField}>
              <label className={styles.gastoLabel} htmlFor={`${id}-fecha`}>Fecha</label>
              <input
                id={`${id}-fecha`}
                className={styles.gastoInput}
                type="date"
                value={form.fecha}
                onChange={e => set('fecha', e.target.value)}
              />
            </div>
            <div className={styles.gastoField}>
              <label className={styles.gastoLabel} htmlFor={`${id}-monto`}>Monto total</label>
              <div className={styles.gastoInputPrefix}>
                <span>$</span>
                <input
                  id={`${id}-monto`}
                  type="number"
                  placeholder="0"
                  value={form.monto}
                  onChange={e => set('monto', e.target.value)}
                  min={0}
                />
              </div>
            </div>
          </div>

          {/* Cuotas */}
          <div className={styles.gastoField}>
            <label className={styles.gastoLabel} htmlFor={`${id}-cuotas`}>Número de cuotas</label>
            <input
              id={`${id}-cuotas`}
              className={styles.gastoInput}
              type="number"
              min={1}
              max={48}
              value={form.numCuotas}
              onChange={e => set('numCuotas', e.target.value)}
            />
          </div>

          {/* Comentario */}
          <div className={styles.gastoField}>
            <label className={styles.gastoLabel} htmlFor={`${id}-com`}>Comentario (opcional)</label>
            <textarea
              id={`${id}-com`}
              className={styles.gastoTextarea}
              placeholder="Notas adicionales..."
              rows={2}
              value={form.comentario}
              onChange={e => set('comentario', e.target.value)}
            />
          </div>

        </div>

        <div className={styles.modalBtns}>
          <button className={styles.btnGhost}   onClick={onCerrar}>Cancelar</button>
          <button className={styles.btnPrimary} onClick={confirmar}>Agregar gasto</button>
        </div>

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

export default function PagarTarjetaPage() {
  const navigate = useNavigate()

  // Tarjeta y mes
  const [tarjetaId, setTarjetaId] = useState(MOCK_TARJETAS[0].id)
  const hoy = new Date()
  const [mes,  setMes]  = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())
  const esActual = mes === hoy.getMonth() && anio === hoy.getFullYear()

  const tarjeta = MOCK_TARJETAS.find(t => t.id === tarjetaId)!

  const irAnterior = () => {
    if (mes === 0) { setMes(11); setAnio(a => a - 1) }
    else setMes(m => m - 1)
  }
  const irSiguiente = () => {
    if (esActual) return
    if (mes === 11) { setMes(0); setAnio(a => a + 1) }
    else setMes(m => m + 1)
  }

  // Cuotas y filtro
  const [cuotas,       setCuotas]       = useState<Cuota[]>(MOCK_CUOTAS_INIT)
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('TODOS')

  const cuotasFiltradas = useMemo(() =>
    filtroEstado === 'TODOS' ? cuotas : cuotas.filter(c => c.estado === filtroEstado),
  [cuotas, filtroEstado])

  const toggleIncluir = (id: number) =>
    setCuotas(prev => prev.map(c =>
      c.id === id && c.estado !== 'PAGADO' ? { ...c, incluir: !c.incluir } : c,
    ))

  // Cargos adicionales
  const [cargos,           setCargos]           = useState<CargoAdicional[]>([])
  const [mostrarFormCargo, setMostrarFormCargo] = useState(false)

  const agregarCargo = (descripcion: string, monto: number) => {
    setCargos(prev => [...prev, { id: Date.now(), descripcion, monto }])
    setMostrarFormCargo(false)
  }

  const eliminarCargo = (id: number) =>
    setCargos(prev => prev.filter(c => c.id !== id))

  // Cálculos de totales
  const incluido = cuotas
    .filter(c => c.incluir && c.estado !== 'PAGADO')
    .reduce((s, c) => s + c.monto, 0)
  const excluido = cuotas
    .filter(c => !c.incluir)
    .reduce((s, c) => s + c.monto, 0)
  const cargosTotal = cargos.reduce((s, c) => s + c.monto, 0)
  const total       = incluido + cargosTotal

  const numIncluidas = cuotas.filter(c => c.incluir && c.estado !== 'PAGADO').length
  const numExcluidas = cuotas.filter(c => !c.incluir).length

  // Modals y pantalla de éxito
  const [modalPagoAbierto,  setModalPagoAbierto]  = useState(false)
  const [modalGastoAbierto, setModalGastoAbierto] = useState(false)
  const [pagoExitoso,       setPagoExitoso]       = useState(false)
  const [totalPagado,       setTotalPagado]       = useState(0)

  const confirmarPago = () => {
    setTotalPagado(total)
    // Marcar cuotas incluidas como PAGADO
    setCuotas(prev => prev.map(c =>
      c.incluir && c.estado !== 'PAGADO' ? { ...c, estado: 'PAGADO' as const } : c,
    ))
    // Limpiar cargos
    setCargos([])
    setModalPagoAbierto(false)
    setPagoExitoso(true)
    // TODO: conectar al backend
  }

  const verOtroMes = () => {
    setPagoExitoso(false)
    setCuotas(MOCK_CUOTAS_INIT)
    // Avanzar al mes siguiente
    if (mes === 11) { setMes(0); setAnio(a => a + 1) }
    else setMes(m => m + 1)
  }

  const agregarNuevoGasto = (cuota: Cuota) => {
    setCuotas(prev => [...prev, cuota])
    setModalGastoAbierto(false)
  }

  // ── Pantalla de éxito ──
  if (pagoExitoso) {
    return (
      <div className={styles.page}>
        <PantallaExito
          tarjeta={tarjeta}
          mes={mes}
          anio={anio}
          total={totalPagado}
          onVerOtroMes={verOtroMes}
          onDashboard={() => navigate('/')}
        />
      </div>
    )
  }

  return (
    <div className={styles.page}>

      {/* ── Encabezado ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.titulo}>Pagar tarjeta</h1>
          <select
            className={styles.tarjetaSelect}
            value={tarjetaId}
            onChange={e => setTarjetaId(e.target.value)}
          >
            {MOCK_TARJETAS.map(t => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </div>

        <div className={styles.mesNav}>
          <button className={styles.mesBtn} onClick={irAnterior} aria-label="Mes anterior">‹</button>
          <span className={styles.mesLabel}>{MESES[mes]} {anio}</span>
          <button className={styles.mesBtn} onClick={irSiguiente} disabled={esActual} aria-label="Mes siguiente">›</button>
        </div>
      </div>

      {/* ── Barra de filtros ── */}
      <div className={styles.filterBar}>
        <div className={styles.segmented}>
          {FILTRO_OPTS.map(o => (
            <button
              key={o.value}
              className={`${styles.segBtn} ${filtroEstado === o.value ? styles.segBtnActive : ''}`}
              onClick={() => setFiltroEstado(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>

        <button
          className={styles.btnPrimary}
          onClick={() => setModalGastoAbierto(true)}
        >
          + Gasto
        </button>
      </div>

      {/* ── Cuotas del mes ── */}
      <div className={styles.seccion}>
        <p className={styles.seccionTitulo}>Cuotas del mes</p>

        {cuotasFiltradas.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>○</span>
            <p>Sin cuotas para este período</p>
          </div>
        ) : (
          cuotasFiltradas.map(c => (
            <CuotaItem key={c.id} cuota={c} onToggle={toggleIncluir} />
          ))
        )}
      </div>

      {/* ── Cargos adicionales ── */}
      <div className={styles.seccion}>
        <div className={styles.seccionHeaderRow}>
          <p className={styles.seccionTitulo}>Cargos adicionales</p>
          {!mostrarFormCargo && (
            <button
              className={`${styles.btnGhost} ${styles.btnSmall}`}
              onClick={() => setMostrarFormCargo(true)}
            >
              + Agregar
            </button>
          )}
        </div>

        {mostrarFormCargo && (
          <CargoForm
            onConfirmar={agregarCargo}
            onCancelar={() => setMostrarFormCargo(false)}
          />
        )}

        {cargos.length === 0 && !mostrarFormCargo ? (
          <p className={styles.cargosVacio}>Sin cargos adicionales este mes.</p>
        ) : (
          cargos.map(c => (
            <CargoItem key={c.id} cargo={c} onEliminar={eliminarCargo} />
          ))
        )}
      </div>

      {/* ── Panel de totales ── */}
      <div className={styles.totalesPanel}>
        <div className={styles.totalFila}>
          <span className={styles.totalLabel}>Incluido</span>
          <span className={styles.totalMonto}>{clp(incluido)}</span>
        </div>
        <div className={styles.totalFila}>
          <span className={styles.totalLabel}>Excluido</span>
          <span className={`${styles.totalMonto} ${styles.totalMontoExcluido}`}>{clp(excluido)}</span>
        </div>
        <div className={styles.totalFila}>
          <span className={styles.totalLabel}>Cargos</span>
          <span className={styles.totalMonto}>{clp(cargosTotal)}</span>
        </div>

        <div className={styles.totalSep} />

        <div className={`${styles.totalFila} ${styles.totalFilaFinal}`}>
          <span className={styles.totalLabelFinal}>Total a pagar</span>
          <span className={styles.totalMontoFinal}>{clp(total)}</span>
        </div>

        <button
          className={styles.btnPagar}
          disabled={total === 0}
          onClick={() => setModalPagoAbierto(true)}
        >
          Registrar pago
        </button>
      </div>

      {/* ── Modal confirmar pago ── */}
      {modalPagoAbierto && (
        <ModalConfirmarPago
          tarjeta={tarjeta}
          mes={mes}
          anio={anio}
          numIncluidas={numIncluidas}
          numExcluidas={numExcluidas}
          total={total}
          onCancelar={() => setModalPagoAbierto(false)}
          onConfirmar={confirmarPago}
        />
      )}

      {/* ── Modal nuevo gasto ── */}
      {modalGastoAbierto && (
        <ModalNuevoGasto
          tarjeta={tarjeta}
          onCerrar={() => setModalGastoAbierto(false)}
          onConfirmar={agregarNuevoGasto}
        />
      )}

    </div>
  )
}
