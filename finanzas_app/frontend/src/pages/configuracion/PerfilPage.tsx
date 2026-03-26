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
  const { user, logout, updateNombre } = useAuth()
  const [nombreEdit, setNombreEdit] = useState(user?.nombre ?? '')
  const [guardando, setGuardando] = useState(false)
  const [mensajeError, setMensajeError] = useState<string | null>(null)
  const [mensajeOk, setMensajeOk] = useState<string | null>(null)
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
