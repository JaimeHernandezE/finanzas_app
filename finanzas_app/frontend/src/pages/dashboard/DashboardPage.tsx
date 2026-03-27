import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useMovimientos } from '@/hooks/useMovimientos'
import { useCuentasPersonales } from '@/hooks/useCuentasPersonales'
import { useApi } from '@/hooks/useApi'
import { finanzasApi, movimientosApi } from '@/api'
import { Cargando, ErrorCarga } from '@/components/ui'
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
}

interface CategoriaGasto {
  categoria: string
  monto: number
  color: string
}

interface LiquidacionApi {
  ingresos: Array<{ usuario_id: number; total: string }>
  gastos_comunes: Array<{ usuario_id: number; total: string }>
}

const COLORS = ['#c8f060', '#60c8f0', '#f060c8', '#f0c860', '#60f0c8', '#c860f0']

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

function CategoriaBar({
  categoria, monto, color, max, delay,
}: CategoriaGasto & { max: number; delay: number }) {
  const { formatMonto } = useConfig()
  const pct = max > 0 ? (monto / max) * 100 : 0

  return (
    <div className={styles.barRow}>
      <span className={styles.barLabel} title={categoria}>{categoria}</span>
      <div className={styles.barTrack}>
        <div
          className={styles.barFill}
          style={
            { '--target-width': `${pct}%`, backgroundColor: color, animationDelay: `${delay}ms` } as React.CSSProperties
          }
        />
      </div>
      <span className={styles.barMonto}>{formatMonto(Math.abs(monto))}</span>
    </div>
  )
}

function MovimientoItem({ mov }: { mov: MovimientoApi }) {
  const { formatMonto } = useConfig()
  const badge     = METODO_BADGE[mov.metodo_pago_tipo]
  const esIngreso = mov.tipo === 'INGRESO'
  const monto = montoAbs(mov.monto)
  const montoFmt  = esIngreso
    ? formatMonto(monto)
    : `−${formatMonto(monto)}`

  return (
    <div className={styles.movItem}>
      <span className={styles.movFecha}>{fechaCorta(mov.fecha)}</span>
      <div className={styles.movInfo}>
        <span className={styles.movDesc}>{mov.comentario || '—'}</span>
        <span className={styles.movCat}>{mov.categoria_nombre}</span>
      </div>
      <div className={styles.movRight}>
        <span
          className={styles.movMonto}
          style={{ color: esIngreso ? '#22a06b' : '#0f0f0f' }}
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
    </div>
  )
}

function MovimientosList({
  titulo,
  movimientos,
  verTodosTo,
}: {
  titulo:       string
  movimientos:  MovimientoApi[]
  verTodosTo?:  string
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
                <MovimientoItem key={m.id} mov={m} />
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
  const { user } = useAuth()
  const hoy = new Date()
  const [mes,  setMes]  = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())

  const { movimientos: movimientosRaw, loading, error } = useMovimientos({
    mes: mes + 1,
    anio,
    ambito: 'PERSONAL',
    solo_mios: true,
  })
  const movimientos = (movimientosRaw ?? []) as MovimientoApi[]

  const { data: deudaRes, loading: loadingDeuda } = useApi(
    () => movimientosApi.getCuotasDeudaPendiente(),
    [],
  )
  const { data: liquidacionRes, loading: loadingLiquidacion, error: errorLiquidacion } = useApi<LiquidacionApi>(
    () => finanzasApi.getLiquidacion(mes + 1, anio),
    [mes, anio],
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

  const deudaTc = useMemo(() => {
    const t = deudaRes?.total
    return Math.round(Number(t) || 0)
  }, [deudaRes])

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

  // Métricas y listas (API ya filtra por mes/anio)
  const efectivo = useMemo(
    () =>
      movimientos
        .filter(m => m.metodo_pago_tipo !== 'CREDITO')
        .reduce(
          (acc, m) =>
            acc + (m.tipo === 'INGRESO' ? montoAbs(m.monto) : -montoAbs(m.monto)),
          0,
        ),
    [movimientos],
  )
  const ajusteLiquidacionComun = useMemo(() => {
    if (!liquidacionRes || !user) return 0
    const totalIngresos = (liquidacionRes.ingresos ?? []).reduce(
      (acc, i) => acc + toPesos(i.total),
      0,
    )
    const totalGastosComunes = (liquidacionRes.gastos_comunes ?? []).reduce(
      (acc, g) => acc + toPesos(g.total),
      0,
    )
    if (totalIngresos <= 0 || totalGastosComunes <= 0) return 0

    const ingresoUsuario = (liquidacionRes.ingresos ?? [])
      .filter(i => i.usuario_id === user.id)
      .reduce((acc, i) => acc + toPesos(i.total), 0)

    // Lo que "debería" cubrir según prorrateo por ingresos.
    const aporteEsperado = (ingresoUsuario / totalIngresos) * totalGastosComunes
    // Lo que efectivamente pagó en gastos comunes.
    const pagadoPorUsuario = (liquidacionRes.gastos_comunes ?? [])
      .filter(g => g.usuario_id === user.id)
      .reduce((acc, g) => acc + toPesos(g.total), 0)

    // > 0: le deben al usuario (se suma al saldo). < 0: el usuario debe (se resta).
    return Math.round(pagadoPorUsuario - aporteEsperado)
  }, [liquidacionRes, user])
  const saldo = efectivo - deudaTc + ajusteLiquidacionComun

  const movimientosCuentaSeleccionada = useMemo(() => {
    if (cuentaTab === null) return movimientos
    return movimientos.filter(m => m.cuenta === cuentaTab)
  }, [movimientos, cuentaTab])

  // Categorías (solo egresos) ordenadas de mayor a menor
  const categoriasSorted = useMemo(() => {
    const byCat = new Map<string, number>()
    for (const m of movimientosCuentaSeleccionada) {
      if (m.tipo !== 'EGRESO') continue
      const name = m.categoria_nombre || 'Otros'
      byCat.set(name, (byCat.get(name) ?? 0) + montoAbs(m.monto))
    }
    return Array.from(byCat.entries())
      .map(([categoria, monto], i) => ({ categoria, monto, color: COLORS[i % COLORS.length] }))
      .sort((a, b) => b.monto - a.monto)
  }, [movimientosCuentaSeleccionada])
  const maxCat = categoriasSorted[0]?.monto ?? 1
  const totalCat = categoriasSorted.reduce((s, c) => s + c.monto, 0)

  const linkListadoCuentaActiva = useMemo(() => {
    if (cuentaTab !== null) return `/gastos/cuenta/${cuentaTab}`
    const p = (cuentasData ?? []).find(c => c.es_propia)
    return p ? `/gastos/cuenta/${p.id}` : '/configuracion/cuentas'
  }, [cuentaTab, cuentasData])

  if (loading || loadingDeuda || loadingLiquidacion) return <Cargando />
  if (error || errorLiquidacion) return <ErrorCarga mensaje={error || errorLiquidacion || 'Error al cargar datos.'} />

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
      <div className={styles.metrics}>
        <MetricCard label="Efectivo disponible" valor={efectivo}      variant="default" delay={0}   />
        <MetricCard label="Deuda tarjetas"       valor={deudaTc}       variant="danger"  delay={80}  />
        <MetricCard label="Saldo proyectado"     valor={saldo}         variant="dark"    delay={160} />
      </div>

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
            <span className={styles.catTotal}>{formatMonto(Math.abs(totalCat))}</span>
          </div>
          <div className={styles.catLista}>
            {categoriasSorted.map((c, i) => (
              <CategoriaBar key={c.categoria} {...c} max={maxCat} delay={i * 60} />
            ))}
          </div>
        </div>

        {/* Columna derecha: listas de movimientos */}
        <div className={styles.listas}>
          <MovimientosList
            titulo="Gastos personales"
            movimientos={movimientosCuentaSeleccionada}
            verTodosTo={linkListadoCuentaActiva}
          />
        </div>

      </div>
    </div>
  )
}
