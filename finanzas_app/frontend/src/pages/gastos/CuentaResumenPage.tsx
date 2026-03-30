import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApi } from '@/hooks/useApi'
import { useCuentasPersonales } from '@/hooks/useCuentasPersonales'
import { finanzasApi } from '@/api/finanzas'
import { Cargando, ErrorCarga } from '@/components/ui'
import { useConfig } from '@/context/ConfigContext'
import styles from './CuentaPage.module.scss'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function parseMonto(s: string): number {
  const n = Number(String(s).trim())
  return Number.isFinite(n) ? n : 0
}

export default function CuentaResumenPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { formatMonto } = useConfig()
  const cuentaId = id ? Number(id) : NaN

  const { data: cuentasData, loading: cuentasLoading, error: cuentasError } =
    useCuentasPersonales()

  const cuentaOk = useMemo(
    () => (cuentasData ?? []).some(c => c.id === cuentaId),
    [cuentasData, cuentaId],
  )

  const listo = !cuentasLoading && Number.isFinite(cuentaId) && cuentaOk

  const { data, loading, error } = useApi(
    async () => {
      if (!listo) {
        return { data: null }
      }
      return finanzasApi.getCuentaResumenMensual(cuentaId)
    },
    [cuentaId, listo],
  )

  const meses = data?.meses ?? []
  const sumaPeriodos = useMemo(() => {
    return meses.reduce(
      (acc, row) => ({
        ingresos: acc.ingresos + parseMonto(row.ingresos),
        egresos: acc.egresos + parseMonto(row.egresos),
        neto: acc.neto + parseMonto(row.efectivo_neto),
      }),
      { ingresos: 0, egresos: 0, neto: 0 },
    )
  }, [meses])

  if (!Number.isFinite(cuentaId)) {
    return <ErrorCarga mensaje="Cuenta no válida." />
  }

  if (cuentasLoading) return <Cargando />
  if (cuentasError) return <ErrorCarga mensaje={cuentasError} />
  if (!cuentaOk) {
    return (
      <ErrorCarga mensaje="Cuenta no encontrada o sin acceso." />
    )
  }

  if (loading) return <Cargando />
  if (error) return <ErrorCarga mensaje={error} />

  const nombre = data?.cuenta?.nombre ?? 'Cuenta'
  const pendiente = data?.recalculo?.pendiente

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.tituloWrap}>
            <h1 className={styles.titulo}>Resumen mensual</h1>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
            {nombre}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#9ca3af' }}>
            Solo meses cerrados; el mes en curso aparece al cambiar de mes.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={() => navigate(`/gastos/cuenta/${id}`)}
          >
            ← Volver al listado
          </button>
        </div>
      </div>

      {pendiente && (
        <p style={{ fontSize: 13, color: '#92400e', marginBottom: 16 }}>
          Hay recálculo pendiente; los totales pueden actualizarse al ejecutar el mantenimiento.
        </p>
      )}

      <div className={styles.resumenCard}>
        {meses.length === 0 ? (
          <p className={styles.resumenEmpty}>Sin movimientos en efectivo o débito en esta cuenta.</p>
        ) : (
          <table className={styles.resumenTable}>
            <thead>
              <tr>
                <th className={styles.resumenTh}>Mes</th>
                <th className={styles.resumenTh}>Ingresos</th>
                <th className={styles.resumenTh}>Egresos</th>
                <th className={styles.resumenTh}>Neto</th>
              </tr>
            </thead>
            <tbody>
              <tr className={styles.resumenRowInfo}>
                <td className={`${styles.resumenTd} ${styles.resumenTdMes}`}>
                  <div className={styles.resumenInfoLabel}>
                    <span className={styles.resumenInfoTitulo}>Total (todos los períodos)</span>
                    <span className={styles.resumenInfoHint}>
                      Suma de ingresos, egresos y neto de todas las filas de la tabla.
                    </span>
                  </div>
                </td>
                <td className={`${styles.resumenTd} ${styles.resumenTdPos}`}>
                  +{formatMonto(sumaPeriodos.ingresos)}
                </td>
                <td className={styles.resumenTd}>{formatMonto(sumaPeriodos.egresos)}</td>
                <td
                  className={`${styles.resumenTd} ${
                    sumaPeriodos.neto >= 0 ? styles.resumenTdPos : styles.resumenTdNeg
                  }`}
                >
                  {sumaPeriodos.neto >= 0 ? '+' : '−'}
                  {formatMonto(Math.abs(sumaPeriodos.neto))}
                </td>
              </tr>
              {meses.map(row => {
                const neto = parseMonto(row.efectivo_neto)
                return (
                  <tr key={`${row.anio}-${row.mes}`}>
                    <td className={`${styles.resumenTd} ${styles.resumenTdMes}`}>
                      {MESES[row.mes - 1]} {row.anio}
                    </td>
                    <td className={`${styles.resumenTd} ${styles.resumenTdPos}`}>
                      +{formatMonto(parseMonto(row.ingresos))}
                    </td>
                    <td className={styles.resumenTd}>
                      {formatMonto(parseMonto(row.egresos))}
                    </td>
                    <td
                      className={`${styles.resumenTd} ${
                        neto >= 0 ? styles.resumenTdPos : styles.resumenTdNeg
                      }`}
                    >
                      {neto >= 0 ? '+' : '−'}
                      {formatMonto(Math.abs(neto))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
