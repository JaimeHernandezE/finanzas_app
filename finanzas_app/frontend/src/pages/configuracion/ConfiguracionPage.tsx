import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useEspacio } from '@/context/EspacioContext'
import { useCategorias } from '@/hooks/useCatalogos'
import { useApi } from '@/hooks/useApi'
import { exportApi, familiaApi, finanzasApi } from '@/api'
import { driveApi } from '@/api/drive'
import { apiErrorMessage } from '@/utils/apiErrorMessage'
import { esViteDemo } from '@/firebase'
import styles from './ConfiguracionPage.module.scss'

// -----------------------------------------------------------------------------
// Índice (resúmenes desde API)
// -----------------------------------------------------------------------------

const GRUPOS = [
  {
    grupo: 'CUENTA',
    items: [{ icon: '◉', label: 'Perfil', to: '/configuracion/perfil' as const }],
  },
  {
    grupo: 'FINANZAS',
    items: [
      { icon: '▤', label: 'Categorías', to: '/configuracion/categorias' as const },
      { icon: '◫', label: 'Cuentas personales', to: '/configuracion/cuentas' as const },
      { icon: '⇪', label: 'Importar cuenta personal', to: '/configuracion/importar-cuenta-personal' as const },
      { icon: '⇪', label: 'Importar honorarios', to: '/configuracion/importar-honorarios' as const },
      { icon: '⇪', label: 'Importar sueldos', to: '/configuracion/importar-sueldos' as const },
      { icon: '⇪', label: 'Importar gastos comunes', to: '/configuracion/importar-gastos-comunes' as const },
    ],
  },
  {
    grupo: 'FAMILIA',
    items: [
      { icon: '✉', label: 'Invitaciones recibidas', to: '/configuracion/invitaciones' as const },
      { icon: '◎', label: 'Miembros', to: '/configuracion/miembros' as const },
    ],
  },
] as const

function textoCategorias(loading: boolean, error: string | null, n: number | undefined) {
  if (loading && n === undefined) return '…'
  if (error) return '—'
  const c = n ?? 0
  return c === 1 ? '1 categoría' : `${c} categorías`
}

function textoMiembros(loading: boolean, error: string | null, n: number | undefined) {
  if (loading && n === undefined) return '…'
  if (error) return '—'
  const c = n ?? 0
  return c === 1 ? '1 miembro' : `${c} miembros`
}

function textoCuentas(loading: boolean, error: string | null, n: number | undefined) {
  if (loading && n === undefined) return '…'
  if (error) return '—'
  const c = n ?? 0
  return c === 1 ? '1 cuenta personal' : `${c} cuentas personales`
}

// -----------------------------------------------------------------------------
// Página
// -----------------------------------------------------------------------------

const ES_DEMO = esViteDemo()

const GRUPOS_SOLO_DEMO = [
  {
    grupo: 'FINANZAS',
    items: [{ icon: '▤', label: 'Categorías', to: '/configuracion/categorias' as const }],
  },
] as const

export default function ConfiguracionPage() {
  const { user } = useAuth()
  const perfilResumen = user?.nombre ?? ''

  const {
    data: categoriasRaw,
    loading: loadCats,
    error: errCats,
  } = useCategorias()
  const nCats = categoriasRaw !== null && categoriasRaw !== undefined ? categoriasRaw.length : undefined

  const {
    data: miembrosRaw,
    loading: loadM,
    error: errM,
  } = useApi(() => familiaApi.getMiembros(), [])
  const nM =
    miembrosRaw !== null && miembrosRaw !== undefined ? miembrosRaw.length : undefined

  const {
    data: cuentasRaw,
    loading: loadC,
    error: errC,
  } = useApi(() => finanzasApi.getCuentasPersonales(), [])
  const nC =
    cuentasRaw !== null && cuentasRaw !== undefined ? cuentasRaw.length : undefined
  const [recalculando, setRecalculando] = useState(false)
  const [msgRecalculo, setMsgRecalculo] = useState<string | null>(null)
  const [errRecalculo, setErrRecalculo] = useState<string | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [msgSheets, setMsgSheets] = useState<string | null>(null)
  const [errSheets, setErrSheets] = useState<string | null>(null)
  const esAdmin = user?.rol === 'ADMIN'
  const { espacioActivo } = useEspacio()

  const [searchParams, setSearchParams] = useSearchParams()
  const [driveConnected, setDriveConnected] = useState(false)
  const [driveEmail, setDriveEmail] = useState('')
  const [driveLoading, setDriveLoading] = useState(true)
  const [driveConnecting, setDriveConnecting] = useState(false)
  const [driveBacking, setDriveBacking] = useState(false)
  const [msgDrive, setMsgDrive] = useState<string | null>(null)
  const [errDrive, setErrDrive] = useState<string | null>(null)

  useEffect(() => {
    driveApi.status()
      .then(({ data }) => {
        setDriveConnected(data.connected)
        setDriveEmail(data.email)
      })
      .catch(() => {})
      .finally(() => setDriveLoading(false))
  }, [])

  useEffect(() => {
    if (searchParams.get('drive_connected') === '1') {
      setMsgDrive('Google Drive conectado correctamente.')
      setDriveConnected(true)
      driveApi.status().then(({ data }) => {
        setDriveEmail(data.email)
        setDriveConnected(data.connected)
      }).catch(() => {})
      searchParams.delete('drive_connected')
      setSearchParams(searchParams, { replace: true })
    }
    const driveError = searchParams.get('drive_error')
    if (driveError) {
      setErrDrive(`Error al conectar Drive: ${driveError}`)
      searchParams.delete('drive_error')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const handleDriveConnect = async () => {
    setDriveConnecting(true)
    setMsgDrive(null)
    setErrDrive(null)
    try {
      const { data } = await driveApi.connect()
      window.location.href = data.auth_url
    } catch (e) {
      setErrDrive(apiErrorMessage(e) || 'No se pudo iniciar la conexión con Drive.')
      setDriveConnecting(false)
    }
  }

  const handleDriveDisconnect = async () => {
    setMsgDrive(null)
    setErrDrive(null)
    try {
      await driveApi.disconnect()
      setDriveConnected(false)
      setDriveEmail('')
      setMsgDrive('Google Drive desconectado.')
    } catch (e) {
      setErrDrive(apiErrorMessage(e) || 'No se pudo desconectar Drive.')
    }
  }

  const handleDriveBackup = async () => {
    if (!espacioActivo || driveBacking) return
    setDriveBacking(true)
    setMsgDrive(null)
    setErrDrive(null)
    try {
      const { data } = await driveApi.backupEspacio(espacioActivo.id)
      const msg = `Respaldo subido: ${data.archivo.nombre}`
        + (data.eliminados > 0 ? ` (${data.eliminados} antiguo(s) eliminado(s))` : '')
      setMsgDrive(msg)
    } catch (e) {
      setErrDrive(apiErrorMessage(e) || 'No se pudo subir el respaldo a Drive.')
    } finally {
      setDriveBacking(false)
    }
  }

  const ejecutarRecalculoHistorico = async () => {
    if (recalculando) return
    setRecalculando(true)
    setMsgRecalculo(null)
    setErrRecalculo(null)
    try {
      const { data } = await finanzasApi.recalcularHistorico()
      if (!data.procesado) {
        setMsgRecalculo(data.detalle ?? 'No hay datos para recalcular.')
      } else {
        const nRh = data.meses_resumen_historico_familia
        const nSu = data.meses_saldos_personales_usuario
        const cr = data.cuotas_reparadas
        const extra =
          nRh != null || nSu != null
            ? ` Resumen familiar: ${nRh ?? '—'} meses; tus cuentas personales: ${nSu ?? '—'} meses.`
            : ''
        const extraCuotas = cr
          ? ` Cuotas crédito reparadas: ${cr.cuotas_creadas} creadas, ${cr.cuotas_actualizadas} actualizadas, ${cr.cuotas_eliminadas} eliminadas.`
          : ''
        setMsgRecalculo(
          `Recálculo histórico completado (${data.desde ?? 'inicio'} → ${data.hasta ?? 'hoy'}).${extra}${extraCuotas}`
        )
      }
    } catch (e: unknown) {
      setErrRecalculo(apiErrorMessage(e) || 'No se pudo ejecutar el recálculo histórico.')
    } finally {
      setRecalculando(false)
    }
  }

  const ejecutarSincronizarSheets = async () => {
    if (sincronizando) return
    setSincronizando(true)
    setMsgSheets(null)
    setErrSheets(null)
    try {
      const { data } = await exportApi.sincronizarGoogleSheets()
      if (data.ok && data.resumen?.length) {
        const total = data.resumen.reduce((a, r) => a + r.filas, 0)
        setMsgSheets(
          `Google Sheets actualizado: ${data.resumen.length} hoja(s), ${total} filas de datos en total.`
        )
      } else {
        setMsgSheets('Sincronización completada.')
      }
    } catch (e: unknown) {
      setErrSheets(apiErrorMessage(e) || 'No se pudo sincronizar con Google Sheets.')
    } finally {
      setSincronizando(false)
    }
  }

  const resumenPorRuta = useMemo(
    () => ({
      '/configuracion/categorias': textoCategorias(loadCats, errCats, nCats),
      '/configuracion/invitaciones': user?.familia ? '—' : 'Pendiente',
      '/configuracion/miembros': textoMiembros(loadM, errM, nM),
      '/configuracion/cuentas': textoCuentas(loadC, errC, nC),
      '/configuracion/importar-cuenta-personal': 'CSV',
      '/configuracion/importar-honorarios': 'CSV',
      '/configuracion/importar-sueldos': 'CSV',
      '/configuracion/importar-gastos-comunes': 'CSV',
    }),
    [loadCats, errCats, nCats, loadM, errM, nM, loadC, errC, nC, user?.familia]
  )

  const gruposIndice = ES_DEMO ? GRUPOS_SOLO_DEMO : GRUPOS

  return (
    <div className={`${styles.page} ${styles.fadeUp}`}>
      <h1 className={styles.titulo}>Configuración</h1>
      {ES_DEMO ? (
        <p className={styles.demoAviso}>
          En el entorno demo solo está disponible la sección de categorías.
        </p>
      ) : null}

      {gruposIndice.map((g) => (
        <section key={g.grupo} className={styles.section}>
          <h2 className={styles.groupHeader}>{g.grupo}</h2>
          <ul className={styles.list}>
            {g.items.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className={styles.itemLink}>
                  <span className={styles.itemIcon} aria-hidden>
                    {item.icon}
                  </span>
                  <span className={styles.itemLabel}>{item.label}</span>
                  <span className={styles.itemResumen}>
                    {item.to === '/configuracion/perfil'
                      ? perfilResumen
                      : resumenPorRuta[item.to]}
                  </span>
                  <span className={styles.itemChevron} aria-hidden>
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {ES_DEMO ? null : (
      <section className={styles.section}>
        <h2 className={styles.groupHeader}>MANTENIMIENTO</h2>
        {esAdmin ? (
          <ul className={`${styles.list} ${styles.listSpaced}`}>
            <li>
              <Link to="/configuracion/respaldo-bd" className={styles.itemLink}>
                <span className={styles.itemIcon} aria-hidden>
                  ⧉
                </span>
                <span className={styles.itemLabel}>Respaldo PostgreSQL</span>
                <span className={styles.itemResumen}>Dump / Drive</span>
                <span className={styles.itemChevron} aria-hidden>
                  ›
                </span>
              </Link>
            </li>
          </ul>
        ) : null}
        <div className={styles.accionBox}>
          <div className={styles.accionInfo}>
            <h3 className={styles.accionTitulo}>Recálculo histórico mensual</h3>
            <p className={styles.accionTexto}>
              Actualiza liquidación común, saldos por cuenta de la familia, snapshots del resumen familiar
              por mes, vuelve a generar los saldos mensuales de tus cuentas personales y repara cuotas de tarjeta
              para corregir posibles inconsistencias.
            </p>
          </div>
          <button
            type="button"
            className={styles.accionBtn}
            onClick={ejecutarRecalculoHistorico}
            disabled={recalculando}
          >
            {recalculando ? 'Recalculando...' : 'Recalcular histórico'}
          </button>
        </div>
        {msgRecalculo ? <p className={styles.msgOk}>{msgRecalculo}</p> : null}
        {errRecalculo ? <p className={styles.msgErr}>{errRecalculo}</p> : null}

        {!driveLoading && (
          <div className={`${styles.accionBox} ${styles.accionBoxSpaced}`}>
            <div className={styles.accionInfo}>
              <h3 className={styles.accionTitulo}>Google Drive</h3>
              {driveConnected ? (
                <p className={styles.accionTexto}>
                  Conectado como <strong>{driveEmail || '—'}</strong>. Los respaldos se guardan en
                  la carpeta "Finanzas App Backups" de tu Drive.
                </p>
              ) : (
                <p className={styles.accionTexto}>
                  Conecta tu cuenta de Google para guardar respaldos de tus espacios directamente
                  en tu Google Drive personal.
                </p>
              )}
            </div>
            {driveConnected ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={styles.accionBtn}
                  onClick={handleDriveBackup}
                  disabled={driveBacking || !espacioActivo}
                >
                  {driveBacking ? 'Subiendo...' : `Respaldar ${espacioActivo?.nombre ?? 'espacio'}`}
                </button>
                <button
                  type="button"
                  className={`${styles.accionBtn} ${styles.accionBtnSecondary}`}
                  onClick={handleDriveDisconnect}
                >
                  Desconectar
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={styles.accionBtn}
                onClick={handleDriveConnect}
                disabled={driveConnecting}
              >
                {driveConnecting ? 'Redirigiendo...' : 'Conectar Google Drive'}
              </button>
            )}
          </div>
        )}
        {msgDrive ? <p className={styles.msgOk}>{msgDrive}</p> : null}
        {errDrive ? <p className={styles.msgErr}>{errDrive}</p> : null}

        {esAdmin ? (
          <>
            <div className={`${styles.accionBox} ${styles.accionBoxSpaced}`}>
              <div className={styles.accionInfo}>
                <h3 className={styles.accionTitulo}>Respaldo en Google Sheets</h3>
                <p className={styles.accionTexto}>
                  Vuelca los datos de la base al spreadsheet configurado en el servidor (mismas hojas que el
                  respaldo diario automático).
                </p>
              </div>
              <button
                type="button"
                className={styles.accionBtn}
                onClick={ejecutarSincronizarSheets}
                disabled={sincronizando}
              >
                {sincronizando ? 'Sincronizando...' : 'Sincronizar ahora'}
              </button>
            </div>
            {msgSheets ? <p className={styles.msgOk}>{msgSheets}</p> : null}
            {errSheets ? <p className={styles.msgErr}>{errSheets}</p> : null}
          </>
        ) : null}
      </section>
      )}
    </div>
  )
}
