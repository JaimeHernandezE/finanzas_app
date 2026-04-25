import { useEffect, useState, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMovimientos } from '@/hooks/useMovimientos'
import { useCuentasPersonales } from '@/hooks/useCuentasPersonales'
import { useApi } from '@/hooks/useApi'
import { finanzasApi, movimientosApi } from '@/api'
import type { DashboardResumenApi, PresupuestoMesFila } from '@/api/finanzas'
import { Cargando, ErrorCarga } from '@/components/ui'
import InputMontoClp from '@/components/ui/InputMontoClp/InputMontoClp'
import { montoClpANumero } from '@/utils/montoClp'
import { incluirIngresoMovimientoEnSueldoProyectadoMes } from '@/utils/sueldoProyectadoIngresos'
import CategoriaPresupuestoItem from '@/components/presupuesto/CategoriaPresupuestoItem'
import { useConfig } from '@/context/ConfigContext'
import { useAuth } from '@/context/AuthContext'
import styles from './DashboardPage.module.scss'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos (API devuelve snake_case)
// ─────────────────────────────────────────────────────────────────────────────

interface MovimientoApi {
  id: number
  fecha: string
  tipo: 'EGRESO' | 'INGRESO'
  ambito: 'PERSONAL' | 'COMUN'
  cuenta: number | null
  cuenta_nombre?: string | null
  monto: number
  comentario: string
  categoria_nombre: string
  metodo_pago_tipo: 'EFECTIVO' | 'DEBITO' | 'CREDITO'
  ingreso_comun?: number | null
}

interface LiquidacionApi {
  ingresos: Array<{ usuario_id: number; total: string }>
  gastos_comunes: Array<{ usuario_id: number; total: string }>
}

interface PresupuestoCuentaResumen {
  cuentaId: number | null
  cuentaNombre: string
  total: number
}

interface PresupuestosSaldoProyectado {
  comunTotal: number
  personales: PresupuestoCuentaResumen[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/** API a veces devuelve monto como string — evitar concatenación en reduces */
function toPesos(n: unknown): number {
  const x = Number(n)
  return Number.isFinite(x) ? Math.round(x) : 0
}

function montoAbs(n: unknown): number {
  return Math.abs(toPesos(n))
}

/** Base de sueldo estimado para prorrateo y saldo proyectado. */
function sueldoEstimadoMes(sueldosDigitosStr: string): number {
  const base = montoClpANumero(sueldosDigitosStr)
  return Math.max(0, Math.round(base))
}

const fechaCorta = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', {
    day: '2-digit', month: 'short',
  })
}

const METODO_BADGE: Record<MovimientoApi['metodo_pago_tipo'], { label: string; bg: string; color: string }> = {
  EFECTIVO: { label: 'EF', bg: '#f0f0ec', color: '#6b7280' },
  DEBITO:   { label: 'TD', bg: '#e8f4ff', color: '#3b82f6' },
  CREDITO:  { label: 'TC', bg: '#fff0f0', color: '#ff4d4d' },
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes internos
// ─────────────────────────────────────────────────────────────────────────────

function MetricCard({
  label,
  valor,
  variant = 'default',
  delay = 0,
}: {
  label:    string
  valor:    number
  variant?: 'default' | 'danger' | 'dark'
  delay?:   number
}) {
  const { formatMonto } = useConfig()
  const v = toPesos(valor)
  const isNeg = v < 0
  const esMontoSiemprePositivo = variant === 'danger'

  const labelColor =
    variant === 'dark' ? 'rgba(255,255,255,0.5)' : undefined

  const valorColor =
    variant === 'dark'
      ? isNeg ? '#ff4d4d' : '#c8f060'
      : variant === 'danger' ? '#ff4d4d'
      : '#0f0f0f'

  const textoValor = esMontoSiemprePositivo
    ? formatMonto(Math.abs(v))
    : v < 0 ? `−${formatMonto(Math.abs(v))}` : formatMonto(v)

  return (
    <div
      className={`${styles.metricCard} ${variant === 'dark' ? styles.metricCardDark : ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className={styles.metricLabel} style={{ color: labelColor }}>
        {label}
      </span>
      <span className={styles.metricValor} style={{ color: valorColor }}>
        {textoValor}
      </span>
    </div>
  )
}

interface EfectivoDesglose {
  a: string
  b: string
  c: string
  d: string
  e: string
  e_personal: string
  e_comun: string
}

function EfectivoMetricCard({
  label,
  valor,
  desglose,
  delay = 0,
}: {
  label: string
  valor: number
  desglose: EfectivoDesglose | null | undefined
  delay?: number
}) {
  const { formatMonto } = useConfig()
  const [detalleAbierto, setDetalleAbierto] = useState(false)
  const v = toPesos(valor)
  const textoValor = v < 0 ? `−${formatMonto(Math.abs(v))}` : formatMonto(v)
  const n = (s: string | undefined) => Math.round(Number(s) || 0)
  const fmt = (x: number) => (x < 0 ? `−${formatMonto(Math.abs(x))}` : formatMonto(x))

  if (!desglose) {
    return (
      <div className={styles.metricCard} style={{ animationDelay: `${delay}ms` }}>
        <span className={styles.metricLabel}>{label}</span>
        <span className={styles.metricValor}>{textoValor}</span>
      </div>
    )
  }

  const a = n(desglose.a)
  const b = n(desglose.b)
  const c = n(desglose.c)
  const d = n(desglose.d)
  const e = n(desglose.e)
  const ePersonal = n(desglose.e_personal)
  const eComun = n(desglose.e_comun)
  const idPanel = 'efectivo-desglose-panel'
  const maxBar = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d), Math.abs(e), 1)
  const barPct = (v: number) => (Math.abs(v) / maxBar) * 100

  return (
    <div className={styles.metricCard} style={{ animationDelay: `${delay}ms` }}>
      <div className={styles.metricLabelRow}>
        <span className={styles.metricLabel}>{label}</span>
        <button
          type="button"
          className={styles.metricHelpBtn}
          onClick={() => setDetalleAbierto((x) => !x)}
          aria-expanded={detalleAbierto}
          aria-controls={idPanel}
          aria-label={
            detalleAbierto
              ? 'Ocultar desglose de efectivo disponible'
              : 'Ver desglose de efectivo disponible'
          }
        >
          ?
        </button>
      </div>
      <span className={styles.metricValor}>{textoValor}</span>
      {detalleAbierto && (
        <div id={idPanel} className={styles.metricDetallePanel} role="region" aria-live="polite">
          <div className={styles.metricTooltipTitle}>Desglose (A + B + C − D + E)</div>

          <div className={styles.metricDesgloseSectionTitle}>Aportes</div>
          <div className={styles.metricDesgloseFila}>
            <div className={styles.metricDesgloseFilaHead}>
              <span className={styles.metricTooltipKey}>A — Total sueldos (histórico)</span>
              <span className={styles.metricDesgloseMonto}>
                <span className={a >= 0 ? styles.metricDesgloseSignMas : styles.metricDesgloseSignMenos}>
                  {a >= 0 ? '+' : '−'}
                </span>
                <span className={a >= 0 ? styles.metricDesgloseValAport : styles.metricDesgloseValEgreso}>
                  {formatMonto(Math.abs(a))}
                </span>
              </span>
            </div>
            <div className={styles.metricDesgloseBarTrack}>
              <div
                className={styles.metricDesgloseBarFill}
                style={{
                  width: `${barPct(a)}%`,
                  background: a >= 0 ? '#22a06b' : '#ef4444',
                }}
              />
            </div>
          </div>
          <div className={styles.metricDesgloseFila}>
            <div className={styles.metricDesgloseFilaHead}>
              <span className={styles.metricTooltipKey}>B — Sueldo declarado (mes actual)</span>
              <span className={styles.metricDesgloseMonto}>
                <span className={b >= 0 ? styles.metricDesgloseSignMas : styles.metricDesgloseSignMenos}>
                  {b >= 0 ? '+' : '−'}
                </span>
                <span className={b >= 0 ? styles.metricDesgloseValAport : styles.metricDesgloseValEgreso}>
                  {formatMonto(Math.abs(b))}
                </span>
              </span>
            </div>
            <div className={styles.metricDesgloseBarTrack}>
              <div
                className={styles.metricDesgloseBarFill}
                style={{
                  width: `${barPct(b)}%`,
                  background: b >= 0 ? '#22a06b' : '#ef4444',
                }}
              />
            </div>
          </div>

          <div className={styles.metricDesgloseSectionTitle}>Egresos</div>
          <div className={styles.metricDesgloseFila}>
            <div className={styles.metricDesgloseFilaHead}>
              <span className={styles.metricTooltipKey}>
                C — Gastos personales (histórico)
              </span>
              <span className={styles.metricDesgloseMonto}>
                <span className={c >= 0 ? styles.metricDesgloseSignMas : styles.metricDesgloseSignMenos}>
                  {c >= 0 ? '+' : '−'}
                </span>
                <span
                  className={c >= 0 ? styles.metricDesgloseValAport : styles.metricDesgloseValEgreso}
                >
                  {formatMonto(Math.abs(c))}
                </span>
              </span>
            </div>
            <div className={styles.metricDesgloseBarTrack}>
              <div
                className={styles.metricDesgloseBarFill}
                style={{
                  width: `${barPct(c)}%`,
                  background: c >= 0 ? '#22a06b' : '#ef4444',
                }}
              />
            </div>
          </div>
          <div className={styles.metricDesgloseFila}>
            <div className={styles.metricDesgloseFilaHead}>
              <span className={styles.metricTooltipKey}>D — Gastos comunes (histórico)</span>
              <span className={styles.metricDesgloseMonto}>
                <span className={styles.metricDesgloseSignMenos}>−</span>
                <span className={styles.metricDesgloseValEgreso}>{formatMonto(Math.abs(d))}</span>
              </span>
            </div>
            <div className={styles.metricDesgloseBarTrack}>
              <div
                className={styles.metricDesgloseBarFill}
                style={{ width: `${barPct(d)}%`, background: '#ef4444' }}
              />
            </div>
          </div>
          <div className={styles.metricDesgloseFila}>
            <div className={styles.metricDesgloseFilaHead}>
              <span className={styles.metricTooltipKey}>E — Mes actual (personal + común)</span>
              <span className={styles.metricDesgloseMonto}>
                <span className={e >= 0 ? styles.metricDesgloseSignMas : styles.metricDesgloseSignMenos}>
                  {e >= 0 ? '+' : '−'}
                </span>
                <span
                  className={e >= 0 ? styles.metricDesgloseValAport : styles.metricDesgloseValEgreso}
                >
                  {formatMonto(Math.abs(e))}
                </span>
              </span>
            </div>
            <div className={styles.metricDesgloseBarTrack}>
              <div
                className={styles.metricDesgloseBarFill}
                style={{
                  width: `${barPct(e)}%`,
                  background: e >= 0 ? '#22a06b' : '#ef4444',
                }}
              />
            </div>
          </div>
          <div className={styles.metricTooltipRow} style={{ marginTop: 8 }}>
            <span className={styles.metricTooltipKey} style={{ paddingLeft: 8 }}>↳ Personal (sin duplicar sueldos)</span>
            <span className={styles.metricTooltipVal}>{fmt(ePersonal)}</span>
          </div>
          <div className={styles.metricTooltipRow}>
            <span className={styles.metricTooltipKey} style={{ paddingLeft: 8 }}>↳ Común</span>
            <span className={styles.metricTooltipVal}>{fmt(eComun)}</span>
          </div>
          <p className={styles.metricTooltipHint}>
            Cálculo: A + B + C − D + E. A y B se muestran como aportes (+). En el bloque inferior, C y E
            llevan el signo del neto (+ verde / − rojo); D siempre se resta (−). D acumula prorrateos de
            meses anteriores al actual.
          </p>
        </div>
      )}
    </div>
  )
}

function SaldoProyectadoCard({
  label,
  saldo,
  sueldoProyectado,
  efectivo,
  formula,
  prorrateoPresupuestoComun,
  miembros,
  sueldosDigitos,
  onSueldoChange,
  errorCompensacion,
  delay = 0,
}: {
  label: string
  saldo: number
  sueldoProyectado: number
  efectivo: number
  formula: { letra: string; etiqueta: string; monto: number }[]
  prorrateoPresupuestoComun: number
  miembros: { usuario_id: number; nombre: string }[]
  sueldosDigitos: Record<number, string>
  onSueldoChange: (usuarioId: number, soloDigitos: string) => void
  errorCompensacion: string | null
  delay?: number
}) {
  const { formatMonto } = useConfig()
  const v = toPesos(saldo)
  const textoValor = v < 0 ? `−${formatMonto(Math.abs(v))}` : formatMonto(v)
  const [detalleAbierto, setDetalleAbierto] = useState(false)
  const idPanel = 'saldo-proyectado-panel'

  return (
    <div
      className={`${styles.metricCard} ${styles.metricCardDark}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={styles.metricLabelRow}>
        <span className={styles.metricLabel} style={{ color: 'rgba(255,255,255,0.5)' }}>
          {label}
        </span>
        <button
          type="button"
          className={styles.metricHelpBtnSaldo}
          onClick={() => setDetalleAbierto((x) => !x)}
          aria-expanded={detalleAbierto}
          aria-controls={idPanel}
          aria-label={detalleAbierto ? 'Ocultar desglose de saldo proyectado' : 'Ver desglose de saldo proyectado'}
        >
          ?
        </button>
      </div>
      <span
        className={styles.metricValor}
        style={{ color: v < 0 ? '#ff4d4d' : '#c8f060' }}
        title="Saldo = A + B − C − D − … según presupuestos."
      >
        {textoValor}
      </span>

      {detalleAbierto && (
        <div id={idPanel} className={styles.metricDetallePanelSaldo} role="region" aria-live="polite">
          <div className={styles.metricTooltipTitle}>Cómo se calcula el saldo proyectado</div>
          <p className={styles.saldoDetalleIntro}>
            Se calcula como <strong>A + B − C − D − ...</strong>, donde los egresos son
            presupuestos comprometidos (si una categoría está excedida, usa gasto real).
          </p>
          <p className={styles.saldoDetalleFormula}>
            <strong>
              Saldo = {formula.filter((t) => t.letra === 'A' || t.letra === 'B').map((t) => t.letra).join(' + ')}
              {' '}
              −
              {' '}
              {formula.filter((t) => t.letra !== 'A' && t.letra !== 'B').map((t) => t.letra).join(' − ')}
            </strong>
          </p>
          <div className={styles.metricDesgloseSectionTitle}>Aportes</div>
          <div className={styles.metricTooltipRow}>
            <span className={styles.metricTooltipKey}>A — Sueldo estimado + ingresos mes actual</span>
            <span className={styles.metricTooltipVal} style={{ color: '#4ade80' }}>
              +{formatMonto(Math.abs(sueldoProyectado))}
            </span>
          </div>
          <div className={styles.metricTooltipRow}>
            <span className={styles.metricTooltipKey}>B — Efectivo hasta mes anterior</span>
            <span className={styles.metricTooltipVal} style={{ color: '#4ade80' }}>
              +{formatMonto(Math.abs(efectivo))}
            </span>
          </div>
          <div className={styles.metricDesgloseSectionTitle}>Egresos (presupuestos)</div>
          {formula
            .filter((t) => t.letra !== 'A' && t.letra !== 'B')
            .map((t) => (
              <div key={t.letra} className={styles.metricTooltipRow}>
                <span className={styles.metricTooltipKey}>{t.letra} — {t.etiqueta}</span>
                <span className={styles.metricTooltipVal} style={{ color: '#f87171' }}>
                  −{formatMonto(Math.abs(t.monto))}
                </span>
              </div>
            ))}
          <p className={styles.saldoDetalleHint}>
            C usa presupuesto común prorrateado por sueldo estimado (
            {Math.round(prorrateoPresupuestoComun * 100)}% de participación).
          </p>
          {errorCompensacion && (
            <p className={styles.saldoDetalleError}>{errorCompensacion}</p>
          )}
          {miembros.length > 0 && (
            <div className={styles.saldoSueldosGrid}>
              {miembros.map((m) => (
                <label key={m.usuario_id} className={styles.saldoSueldoFila}>
                  <span className={styles.saldoSueldoNombre}>
                    Base prorrateo — {m.nombre}
                  </span>
                  <InputMontoClp
                    soloInput
                    inputClassName={styles.saldoSueldoInput}
                    value={sueldosDigitos[m.usuario_id] ?? ''}
                    onChange={(soloDigitos) => onSueldoChange(m.usuario_id, soloDigitos)}
                    aria-label={`Base prorrateo ${m.nombre}`}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MovimientoItem({
  mov,
  onEditar,
}: {
  mov: MovimientoApi
  onEditar: (id: number) => void
}) {
  const { formatMonto } = useConfig()
  const badge     = METODO_BADGE[mov.metodo_pago_tipo]
  const esIngreso = mov.tipo === 'INGRESO'
  const esCreditoTc = mov.metodo_pago_tipo === 'CREDITO'
  const monto = montoAbs(mov.monto)
  const montoFmt =
    esIngreso
      ? formatMonto(monto)
      : esCreditoTc
        ? formatMonto(monto)
        : `−${formatMonto(monto)}`

  return (
    <button
      type="button"
      className={styles.movItem}
      onClick={() => onEditar(mov.id)}
      aria-label={`Editar movimiento ${mov.comentario || 'sin comentario'}`}
    >
      <span className={styles.movFecha}>{fechaCorta(mov.fecha)}</span>
      <div className={styles.movInfo}>
        <span className={styles.movDesc}>{mov.comentario || '—'}</span>
        <span className={styles.movCat}>{mov.categoria_nombre}</span>
      </div>
      <div className={styles.movRight}>
        <span
          className={styles.movMonto}
          style={{ color: esIngreso ? '#22a06b' : esCreditoTc ? '#6b7280' : '#0f0f0f' }}
        >
          {montoFmt}
        </span>
        <span
          className={styles.movBadge}
          style={{ backgroundColor: badge.bg, color: badge.color }}
        >
          {badge.label}
        </span>
      </div>
    </button>
  )
}

function MovimientosList({
  titulo,
  movimientos,
  verTodosTo,
  onEditarMovimiento,
}: {
  titulo:       string
  movimientos:  MovimientoApi[]
  verTodosTo?:  string
  onEditarMovimiento: (id: number) => void
}) {
  const [expandido, setExpandido] = useState(true)
  const movimientosRecientes = useMemo(() => movimientos.slice(0, 10), [movimientos])

  return (
    <div className={styles.listaCard}>
      <button
        className={styles.listaHeader}
        onClick={() => setExpandido(e => !e)}
      >
        <span className={styles.listaTitulo}>{titulo}</span>
        <div className={styles.listaHeaderRight}>
          <span className={styles.listaCuenta}>
            {movimientosRecientes.length} movimiento{movimientosRecientes.length !== 1 ? 's' : ''}
          </span>
          <span className={`${styles.chevron} ${expandido ? styles.chevronOpen : ''}`}>
            ▾
          </span>
        </div>
      </button>

      {expandido && (
        <div className={styles.listaCuerpo}>
          {movimientosRecientes.length === 0 ? (
            <p className={styles.listaVacia}>Sin movimientos este mes.</p>
          ) : (
            <>
              {movimientosRecientes.map(m => (
                <MovimientoItem key={m.id} mov={m} onEditar={onEditarMovimiento} />
              ))}
              {verTodosTo && (
                <Link to={verTodosTo} className={styles.verTodos}>
                  Ver todos →
                </Link>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { formatMonto } = useConfig()
  const navigate = useNavigate()
  const { user } = useAuth()
  const hoy = new Date()
  const [mes,  setMes]  = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())
  const esActual = mes === hoy.getMonth() && anio === hoy.getFullYear()

  const { movimientos: movimientosRaw, loading, error } = useMovimientos({
    mes: mes + 1,
    anio,
    ambito: 'PERSONAL',
    solo_mios: true,
  })
  const movimientos = (movimientosRaw ?? []) as MovimientoApi[]
  const {
    movimientos: movimientosComunesRaw,
    loading: loadingMovimientosComunes,
    error: errorMovimientosComunes,
  } = useMovimientos({
    mes: mes + 1,
    anio,
    ambito: 'COMUN',
    solo_mios: true,
  })
  const movimientosComunes = (movimientosComunesRaw ?? []) as MovimientoApi[]
  const {
    data: dashboardRes,
    loading: loadingDashboard,
    error: errorDashboard,
    refetch: refetchDashboard,
  } = useApi<DashboardResumenApi>(() => finanzasApi.getDashboardResumen(mes + 1, anio), [mes, anio])

  const { data: deudaRes, loading: loadingDeuda } = useApi(
    () => movimientosApi.getCuotasDeudaPendiente(),
    [],
  )
  const { mesPrevio, anioPrevio } = useMemo(() => {
    if (mes === 0) return { mesPrevio: 12, anioPrevio: anio - 1 }
    return { mesPrevio: mes, anioPrevio: anio }
  }, [mes, anio])
  const { data: liquidacionMesAnteriorRes, loading: loadingLiquidacionAnterior, error: errorLiquidacionAnterior } = useApi<LiquidacionApi>(
    () => finanzasApi.getLiquidacion(mesPrevio, anioPrevio),
    [mesPrevio, anioPrevio],
  )
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
  const presupuestosSaldoRes = useMemo((): PresupuestosSaldoProyectado | null => {
    const p = dashboardRes?.presupuesto
    if (!p) return null
    return {
      comunTotal: toPesos(p.comun_total_comprometido),
      personales: p.personales.map((row) => ({
        cuentaId: row.cuenta_id,
        cuentaNombre: row.cuenta_nombre,
        total: toPesos(row.total_comprometido),
      })),
    }
  }, [dashboardRes])
  const [cuentaTab, setCuentaTab] = useState<number | null>(null)

  useEffect(() => {
    if (!cuentasPropias.length) {
      setCuentaTab(null)
      return
    }
    if (cuentaTab === null || !cuentasPropias.some(c => c.id === cuentaTab)) {
      setCuentaTab(cuentasPropias[0].id)
    }
  }, [cuentasPropias, cuentaTab])
  const { data: presupuestoData, loading: loadingPresupuesto, error: errorPresupuesto } = useApi<PresupuestoMesFila[]>(
    () =>
      finanzasApi.getPresupuestoMes({
        mes: mes + 1,
        anio,
        ambito: 'PERSONAL',
        cuenta: cuentaTab ?? undefined,
      }),
    [mes, anio, cuentaTab],
  )

  const deudaTc = useMemo(() => {
    const t = deudaRes?.total
    return Math.round(Number(t) || 0)
  }, [deudaRes])

  const irAnterior = () => {
    if (mes === 0) { setMes(11); setAnio(a => a - 1) }
    else setMes(m => m - 1)
  }

  const irSiguiente = () => {
    if (esActual) return
    if (mes === 11) { setMes(0); setAnio(a => a + 1) }
    else setMes(m => m + 1)
  }

  // Efectivo del resumen (mismo payload que efectivo-disponible; desglose A–E con botón ?).
  const efectivo = useMemo(() => {
    const t = dashboardRes?.efectivo?.efectivo
    return Math.round(Number(t) || 0)
  }, [dashboardRes])
  const efectivoDesglose = dashboardRes?.efectivo?.desglose ?? null

  const [sueldosDigitos, setSueldosDigitos] = useState<Record<number, string>>({})
  const [sueldosDirty, setSueldosDirty] = useState(false)
  const lastSueldosInitSig = useRef<string>('')
  const compensacionData = dashboardRes?.compensacion ?? undefined
  const usarSaldoServidor = !esActual || !sueldosDirty

  useEffect(() => {
    lastSueldosInitSig.current = ''
  }, [mes, anio])

  useEffect(() => {
    if (!esActual) return
    if (!compensacionData?.miembros?.length) return
    if (loadingLiquidacionAnterior || loadingDashboard) return
    const sigLiq = JSON.stringify(
      (liquidacionMesAnteriorRes?.ingresos ?? []).map((i) => [i.usuario_id, i.total]),
    )
    const sigApi = JSON.stringify(dashboardRes?.sueldos_prorrateo_montos ?? {})
    const sig = `${anio}-${mes}|${sigLiq}|${sigApi}`
    if (lastSueldosInitSig.current === sig) return
    lastSueldosInitSig.current = sig
    const prevById = Object.fromEntries(
      (liquidacionMesAnteriorRes?.ingresos ?? []).map((i) => [
        i.usuario_id,
        Math.round(Number(i.total) || 0),
      ]),
    )
    const apiMontos = dashboardRes?.sueldos_prorrateo_montos ?? {}
    const next: Record<number, string> = {}
    for (const m of compensacionData.miembros) {
      const k = String(m.usuario_id)
      const apiVal = apiMontos[k]
      if (apiVal !== undefined && apiVal !== null && apiVal !== '') {
        const n = Math.round(Number(apiVal) || 0)
        next[m.usuario_id] = n === 0 ? '' : String(n)
      } else {
        const v = prevById[m.usuario_id] ?? 0
        next[m.usuario_id] = v === 0 ? '' : String(v)
      }
    }
    setSueldosDigitos(next)
    setSueldosDirty(false)
  }, [
    esActual,
    mes,
    anio,
    compensacionData,
    liquidacionMesAnteriorRes,
    dashboardRes,
    loadingLiquidacionAnterior,
    loadingDashboard,
  ])

  useEffect(() => {
    if (!esActual || !sueldosDirty) return
    if (!compensacionData?.miembros?.length) return
    const t = window.setTimeout(() => {
      const montos: Record<string, string> = {}
      for (const m of compensacionData.miembros) {
        const n = montoClpANumero(sueldosDigitos[m.usuario_id] ?? '')
        montos[String(m.usuario_id)] = n.toFixed(2)
      }
      finanzasApi
        .putSueldosEstimadosProrrateo(mes + 1, anio, montos)
        .then(() => {
          setSueldosDirty(false)
          void refetchDashboard()
        })
        .catch(() => {
          /* el usuario puede reintentar editando */
        })
    }, 800)
    return () => window.clearTimeout(t)
  }, [sueldosDigitos, sueldosDirty, esActual, mes, anio, compensacionData, refetchDashboard])

  const prorrateoDetalle = useMemo(() => {
    const vacio = {
      proporcion: 0,
      baseUsuario: 0,
    }
    if (!esActual || errorDashboard || !compensacionData?.miembros?.length || !user) return vacio
    const n = compensacionData.miembros.length
    const totEst = compensacionData.miembros.reduce(
      (s, m) => s + sueldoEstimadoMes(sueldosDigitos[m.usuario_id] ?? ''),
      0,
    )
    const self = compensacionData.miembros.find((m) => m.usuario_id === user.id)
    if (!self) return vacio
    const meu = sueldoEstimadoMes(sueldosDigitos[user.id] ?? '')
    let proporcion = 0
    if (totEst > 0.005) {
      proporcion = meu / totEst
    } else if (n > 0) {
      proporcion = 1 / n
    }
    return {
      proporcion,
      baseUsuario: meu,
    }
  }, [esActual, errorDashboard, compensacionData, user, sueldosDigitos])

  const prorrateoParaTarjeta = useMemo(() => {
    if (dashboardRes && usarSaldoServidor) {
      const p = Number(dashboardRes.prorrateo.proporcion)
      return {
        proporcion: Number.isFinite(p) ? p : 0,
        baseUsuario: toPesos(dashboardRes.prorrateo.base_usuario),
      }
    }
    return prorrateoDetalle
  }, [dashboardRes, usarSaldoServidor, prorrateoDetalle])

  const ingresosPersonalesMesActual = useMemo(() => {
    if (!esActual) return 0
    return movimientos
      .filter(
        (m) =>
          m.ambito === 'PERSONAL' &&
          incluirIngresoMovimientoEnSueldoProyectadoMes(m),
      )
      .reduce((sum, m) => sum + toPesos(m.monto), 0)
  }, [esActual, movimientos])

  const ingresosComunesMesActual = useMemo(() => {
    if (!esActual) return 0
    return movimientosComunes
      .filter(
        (m) =>
          m.ambito === 'COMUN' &&
          incluirIngresoMovimientoEnSueldoProyectadoMes(m),
      )
      .reduce((sum, m) => sum + toPesos(m.monto), 0)
  }, [esActual, movimientosComunes])

  const ingresosMesActual = ingresosPersonalesMesActual + ingresosComunesMesActual

  const efectivoHastaMesAnterior = useMemo(() => {
    if (dashboardRes) return toPesos(dashboardRes.efectivo_hasta_mes_anterior)
    if (!efectivoDesglose) return 0
    return efectivo - toPesos(efectivoDesglose.b) - toPesos(efectivoDesglose.e)
  }, [dashboardRes, efectivo, efectivoDesglose])

  const sueldoProyectado = useMemo(() => {
    if (!user) return 0
    if (dashboardRes && usarSaldoServidor) {
      return toPesos(dashboardRes.sueldo_proyectado)
    }
    if (!esActual) return 0
    return sueldoEstimadoMes(sueldosDigitos[user.id] ?? '') + ingresosMesActual
  }, [dashboardRes, usarSaldoServidor, sueldosDigitos, user, esActual, ingresosMesActual])

  const presupuestoComunProrrateado = useMemo(() => {
    if (dashboardRes && usarSaldoServidor) {
      return toPesos(dashboardRes.presupuesto_comun_prorrateado)
    }
    const totalComun = toPesos(presupuestosSaldoRes?.comunTotal)
    return Math.round(totalComun * prorrateoDetalle.proporcion)
  }, [dashboardRes, usarSaldoServidor, presupuestosSaldoRes, prorrateoDetalle.proporcion])

  const presupuestosPersonalesOrdenados = useMemo(
    () => [...(presupuestosSaldoRes?.personales ?? [])].sort((a, b) =>
      a.cuentaNombre.localeCompare(b.cuentaNombre, 'es', { sensitivity: 'base' }),
    ),
    [presupuestosSaldoRes],
  )

  const totalPresupuestosPersonales = useMemo(
    () => presupuestosPersonalesOrdenados.reduce((sum, p) => sum + toPesos(p.total), 0),
    [presupuestosPersonalesOrdenados],
  )

  const desgloseSaldoFormula = useMemo(() => {
    if (dashboardRes && usarSaldoServidor && dashboardRes.desglose_saldo?.length) {
      return dashboardRes.desglose_saldo.map((t) => ({
        letra: t.letra,
        etiqueta: t.etiqueta,
        monto: t.monto,
      }))
    }
    const terms: { letra: string; etiqueta: string; monto: number }[] = [
      { letra: 'A', etiqueta: 'Sueldo estimado + ingresos mes actual', monto: sueldoProyectado },
      { letra: 'B', etiqueta: 'Efectivo hasta mes anterior', monto: efectivoHastaMesAnterior },
      { letra: 'C', etiqueta: 'Presupuesto común prorrateado', monto: presupuestoComunProrrateado },
    ]
    const alphabet = 'DEFGHIJKLMNOPQRSTUVWXYZ'
    presupuestosPersonalesOrdenados.forEach((p, idx) => {
      const letra = alphabet[idx] ?? `P${idx + 1}`
      terms.push({
        letra,
        etiqueta: `Presupuesto personal — ${p.cuentaNombre}`,
        monto: toPesos(p.total),
      })
    })
    return terms
  }, [
    dashboardRes,
    usarSaldoServidor,
    sueldoProyectado,
    efectivoHastaMesAnterior,
    presupuestoComunProrrateado,
    presupuestosPersonalesOrdenados,
  ])

  const saldo = useMemo(() => {
    if (dashboardRes && usarSaldoServidor) {
      return toPesos(dashboardRes.saldo_proyectado)
    }
    return sueldoProyectado + efectivoHastaMesAnterior - presupuestoComunProrrateado - totalPresupuestosPersonales
  }, [
    dashboardRes,
    usarSaldoServidor,
    sueldoProyectado,
    efectivoHastaMesAnterior,
    presupuestoComunProrrateado,
    totalPresupuestosPersonales,
  ])

  const movimientosCuentaSeleccionada = useMemo(() => {
    if (cuentaTab === null) return movimientos
    return movimientos.filter(m => m.cuenta === cuentaTab)
  }, [movimientos, cuentaTab])

  const categoriasComparadas = useMemo(() => {
    const data = presupuestoData ?? []
    const nombrePorId = new Map(data.map(f => [f.categoria_id, f.categoria_nombre || '']))
    return data
      .filter(f => {
        if (f.es_agregado_padre) {
          const p = Math.round(Number(f.monto_presupuestado) || 0)
          const g = Math.round(Number(f.gastado) || 0)
          return p > 0 || g > 0
        }
        return f.presupuesto_id != null
      })
      .map(f => {
        const presupuestado = Math.round(Number(f.monto_presupuestado) || 0)
        const gastado = Math.round(Number(f.gastado) || 0)
        const pct = presupuestado > 0 ? (gastado / presupuestado) * 100 : 0
        const esAgg = Boolean(f.es_agregado_padre)
        const nombreBase = f.categoria_nombre || 'Otros'
        return {
          categoriaId: f.categoria_id,
          nombre: esAgg ? `${nombreBase} (total subcategorías)` : nombreBase,
          nombreBase,
          categoriaPadreId: f.categoria_padre_id ?? null,
          gastado,
          presupuestado,
          pct,
          esAgregadoPadre: esAgg,
        }
      })
      .sort((a, b) => {
        const aRaiz = a.esAgregadoPadre || a.categoriaPadreId == null
        const bRaiz = b.esAgregadoPadre || b.categoriaPadreId == null
        if (aRaiz !== bRaiz) return aRaiz ? -1 : 1
        if (aRaiz) {
          return a.nombreBase.localeCompare(b.nombreBase, 'es', { sensitivity: 'base' })
        }
        const pa = nombrePorId.get(a.categoriaPadreId!) || ''
        const pb = nombrePorId.get(b.categoriaPadreId!) || ''
        const c = pa.localeCompare(pb, 'es', { sensitivity: 'base' })
        if (c !== 0) return c
        return a.nombreBase.localeCompare(b.nombreBase, 'es', { sensitivity: 'base' })
      })
  }, [presupuestoData])
  const totalCatGastado = categoriasComparadas
    .filter(c => !c.esAgregadoPadre)
    .reduce((s, c) => s + c.gastado, 0)
  const totalCatPresupuestado = categoriasComparadas
    .filter(c => !c.esAgregadoPadre)
    .reduce((s, c) => s + c.presupuestado, 0)

  const linkListadoCuentaActiva = useMemo(() => {
    if (cuentaTab !== null) return `/gastos/cuenta/${cuentaTab}`
    const p = (cuentasData ?? []).find(c => c.es_propia)
    return p ? `/gastos/cuenta/${p.id}` : '/configuracion/cuentas'
  }, [cuentaTab, cuentasData])

  function irEditarMovimiento(id: number) {
    const returnTo = '/dashboard'
    navigate(`/gastos/${id}/editar?returnTo=${encodeURIComponent(returnTo)}`)
  }

  function irListadoFiltradoCategoria(categoriaId: number) {
    const cuentaDestino = cuentaTab ?? cuentasPropias[0]?.id ?? null
    if (cuentaDestino == null) return
    const params = new URLSearchParams({ categoria: String(categoriaId) })
    navigate(`/gastos/cuenta/${cuentaDestino}?${params.toString()}`)
  }

  if (
    loading ||
    loadingMovimientosComunes ||
    loadingDashboard ||
    loadingDeuda ||
    loadingLiquidacionAnterior
  ) return <Cargando />
  if (error || errorMovimientosComunes || errorDashboard || errorLiquidacionAnterior) {
    return <ErrorCarga mensaje={error || errorMovimientosComunes || errorDashboard || errorLiquidacionAnterior || 'Error al cargar datos.'} />
  }

  const recalculoPendiente = dashboardRes?.efectivo?.recalculo?.pendiente

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.titulo}>Resumen</h1>
          {esActual && <span className={styles.badge}>Mes actual</span>}
        </div>
        <div className={styles.mesNav}>
          <button className={styles.mesBtn} onClick={irAnterior} aria-label="Mes anterior">
            ‹
          </button>
          <span className={styles.mesLabel}>{MESES[mes]} {anio}</span>
          <button
            className={styles.mesBtn}
            onClick={irSiguiente}
            disabled={esActual}
            aria-label="Mes siguiente"
          >
            ›
          </button>
        </div>
      </div>

      {/* ── Tarjetas métricas ── */}
      {recalculoPendiente && (
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
          Hay recálculo de histórico pendiente; los totales pueden actualizarse al ejecutar el comando de mantenimiento.
        </p>
      )}

      <div className={styles.metrics}>
        <EfectivoMetricCard label="Efectivo disponible" valor={efectivo} desglose={efectivoDesglose} delay={0} />
        <MetricCard label="Deuda tarjetas"       valor={deudaTc}       variant="danger"  delay={80}  />
        <SaldoProyectadoCard
          label="Saldo proyectado"
          saldo={saldo}
          sueldoProyectado={sueldoProyectado}
          efectivo={efectivoHastaMesAnterior}
          formula={desgloseSaldoFormula}
          prorrateoPresupuestoComun={prorrateoParaTarjeta.proporcion}
          miembros={compensacionData?.miembros ?? []}
          sueldosDigitos={sueldosDigitos}
          onSueldoChange={(usuarioId, soloDigitos) => {
            setSueldosDirty(true)
            setSueldosDigitos((prev) => ({ ...prev, [usuarioId]: soloDigitos }))
          }}
          errorCompensacion={errorDashboard}
          delay={160}
        />
      </div>

      {deudaTc > 0 && (
        <div className={styles.linkPagarTarjeta}>
          <Link to="/tarjetas/pagar">Ir a pagar tarjeta →</Link>
        </div>
      )}

      {cuentasPropias.length > 0 && (
        <div className={styles.tabsWrap}>
          {cuentasPropias.map(c => (
            <button
              key={c.id}
              type="button"
              className={`${styles.tabBtn} ${cuentaTab === c.id ? styles.tabBtnActive : ''}`}
              onClick={() => setCuentaTab(c.id)}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      )}

      {/* ── Grid inferior ── */}
      <div className={styles.grid}>

        {/* Columna izquierda: gráfico categorías */}
        <div className={styles.catCard}>
          <div className={styles.catHeader}>
            <span className={styles.catTitulo}>Gastos por categoría</span>
            <span className={styles.catTotal}>
              {formatMonto(Math.abs(totalCatGastado))} de {formatMonto(Math.abs(totalCatPresupuestado))}
            </span>
          </div>
          <div className={styles.catLista}>
            {loadingPresupuesto && <p className={styles.catHint}>Cargando comparación…</p>}
            {!loadingPresupuesto && errorPresupuesto && (
              <p className={styles.catHint}>No se pudo cargar presupuesto del período.</p>
            )}
            {!loadingPresupuesto && !errorPresupuesto && categoriasComparadas.length === 0 && (
              <p className={styles.catHint}>Sin presupuestos configurados para este período/cuenta.</p>
            )}
            {!loadingPresupuesto && !errorPresupuesto && categoriasComparadas.map(cat => (
              <CategoriaPresupuestoItem
                key={cat.categoriaId}
                nombre={cat.nombre}
                gastado={cat.gastado}
                presupuestado={cat.presupuestado}
                className={
                  !cat.esAgregadoPadre && cat.categoriaPadreId != null
                    ? styles.catPresupuestoHija
                    : undefined
                }
                onClick={() => irListadoFiltradoCategoria(cat.categoriaId)}
              />
            ))}
          </div>
        </div>

        {/* Columna derecha: listas de movimientos */}
        <div className={styles.listas}>
          <MovimientosList
            titulo="Gastos personales"
            movimientos={movimientosCuentaSeleccionada}
            verTodosTo={linkListadoCuentaActiva}
            onEditarMovimiento={irEditarMovimiento}
          />
        </div>

      </div>
    </div>
  )
}
