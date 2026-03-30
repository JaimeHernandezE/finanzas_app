import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { familiaApi } from '@/api'
import { Cargando, ErrorCarga } from '@/components/ui'
import styles from './MiembrosPage.module.scss'

interface Miembro {
  id: number
  nombre: string
  email: string
  foto: string | null
  rol: 'ADMIN' | 'MIEMBRO' | 'LECTURA'
  esTuActual: boolean
  puedeQuitar: boolean
}

interface Invitacion {
  id: number
  email: string
  fechaEnvio: string
}

function rolLabel(rol: string): string {
  if (rol === 'ADMIN') return 'Administrador'
  if (rol === 'LECTURA') return 'Solo lectura'
  return 'Miembro'
}

function formatFechaEnvio(fecha: string): string {
  const d = new Date(fecha + 'T12:00:00')
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function MiembrosPage() {
  const { user: currentUser } = useAuth()
  const [miembros, setMiembros] = useState<Miembro[]>([])
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [emailInvitacion, setEmailInvitacion] = useState('')
  const [emailError, setEmailError] = useState('')
  const [apiError, setApiError] = useState('')
  const [mensajeExito, setMensajeExito] = useState<string | null>(null)
  const [editingRolId, setEditingRolId] = useState<number | null>(null)
  const [editRol, setEditRol] = useState<'ADMIN' | 'MIEMBRO' | 'LECTURA'>('MIEMBRO')
  const [savingRol, setSavingRol] = useState(false)
  const [quitarMiembroId, setQuitarMiembroId] = useState<number | null>(null)

  const esAdmin = currentUser?.rol === 'ADMIN'

  const cargar = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const [resM, resI] = await Promise.all([
        familiaApi.getMiembros(),
        familiaApi.getInvitaciones(),
      ])
      const uid = currentUser?.id
      setMiembros(
        resM.data.map((m) => ({
          id: m.id,
          nombre: m.nombre,
          email: m.email,
          foto: null,
          rol: m.rol,
          esTuActual: m.id === uid,
          puedeQuitar: !!m.puede_quitar,
        }))
      )
      setInvitaciones(
        resI.data.map((i) => ({
          id: i.id,
          email: i.email,
          fechaEnvio: i.fecha_envio,
        }))
      )
    } catch {
      setError('No se pudieron cargar los miembros.')
    } finally {
      setLoading(false)
    }
  }, [currentUser?.id])

  useEffect(() => {
    if (currentUser?.id) void cargar()
  }, [currentUser?.id, cargar])

  useEffect(() => {
    if (mensajeExito === null) return
    const t = setTimeout(() => setMensajeExito(null), 4000)
    return () => clearTimeout(t)
  }, [mensajeExito])

  const handleEnviarInvitacion = async () => {
    const email = emailInvitacion.trim()
    setEmailError('')
    setApiError('')
    if (!email) {
      setEmailError('Ingresa un email')
      return
    }
    if (!EMAIL_REGEX.test(email)) {
      setEmailError('Email no válido')
      return
    }
    if (!esAdmin) return
    try {
      const { data } = await familiaApi.createInvitacion(email)
      setInvitaciones((prev) => [
        { id: data.id, email: data.email, fechaEnvio: data.fecha_envio },
        ...prev.filter((p) => p.id !== data.id),
      ])
      setMensajeExito(
        `Invitación registrada para ${email}. Esa persona debe iniciar sesión con ese correo para unirse (no se envía email automático).`
      )
      setEmailInvitacion('')
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'No se pudo crear la invitación.'
      setApiError(msg)
    }
  }

  const eliminarInvitacion = async (id: number) => {
    if (!esAdmin) return
    setApiError('')
    try {
      await familiaApi.deleteInvitacion(id)
      setInvitaciones((prev) => prev.filter((i) => i.id !== id))
    } catch {
      setApiError('No se pudo eliminar la invitación.')
    }
  }

  const startEditRol = (m: Miembro) => {
    setEditingRolId(m.id)
    setEditRol(m.rol)
    setQuitarMiembroId(null)
  }

  const cancelEditRol = () => setEditingRolId(null)

  const saveRol = async () => {
    if (editingRolId == null) return
    setSavingRol(true)
    setApiError('')
    try {
      const { data } = await familiaApi.patchMiembroRol(editingRolId, editRol)
      setMiembros((prev) =>
        prev.map((m) =>
          m.id === editingRolId
            ? { ...m, rol: data.rol, nombre: data.nombre || m.nombre }
            : m
        )
      )
      setEditingRolId(null)
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'No se pudo actualizar el rol.'
      setApiError(msg)
    } finally {
      setSavingRol(false)
    }
  }

  const startQuitarMiembro = (m: Miembro) => {
    setApiError('')
    setQuitarMiembroId(m.id)
    setEditingRolId(null)
  }

  const cancelQuitarMiembro = () => setQuitarMiembroId(null)

  const confirmQuitarMiembro = async () => {
    if (quitarMiembroId == null) return
    setApiError('')
    try {
      await familiaApi.deleteMiembro(quitarMiembroId)
      setQuitarMiembroId(null)
      await cargar()
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'No se pudo quitar al miembro.'
      setApiError(msg)
      setQuitarMiembroId(null)
    }
  }

  if (!currentUser?.id) return <Cargando />
  if (loading) return <Cargando />
  if (error)
    return (
      <div className={styles.page}>
        <ErrorCarga mensaje={error} />
        <button type="button" className={styles.btnEnviar} onClick={() => void cargar()}>
          Reintentar
        </button>
      </div>
    )

  return (
    <div className={`${styles.page} ${styles.fadeUp}`}>
      <Link to="/configuracion" className={styles.backLink}>
        ← Configuración
      </Link>
      <h1 className={styles.titulo}>Miembros de la familia</h1>

      {apiError && <p className={styles.msgError}>{apiError}</p>}

      <section className={styles.section}>
        <h2 className={styles.groupHeader}>MIEMBROS ACTIVOS</h2>
        {esAdmin && (
          <p className={styles.hintQuitar}>
            Puedes quitar de la familia a quien no tenga movimientos, cuentas, tarjetas ni otros datos
            asociados. Si tiene actividad, primero hay que limpiar o reasignar esos registros.
          </p>
        )}
        <div className={styles.block}>
          {miembros.map((m) => {
            const inicial = m.nombre.trim().charAt(0).toUpperCase() || '?'
            const isEditing = editingRolId === m.id
            const isConfirmQuitar = quitarMiembroId === m.id

            if (isConfirmQuitar) {
              return (
                <div key={m.id} className={styles.fila}>
                  <span className={styles.confirmText}>
                    ¿Quitar a «{m.nombre}» de la familia? Podrá volver a unirse con una invitación.
                  </span>
                  <div className={styles.confirmActions}>
                    <button
                      type="button"
                      className={styles.btnConfirmSi}
                      onClick={() => void confirmQuitarMiembro()}
                    >
                      Sí
                    </button>
                    <button type="button" className={styles.btnConfirmNo} onClick={cancelQuitarMiembro}>
                      No
                    </button>
                  </div>
                </div>
              )
            }

            if (isEditing) {
              return (
                <div key={m.id} className={styles.fila}>
                  <div className={styles.filaAvatar}>
                    {m.foto ? (
                      <img src={m.foto} alt="" className={styles.avatarImg} />
                    ) : (
                      <div className={styles.avatarInicial}>{inicial}</div>
                    )}
                  </div>
                  <div className={styles.filaEditRol}>
                    <select
                      className={styles.selectRol}
                      value={editRol}
                      onChange={(e) =>
                        setEditRol(e.target.value as 'ADMIN' | 'MIEMBRO' | 'LECTURA')
                      }
                      disabled={savingRol}
                    >
                      <option value="ADMIN">Administrador</option>
                      <option value="MIEMBRO">Miembro</option>
                      <option value="LECTURA">Solo lectura</option>
                    </select>
                    <button
                      type="button"
                      className={styles.btnOk}
                      onClick={() => void saveRol()}
                      disabled={savingRol}
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      className={styles.btnCancel}
                      onClick={cancelEditRol}
                      disabled={savingRol}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            }

            return (
              <div key={m.id} className={styles.fila}>
                <div className={styles.filaAvatar}>
                  {m.foto ? (
                    <img src={m.foto} alt="" className={styles.avatarImg} />
                  ) : (
                    <div className={styles.avatarInicial}>{inicial}</div>
                  )}
                </div>
                <div className={styles.filaMain}>
                  <div className={styles.filaTop}>
                    <span className={styles.filaNombre}>{m.nombre}</span>
                    <span className={`${styles.badgeRol} ${styles[`rol${m.rol}`]}`}>
                      {rolLabel(m.rol)}
                    </span>
                    {m.esTuActual && <span className={styles.tuBadge}>(tú)</span>}
                    {esAdmin && (
                      <span className={styles.filaActions}>
                        <button
                          type="button"
                          className={styles.btnEdit}
                          onClick={() => startEditRol(m)}
                          title="Editar rol"
                        >
                          ✎
                        </button>
                        {m.puedeQuitar && (
                          <button
                            type="button"
                            className={styles.btnQuitar}
                            onClick={() => startQuitarMiembro(m)}
                            title="Quitar de la familia"
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                  <p className={styles.filaEmail}>{m.email}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {esAdmin && (
        <section className={styles.section}>
          <h2 className={styles.groupHeader}>INVITAR MIEMBRO</h2>
          <p className={styles.hintInvitacion}>
            Se guarda la invitación en el sistema. La persona debe usar exactamente ese correo al
            registrarse; no se envía email automático.
          </p>
          <div className={styles.invitarRow}>
            <input
              type="email"
              className={styles.inputEmail}
              placeholder="email@gmail.com"
              value={emailInvitacion}
              onChange={(e) => {
                setEmailInvitacion(e.target.value)
                setEmailError('')
              }}
            />
            <button type="button" className={styles.btnEnviar} onClick={() => void handleEnviarInvitacion()}>
              Registrar invitación
            </button>
          </div>
          {emailError && <p className={styles.msgError}>{emailError}</p>}
          {mensajeExito && <p className={styles.msgExito}>{mensajeExito}</p>}
        </section>
      )}

      {invitaciones.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.groupHeader}>INVITACIONES PENDIENTES</h2>
          <div className={styles.block}>
            {invitaciones.map((i) => (
              <div key={i.id} className={styles.filaInvitacion}>
                <span className={styles.invEmail}>{i.email}</span>
                <span className={styles.invFecha}>Registrada {formatFechaEnvio(i.fechaEnvio)}</span>
                {esAdmin && (
                  <button
                    type="button"
                    className={styles.btnDelete}
                    onClick={() => void eliminarInvitacion(i.id)}
                    title="Revocar"
                  >
                    🗑
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
