import { useEffect, useState } from 'react'
import type { MetricasPublicasApi } from '@shared/api/finanzas'
import styles from './PublicDashboard.module.scss'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

const METODO_COLORS: Record<string, string> = {
  efectivo: '#9ca3af',
  debito: '#60a5fa',
  credito: '#f87171',
}

const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString('es-CL')
}

export default function PublicDashboard() {
  const [data, setData] = useState<MetricasPublicasApi | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/finanzas/metricas-publicas/`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<MetricasPublicasApi>
      })
      .then(setData)
      .catch(() => {})
  }, [])

  if (!data) return null

  const { producto, gasto_por_categoria, metodo_pago, estacionalidad, presupuesto_vs_real } = data

  return (
    <section className={styles.root}>
      <div className={styles.heading}>
        <span className={styles.label}>Datos reales agregados</span>
        <h2 className={styles.title}>Métricas de uso</h2>
        <p className={styles.subtitle}>Estadísticas anónimas de la plataforma — sin datos personales.</p>
      </div>

      {/* Product stats */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <p className={styles.statValue}>{formatNum(producto.usuarios_activos)}</p>
          <p className={styles.statLabel}>Usuarios activos</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statValue}>{formatNum(producto.movimientos_totales)}</p>
          <p className={styles.statLabel}>Movimientos registrados</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statValue}>{producto.meses_de_datos}</p>
          <p className={styles.statLabel}>Meses de datos</p>
        </div>
      </div>

      <div className={styles.chartsGrid}>
        {/* Gasto por categoría */}
        {gasto_por_categoria.length > 0 && (
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Distribución de gasto</h3>
            {gasto_por_categoria.slice(0, 6).map((row) => (
              <div key={row.categoria} className={styles.barRow}>
                <span className={styles.barLabel}>{row.categoria}</span>
                <div className={styles.barTrack}>
                  <div className={styles.barFill} style={{ width: `${row.porcentaje}%` }} />
                </div>
                <span className={styles.barPct}>{row.porcentaje}%</span>
              </div>
            ))}
          </div>
        )}

        {/* Método de pago */}
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Método de pago</h3>
          <div className={styles.stackedBarWrap}>
            <div className={styles.stackedBar}>
              {(['efectivo', 'debito', 'credito'] as const).map((key) => {
                const pct = metodo_pago[key]
                if (!pct) return null
                return (
                  <div
                    key={key}
                    className={styles.stackedSeg}
                    style={{ width: `${pct}%`, background: METODO_COLORS[key] }}
                  />
                )
              })}
            </div>
          </div>
          <div className={styles.legend}>
            {(['efectivo', 'debito', 'credito'] as const).map((key) => (
              <span key={key} className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: METODO_COLORS[key] }} />
                {METODO_LABELS[key]} {metodo_pago[key]}%
              </span>
            ))}
          </div>
        </div>

        {/* Estacionalidad */}
        {estacionalidad.length > 0 && (
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Estacionalidad (12 meses)</h3>
            <div className={styles.vertBars}>
              {estacionalidad.map((row) => (
                <div key={row.periodo} className={styles.vertCol}>
                  <div className={styles.vertBar} style={{ height: `${row.indice}%` }} />
                  <span className={styles.vertLabel}>{row.periodo.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Presupuesto vs real */}
        {presupuesto_vs_real && (
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Presupuesto vs real</h3>
            <div className={styles.ringWrap}>
              <div
                className={styles.ring}
                style={{
                  background: `conic-gradient(#c8f060 0% ${presupuesto_vs_real.porcentaje_cumplimiento}%, rgba(255,255,255,0.08) ${presupuesto_vs_real.porcentaje_cumplimiento}% 100%)`,
                }}
              >
                <div className={styles.ringInner}>
                  <span className={styles.ringPct}>{Math.round(presupuesto_vs_real.porcentaje_cumplimiento)}%</span>
                </div>
              </div>
              <div className={styles.ringMeta}>
                <span className={styles.ringMetaNum}>{presupuesto_vs_real.categorias_con_presupuesto}</span> categorías
                con presupuesto
                <br />
                <span className={styles.ringMetaNum}>{presupuesto_vs_real.categorias_excedidas}</span> excedidas este
                mes
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
