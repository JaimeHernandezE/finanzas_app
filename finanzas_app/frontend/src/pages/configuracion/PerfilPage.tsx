import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import styles from './PerfilPage.module.scss'

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function rolLabel(rol: string): string {
  if (rol === 'ADMIN') return 'Administrador'
  if (rol === 'LECTURA') return 'Solo lectura'
  return 'Miembro'
}

// -----------------------------------------------------------------------------
// Página
// -----------------------------------------------------------------------------

export default function PerfilPage() {
  const { user, logout, updateNombre, changePassword } = useAuth()
  const [nombreEdit, setNombreEdit] = useState(user?.nombre ?? '')
  const [guardando, setGuardando] = useState(false)
  const [mensajeError, setMensajeError] = useState<string | null>(null)
  const [mensajeOk, setMensajeOk] = useState<string | null>(null)
  const [passwordNueva, setPasswordNueva] = useState('')
  const [passwordConfirmar, setPasswordConfirmar] = useState('')
  const [cambiandoPassword, setCambiandoPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordOk, setPasswordOk] = useState<string | null>(null)
  const nombreTrim = nombreEdit.trim()
  const nombreCambiado = user?.nombre.trim() !== nombreTrim
  const puedeGuardar = nombreTrim.length > 0 && nombreCambiado && !guardando

  if (!user) {
    return (
      <div className={styles.page}>
        <p className={styles.muted}>No hay sesión iniciada.</p>
      </div>
    )
  }

  const inicial = user.nombre.trim().charAt(0).toUpperCase() || '?'

  const handleGuardar = async () => {
    if (!puedeGuardar) return
    setGuardando(true)
    setMensajeError(null)
    setMensajeOk(null)
    try {
      await updateNombre(nombreTrim)
      setMensajeOk('Nombre actualizado')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo actualizar el nombre'
      setMensajeError(msg)
    } finally {
      setGuardando(false)
    }
  }

  const handleCambiarPassword = async () => {
    setPasswordError(null)
    setPasswordOk(null)

    if (passwordNueva.trim().length < 6) {
      setPasswordError('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (passwordNueva !== passwordConfirmar) {
      setPasswordError('La confirmación no coincide con la nueva contraseña.')
      return
    }

    setCambiandoPassword(true)
    try {
      await changePassword(passwordNueva)
      setPasswordNueva('')
      setPasswordConfirmar('')
      setPasswordOk('Contraseña actualizada correctamente.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.'
      setPasswordError(msg)
    } finally {
      setCambiandoPassword(false)
    }
  }

  return (
    <div className={`${styles.page} ${styles.fadeUp}`}>
      <Link to="/configuracion" className={styles.backLink}>← Configuración</Link>
      <h1 className={styles.titulo}>Perfil</h1>

      {/* Avatar y datos */}
      <section className={styles.section}>
        <div className={styles.avatarWrap}>
          {user.foto ? (
            <img src={user.foto} alt="" className={styles.avatarImg} />
          ) : (
            <div className={styles.avatarInicial}>{inicial}</div>
          )}
        </div>
        <p className={styles.nombre}>{user.nombre}</p>
        <p className={styles.email}>{user.email}</p>
        <span className={styles.badgeRol}>{rolLabel(user.rol)}</span>
      </section>

      {/* Información editable */}
      <section className={styles.section}>
        <h2 className={styles.groupHeader}>INFORMACIÓN</h2>
        <div className={styles.rowEdit}>
          <label className={styles.labelInline} htmlFor="perfil-nombre">Nombre</label>
          <div className={styles.inputRow}>
            <input
              id="perfil-nombre"
              type="text"
              className={styles.input}
              value={nombreEdit}
              onChange={(e) => setNombreEdit(e.target.value)}
            />
            <button
              type="button"
              className={styles.btnGuardar}
              disabled={!puedeGuardar}
              onClick={handleGuardar}
            >
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
          {mensajeError && <p className={styles.msgError}>{mensajeError}</p>}
          {mensajeOk && <p className={styles.msgOk}>{mensajeOk}</p>}
        </div>
      </section>

      {/* Seguridad */}
      <section className={styles.section}>
        <h2 className={styles.groupHeader}>SEGURIDAD</h2>
        <p className={styles.seguridadHint}>
          Cualquier miembro de la familia puede definir o cambiar su contraseña aquí. Si solo usas Google,
          la primera vez se vincula una contraseña a tu cuenta para poder entrar también con email.
        </p>
        <div className={styles.rowEdit}>
          <label className={styles.labelInline} htmlFor="perfil-password-nueva">
            Contraseña (email)
          </label>
          <div className={styles.inputColumn}>
            <input
              id="perfil-password-nueva"
              type="password"
              className={styles.input}
              value={passwordNueva}
              onChange={(e) => setPasswordNueva(e.target.value)}
              placeholder="Nueva contraseña"
              autoComplete="new-password"
            />
            <input
              type="password"
              className={styles.input}
              value={passwordConfirmar}
              onChange={(e) => setPasswordConfirmar(e.target.value)}
              placeholder="Confirmar nueva contraseña"
              autoComplete="new-password"
            />
            <button
              type="button"
              className={styles.btnGuardar}
              disabled={cambiandoPassword}
              onClick={handleCambiarPassword}
            >
              {cambiandoPassword ? 'Actualizando...' : 'Cambiar contraseña'}
            </button>
          </div>
          {passwordError && <p className={styles.msgError}>{passwordError}</p>}
          {passwordOk && <p className={styles.msgOk}>{passwordOk}</p>}
        </div>
      </section>

      {/* Sesión */}
      <section className={styles.section}>
        <h2 className={styles.groupHeader}>SESIÓN</h2>
        <button type="button" className={styles.btnLogout} onClick={logout}>
          Cerrar sesión
        </button>
      </section>
    </div>
  )
}
