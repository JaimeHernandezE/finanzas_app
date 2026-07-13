import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import styles from './NotificacionesConfigPage.module.scss'

export default function NotificacionesConfigPage() {
  const { user, updatePreferencias } = useAuth()
  const [activa, setActiva] = useState(user?.notif_presupuesto_activa !== false)
  const [umbral, setUmbral] = useState(user?.notif_presupuesto_umbral_pct ?? 80)
  const [guardando, setGuardando] = useState(false)
  const [mensajeOk, setMensajeOk] = useState<string | null>(null)
  const [mensajeError, setMensajeError] = useState<string | null>(null)

  const handleGuardar = async () => {
    if (guardando) return
    const umbralNum = Number(umbral)
    if (!Number.isFinite(umbralNum) || umbralNum < 50 || umbralNum > 100) {
      setMensajeError('El umbral debe estar entre 50 y 100.')
      setMensajeOk(null)
      return
    }
    setGuardando(true)
    setMensajeOk(null)
    setMensajeError(null)
    try {
      await updatePreferencias({
        notif_presupuesto_activa: activa,
        notif_presupuesto_umbral_pct: Math.round(umbralNum),
      })
      setMensajeOk('Preferencias de notificaciones guardadas.')
    } catch (e) {
      setMensajeError(e instanceof Error ? e.message : 'No se pudieron guardar las preferencias.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className={styles.page}>
      <Link to="/configuracion" className={styles.volver}>
        ← Configuración
      </Link>
      <h1 className={styles.titulo}>Notificaciones</h1>
      <p className={styles.subtitulo}>
        Configura cuándo recibir avisos in-app sobre el avance de tus presupuestos.
        También recibirás un aviso al superar el 100% si tu umbral es menor.
      </p>

      <section className={styles.section}>
        <div className={styles.campo}>
          <div className={styles.campoInfo}>
            <h2 className={styles.campoTitulo}>Alertas de presupuesto</h2>
            <p className={styles.campoTexto}>
              Avisa cuando una categoría con presupuesto alcance el porcentaje configurado
              (y al superar el presupuesto del mes).
            </p>
          </div>
          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={activa}
              onChange={e => setActiva(e.target.checked)}
            />
            <span>{activa ? 'Activadas' : 'Desactivadas'}</span>
          </label>
        </div>

        <div className={styles.campo}>
          <div className={styles.campoInfo}>
            <h2 className={styles.campoTitulo}>Umbral de aviso</h2>
            <p className={styles.campoTexto}>
              Porcentaje de gasto vs presupuesto mensual por categoría (50–100%).
            </p>
          </div>
          <div className={styles.umbralRow}>
            <input
              type="range"
              min={50}
              max={100}
              step={5}
              value={umbral}
              disabled={!activa}
              onChange={e => setUmbral(Number(e.target.value))}
              className={styles.slider}
            />
            <input
              type="number"
              min={50}
              max={100}
              value={umbral}
              disabled={!activa}
              onChange={e => setUmbral(Number(e.target.value))}
              className={styles.umbralInput}
            />
            <span className={styles.umbralPct}>%</span>
          </div>
        </div>

        <button
          type="button"
          className={styles.btnGuardar}
          onClick={() => void handleGuardar()}
          disabled={guardando}
        >
          {guardando ? 'Guardando…' : 'Guardar preferencias'}
        </button>

        {mensajeOk ? <p className={styles.msgOk}>{mensajeOk}</p> : null}
        {mensajeError ? <p className={styles.msgErr}>{mensajeError}</p> : null}
      </section>

      <p className={styles.linkBuzon}>
        <Link to="/notificaciones">Ver notificaciones recibidas →</Link>
      </p>
    </div>
  )
}
