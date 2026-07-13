import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useEspacio } from '@/context/EspacioContext'
import { useCategorias } from '@/hooks/useCatalogos'
import { useApi } from '@/hooks/useApi'
import { exportApi, espaciosApi, familiaApi, finanzasApi } from '@/api'
import type { ModoReparto } from '@/api/espacios'
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

const MODOS_REPARTO: { value: ModoReparto; label: string }[] = [
  { value: 'PROPORCIONAL', label: 'Proporcional a los ingresos' },
  { value: 'PARTES_IGUALES', label: 'Partes iguales' },
  { value: 'SIN_REPARTO', label: 'Sin repartición' },
]

function descargarJson(data: unknown, nombre: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function ConfiguracionPage() {
  const { user, refreshUsuario } = useAuth()
  const perfilResumen = user?.nombre ?? ''
  const importInputRef = useRef<HTMLInputElement>(null)

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
  const {
    espacioActivo,
    esFamiliar,
    familiaresActivos,
    necesitaSelectorFamilia,
    ocultarModulosFamiliares,
    setOcultarModulosFamiliares,
    setEspacioActivoId,
  } = useEspacio()

  const [exportandoEspacio, setExportandoEspacio] = useState(false)
  const [importandoEspacio, setImportandoEspacio] = useState(false)
  const [msgEspacio, setMsgEspacio] = useState<string | null>(null)
  const [errEspacio, setErrEspacio] = useState<string | null>(null)
  const [modoReparto, setModoReparto] = useState<ModoReparto>('PROPORCIONAL')
  const [guardandoReparto, setGuardandoReparto] = useState(false)
  const [msgReparto, setMsgReparto] = useState<string | null>(null)
  const [errReparto, setErrReparto] = useState<string | null>(null)
  const [salirPrecheck, setSalirPrecheck] = useState<{ puede_salir: boolean; motivo: string } | null>(null)
  const [saliendoFamilia, setSaliendoFamilia] = useState(false)
  const [msgSalir, setMsgSalir] = useState<string | null>(null)
  const [errSalir, setErrSalir] = useState<string | null>(null)

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

  useEffect(() => {
    if (espacioActivo?.modo_reparto) {
      setModoReparto(espacioActivo.modo_reparto as ModoReparto)
    }
  }, [espacioActivo?.id, espacioActivo?.modo_reparto])

  useEffect(() => {
    if (!user?.familia || ES_DEMO) {
      setSalirPrecheck(null)
      return
    }
    familiaApi.salirFamiliaPrecheck()
      .then(({ data }) => setSalirPrecheck(data))
      .catch(() => setSalirPrecheck(null))
  }, [user?.familia?.id])

  const handleExportarEspacio = async () => {
    if (!espacioActivo || exportandoEspacio) return
    setExportandoEspacio(true)
    setMsgEspacio(null)
    setErrEspacio(null)
    try {
      const { data } = await espaciosApi.exportar(espacioActivo.id)
      const nombre = `respaldo_${espacioActivo.nombre.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`
      descargarJson(data, nombre)
      setMsgEspacio('Respaldo descargado.')
    } catch (e) {
      setErrEspacio(apiErrorMessage(e) || 'No se pudo exportar el espacio.')
    } finally {
      setExportandoEspacio(false)
    }
  }

  const handleImportarEspacio = async (file: File | null) => {
    if (!espacioActivo || !file || importandoEspacio) return
    setImportandoEspacio(true)
    setMsgEspacio(null)
    setErrEspacio(null)
    try {
      const { data } = await espaciosApi.importar(espacioActivo.id, file)
      setMsgEspacio(data.mensaje ?? 'Importación completada.')
    } catch (e) {
      setErrEspacio(apiErrorMessage(e) || 'No se pudo importar el respaldo.')
    } finally {
      setImportandoEspacio(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const handleGuardarModoReparto = async () => {
    if (!espacioActivo || guardandoReparto) return
    setGuardandoReparto(true)
    setMsgReparto(null)
    setErrReparto(null)
    try {
      const { data } = await espaciosApi.actualizar(espacioActivo.id, { modo_reparto: modoReparto })
      setMsgReparto('Modo de reparto actualizado.')
      setModoReparto(data.modo_reparto)
      await refreshUsuario()
    } catch (e) {
      setErrReparto(apiErrorMessage(e) || 'No se pudo actualizar el modo de reparto.')
    } finally {
      setGuardandoReparto(false)
    }
  }

  const handleSalirFamilia = async () => {
    if (saliendoFamilia) return
    if (!window.confirm('¿Salir de la familia? Se copiarán tus datos al espacio personal.')) return
    setSaliendoFamilia(true)
    setMsgSalir(null)
    setErrSalir(null)
    try {
      const { data: resultado } = await familiaApi.salirFamilia()
      await refreshUsuario()
      if (resultado.espacio_personal_id) {
        setEspacioActivoId(resultado.espacio_personal_id)
      } else {
        const personal = user?.espacios?.find(e => e.tipo === 'PERSONAL')
        if (personal) setEspacioActivoId(personal.id)
      }
      setMsgSalir('Has salido de la familia. Tus datos están en tu espacio personal.')
      setSalirPrecheck(null)
    } catch (e) {
      setErrSalir(apiErrorMessage(e) || 'No se pudo salir de la familia.')
    } finally {
      setSaliendoFamilia(false)
    }
  }

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

  const gruposIndice = useMemo(() => {
    const base = ES_DEMO ? GRUPOS_SOLO_DEMO : GRUPOS
    if (familiaresActivos.length === 0 || ocultarModulosFamiliares) {
      return base.filter(g => g.grupo !== 'FAMILIA')
    }
    return base
  }, [familiaresActivos.length, ocultarModulosFamiliares])

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

      {!ES_DEMO && necesitaSelectorFamilia && (
        <section className={styles.section}>
          <h2 className={styles.groupHeader}>FAMILIA ACTIVA</h2>
          <div className={styles.accionBox}>
            <div className={styles.accionInfo}>
              <h3 className={styles.accionTitulo}>Familia para operar en la app</h3>
              <p className={styles.accionTexto}>
                Perteneces a varias familias. Elige cuál usar para movimientos compartidos,
                liquidación, presupuesto y respaldos. Las cuentas personales del menú siguen
                siendo tuyas dentro de esa familia.
              </p>
            </div>
            <select
              className={styles.selectReparto}
              value={espacioActivo?.id ?? ''}
              onChange={e => setEspacioActivoId(Number(e.target.value))}
            >
              {familiaresActivos.map(e => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      {!ES_DEMO && (
        <section className={styles.section}>
          <h2 className={styles.groupHeader}>INTERFAZ</h2>
          <div className={styles.accionBox}>
            <div className={styles.accionInfo}>
              <h3 className={styles.accionTitulo}>Ocultar módulos familiares</h3>
              <p className={styles.accionTexto}>
                Oculta menús y accesos de familia en el sidebar. Útil si aún no perteneces a
                una familia o quieres enfocarte solo en tus cuentas personales.
              </p>
            </div>
            <label className={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={ocultarModulosFamiliares}
                onChange={e => setOcultarModulosFamiliares(e.target.checked)}
              />
              <span>{ocultarModulosFamiliares ? 'Ocultos' : 'Visibles'}</span>
            </label>
          </div>
        </section>
      )}

      {!ES_DEMO && espacioActivo && (
        <section className={styles.section}>
          <h2 className={styles.groupHeader}>RESPALDO ESPACIO</h2>
          <div className={styles.accionBox}>
            <div className={styles.accionInfo}>
              <h3 className={styles.accionTitulo}>
                Respaldo de {espacioActivo.tipo === 'PERSONAL' ? 'espacio personal' : espacioActivo.nombre}
              </h3>
              <p className={styles.accionTexto}>
                Descarga o restaura un JSON con los datos del espacio activo ({espacioActivo.nombre}).
                La importación reemplaza los datos actuales del espacio.
              </p>
            </div>
            <div className={styles.accionBtnsRow}>
              <button
                type="button"
                className={styles.accionBtn}
                onClick={() => void handleExportarEspacio()}
                disabled={exportandoEspacio}
              >
                {exportandoEspacio ? 'Exportando…' : 'Descargar JSON'}
              </button>
              <button
                type="button"
                className={`${styles.accionBtn} ${styles.accionBtnSecondary}`}
                onClick={() => importInputRef.current?.click()}
                disabled={importandoEspacio || espacioActivo.archivado}
              >
                {importandoEspacio ? 'Importando…' : 'Restaurar desde JSON'}
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                className={styles.hiddenFile}
                onChange={e => void handleImportarEspacio(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          {msgEspacio ? <p className={styles.msgOk}>{msgEspacio}</p> : null}
          {errEspacio ? <p className={styles.msgErr}>{errEspacio}</p> : null}
        </section>
      )}

      {!ES_DEMO && esFamiliar && espacioActivo?.rol === 'ADMIN' && !espacioActivo?.archivado && (
        <section className={styles.section}>
          <h2 className={styles.groupHeader}>REPARTO FAMILIAR</h2>
          <div className={styles.accionBox}>
            <div className={styles.accionInfo}>
              <h3 className={styles.accionTitulo}>Modo de reparto</h3>
              <p className={styles.accionTexto}>
                Define cómo se calcula la liquidación de gastos comunes en este espacio familiar.
              </p>
              <select
                className={styles.selectReparto}
                value={modoReparto}
                onChange={e => setModoReparto(e.target.value as ModoReparto)}
              >
                {MODOS_REPARTO.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={styles.accionBtn}
              onClick={() => void handleGuardarModoReparto()}
              disabled={guardandoReparto || modoReparto === espacioActivo?.modo_reparto}
            >
              {guardandoReparto ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
          {msgReparto ? <p className={styles.msgOk}>{msgReparto}</p> : null}
          {errReparto ? <p className={styles.msgErr}>{errReparto}</p> : null}
        </section>
      )}

      {!ES_DEMO && user?.familia && (
        <section className={styles.section}>
          <h2 className={styles.groupHeader}>FAMILIA</h2>
          <div className={styles.accionBox}>
            <div className={styles.accionInfo}>
              <h3 className={styles.accionTitulo}>Salir de la familia</h3>
              <p className={styles.accionTexto}>
                {salirPrecheck?.puede_salir
                  ? 'Se copiarán tus datos al espacio personal. El espacio familiar puede quedar archivado si eres el último miembro.'
                  : salirPrecheck?.motivo ?? 'Comprobando si puedes salir…'}
              </p>
            </div>
            <button
              type="button"
              className={`${styles.accionBtn} ${styles.accionBtnDanger}`}
              onClick={() => void handleSalirFamilia()}
              disabled={saliendoFamilia || salirPrecheck?.puede_salir === false}
            >
              {saliendoFamilia ? 'Saliendo…' : 'Salir de la familia'}
            </button>
          </div>
          {msgSalir ? <p className={styles.msgOk}>{msgSalir}</p> : null}
          {errSalir ? <p className={styles.msgErr}>{errSalir}</p> : null}
        </section>
      )}

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
