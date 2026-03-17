import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User as FirebaseUser
} from 'firebase/auth'
import { auth, provider } from '../firebase'

export interface Usuario {
  id:       number
  uid?:     string
  email:    string
  nombre:   string
  foto:     string | null
  rol:      string
  familia:  { id: number; nombre: string } | null
}

interface AuthContextType {
  usuario:  Usuario | null
  /** Alias de usuario para compatibilidad con páginas que usan useAuth().user */
  user:     Usuario | null
  loading:  boolean
  error:    string | null
  login:    () => Promise<void>
  logout:   () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario,  setUsuario]  = useState<Usuario | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await verificarConBackend(firebaseUser)
      } else {
        setUsuario(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  async function verificarConBackend(firebaseUser: FirebaseUser) {
    try {
      const token = await firebaseUser.getIdToken()

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/usuarios/me/`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (res.ok) {
        const data = await res.json()
        localStorage.setItem('auth_token', token)
        setUsuario(data)
        setError(null)
      } else if (res.status === 404) {
        await signOut(auth)
        localStorage.removeItem('auth_token')
        setUsuario(null)
        setError('Tu cuenta de Gmail no está registrada. Contacta al administrador.')
      }
    } catch (err) {
      console.error('Error verificando con backend:', err)
      setError('Error conectando con el servidor. Intenta nuevamente.')
      setLoading(false)
    }
  }

  async function login() {
    setError(null)
    try {
      await signInWithPopup(auth, provider)
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : ''
      if (code !== 'auth/popup-closed-by-user') {
        setError('Error al iniciar sesión. Intenta nuevamente.')
      }
    }
  }

  async function logout() {
    await signOut(auth)
    localStorage.removeItem('auth_token')
    setUsuario(null)
  }

  return (
    <AuthContext.Provider value={{ usuario, user: usuario, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
