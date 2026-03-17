import { useState } from 'react'
import styles from './DashboardPage.module.scss'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

interface Movimiento {
  id:          number
  fecha:       string
  categoria:   string
  descripcion: string
  monto:       number
  tipo:        'EGRESO' | 'INGRESO'
  ambito:      'PERSONAL' | 'COMUN'
  metodo:      'EFECTIVO' | 'DEBITO' | 'CREDITO'
}

interface CategoriaGasto {
  categoria: string
  monto:     number
  color:     string
}

// ─────────────────────────────────────────────────────────────────────────────
// Datos mock  // TODO: reemplazar por fetch al backend
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_MOVIMIENTOS: Movimiento[] = [
  { id: 1, fecha: '2026-03-15', categoria: 'Alimentación', descripcion: 'Supermercado Lider',    monto: 87400,  tipo: 'EGRESO',  ambito: 'PERSONAL', metodo: 'DEBITO'   },
  { id: 2, fecha: '2026-03-14', categoria: 'Transporte',   descripcion: 'Bencina',               monto: 45000,  tipo: 'EGRESO',  ambito: 'PERSONAL', metodo: 'EFECTIVO' },
  { id: 3, fecha: '2026-03-13', categoria: 'Honorarios',   descripcion: 'Proyecto Arquitectura', monto: 850000, tipo: 'INGRESO', ambito: 'PERSONAL', metodo: 'EFECTIVO' },
  { id: 4, fecha: '2026-03-12', categoria: 'Servicios',    descripcion: 'Agua + Luz',            monto: 62300,  tipo: 'EGRESO',  ambito: 'COMUN',    metodo: 'EFECTIVO' },
  { id: 5, fecha: '2026-03-11', categoria: 'Alimentación', descripcion: 'Feria semanal',         monto: 28000,  tipo: 'EGRESO',  ambito: 'COMUN',    metodo: 'EFECTIVO' },
  { id: 6, fecha: '2026-03-10', categoria: 'Entretención', descripcion: 'Netflix',               monto: 10990,  tipo: 'EGRESO',  ambito: 'PERSONAL', metodo: 'CREDITO'  },
  { id: 7, fecha: '2026-03-09', categoria: 'Salud',        descripcion: 'Farmacia Cruz Verde',   monto: 15600,  tipo: 'EGRESO',  ambito: 'COMUN',    metodo: 'EFECTIVO' },
  { id: 8, fecha: '2026-03-08', categoria: 'Educación',    descripcion: 'Matrícula U',           monto: 320000, tipo: 'EGRESO',  ambito: 'COMUN',    metodo: 'CREDITO'  },
]

const MOCK_CATEGORIAS: CategoriaGasto[] = [
  { categoria: 'Alimentación', monto: 115400, color: '#c8f060' },
  { categoria: 'Servicios',    monto: 62300,  color: '#60c8f0' },
  { categoria: 'Educación',    monto: 320000, color: '#f060c8' },
  { categoria: 'Transporte',   monto: 45000,  color: '#f0c860' },
  { categoria: 'Salud',        monto: 15600,  color: '#60f0c8' },
  { categoria: 'Entretención', monto: 10990,  color: '#c860f0' },
]

const DEUDA_TC_MOCK = 330990 // TODO: vendrá de cuotas del backend

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const clp = (n: number) =>
  n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })

const fechaCorta = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', {
    day: '2-digit', month: 'short',
  })
}

const METODO_BADGE: Record<Movimiento['metodo'], { label: string; bg: string; color: string }> = {
  EFECTIVO: { label: 'EF', bg: '#f0f0ec', color: '#6b7280' },
  DEBITO:   { label: 'TD', bg: '#e8f4ff', color: '#3b82f6' },
  CREDITO:  { label: 'TC', bg: '#fff0f0', color: '#ff4d4d' },
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes internos
// ─────────────────────────────────────────────────────────────────────────────

function MetricCard({
  label, valor, variant = 'default', delay = 0,
}: {
  label:    string
  valor:    number
  variant?: 'default' | 'danger' | 'dark'
  delay?:   number
}) {
  const isNeg = valor < 0

  const labelColor =
    variant === 'dark' ? 'rgba(255,255,255,0.5)' : undefined

  const valorColor =
    variant === 'dark'
      ? isNeg ? '#ff4d4d' : '#c8f060'
      : variant === 'danger' ? '#ff4d4d'
      : '#0f0f0f'

  return (
    <div
      className={`${styles.metricCard} ${variant === 'dark' ? styles.metricCardDark : ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className={styles.metricLabel} style={{ color: labelColor }}>
        {label}
      </span>
      <span className={styles.metricValor} style={{ color: valorColor }}>
        {clp(Math.abs(valor))}
        {isNeg && <span className={styles.metricNeg}> negativo</span>}
      </span>
    </div>
  )
}

function CategoriaBar({
  categoria, monto, color, max, delay,
}: CategoriaGasto & { max: number; delay: number }) {
  const pct = max > 0 ? (monto / max) * 100 : 0

  return (
    <div className={styles.barRow}>
      <span className={styles.barLabel} title={categoria}>{categoria}</span>
      <div className={styles.barTrack}>
        <div
          className={styles.barFill}
          style={
            { '--target-width': `${pct}%`, backgroundColor: color, animationDelay: `${delay}ms` }
            as React.CSSProperties
          }
        />
      </div>
      <span className={styles.barMonto}>{clp(monto)}</span>
    </div>
  )
}

function MovimientoItem({ mov }: { mov: Movimiento }) {
  const badge     = METODO_BADGE[mov.metodo]
  const esIngreso = mov.tipo === 'INGRESO'

  return (
    <div className={styles.movItem}>
      <span className={styles.movFecha}>{fechaCorta(mov.fecha)}</span>
      <div className={styles.movInfo}>
        <span className={styles.movDesc}>{mov.descripcion}</span>
        <span className={styles.movCat}>{mov.categoria}</span>
      </div>
      <div className={styles.movRight}>
        <span
          className={styles.movMonto}
          style={{ color: esIngreso ? '#22a06b' : '#0f0f0f' }}
        >
          {esIngreso ? '+' : '−'}{clp(mov.monto)}
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
  titulo, movimientos,
}: {
  titulo:       string
  movimientos:  Movimiento[]
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
              <button className={styles.verTodos}>Ver todos →</button>
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
  const hoy = new Date()
  const [mes,  setMes]  = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())

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

  // Filtrar movimientos del mes seleccionado
  const movMes = MOCK_MOVIMIENTOS.filter(mov => {
    const [y, mo] = mov.fecha.split('-').map(Number)
    return mo - 1 === mes && y === anio
  })

  // Métricas
  const efectivo = movMes
    .filter(m => m.metodo !== 'CREDITO')
    .reduce((acc, m) => acc + (m.tipo === 'INGRESO' ? m.monto : -m.monto), 0)
  const saldo = efectivo - DEUDA_TC_MOCK

  // Listas por ámbito
  const personales = movMes.filter(m => m.ambito === 'PERSONAL')
  const comunes    = movMes.filter(m => m.ambito === 'COMUN')

  // Categorías ordenadas de mayor a menor
  const categoriasSorted = [...MOCK_CATEGORIAS].sort((a, b) => b.monto - a.monto)
  const maxCat = categoriasSorted[0]?.monto ?? 1
  const totalCat = categoriasSorted.reduce((s, c) => s + c.monto, 0)

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
        <MetricCard label="Deuda tarjetas"       valor={DEUDA_TC_MOCK} variant="danger"  delay={80}  />
        <MetricCard label="Saldo proyectado"     valor={saldo}         variant="dark"    delay={160} />
      </div>

      {/* ── Grid inferior ── */}
      <div className={styles.grid}>

        {/* Columna izquierda: gráfico categorías */}
        <div className={styles.catCard}>
          <div className={styles.catHeader}>
            <span className={styles.catTitulo}>Gastos por categoría</span>
            <span className={styles.catTotal}>{clp(totalCat)}</span>
          </div>
          <div className={styles.catLista}>
            {categoriasSorted.map((c, i) => (
              <CategoriaBar key={c.categoria} {...c} max={maxCat} delay={i * 60} />
            ))}
          </div>
        </div>

        {/* Columna derecha: listas de movimientos */}
        <div className={styles.listas}>
          <MovimientosList titulo="Gastos personales" movimientos={personales} />
          <MovimientosList titulo="Gastos comunes"    movimientos={comunes}    />
        </div>

      </div>
    </div>
  )
}
