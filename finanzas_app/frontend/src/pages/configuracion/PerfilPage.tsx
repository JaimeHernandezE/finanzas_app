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
  const { user, logout } = useAuth()
  const [nombreEdit, setNombreEdit] = useState(user?.nombre ?? '')
  const nombreCambiado = user?.nombre !== nombreEdit

  if (!user) {
    return (
      <div className={styles.page}>
        <p className={styles.muted}>No hay sesión iniciada.</p>
      </div>
    )
  }

  const inicial = user.nombre.trim().charAt(0).toUpperCase() || '?'

  const handleGuardar = () => {
    // TODO: conectar al backend PATCH /api/usuarios/me/
    console.log('Guardar nombre:', nombreEdit)
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
              disabled={!nombreCambiado}
              onClick={handleGuardar}
            >
              Guardar
            </button>
          </div>
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
