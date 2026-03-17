import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export default function LoginPage() {
  const navigate = useNavigate()
  const { usuario, loading, error, login } = useAuth()

  useEffect(() => {
    if (!loading && usuario) {
      navigate('/', { replace: true })
    }
  }, [loading, usuario, navigate])

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
        Iniciar sesión
      </h1>
      <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Usa tu cuenta de Google para acceder a Finanzas.
      </p>
      {error && (
        <p style={{ color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => login()}
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
