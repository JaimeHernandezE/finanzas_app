import { useState, useMemo } from 'react'
import styles from './LiquidacionPage.module.scss'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

interface IngresoMiembro {
  usuarioId: string
  nombre:    string
  monto:     number
}

interface GastoMiembro {
  usuarioId:        string
  nombre:           string
  montoRegistrado:  number
}

interface PeriodoData {
  ingresos:                 IngresoMiembro[]
  gastos:                   GastoMiembro[]
  usandoSueldosAnteriores?: boolean
  mesAnterior?:             string
}

// ─────────────────────────────────────────────────────────────────────────────
// Datos mock  // TODO: reemplazar por fetch al backend
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const USUARIO_ACTUAL = { id: 'jaime', nombre: 'Jaime' }

const MOCK_PERIODOS = [
  { mes: 1, anio: 2026, tipo: 'LIQUIDADO'  as const },
  { mes: 2, anio: 2026, tipo: 'PROYECTADO' as const },
]

const MOCK_FEBRERO: PeriodoData = {
  ingresos: [
    { usuarioId: 'jaime', nombre: 'Jaime', monto: 1800000 },
    { usuarioId: 'glori', nombre: 'Glori', monto: 1000000 },
  ],
  gastos: [
    { usuarioId: 'jaime', nombre: 'Jaime', montoRegistrado: 320000 },
    { usuarioId: 'glori', nombre: 'Glori', montoRegistrado: 180000 },
  ],
}

const MOCK_MARZO: PeriodoData = {
  usandoSueldosAnteriores: true,
  mesAnterior: 'febrero',
  ingresos: [
    { usuarioId: 'jaime', nombre: 'Jaime', monto: 1800000 },
    { usuarioId: 'glori', nombre: 'Glori', monto: 1000000 },
  ],
  gastos: [
    { usuarioId: 'jaime', nombre: 'Jaime', montoRegistrado: 145000 },
    { usuarioId: 'glori', nombre: 'Glori', montoRegistrado: 62300  },
  ],
}

const COLORES_MIEMBRO = ['#c8f060', '#60c8f0', '#f060c8', '#f0c860']

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const clp = (n: number) =>
  n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })

const pct = (n: number) => `${n.toFixed(1)}%`

function calcular(data: PeriodoData) {
  const totalIngresos = data.ingresos.reduce((s, i) => s + i.monto, 0)

  const proporciones = data.ingresos.map(i => ({
    ...i,
    porcentaje: totalIngresos > 0 ? (i.monto / totalIngresos) * 100 : 0,
  }))

  const totalGastos = data.gastos.reduce((s, g) => s + g.montoRegistrado, 0)

  const deberíaPagar = proporciones.map(p => ({
    usuarioId:  p.usuarioId,
    nombre:     p.nombre,
    porcentaje: p.porcentaje,
    monto:      totalGastos * (p.porcentaje / 100),
  }))

  const compensaciones = deberíaPagar.map(d => {
    const pagado = data.gastos.find(g => g.usuarioId === d.usuarioId)?.montoRegistrado ?? 0
    return {
      usuarioId: d.usuarioId,
      nombre:    d.nombre,
      pagado,
      debería:   d.monto,
      diferencia: pagado - d.monto,
    }
  })

  // Transferencias: el que pagó menos transfiere al que pagó más
  const deudores   = compensaciones.filter(c => c.diferencia < -0.5)
    .sort((a, b) => a.diferencia - b.diferencia)
  const acreedores = compensaciones.filter(c => c.diferencia >  0.5)
    .sort((a, b) => b.diferencia - a.diferencia)

  const transferencias: { de: string; a: string; monto: number }[] = []
  if (deudores.length > 0 && acreedores.length > 0) {
    transferencias.push({
      de:    deudores[0].nombre,
      a:     acreedores[0].nombre,
      monto: Math.round(Math.abs(deudores[0].diferencia)),
    })
  }

  return { totalIngresos, proporciones, totalGastos, deberíaPagar, compensaciones, transferencias }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────────

function SeccionCard({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className={styles.seccion}>
      <p className={styles.seccionTitulo}>{titulo}</p>
      {children}
    </section>
  )
}

function PropBarRow({
  nombre, valor, max, color, metaDerecha, delay = 0,
}: {
  nombre:      string
  valor:       number
  max:         number
  color:       string
  metaDerecha?: React.ReactNode
  delay?:      number
}) {
  const ancho = max > 0 ? (valor / max) * 100 : 0

  return (
    <div className={styles.barRow}>
      <span className={styles.barNombre}>{nombre}</span>
      <div className={styles.barTrack}>
        <div
          className={styles.barFill}
          style={
            { '--target-width': `${ancho}%`, backgroundColor: color, animationDelay: `${delay}ms` } as React.CSSProperties
          }
        />
      </div>
      <span className={styles.barValor}>{clp(valor)}</span>
      {metaDerecha && <span className={styles.barMeta}>{metaDerecha}</span>}
    </div>
  )
}

function FilaTotal({ label, monto }: { label: string; monto: number }) {
  return (
    <div className={styles.filaTotal}>
      <span className={styles.filaTotalLabel}>{label}</span>
      <span className={styles.filaTotalMonto}>{clp(monto)}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

export default function LiquidacionPage() {
  const [periodoActivo, setPeriodoActivo] = useState<'LIQUIDADO' | 'PROYECTADO'>('LIQUIDADO')

  const periodoLiquidado  = MOCK_PERIODOS.find(p => p.tipo === 'LIQUIDADO')!
  const periodoProyectado = MOCK_PERIODOS.find(p => p.tipo === 'PROYECTADO')!

  const {
    totalIngresos,
    proporciones,
    totalGastos,
    deberíaPagar,
    compensaciones,
    transferencias,
  } = useMemo(() => {
    const data = periodoActivo === 'LIQUIDADO' ? MOCK_FEBRERO : MOCK_MARZO
    return calcular(data)
  }, [periodoActivo])

  const data = periodoActivo === 'LIQUIDADO' ? MOCK_FEBRERO : MOCK_MARZO

  return (
    <div className={styles.page}>

      {/* ── Encabezado ── */}
      <div className={styles.header}>
        <h1 className={styles.titulo}>Liquidación</h1>
      </div>

      {/* ── Tabs de período ── */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${periodoActivo === 'LIQUIDADO' ? styles.tabActivo : ''}`}
          onClick={() => setPeriodoActivo('LIQUIDADO')}
        >
          <span className={styles.tabArrow}>◀</span>
          <span className={styles.tabMes}>
            {MESES[periodoLiquidado.mes]} {periodoLiquidado.anio}
          </span>
          <span className={`${styles.tabBadge} ${styles.tabBadgeLiquidado}`}>
            Liquidado
          </span>
        </button>

        <button
          className={`${styles.tab} ${periodoActivo === 'PROYECTADO' ? styles.tabActivo : ''}`}
          onClick={() => setPeriodoActivo('PROYECTADO')}
        >
          <span className={styles.tabMes}>
            {MESES[periodoProyectado.mes]} {periodoProyectado.anio}
          </span>
          <span className={`${styles.tabBadge} ${styles.tabBadgeProyectado}`}>
            Proyectado
          </span>
          <span className={styles.tabArrow}>▶</span>
        </button>
      </div>

      {periodoActivo === 'PROYECTADO' && (
        <p className={styles.notaProyectado}>
          ℹ Los cálculos se actualizan en tiempo real según los gastos del mes en curso.
        </p>
      )}

      {/* ── Sueldos declarados ── */}
      <SeccionCard titulo="Sueldos declarados">
        {periodoActivo === 'PROYECTADO' && data.usandoSueldosAnteriores && (
          <div className={styles.avisoSueldos}>
            ⚠ Usando sueldos de {data.mesAnterior}. Declara los de{' '}
            {MESES[periodoProyectado.mes]} en <a href="/sueldos" className={styles.avisoLink}>Sueldos</a>.
          </div>
        )}

        {proporciones.map((ing, i) => (
          <PropBarRow
            key={ing.usuarioId}
            nombre={ing.nombre}
            valor={ing.monto}
            max={totalIngresos}
            color={COLORES_MIEMBRO[i % COLORES_MIEMBRO.length]}
            metaDerecha={pct(ing.porcentaje)}
            delay={i * 60}
          />
        ))}

        <FilaTotal label="Total familia" monto={totalIngresos} />
      </SeccionCard>

      {/* ── Gastos comunes del mes ── */}
      <SeccionCard titulo="Gastos comunes del mes">
        {data.gastos.map((g, i) => (
          <PropBarRow
            key={g.usuarioId}
            nombre={g.nombre}
            valor={g.montoRegistrado}
            max={totalGastos}
            color={COLORES_MIEMBRO[i % COLORES_MIEMBRO.length]}
            delay={i * 60}
          />
        ))}

        <FilaTotal label="Total gastos" monto={totalGastos} />
      </SeccionCard>

      {/* ── Prorrateo ── */}
      <SeccionCard titulo="Prorrateo">
        {deberíaPagar.map(d => (
          <div key={d.usuarioId} className={styles.prorrateoFila}>
            <span className={styles.prorrateoNombre}>{d.nombre}</span>
            <span className={styles.prorrateoCalc}>
              {pct(d.porcentaje)}
              <span className={styles.prorrateoOp}> × </span>
              {clp(totalGastos)}
              <span className={styles.prorrateoOp}> = </span>
            </span>
            <span className={styles.prorrateoMonto}>{clp(d.monto)}</span>
          </div>
        ))}
      </SeccionCard>

      {/* ── Compensación ── */}
      <SeccionCard titulo="Compensación">
        {compensaciones.map(c => {
          const esDeudor  = c.diferencia < -0.5
          const esAcreedor = c.diferencia >  0.5
          return (
            <div key={c.usuarioId} className={styles.compFila}>
              <span className={styles.compNombre}>{c.nombre}</span>
              <span className={styles.compDetalle}>
                pagó {clp(c.pagado)}
                <span className={styles.compSep}> — </span>
                debería {clp(c.debería)}
                <span className={styles.compSep}> → </span>
              </span>
              <span
                className={styles.compResultado}
                style={{
                  color: esDeudor ? '#ff4d4d' : esAcreedor ? '#22a06b' : '#6b7280',
                }}
              >
                {esDeudor
                  ? `debe ${clp(Math.abs(c.diferencia))}`
                  : esAcreedor
                  ? `recibe ${clp(c.diferencia)}`
                  : 'está al día'}
              </span>
            </div>
          )
        })}

        {/* Card resultado final */}
        {transferencias.length > 0 ? (
          <div className={styles.resultCard}>
            <p className={styles.resultTexto}>
              <strong>{transferencias[0].de}</strong>{' '}
              le transfiere{' '}
              <span className={styles.resultMonto}>{clp(transferencias[0].monto)}</span>{' '}
              a <strong>{transferencias[0].a}</strong>
            </p>
            {periodoActivo === 'PROYECTADO' && (
              <p className={styles.resultProyeccion}>
                Proyección basada en {clp(totalGastos)} de gastos registrados hasta hoy
              </p>
            )}
          </div>
        ) : (
          <div className={styles.resultCardOk}>
            ✓ Sin transferencias necesarias este mes
          </div>
        )}
      </SeccionCard>

    </div>
  )
}
