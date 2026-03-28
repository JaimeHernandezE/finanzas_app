import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export default function LoginPage() {
  const navigate = useNavigate()
  const {
    usuario,
    loading,
    error,
    clearError,
    login,
    loginWithEmail,
    checkEmailForRegister,
    registerWithEmail,
    linkEmailToGoogleAccount,
  } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [linkMode, setLinkMode] = useState(false)
  const [registerStep, setRegisterStep] = useState<'email' | 'password'>('email')
  const [localError, setLocalError] = useState<string | null>(null)

  const shownError = localError ?? error
  const title = useMemo(() => {
    if (linkMode) return 'Vincular cuenta'
    return isRegister ? 'Crear cuenta' : 'Iniciar sesión'
  }, [isRegister, linkMode])
  const subtitle = useMemo(() => {
    if (linkMode) {
      return 'Este correo ya está asociado a Google. Crea contraseña y vincula ambos métodos.'
    }
    return isRegister
      ? 'Regístrate con email o usa Google.'
      : 'Usa email/contraseña o tu cuenta de Google.'
  }, [isRegister, linkMode])

  useEffect(() => {
    if (!loading && usuario) {
      navigate('/', { replace: true })
    }
  }, [loading, usuario, navigate])

  function validarEmail(valor: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim())
  }

  async function handleSubmitEmail() {
    clearError()
    setLocalError(null)
    const emailNormalizado = email.trim().toLowerCase()

    if (!validarEmail(emailNormalizado)) {
      setLocalError('Ingresa un correo válido.')
      return
    }

    if (linkMode) {
      if (!password) {
        setLocalError('Ingresa una contraseña.')
        return
      }
      if (password.length < 6) {
        setLocalError('La contraseña debe tener al menos 6 caracteres.')
        return
      }
      if (password !== confirmPassword) {
        setLocalError('Las contraseñas no coinciden.')
        return
      }
      await linkEmailToGoogleAccount(emailNormalizado, password)
      return
    }

    if (isRegister) {
      if (registerStep === 'email') {
        const check = await checkEmailForRegister(emailNormalizado)
        if (check.requiresLinking) {
          setLinkMode(true)
          setPassword('')
          setConfirmPassword('')
          return
        }
        if (check.hasPassword) {
          setLocalError('Este correo ya está registrado. Inicia sesión con email.')
          return
        }
        if (check.exists) {
          setLocalError(
            'Este correo ya existe con otro método. Continúa con Google para vincular la cuenta.'
          )
          return
        }

        setRegisterStep('password')
        setLocalError('Correo registrado. Ahora crea y confirma tu contraseña.')
        return
      }

      if (!password) {
        setLocalError('Ingresa una contraseña.')
        return
      }
      if (password.length < 6) {
        setLocalError('La contraseña debe tener al menos 6 caracteres.')
        return
      }
      if (password !== confirmPassword) {
        setLocalError('Las contraseñas no coinciden.')
        return
      }

      const result = await registerWithEmail(emailNormalizado, password)
      if (result.requiresLinking) {
        setLinkMode(true)
        setRegisterStep('email')
        setPassword('')
        setConfirmPassword('')
      }
      return
    }

    if (!password) {
      setLocalError('Ingresa una contraseña.')
      return
    }

    await loginWithEmail(emailNormalizado, password)
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: 400, margin: '2rem auto', textAlign: 'center' }}>
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Cargando…</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 400, margin: '2rem auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        {title}
      </h1>
      <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        {subtitle}
      </p>
      {shownError && (
        <p style={{ color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>
          {shownError}
        </p>
      )}

      <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Correo electrónico"
          autoComplete="email"
          readOnly={linkMode}
          style={{
            width: '100%',
            padding: '0.75rem 0.875rem',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            fontSize: '0.95rem',
            backgroundColor: linkMode ? '#f3f4f6' : '#fff',
            color: linkMode ? '#374151' : '#111827',
            cursor: linkMode ? 'not-allowed' : 'text',
          }}
        />
        {(!isRegister || linkMode || registerStep === 'password') && (
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            autoComplete={isRegister || linkMode ? 'new-password' : 'current-password'}
            style={{
              width: '100%',
              padding: '0.75rem 0.875rem',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: '0.95rem',
            }}
          />
        )}
        {(linkMode || (isRegister && registerStep === 'password')) && (
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirmar contraseña"
            autoComplete="new-password"
            style={{
              width: '100%',
              padding: '0.75rem 0.875rem',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              fontSize: '0.95rem',
            }}
          />
        )}
      </div>

      <button
        type="button"
        onClick={() => void handleSubmitEmail()}
        style={{
          width: '100%',
          padding: '0.75rem 1rem',
          fontSize: '1rem',
          fontWeight: 600,
          border: 'none',
          borderRadius: 8,
          backgroundColor: '#111827',
          color: '#fff',
          cursor: 'pointer',
          marginBottom: '0.75rem',
        }}
      >
        {linkMode
          ? 'Vincular cuenta'
          : isRegister
            ? registerStep === 'email'
              ? 'Validar correo'
              : 'Crear cuenta'
            : 'Iniciar sesión con email'}
      </button>

      {!linkMode && (
        <button
          type="button"
          onClick={() => {
            clearError()
            setLocalError(null)
            setLinkMode(false)
            setRegisterStep('email')
            setIsRegister(prev => !prev)
            setPassword('')
            setConfirmPassword('')
          }}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            fontSize: '0.9rem',
            fontWeight: 500,
            border: 'none',
            backgroundColor: 'transparent',
            color: '#2563eb',
            cursor: 'pointer',
            marginBottom: '0.75rem',
          }}
        >
          {isRegister ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          clearError()
          setLocalError(null)
          void login()
        }}
        style={{
          width: '100%',
          padding: '0.75rem 1rem',
          fontSize: '1rem',
          fontWeight: 600,
          border: '1px solid #d1d5db',
          borderRadius: 8,
          backgroundColor: '#fff',
          cursor: 'pointer',
        }}
      >
        Continuar con Google
      </button>
    </div>
  )
}
