import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { finanzasApi } from '@/api'
import type { NotificacionUsuarioApi } from '@/api/finanzas'
import { Cargando, ErrorCarga } from '@/components/ui'
import { CompensacionNotificacionResumen } from '@/components/notificaciones/CompensacionNotificacionResumen'
import { useConfig } from '@/context/ConfigContext'
import { parseCompensacionNotificacion } from '@finanzas/shared/utils/notificacionCompensacion'
import styles from './NotificacionesPage.module.scss'

function formatFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function NotificacionesPage() {
  const { formatMonto } = useConfig()
  const [items, setItems] = useState<NotificacionUsuarioApi[]>([])
  const [noLeidas, setNoLeidas] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [marcando, setMarcando] = useState(false)

  const cargar = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const { data } = await finanzasApi.getNotificaciones()
      setItems(data.notificaciones)
      setNoLeidas(data.no_leidas)
    } catch {
      setError('No se pudieron cargar las notificaciones.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const marcarLeida = async (id: number) => {
    try {
      await finanzasApi.marcarNotificacionLeida(id)
      await cargar()
    } catch {
      setError('No se pudo marcar la notificación como leída.')
    }
  }

  const marcarTodas = async () => {
    if (marcando || noLeidas === 0) return
    setMarcando(true)
    try {
      await finanzasApi.marcarTodasNotificacionesLeidas()
      await cargar()
    } catch {
      setError('No se pudieron marcar todas como leídas.')
    } finally {
      setMarcando(false)
    }
  }

  if (loading) return <Cargando />
  if (error && items.length === 0) return <ErrorCarga mensaje={error} />

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.titulo}>Notificaciones</h1>
        <p className={styles.subtitulo}>
          Avisos cuando un cambio en gastos o sueldos comunes modifica la compensación entre miembros.
        </p>
        {noLeidas > 0 ? (
          <button type="button" className={styles.btnMarcar} onClick={marcarTodas} disabled={marcando}>
            {marcando ? 'Marcando…' : `Marcar todas como leídas (${noLeidas})`}
          </button>
        ) : null}
      </div>

      {error ? <p className={styles.msgErr}>{error}</p> : null}

      {items.length === 0 ? (
        <p className={styles.vacio}>No tienes notificaciones.</p>
      ) : (
        <ul className={styles.lista}>
          {items.map((n) => {
            const compensacion = parseCompensacionNotificacion(n.payload)
            const mes = Number(n.payload?.mes)
            const anio = Number(n.payload?.anio)
            const linkLiquidacion =
              Number.isFinite(mes) && Number.isFinite(anio)
                ? `/liquidacion?mes=${mes}&anio=${anio}`
                : null

            return (
            <li key={n.id} className={n.leida ? styles.itemLeida : styles.item}>
              <div className={styles.itemHead}>
                <span className={styles.itemTitulo}>{n.titulo}</span>
                <span className={styles.itemFecha}>{formatFecha(n.creado_at)}</span>
              </div>
              <p className={styles.itemMensaje}>{n.mensaje}</p>
              {compensacion ? (
                <CompensacionNotificacionResumen
                  compensacion={compensacion}
                  formatMonto={formatMonto}
                />
              ) : null}
              {linkLiquidacion ? (
                <Link to={linkLiquidacion} className={styles.linkLiquidacion}>
                  Ver resumen común del mes →
                </Link>
              ) : null}
              {!n.leida ? (
                <button type="button" className={styles.btnItem} onClick={() => marcarLeida(n.id)}>
                  Marcar como leída
                </button>
              ) : null}
            </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
