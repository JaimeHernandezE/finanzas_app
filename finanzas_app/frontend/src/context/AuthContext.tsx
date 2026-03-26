import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  onAuthStateChanged,
  signInWithPopup,
  getRedirectResult,
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
  updateNombre: (nombre: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const [usuario,  setUsuario]  = useState<Usuario | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  async function verificarConBackend(firebaseUser: FirebaseUser) {
    try {
      const token = await firebaseUser.getIdToken()
      const headers = { Authorization: `Bearer ${token}` }
      const meUrl = `${import.meta.env.VITE_API_URL}/api/usuarios/me/`
      const registroUrl = `${import.meta.env.VITE_API_URL}/api/usuarios/registro/`

      const res = await fetch(meUrl, { headers })

      if (res.ok) {
        const data = await res.json()
        localStorage.setItem('auth_token', token)
        setUsuario(data)
        setError(null)
      } else if (res.status === 404) {
        // Si existe invitación pendiente (o es primer usuario), el backend lo registra aquí.
        const regRes = await fetch(registroUrl, {
          method: 'POST',
          headers,
        })
        if (regRes.ok) {
          const data = await regRes.json()
          localStorage.setItem('auth_token', token)
          setUsuario(data)
          setError(null)
          return
        }

        const regBody = await regRes.json().catch(() => ({}))
        await signOut(auth)
        localStorage.removeItem('auth_token')
        setUsuario(null)
        setError(
          regBody?.error ||
          'Tu cuenta de Gmail no está registrada. Contacta al administrador.'
        )
      } else if (res.status === 401) {
        const body = await res.json().catch(() => ({}))
        const msg = body?.error || 'Sesión no válida'
        setError(
          msg.includes('Token') || msg.includes('Firebase')
            ? 'No se pudo verificar la sesión. Comprueba que el backend tenga el archivo firebase-service-account.json.'
            : msg
        )
        setUsuario(null)
      }
    } catch (err) {
      console.error('Error verificando con backend:', err)
      setError('Error conectando con el servidor. Intenta nuevamente.')
      setUsuario(null)
    } finally {
      setLoading(false)
    }
  }

  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let cancelled = false

    async function initAuth() {
      try {
        const result = await getRedirectResult(auth)
        if (cancelled) return
        if (result?.user) {
          await verificarConBackend(result.user)
          if (cancelled) return
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error en redirect de login:', err)
          setError('Error al iniciar sesión. Intenta nuevamente.')
          setLoading(false)
        }
      }

      if (cancelled) return
      unsubRef.current = onAuthStateChanged(auth, async (firebaseUser) => {
        if (cancelled) return
        if (firebaseUser) {
          await verificarConBackend(firebaseUser)
        } else {
          setUsuario(null)
          setLoading(false)
        }
      })
    }

    initAuth()
    return () => {
      cancelled = true
      if (unsubRef.current) unsubRef.current()
      unsubRef.current = null
    }
  }, [])

  async function login() {
    setError(null)
    setLoading(true)
    try {
      const result = await signInWithPopup(auth, provider)
      await verificarConBackend(result.user)
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : ''
      if (code === 'auth/popup-closed-by-user') {
        setError(null)
      } else {
        setError('Error al iniciar sesión. Intenta nuevamente.')
      }
      setLoading(false)
    }
  }

  async function logout() {
    await signOut(auth)
    localStorage.removeItem('auth_token')
    setUsuario(null)
    navigate('/login', { replace: true })
  }

  async function updateNombre(nombre: string) {
    const token = localStorage.getItem('auth_token')
    if (!token) throw new Error('Sesión no disponible')

    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/usuarios/me/`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nombre }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error || 'No se pudo actualizar el nombre')
    }

    const data = await res.json()
    setUsuario(prev => {
      if (!prev) return data
      return {
        ...data,
        // Si backend no envía foto por algún motivo, conservar la local.
        foto: data?.foto ?? prev.foto ?? null,
      }
    })
  }

  // Cierre de sesión automático tras 5 minutos de inactividad
  const logoutRef = useRef(logout)
  logoutRef.current = logout
  const INACTIVITY_MS = 5 * 60 * 1000
  useEffect(() => {
    if (!usuario) return

    let timeoutId: ReturnType<typeof setTimeout>

    function resetTimer() {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        logoutRef.current()
      }, INACTIVITY_MS)
    }

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach((ev) => window.addEventListener(ev, resetTimer))
    resetTimer()

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetTimer))
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [usuario])

  return (
    <AuthContext.Provider value={{ usuario, user: usuario, loading, error, login, logout, updateNombre }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
