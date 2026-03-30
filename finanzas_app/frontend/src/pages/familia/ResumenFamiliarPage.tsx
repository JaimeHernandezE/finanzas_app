import { useMemo } from 'react'
import { useApi } from '@/hooks/useApi'
import { finanzasApi } from '@/api'
import type { ResumenHistoricoMes } from '@/api/finanzas'
import { Cargando, ErrorCarga } from '@/components/ui'
import { useConfig } from '@/context/ConfigContext'
import styles from './ResumenFamiliarPage.module.scss'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function toNum(s: string): number {
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

function BloqueMes({ mes, formatMonto }: { mes: ResumenHistoricoMes; formatMonto: (n: number) => string }) {
  const { base_prorrateo } = mes
  const labelBase = `${MESES[base_prorrateo.mes - 1]} ${base_prorrateo.anio}`

  return (
    <article className={styles.mesCard}>
      <section className={styles.mesHeader}>
        <h2 className={styles.mesTitulo}>
          {MESES[mes.mes - 1]} {mes.anio}
        </h2>
        <span className={styles.mesTotal}>
          Neto común familiar (ing. − egr.): {formatMonto(toNum(mes.gasto_comun_total))}
        </span>
        <p className={styles.baseProrrateo}>
          Prorrateo según ingresos comunes de: {labelBase}. {base_prorrateo.nota}
        </p>
      </section>

      <div className={styles.mesBody}>
        <section>
          <h3 className={styles.bloqueTitulo}>Posición neta por usuario (ing. − egr., efectivo / débito)</h3>
          <div className={styles.tablaWrap}>
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th className={styles.num}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {mes.gastos_comunes_por_usuario.map(row => (
                  <tr key={row.usuario_id}>
                    <td>{row.nombre}</td>
                    <td className={styles.num}>{formatMonto(toNum(row.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className={styles.bloqueTitulo}>Sueldos declarados (mes)</h3>
          <div className={styles.tablaWrap}>
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th className={styles.num}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {mes.sueldos_por_usuario.map(row => (
                  <tr key={row.usuario_id}>
                    <td>{row.nombre}</td>
                    <td className={styles.num}>{formatMonto(toNum(row.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className={styles.bloqueTitulo}>Prorrateo (mismo mes que gastos comunes)</h3>
          <div className={styles.tablaWrap}>
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th className={styles.num}>%</th>
                  <th className={styles.num}>Ingreso común (mes)</th>
                </tr>
              </thead>
              <tbody>
                {mes.prorrateo_por_usuario.map(row => (
                  <tr key={row.usuario_id}>
                    <td>{row.nombre}</td>
                    <td className={styles.num}>{row.porcentaje}%</td>
                    <td className={styles.num}>{formatMonto(toNum(row.ingreso_comun_mes))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className={styles.bloqueTitulo}>Cuota sobre el neto familiar (prorrateado)</h3>
          <div className={styles.tablaWrap}>
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th className={styles.num}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {mes.gasto_comun_prorrateado_por_usuario.map(row => (
                  <tr key={row.usuario_id}>
                    <td>{row.nombre}</td>
                    <td className={styles.num}>{formatMonto(toNum(row.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className={styles.bloqueTitulo}>Compensación (neto vs prorrateado)</h3>
          <div className={styles.tablaWrap}>
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th className={styles.num}>Neto</th>
                  <th className={styles.num}>Prorrateado</th>
                  <th className={styles.num}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {mes.compensacion.por_usuario.map(row => (
                  <tr key={row.usuario_id}>
                    <td>{row.nombre}</td>
                    <td className={styles.num}>{formatMonto(toNum(row.pagado_efectivo))}</td>
                    <td className={styles.num}>{formatMonto(toNum(row.gasto_prorrateado))}</td>
                    <td className={styles.num}>{formatMonto(toNum(row.diferencia))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className={styles.bloqueTitulo}>Transferencias sugeridas</h3>
          {mes.compensacion.transferencias_sugeridas.length === 0 ? (
            <p className={styles.vacio} style={{ padding: 12 }}>
              Sin transferencias necesarias (diferencias en cero o mínimas).
            </p>
          ) : (
            <ul className={styles.transferencias}>
              {mes.compensacion.transferencias_sugeridas.map((t, i) => (
                <li key={`${t.de_usuario_id}-${t.a_usuario_id}-${i}`} className={styles.transferItem}>
                  <strong>{t.de_nombre}</strong> paga a <strong>{t.a_nombre}</strong>:{' '}
                  {formatMonto(toNum(t.monto))}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </article>
  )
}

export default function ResumenFamiliarPage() {
  const { formatMonto } = useConfig()
  const { data, loading, error } = useApi(() => finanzasApi.getResumenHistorico(), [])

  const meses = useMemo(() => {
    const list = data?.meses ?? []
    return [...list].reverse()
  }, [data])

  if (loading) return <Cargando />
  if (error) return <ErrorCarga mensaje={error} />

  return (
    <div className={styles.page}>
      <h1 className={styles.titulo}>Resumen histórico</h1>
      <p className={styles.subtitulo}>
        Neto familiar y posiciones por usuario = ingresos − egresos (COMÚN, sin crédito). Prorrateo y compensación
        usan ese neto y los ingresos comunes declarados del mes. Útil para alinear el efectivo con tu planilla.
      </p>

      {data?.recalculo?.pendiente && (
        <p className={styles.avisoRecalculo}>
          Hay recálculo de histórico pendiente; los totales pueden actualizarse al ejecutar el mantenimiento.
        </p>
      )}

      {meses.length === 0 ? (
        <p className={styles.vacio}>Aún no hay datos de movimientos o sueldos para mostrar.</p>
      ) : (
        meses.map(m => <BloqueMes key={`${m.anio}-${m.mes}`} mes={m} formatMonto={formatMonto} />)
      )}
    </div>
  )
}
