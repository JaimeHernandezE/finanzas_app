import { useState, useMemo } from 'react'
import { useApi } from '@/hooks/useApi'
import { finanzasApi } from '@/api'
import { Cargando, ErrorCarga } from '@/components/ui'
import { useConfig } from '@/context/ConfigContext'
import styles from './LiquidacionPage.module.scss'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos (API: ingresos/gastos_comunes con usuario_id, nombre, total string)
// ─────────────────────────────────────────────────────────────────────────────

interface IngresoMiembro {
  usuarioId: string
  nombre: string
  monto: number
}

interface GastoMiembro {
  usuarioId: string
  nombre: string
  montoRegistrado: number
}

interface PeriodoData {
  ingresos: IngresoMiembro[]
  gastos: GastoMiembro[]
  usandoSueldosAnteriores?: boolean
  mesAnterior?: string
}

const COLORES_MIEMBRO = ['#c8f060', '#60c8f0', '#f060c8', '#f0c860']

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

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
  const { formatMonto } = useConfig()
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
      <span className={styles.barValor}>{formatMonto(valor)}</span>
      {metaDerecha && <span className={styles.barMeta}>{metaDerecha}</span>}
    </div>
  )
}

function FilaTotal({ label, monto }: { label: string; monto: number }) {
  const { formatMonto } = useConfig()
  return (
    <div className={styles.filaTotal}>
      <span className={styles.filaTotalLabel}>{label}</span>
      <span className={styles.filaTotalMonto}>{formatMonto(monto)}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

export default function LiquidacionPage() {
  const { formatMonto } = useConfig()
  const hoy = new Date()
  const [mes, setMes] = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())

  const { data: liquidacionData, loading, error } = useApi(
    () => finanzasApi.getLiquidacion(mes + 1, anio),
    [mes, anio],
  )

  const data: PeriodoData | null = useMemo(() => {
    if (!liquidacionData) return null
    const ing = (liquidacionData as { ingresos?: { usuario_id: number; nombre: string; total: string }[] }).ingresos ?? []
    const gas = (liquidacionData as { gastos_comunes?: { usuario_id: number; nombre: string; total: string }[] }).gastos_comunes ?? []
    return {
      ingresos: ing.map(i => ({
        usuarioId: String(i.usuario_id),
        nombre: i.nombre,
        monto: Number(i.total) || 0,
      })),
      gastos: gas.map(g => ({
        usuarioId: String(g.usuario_id),
        nombre: g.nombre,
        montoRegistrado: Number(g.total) || 0,
      })),
    }
  }, [liquidacionData])

  const {
    totalIngresos,
    proporciones,
    totalGastos,
    deberíaPagar,
    compensaciones,
    transferencias,
  } = useMemo(() => (data ? calcular(data) : {
    totalIngresos: 0, proporciones: [], totalGastos: 0,
    deberíaPagar: [], compensaciones: [], transferencias: [],
  }), [data])

  if (loading) return <Cargando />
  if (error) return <ErrorCarga mensaje={error} />
  if (!data) return null

  return (
    <div className={styles.page}>

      {/* ── Encabezado ── */}
      <div className={styles.header}>
        <h1 className={styles.titulo}>Liquidación</h1>
        <div className={styles.mesNav} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={() => mes === 0 ? (setMes(11), setAnio(a => a - 1)) : setMes(m => m - 1)}>‹</button>
          <span>{MESES[mes]} {anio}</span>
          <button
            type="button"
            disabled={mes === new Date().getMonth() && anio === new Date().getFullYear()}
            onClick={() => mes === 11 ? (setMes(0), setAnio(a => a + 1)) : setMes(m => m + 1)}
          >
            ›
          </button>
        </div>
      </div>

      {/* ── Sueldos declarados ── */}
      <SeccionCard titulo="Sueldos declarados">
        {data.usandoSueldosAnteriores && (
          <div className={styles.avisoSueldos}>
            ⚠ Usando sueldos de {data.mesAnterior}. Declara los de{' '}
            {MESES[mes]} en <a href="/sueldos" className={styles.avisoLink}>Sueldos</a>.
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
            metaDerecha={`(registrados por ${g.nombre})`}
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
              {formatMonto(totalGastos)}
              <span className={styles.prorrateoOp}> = </span>
            </span>
            <span className={styles.prorrateoMonto}>{formatMonto(d.monto)}</span>
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
                pagó {formatMonto(c.pagado)}
                <span className={styles.compSep}> — </span>
                debería {formatMonto(c.debería)}
                <span className={styles.compSep}> → </span>
              </span>
              <span
                className={styles.compResultado}
                style={{
                  color: esDeudor ? '#ff4d4d' : esAcreedor ? '#22a06b' : '#6b7280',
                }}
              >
                {esDeudor
                  ? `debe ${formatMonto(Math.abs(c.diferencia))}`
                  : esAcreedor
                  ? `recibe ${formatMonto(c.diferencia)}`
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
              <span className={styles.resultMonto}>{formatMonto(transferencias[0].monto)}</span>{' '}
              a <strong>{transferencias[0].a}</strong>
            </p>
            {(mes === new Date().getMonth() && anio === new Date().getFullYear()) && (
              <p className={styles.resultProyeccion}>
                Proyección basada en {formatMonto(totalGastos)} de gastos registrados hasta hoy
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
