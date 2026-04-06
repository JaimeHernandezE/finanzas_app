import { useState } from 'react'
import { Link } from 'react-router-dom'
import Select from 'react-select'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import styles from './PerfilPage.module.scss'

// -----------------------------------------------------------------------------
// Constantes
// -----------------------------------------------------------------------------

type IdiomaUi = 'es' | 'en'

const IDIOMAS: { value: IdiomaUi; label: string }[] = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
]

const MONEDAS = [
  { value: 'CLP', label: 'CLP — Peso chileno' },
  { value: 'USD', label: 'USD — Dólar estadounidense' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'ARS', label: 'ARS — Peso argentino' },
  { value: 'PEN', label: 'PEN — Sol peruano' },
  { value: 'MXN', label: 'MXN — Peso mexicano' },
  { value: 'COP', label: 'COP — Peso colombiano' },
]

// Lista curada de zonas horarias comunes + todo lo que soporte el navegador
function getZonasHorarias() {
  const curadas = [
    'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/Lima',
    'America/Bogota', 'America/Mexico_City', 'America/New_York',
    'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Sao_Paulo', 'Europe/Madrid', 'Europe/London',
    'Europe/Paris', 'Europe/Berlin', 'Europe/Rome',
    'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata',
    'Australia/Sydney', 'Pacific/Auckland', 'UTC',
  ]
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const todas = (Intl as any).supportedValuesOf('timeZone') as string[]
    return todas.map(z => ({ value: z, label: z }))
  } catch {
    return curadas.map(z => ({ value: z, label: z }))
  }
}

const ZONAS = getZonasHorarias()

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
  const { t } = useTranslation()
  const { user, logout, updateNombre, changePassword, updatePreferencias } = useAuth()

  const [nombreEdit, setNombreEdit] = useState(user?.nombre ?? '')
  const [guardando, setGuardando] = useState(false)
  const [mensajeError, setMensajeError] = useState<string | null>(null)
  const [mensajeOk, setMensajeOk] = useState<string | null>(null)

  const [passwordNueva, setPasswordNueva] = useState('')
  const [passwordConfirmar, setPasswordConfirmar] = useState('')
  const [cambiandoPassword, setCambiandoPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordOk, setPasswordOk] = useState<string | null>(null)

  const [idiomaEdit, setIdiomaEdit] = useState<IdiomaUi>(
    user?.idioma_ui === 'en' ? 'en' : 'es'
  )
  const [monedaEdit, setMonedaEdit] = useState(user?.moneda_display ?? 'CLP')
  const [zonaEdit, setZonaEdit] = useState(user?.zona_horaria ?? 'America/Santiago')
  const [guardandoPrefs, setGuardandoPrefs] = useState(false)
  const [prefsError, setPrefsError] = useState<string | null>(null)
  const [prefsOk, setPrefsOk] = useState<string | null>(null)

  const nombreTrim = nombreEdit.trim()
  const nombreCambiado = user?.nombre.trim() !== nombreTrim
  const puedeGuardar = nombreTrim.length > 0 && nombreCambiado && !guardando

  if (!user) {
    return (
      <div className={styles.page}>
        <p className={styles.muted}>{t('perfil.sin_sesion')}</p>
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
      setMensajeOk(t('perfil.nombre_actualizado'))
    } catch (err) {
      setMensajeError(err instanceof Error ? err.message : 'No se pudo actualizar el nombre')
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
      setPasswordOk(t('perfil.password_actualizada'))
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.')
    } finally {
      setCambiandoPassword(false)
    }
  }

  const handleGuardarPreferencias = async () => {
    setPrefsError(null)
    setPrefsOk(null)
    setGuardandoPrefs(true)
    try {
      await updatePreferencias({
        idioma_ui: idiomaEdit,
        moneda_display: monedaEdit,
        zona_horaria: zonaEdit,
      })
      setPrefsOk(t('perfil.preferencias_actualizadas'))
    } catch (err) {
      setPrefsError(err instanceof Error ? err.message : 'No se pudo actualizar las preferencias')
    } finally {
      setGuardandoPrefs(false)
    }
  }

  const selectStyles = {
    control: (base: object) => ({
      ...base,
      minHeight: '36px',
      fontSize: '14px',
      borderColor: '#d1d5db',
      boxShadow: 'none',
      '&:hover': { borderColor: '#0f0f0f' },
    }),
    option: (base: object, state: { isSelected: boolean }) => ({
      ...base,
      fontSize: '14px',
      backgroundColor: state.isSelected ? '#0f0f0f' : undefined,
      '&:hover': { backgroundColor: state.isSelected ? '#0f0f0f' : '#f3f4f6' },
    }),
  }

  return (
    <div className={`${styles.page} ${styles.fadeUp}`}>
      <Link to="/configuracion" className={styles.backLink}>{t('perfil.volver')}</Link>
      <h1 className={styles.titulo}>{t('perfil.titulo')}</h1>

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
        <h2 className={styles.groupHeader}>{t('perfil.informacion')}</h2>
        <div className={styles.rowEdit}>
          <label className={styles.labelInline} htmlFor="perfil-nombre">{t('perfil.nombre')}</label>
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
              {guardando ? t('perfil.guardando') : t('perfil.guardar')}
            </button>
          </div>
          {mensajeError && <p className={styles.msgError}>{mensajeError}</p>}
          {mensajeOk && <p className={styles.msgOk}>{mensajeOk}</p>}
        </div>
      </section>

      {/* Región e idioma */}
      <section className={styles.section}>
        <h2 className={styles.groupHeader}>{t('perfil.region')}</h2>

        <div className={styles.rowEdit}>
          <label className={styles.labelInline}>{t('perfil.idioma')}</label>
          <div style={{ maxWidth: 320 }}>
            <Select
              options={IDIOMAS}
              value={IDIOMAS.find(o => o.value === idiomaEdit) ?? null}
              onChange={opt => opt && setIdiomaEdit(opt.value)}
              styles={selectStyles}
              isSearchable={false}
            />
          </div>
        </div>

        <div className={styles.rowEdit}>
          <label className={styles.labelInline}>{t('perfil.moneda')}</label>
          <div style={{ maxWidth: 320 }}>
            <Select
              options={MONEDAS}
              value={MONEDAS.find(o => o.value === monedaEdit) ?? null}
              onChange={opt => opt && setMonedaEdit(opt.value)}
              styles={selectStyles}
              isSearchable={false}
            />
          </div>
          <p className={styles.muted} style={{ marginTop: 4, fontSize: 12 }}>
            {t('perfil.moneda_nota')}
          </p>
        </div>

        <div className={styles.rowEdit}>
          <label className={styles.labelInline}>{t('perfil.zona_horaria')}</label>
          <div style={{ maxWidth: 400 }}>
            <Select
              options={ZONAS}
              value={ZONAS.find(o => o.value === zonaEdit) ?? null}
              onChange={opt => opt && setZonaEdit(opt.value)}
              styles={selectStyles}
              isSearchable
              placeholder="Buscar zona horaria..."
            />
          </div>
        </div>

        <button
          type="button"
          className={styles.btnGuardar}
          disabled={guardandoPrefs}
          onClick={handleGuardarPreferencias}
        >
          {guardandoPrefs ? t('perfil.guardando_preferencias') : t('perfil.guardar_preferencias')}
        </button>
        {prefsError && <p className={styles.msgError} style={{ marginTop: 8 }}>{prefsError}</p>}
        {prefsOk && <p className={styles.msgOk} style={{ marginTop: 8 }}>{prefsOk}</p>}
      </section>

      {/* Seguridad */}
      <section className={styles.section}>
        <h2 className={styles.groupHeader}>{t('perfil.seguridad')}</h2>
        <p className={styles.seguridadHint}>{t('perfil.password_hint')}</p>
        <div className={styles.rowEdit}>
          <label className={styles.labelInline} htmlFor="perfil-password-nueva">
            {t('perfil.password_label')}
          </label>
          <div className={styles.inputColumn}>
            <input
              id="perfil-password-nueva"
              type="password"
              className={styles.input}
              value={passwordNueva}
              onChange={(e) => setPasswordNueva(e.target.value)}
              placeholder={t('perfil.password_nueva')}
              autoComplete="new-password"
            />
            <input
              type="password"
              className={styles.input}
              value={passwordConfirmar}
              onChange={(e) => setPasswordConfirmar(e.target.value)}
              placeholder={t('perfil.password_confirmar')}
              autoComplete="new-password"
            />
            <button
              type="button"
              className={styles.btnGuardar}
              disabled={cambiandoPassword}
              onClick={handleCambiarPassword}
            >
              {cambiandoPassword ? t('perfil.actualizando') : t('perfil.cambiar_password')}
            </button>
          </div>
          {passwordError && <p className={styles.msgError}>{passwordError}</p>}
          {passwordOk && <p className={styles.msgOk}>{passwordOk}</p>}
        </div>
      </section>

      {/* Sesión */}
      <section className={styles.section}>
        <h2 className={styles.groupHeader}>{t('perfil.sesion')}</h2>
        <button type="button" className={styles.btnLogout} onClick={logout}>
          {t('perfil.cerrar_sesion')}
        </button>
      </section>
    </div>
  )
}
