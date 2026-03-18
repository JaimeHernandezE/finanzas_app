import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useMovimientos } from '@/hooks/useMovimientos'
import { useCuentasPersonales } from '@/hooks/useCuentasPersonales'
import { useApi } from '@/hooks/useApi'
import { movimientosApi } from '@/api'
import { Cargando, ErrorCarga } from '@/components/ui'
import { useConfig } from '@/context/ConfigContext'
import styles from './DashboardPage.module.scss'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos (API devuelve snake_case)
// ─────────────────────────────────────────────────────────────────────────────

interface MovimientoApi {
  id: number
  fecha: string
  tipo: 'EGRESO' | 'INGRESO'
  ambito: 'PERSONAL' | 'COMUN'
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
  const montoFmt  = esIngreso
    ? formatMonto(toPesos(mov.monto))
    : `−${formatMonto(toPesos(mov.monto))}`

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

  return (
    <div className={styles.listaCard}>
      <button
        className={styles.listaHeader}
        onClick={() => setExpandido(e => !e)}
      >
        <span className={styles.listaTitulo}>{titulo}</span>
        <div className={styles.listaHeaderRight}>
          <span className={styles.listaCuenta}>
            {movimientos.length} movimiento{movimientos.length !== 1 ? 's' : ''}
          </span>
          <span className={`${styles.chevron} ${expandido ? styles.chevronOpen : ''}`}>
            ▾
          </span>
        </div>
      </button>

      {expandido && (
        <div className={styles.listaCuerpo}>
          {movimientos.length === 0 ? (
            <p className={styles.listaVacia}>Sin movimientos este mes.</p>
          ) : (
            <>
              {movimientos.map(m => (
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
  const hoy = new Date()
  const [mes,  setMes]  = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())

  const { movimientos: movimientosRaw, loading, error } = useMovimientos({
    mes: mes + 1,
    anio,
  })
  const movimientos = (movimientosRaw ?? []) as MovimientoApi[]

  const { data: deudaRes, loading: loadingDeuda } = useApi(
    () => movimientosApi.getCuotasDeudaPendiente(),
    [],
  )
  const { data: cuentasData } = useCuentasPersonales()

  const deudaTc = useMemo(() => {
    const t = deudaRes?.total
    return Math.round(Number(t) || 0)
  }, [deudaRes])

  const linkListadoPersonales = useMemo(() => {
    const p = (cuentasData ?? []).find(c => c.es_propia)
    return p ? `/gastos/cuenta/${p.id}` : '/configuracion/cuentas'
  }, [cuentasData])

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
            acc + (m.tipo === 'INGRESO' ? toPesos(m.monto) : -toPesos(m.monto)),
          0,
        ),
    [movimientos],
  )
  const saldo = efectivo - deudaTc

  const personales = useMemo(() => movimientos.filter(m => m.ambito === 'PERSONAL'), [movimientos])
  const comunes    = useMemo(() => movimientos.filter(m => m.ambito === 'COMUN'), [movimientos])

  // Categorías (solo egresos) ordenadas de mayor a menor
  const categoriasSorted = useMemo(() => {
    const byCat = new Map<string, number>()
    for (const m of movimientos) {
      if (m.tipo !== 'EGRESO') continue
      const name = m.categoria_nombre || 'Otros'
      byCat.set(name, (byCat.get(name) ?? 0) + toPesos(m.monto))
    }
    return Array.from(byCat.entries())
      .map(([categoria, monto], i) => ({ categoria, monto, color: COLORS[i % COLORS.length] }))
      .sort((a, b) => b.monto - a.monto)
  }, [movimientos])
  const maxCat = categoriasSorted[0]?.monto ?? 1
  const totalCat = categoriasSorted.reduce((s, c) => s + c.monto, 0)

  if (loading || loadingDeuda) return <Cargando />
  if (error) return <ErrorCarga mensaje={error} />

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
            movimientos={personales}
            verTodosTo={linkListadoPersonales}
          />
          <MovimientosList
            titulo="Gastos comunes"
            movimientos={comunes}
            verTodosTo="/gastos/comunes"
          />
        </div>

      </div>
    </div>
  )
}
