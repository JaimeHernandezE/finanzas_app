import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import styles from './MiembrosPage.module.scss'

// -----------------------------------------------------------------------------
// Tipos y mock — TODO: reemplazar por fetch al backend
// -----------------------------------------------------------------------------

interface Miembro {
  id: string
  nombre: string
  email: string
  foto: string | null
  rol: 'ADMIN' | 'MIEMBRO' | 'LECTURA'
  esTuActual: boolean
}

interface Invitacion {
  id: string
  email: string
  fechaEnvio: string
}

const MOCK_MIEMBROS: Miembro[] = [
  { id: 'jaime', nombre: 'Jaime Herrera', email: 'jhearquitecto@gmail.com', foto: null, rol: 'ADMIN', esTuActual: true },
  { id: 'glori', nombre: 'Glori Herrera', email: 'glori@gmail.com', foto: null, rol: 'MIEMBRO', esTuActual: false },
]

const MOCK_INVITACIONES: Invitacion[] = [
  { id: '1', email: 'sofia@gmail.com', fechaEnvio: '2026-03-15' },
]

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

// -----------------------------------------------------------------------------
// Página
// -----------------------------------------------------------------------------

export default function MiembrosPage() {
  const { user: currentUser } = useAuth()
  const [miembros, setMiembros] = useState<Miembro[]>(() =>
    MOCK_MIEMBROS.map((m) => ({ ...m, esTuActual: m.id === currentUser?.id }))
  )
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>(MOCK_INVITACIONES)
  const [emailInvitacion, setEmailInvitacion] = useState('')
  const [emailError, setEmailError] = useState('')
  const [mensajeExito, setMensajeExito] = useState<string | null>(null)
  const [editingRolId, setEditingRolId] = useState<string | null>(null)
  const [editRol, setEditRol] = useState<'ADMIN' | 'MIEMBRO' | 'LECTURA'>('MIEMBRO')

  useEffect(() => {
    if (mensajeExito === null) return
    const t = setTimeout(() => setMensajeExito(null), 3000)
    return () => clearTimeout(t)
  }, [mensajeExito])

  const handleEnviarInvitacion = () => {
    const email = emailInvitacion.trim()
    setEmailError('')
    if (!email) {
      setEmailError('Ingresa un email')
      return
    }
    if (!EMAIL_REGEX.test(email)) {
      setEmailError('Email no válido')
      return
    }
    // TODO: conectar al backend que enviará el email real
    const nueva: Invitacion = { id: `inv-${Date.now()}`, email, fechaEnvio: new Date().toISOString().slice(0, 10) }
    setInvitaciones((prev) => [...prev, nueva])
    setMensajeExito(`✓ Invitación enviada a ${email}`)
    setEmailInvitacion('')
  }

  const eliminarInvitacion = (id: string) => {
    setInvitaciones((prev) => prev.filter((i) => i.id !== id))
  }

  const startEditRol = (m: Miembro) => {
    setEditingRolId(m.id)
    setEditRol(m.rol)
  }

  const cancelEditRol = () => setEditingRolId(null)

  const saveRol = () => {
    if (!editingRolId) return
    setMiembros((prev) => prev.map((m) => (m.id === editingRolId ? { ...m, rol: editRol } : m)))
    setEditingRolId(null)
  }

  return (
    <div className={`${styles.page} ${styles.fadeUp}`}>
      <Link to="/configuracion" className={styles.backLink}>← Configuración</Link>
      <h1 className={styles.titulo}>Miembros de la familia</h1>

      {/* Miembros activos */}
      <section className={styles.section}>
        <h2 className={styles.groupHeader}>MIEMBROS ACTIVOS</h2>
        <div className={styles.block}>
          {miembros.map((m) => {
            const inicial = m.nombre.trim().charAt(0).toUpperCase() || '?'
            const isEditing = editingRolId === m.id

            if (isEditing) {
              return (
                <div key={m.id} className={styles.fila}>
                  <div className={styles.filaAvatar}>
                    {m.foto ? <img src={m.foto} alt="" className={styles.avatarImg} /> : <div className={styles.avatarInicial}>{inicial}</div>}
                  </div>
                  <div className={styles.filaEditRol}>
                    <select className={styles.selectRol} value={editRol} onChange={(e) => setEditRol(e.target.value as 'ADMIN' | 'MIEMBRO' | 'LECTURA')}>
                      <option value="ADMIN">Administrador</option>
                      <option value="MIEMBRO">Miembro</option>
                      <option value="LECTURA">Solo lectura</option>
                    </select>
                    <button type="button" className={styles.btnOk} onClick={saveRol}>✓</button>
                    <button type="button" className={styles.btnCancel} onClick={cancelEditRol}>✕</button>
                  </div>
                </div>
              )
            }

            return (
              <div key={m.id} className={styles.fila}>
                <div className={styles.filaAvatar}>
                  {m.foto ? <img src={m.foto} alt="" className={styles.avatarImg} /> : <div className={styles.avatarInicial}>{inicial}</div>}
                </div>
                <div className={styles.filaMain}>
                  <div className={styles.filaTop}>
                    <span className={styles.filaNombre}>{m.nombre}</span>
                    <span className={`${styles.badgeRol} ${styles[`rol${m.rol}`]}`}>{rolLabel(m.rol)}</span>
                    {m.esTuActual && <span className={styles.tuBadge}>(tú)</span>}
                    {!m.esTuActual && (
                      <button type="button" className={styles.btnEdit} onClick={() => startEditRol(m)} title="Editar rol">✎</button>
                    )}
                  </div>
                  <p className={styles.filaEmail}>{m.email}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Invitar miembro */}
      <section className={styles.section}>
        <h2 className={styles.groupHeader}>INVITAR MIEMBRO</h2>
        <div className={styles.invitarRow}>
          <input
            type="email"
            className={styles.inputEmail}
            placeholder="email@gmail.com"
            value={emailInvitacion}
            onChange={(e) => { setEmailInvitacion(e.target.value); setEmailError('') }}
          />
          <button type="button" className={styles.btnEnviar} onClick={handleEnviarInvitacion}>
            Enviar invitación
          </button>
        </div>
        {emailError && <p className={styles.msgError}>{emailError}</p>}
        {mensajeExito && <p className={styles.msgExito}>{mensajeExito}</p>}
      </section>

      {/* Invitaciones pendientes */}
      {invitaciones.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.groupHeader}>INVITACIONES PENDIENTES</h2>
          <div className={styles.block}>
            {invitaciones.map((i) => (
              <div key={i.id} className={styles.filaInvitacion}>
                <span className={styles.invEmail}>{i.email}</span>
                <span className={styles.invFecha}>Enviada {formatFechaEnvio(i.fechaEnvio)}</span>
                <button type="button" className={styles.btnDelete} onClick={() => eliminarInvitacion(i.id)} title="Eliminar">🗑</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
