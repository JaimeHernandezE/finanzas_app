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
  const resumenPorUsuario = useMemo(() => {
    const porId = new Map<
      number,
      {
        usuario_id: number
        nombre: string
        sueldo_declarado: number
        prorrateo_pct: string
        gasto_prorrateado: number
        gasto_neto: number
        diferencia: number
      }
    >()

    const ensure = (usuario_id: number, nombre: string) => {
      const existente = porId.get(usuario_id)
      if (existente) return existente
      const nuevo = {
        usuario_id,
        nombre,
        sueldo_declarado: 0,
        prorrateo_pct: '0',
        gasto_prorrateado: 0,
        gasto_neto: 0,
        diferencia: 0,
      }
      porId.set(usuario_id, nuevo)
      return nuevo
    }

    for (const row of mes.sueldos_por_usuario) {
      ensure(row.usuario_id, row.nombre).sueldo_declarado = toNum(row.total)
    }
    for (const row of mes.prorrateo_por_usuario) {
      const user = ensure(row.usuario_id, row.nombre)
      user.prorrateo_pct = row.porcentaje
    }
    for (const row of mes.compensacion.por_usuario) {
      const user = ensure(row.usuario_id, row.nombre)
      user.gasto_prorrateado = toNum(row.gasto_prorrateado)
      user.gasto_neto = toNum(row.pagado_efectivo)
      user.diferencia = toNum(row.diferencia)
    }

    return Array.from(porId.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [mes])
  const transferenciasSugeridas = useMemo(() => {
    type SaldoUsuario = { usuario_id: number; nombre: string; saldo: number }
    const deudores: SaldoUsuario[] = []
    const acreedores: SaldoUsuario[] = []

    for (const row of mes.compensacion.por_usuario) {
      const diferencia = toNum(row.diferencia)
      if (diferencia > 0) {
        // diferencia positiva: pagó menos de lo que debía gastar
        deudores.push({ usuario_id: row.usuario_id, nombre: row.nombre, saldo: diferencia })
      } else if (diferencia < 0) {
        // diferencia negativa: pagó de más y debe recibir
        acreedores.push({ usuario_id: row.usuario_id, nombre: row.nombre, saldo: Math.abs(diferencia) })
      }
    }

    const resultado: {
      de_usuario_id: number
      de_nombre: string
      a_usuario_id: number
      a_nombre: string
      monto: number
    }[] = []
    const EPS = 0.005
    let i = 0
    let j = 0
    while (i < deudores.length && j < acreedores.length) {
      const deudor = deudores[i]
      const acreedor = acreedores[j]
      const monto = Math.min(deudor.saldo, acreedor.saldo)
      if (monto > EPS) {
        resultado.push({
          de_usuario_id: deudor.usuario_id,
          de_nombre: deudor.nombre,
          a_usuario_id: acreedor.usuario_id,
          a_nombre: acreedor.nombre,
          monto,
        })
      }
      deudor.saldo -= monto
      acreedor.saldo -= monto
      if (deudor.saldo <= EPS) i += 1
      if (acreedor.saldo <= EPS) j += 1
    }

    return resultado
  }, [mes.compensacion.por_usuario])

  return (
    <article className={styles.mesCard}>
      <section className={styles.mesHeader}>
        <h2 className={styles.mesTitulo}>
          {MESES[mes.mes - 1]} {mes.anio}
        </h2>
        <span className={styles.mesTotal}>
          Real común familiar (ing. − egr.): {formatMonto(toNum(mes.gasto_comun_total))}
        </span>
        <p className={styles.baseProrrateo}>
          Prorrateo según ingresos comunes de: {labelBase}. {base_prorrateo.nota}
        </p>
      </section>

      <div className={styles.mesBody}>
        <section>
          <h3 className={styles.bloqueTitulo}>Resumen por usuario</h3>
          <div className={styles.tablaWrap}>
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th className={styles.num}>Sueldos declarados</th>
                  <th className={styles.num}>Prorrateo</th>
                  <th className={styles.num}>Gasto prorrateado</th>
                  <th className={styles.num}>Gasto real</th>
                  <th className={styles.num}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {resumenPorUsuario.map(row => (
                  <tr key={row.usuario_id}>
                    <td>{row.nombre}</td>
                    <td className={styles.num}>{formatMonto(row.sueldo_declarado)}</td>
                    <td className={styles.num}>{row.prorrateo_pct}%</td>
                    <td className={styles.num}>{formatMonto(row.gasto_prorrateado)}</td>
                    <td className={styles.num}>{formatMonto(row.gasto_neto)}</td>
                    <td className={styles.num}>{formatMonto(row.diferencia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className={styles.bloqueTitulo}>Transferencias sugeridas</h3>
          {transferenciasSugeridas.length === 0 ? (
            <p className={styles.vacio} style={{ padding: 12 }}>
              Sin transferencias necesarias (diferencias en cero o mínimas).
            </p>
          ) : (
            <ul className={styles.transferencias}>
              {transferenciasSugeridas.map((t, i) => (
                <li key={`${t.de_usuario_id}-${t.a_usuario_id}-${i}`} className={styles.transferItem}>
                  <strong>{t.de_nombre}</strong> paga a <strong>{t.a_nombre}</strong>:{' '}
                  {formatMonto(t.monto)}
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
        Neto familiar y posiciones por usuario = ingresos − egresos. Prorrateo y compensación
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
