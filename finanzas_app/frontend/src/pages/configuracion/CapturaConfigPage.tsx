import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  pendientesApi,
  type CapturaCorreoConfig,
} from '@/api/pendientes'
import { Cargando, ErrorCarga } from '@/components/ui'
import { apiErrorMessage } from '@/utils/apiErrorMessage'
import styles from './CapturaConfigPage.module.scss'

export default function CapturaConfigPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [correo, setCorreo] = useState<CapturaCorreoConfig | null>(null)
  const [remitentes, setRemitentes] = useState<string[]>([])
  const [remitenteNuevo, setRemitenteNuevo] = useState('')
  const [intervalo, setIntervalo] = useState(15)
  const [notifActivas, setNotifActivas] = useState(true)

  const aplicarCorreo = (data: CapturaCorreoConfig) => {
    setCorreo(data)
    setRemitentes(data.remitentes_banco || [])
    setIntervalo(data.intervalo_minutos)
    setNotifActivas(data.notificaciones_activas)
  }

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const correoRes = await pendientesApi.getCorreo()
      aplicarCorreo(correoRes.data)
    } catch (e) {
      setError(apiErrorMessage(e, 'No se pudo cargar la configuración de captura.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    const ok = searchParams.get('correo_oauth')
    const err = searchParams.get('correo_oauth_error')
    if (ok === '1') {
      setOkMsg('Correo conectado correctamente.')
      setSearchParams({}, { replace: true })
      void cargar()
    } else if (err) {
      const mensajes: Record<string, string> = {
        invalid_client_secret:
          'Secret de Microsoft inválido: en Azure → Certificates & secrets copia el Value '
          + '(texto largo), no el Secret ID (GUID). Luego recrea el secreto si ya no ves el Value, '
          + 'actualiza MICROSOFT_OAUTH_CLIENT_SECRET en .env y reinicia docker-compose up -d web.',
        redirect_mismatch:
          'El redirect URI no coincide. En Azure debe estar exactamente: '
          + 'http://localhost:8000/api/finanzas/captura/correo/oauth/callback/microsoft/',
        token_exchange:
          'Falló el intercambio de token con Microsoft. Revisa Client ID, Secret (Value) '
          + 'y el redirect URI en Azure.',
        no_code: 'Microsoft no devolvió código de autorización.',
        invalid_state: 'Sesión OAuth inválida o expirada. Intenta conectar de nuevo.',
      }
      setError(mensajes[err] ?? `No se pudo conectar el correo (${err}).`)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, cargar])

  const agregarRemitente = () => {
    const s = remitenteNuevo.trim().toLowerCase()
    if (!s || !s.includes('@')) {
      setError('El remitente debe ser un email o un dominio con @ (ej. @bci.cl).')
      return
    }
    if (remitentes.includes(s)) {
      setRemitenteNuevo('')
      return
    }
    setRemitentes([...remitentes, s])
    setRemitenteNuevo('')
    setError(null)
  }

  const guardarPrefs = async () => {
    setBusy(true)
    setError(null)
    setOkMsg(null)
    try {
      const { data } = await pendientesApi.updateCorreoPrefs({
        remitentes_banco: remitentes,
        intervalo_minutos: intervalo,
        notificaciones_activas: notifActivas,
      })
      aplicarCorreo(data)
      setOkMsg('Preferencias guardadas.')
    } catch (e) {
      setError(apiErrorMessage(e, 'No se pudieron guardar las preferencias.'))
    } finally {
      setBusy(false)
    }
  }

  const conectarOAuth = async (proveedor: 'GMAIL' | 'OUTLOOK') => {
    setBusy(true)
    setError(null)
    setOkMsg(null)
    try {
      const { data } = await pendientesApi.oauthConnect(proveedor)
      window.location.href = data.auth_url
    } catch (e) {
      setError(apiErrorMessage(e, 'No se pudo iniciar la conexión OAuth.'))
      setBusy(false)
    }
  }

  const probarCorreo = async () => {
    setBusy(true)
    setError(null)
    setOkMsg(null)
    try {
      const { data } = await pendientesApi.probarCorreo()
      setOkMsg(data.mensaje || 'Conexión correcta.')
    } catch (e) {
      setError(apiErrorMessage(e, 'Prueba de conexión fallida.'))
    } finally {
      setBusy(false)
    }
  }

  const desconectarCorreo = async () => {
    setBusy(true)
    setError(null)
    setOkMsg(null)
    try {
      const { data } = await pendientesApi.desconectarCorreo()
      aplicarCorreo(data)
      setOkMsg('Correo desconectado.')
    } catch (e) {
      setError(apiErrorMessage(e, 'No se pudo desconectar.'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Cargando />

  const minIntervalo = correo?.intervalo_minimo_permitido ?? 5

  return (
    <div className={styles.page}>
      <Link to="/configuracion" className={styles.back}>← Configuración</Link>
      <h1 className={styles.title}>Captura</h1>
      <p className={styles.sub}>
        Conecta tu correo con un clic y registra los remitentes de tu banco.
        Confirma pendientes aquí o en <Link to="/pendientes">Pendientes</Link>.
      </p>

      {error ? <ErrorCarga mensaje={error} /> : null}
      {okMsg ? <p className={styles.okMsg}>{okMsg}</p> : null}

      <section className={styles.block}>
        <h2>Correo bancario</h2>
        <p className={styles.help}>
          Conecta Gmail u Outlook/Hotmail. No necesitas contraseña de aplicación:
          autorizas la app en el proveedor (como Drive).
        </p>

        {correo?.conectado ? (
          <>
            <p className={styles.status}>
              Conectado · {correo.proveedor === 'GMAIL' ? 'Gmail' : 'Outlook'} · {correo.email}
              {correo.ultimo_sync_at
                ? ` · Última sync: ${new Date(correo.ultimo_sync_at).toLocaleString('es-CL')}`
                : ''}
            </p>
            {correo.ultimo_error ? (
              <p className={styles.errorInline}>{correo.ultimo_error}</p>
            ) : null}
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnSecondary}
                disabled={busy}
                onClick={() => void probarCorreo()}
              >
                Probar conexión
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={busy}
                onClick={() => void desconectarCorreo()}
              >
                Desconectar
              </button>
            </div>
          </>
        ) : (
          <div className={styles.actions}>
            <button type="button" disabled={busy} onClick={() => void conectarOAuth('GMAIL')}>
              Conectar Gmail
            </button>
            <button
              type="button"
              className={styles.btnSecondary}
              disabled={busy}
              onClick={() => void conectarOAuth('OUTLOOK')}
            >
              Conectar Outlook / Hotmail
            </button>
          </div>
        )}

        <div className={styles.field} style={{ marginTop: 16 }}>
          <span>Remitentes de bancos</span>
          <p className={styles.helpInline}>
            Ej. <code>alertas@bci.cl</code> o <code>@santander.cl</code>. Solo esos correos
            generan pendientes.
          </p>
          <div className={styles.remitenteRow}>
            <input
              type="text"
              value={remitenteNuevo}
              onChange={e => setRemitenteNuevo(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  agregarRemitente()
                }
              }}
              placeholder="alertas@banco.cl"
            />
            <button type="button" className={styles.btnSecondary} onClick={agregarRemitente}>
              Agregar
            </button>
          </div>
          {remitentes.length === 0 ? (
            <p className={styles.helpInline}>Aún no hay remitentes.</p>
          ) : (
            <ul className={styles.chipList}>
              {remitentes.map(r => (
                <li key={r}>
                  <span>{r}</span>
                  <button
                    type="button"
                    className={styles.chipRemove}
                    onClick={() => setRemitentes(remitentes.filter(x => x !== r))}
                    aria-label={`Quitar ${r}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className={styles.field}>
          Tasa de refresco (minutos)
          <select
            value={intervalo}
            onChange={e => setIntervalo(Number(e.target.value))}
          >
            {[5, 10, 15, 30, 60]
              .filter(n => n >= minIntervalo)
              .map(n => (
                <option key={n} value={n}>
                  Cada {n} min
                </option>
              ))}
          </select>
          <span className={styles.helpInline}>Mínimo permitido: {minIntervalo} minutos</span>
        </label>

        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={notifActivas}
            onChange={e => setNotifActivas(e.target.checked)}
          />
          Avisarme cuando llegue un pendiente desde el correo
        </label>

        <div className={styles.actions}>
          <button type="button" disabled={busy} onClick={() => void guardarPrefs()}>
            Guardar preferencias
          </button>
        </div>
      </section>
    </div>
  )
}
