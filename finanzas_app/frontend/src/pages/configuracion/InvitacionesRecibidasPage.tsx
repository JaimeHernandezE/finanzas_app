import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { familiaApi } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { Cargando, ErrorCarga } from '@/components/ui'
import styles from './InvitacionesRecibidasPage.module.scss'

interface InvitacionRow {
  id: number
  familiaNombre: string
  fechaEnvio: string
  invitadorNombre: string
}

function formatFecha(fecha: string): string {
  const d = new Date(fecha + 'T12:00:00')
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function InvitacionesRecibidasPage() {
  const { user, refreshUsuario } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<InvitacionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [procesandoId, setProcesandoId] = useState<number | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const { data } = await familiaApi.getInvitacionesRecibidas()
      setItems(
        data.map((r) => ({
          id: r.id,
          familiaNombre: r.familia.nombre,
          fechaEnvio: r.fecha_envio,
          invitadorNombre: r.invitador_nombre,
        }))
      )
    } catch {
      setError('No se pudieron cargar las invitaciones.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const sinFamilia = user && !user.familia

  const aceptar = async (id: number) => {
    setApiError(null)
    setProcesandoId(id)
    try {
      await familiaApi.aceptarInvitacionRecibida(id)
      await refreshUsuario()
      navigate('/dashboard', { replace: true })
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'No se pudo aceptar la invitación.'
      setApiError(msg)
    } finally {
      setProcesandoId(null)
    }
  }

  const rechazar = async (id: number) => {
    setApiError(null)
    setProcesandoId(id)
    try {
      await familiaApi.rechazarInvitacionRecibida(id)
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch {
      setApiError('No se pudo rechazar la invitación.')
    } finally {
      setProcesandoId(null)
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <Cargando />
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.page}>
        <ErrorCarga mensaje={error} />
      </div>
    )
  }

  return (
    <div className={`${styles.page} ${styles.fadeUp}`}>
      <Link to="/configuracion" className={styles.backLink}>
        ← Configuración
      </Link>
      <h1 className={styles.titulo}>Invitaciones recibidas</h1>
      <p className={styles.subtitulo}>
        {sinFamilia
          ? 'Te han invitado a unirte a una familia. Acepta solo si reconoces al remitente y quieres compartir datos con ese grupo.'
          : 'Aquí aparecían las invitaciones pendientes. Ya perteneces a una familia.'}
      </p>

      {apiError ? <p className={styles.msgErr}>{apiError}</p> : null}

      <section className={styles.section}>
        <h2 className={styles.groupHeader}>PENDIENTES</h2>
        <div className={styles.block}>
          {!sinFamilia ? (
            <p className={styles.msgVacio}>No hay acciones disponibles.</p>
          ) : items.length === 0 ? (
            <p className={styles.msgVacio}>
              No tienes invitaciones pendientes. Si un administrador te agregó, pide que confirme el correo
              exacto o que vuelva a registrar la invitación desde Configuración → Miembros.
            </p>
          ) : (
            items.map((i) => (
              <div key={i.id} className={styles.fila}>
                <div className={styles.filaMain}>
                  <div className={styles.familiaNombre}>{i.familiaNombre}</div>
                  <div className={styles.meta}>
                    Invitación de {i.invitadorNombre} · {formatFecha(i.fechaEnvio)}
                  </div>
                </div>
                <div className={styles.acciones}>
                  <button
                    type="button"
                    className={styles.btnAceptar}
                    disabled={procesandoId !== null}
                    onClick={() => void aceptar(i.id)}
                  >
                    {procesandoId === i.id ? '…' : 'Aceptar'}
                  </button>
                  <button
                    type="button"
                    className={styles.btnRechazar}
                    disabled={procesandoId !== null}
                    onClick={() => void rechazar(i.id)}
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
