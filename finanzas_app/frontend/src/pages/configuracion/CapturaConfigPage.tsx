import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { pendientesApi } from '@/api/pendientes'
import { Cargando, ErrorCarga } from '@/components/ui'
import { apiErrorMessage } from '@/utils/apiErrorMessage'
import styles from './CapturaConfigPage.module.scss'

export default function CapturaConfigPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [estado, setEstado] = useState<{
    telegram_vinculado: boolean
    whatsapp_vinculado: boolean
    whatsapp_phone: string
    telegram_chat_id_presente: boolean
  } | null>(null)
  const [codigoTg, setCodigoTg] = useState<string | null>(null)
  const [codigoWa, setCodigoWa] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await pendientesApi.estadoVinculo()
      setEstado(data)
    } catch (e) {
      setError(apiErrorMessage(e, 'No se pudo cargar el estado de vínculo.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const generar = async (canal: 'TELEGRAM' | 'WHATSAPP') => {
    setBusy(true)
    setError(null)
    try {
      const { data } = await pendientesApi.generarVinculo(canal)
      if (canal === 'TELEGRAM') setCodigoTg(data.codigo)
      else setCodigoWa(data.codigo)
    } catch (e) {
      setError(apiErrorMessage(e, 'No se pudo generar el código.'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Cargando />

  return (
    <div className={styles.page}>
      <Link to="/configuracion" className={styles.back}>← Configuración</Link>
      <h1 className={styles.title}>Captura por mensajería</h1>
      <p className={styles.sub}>
        Vincula Telegram o WhatsApp. Genera un código aquí y envía al bot:{' '}
        <code>/vincular CODIGO</code>. Luego escribe gastos o «pendientes».
      </p>

      {error ? <ErrorCarga mensaje={error} /> : null}

      <section className={styles.block}>
        <h2>Telegram</h2>
        <p className={styles.status}>
          {estado?.telegram_vinculado ? 'Vinculado' : 'No vinculado'}
        </p>
        <button type="button" disabled={busy} onClick={() => void generar('TELEGRAM')}>
          Generar código
        </button>
        {codigoTg ? (
          <p className={styles.codigo}>
            Código: <strong>{codigoTg}</strong> — envía <code>/vincular {codigoTg}</code>
          </p>
        ) : null}
      </section>

      <section className={styles.block}>
        <h2>WhatsApp</h2>
        <p className={styles.status}>
          {estado?.whatsapp_vinculado
            ? `Vinculado (${estado.whatsapp_phone || 'ok'})`
            : 'No vinculado'}
        </p>
        <button type="button" disabled={busy} onClick={() => void generar('WHATSAPP')}>
          Generar código
        </button>
        {codigoWa ? (
          <p className={styles.codigo}>
            Código: <strong>{codigoWa}</strong> — envía <code>/vincular {codigoWa}</code>
          </p>
        ) : null}
      </section>

      <p className={styles.hint}>
        También puedes resolver la bandeja en <Link to="/pendientes">Pendientes</Link>.
      </p>
    </div>
  )
}
