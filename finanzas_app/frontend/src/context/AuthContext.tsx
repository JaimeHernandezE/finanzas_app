import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  fetchSignInMethodsForEmail,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithEmailAndPassword,
  signInWithPopup,
  getRedirectResult,
  linkWithCredential,
  GoogleAuthProvider,
  signOut,
  updatePassword,
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
  clearError: () => void
  login:    () => Promise<void>
  loginWithEmail: (email: string, password: string) => Promise<void>
  checkEmailForRegister: (
    email: string
  ) => Promise<{ exists: boolean; requiresLinking: boolean; hasPassword: boolean }>
  registerWithEmail: (
    email: string,
    password: string
  ) => Promise<{ requiresLinking: boolean }>
  linkEmailToGoogleAccount: (email: string, password: string) => Promise<void>
  changePassword: (newPassword: string) => Promise<void>
  logout:   () => Promise<void>
  updateNombre: (nombre: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)
const GOOGLE_PROVIDER_ID = GoogleAuthProvider.PROVIDER_ID
const PASSWORD_PROVIDER_ID = EmailAuthProvider.PROVIDER_ID

function mapFirebaseError(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'El correo ingresado no es válido.'
    case 'auth/missing-password':
      return 'Debes ingresar una contraseña.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Correo o contraseña incorrectos.'
    case 'auth/email-already-in-use':
      return 'Este correo ya está registrado.'
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.'
    case 'auth/network-request-failed':
      return 'No hay conexión a internet. Intenta nuevamente.'
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera unos minutos e inténtalo otra vez.'
    case 'auth/provider-already-linked':
      return 'El método email/contraseña ya está vinculado a esta cuenta.'
    case 'auth/credential-already-in-use':
      return 'Esa credencial ya está en uso por otra cuenta.'
    case 'auth/popup-closed-by-user':
      return 'Se canceló el inicio de sesión con Google.'
    case 'auth/requires-recent-login':
      return 'Por seguridad, vuelve a autenticarte para cambiar la contraseña.'
    default:
      return 'Error de autenticación. Intenta nuevamente.'
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const [usuario,  setUsuario]  = useState<Usuario | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  function clearError() {
    setError(null)
  }

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
        setError(mapFirebaseError(code))
      }
      setLoading(false)
    }
  }

  async function loginWithEmail(email: string, password: string) {
    setError(null)
    setLoading(true)
    try {
      const emailNormalizado = email.trim().toLowerCase()
      const result = await signInWithEmailAndPassword(auth, emailNormalizado, password)
      await verificarConBackend(result.user)
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : ''
      setError(mapFirebaseError(code))
      setLoading(false)
    }
  }

  async function checkEmailForRegister(email: string) {
    const emailNormalizado = email.trim().toLowerCase()
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/usuarios/auth/check-email/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailNormalizado }),
      })
      if (res.ok) {
        const data = await res.json()
        return {
          exists: Boolean(data?.exists),
          requiresLinking: Boolean(data?.requires_linking),
          hasPassword: Boolean(data?.has_password),
        }
      }
    } catch {
      // Fallback a Firebase cliente si el backend no responde.
    }

    try {
      const methods = await fetchSignInMethodsForEmail(auth, emailNormalizado)
      const hasPassword = methods.includes(PASSWORD_PROVIDER_ID)
      const requiresLinking =
        methods.length > 0 &&
        methods.includes(GOOGLE_PROVIDER_ID) &&
        !hasPassword

      return {
        exists: methods.length > 0,
        requiresLinking,
        hasPassword,
      }
    } catch {
      return {
        exists: false,
        requiresLinking: false,
        hasPassword: false,
      }
    }
  }

  async function registerWithEmail(email: string, password: string) {
    setError(null)
    setLoading(true)
    try {
      const emailNormalizado = email.trim().toLowerCase()
      const result = await createUserWithEmailAndPassword(auth, emailNormalizado, password)
      await verificarConBackend(result.user)
      return { requiresLinking: false }
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : ''
      const emailNormalizado = email.trim().toLowerCase()
      if (code === 'auth/email-already-in-use' || code === 'auth/account-exists-with-different-credential') {
        try {
          const methods = await fetchSignInMethodsForEmail(auth, emailNormalizado)
          const tienePassword = methods.includes(PASSWORD_PROVIDER_ID)
          const sugiereGoogle = methods.length === 0 || methods.includes(GOOGLE_PROVIDER_ID)

          if (sugiereGoogle && !tienePassword) {
            setError(
              'Este correo ya está asociado a una cuenta de Google. Crea una contraseña para poder acceder también con email.'
            )
            setLoading(false)
            return { requiresLinking: true }
          }

          if (tienePassword) {
            setError('Este correo ya está registrado. Inicia sesión con email.')
            setLoading(false)
            return { requiresLinking: false }
          }

          setError(
            'Este correo ya existe. Si usas Google para entrar, continua con Vincular cuenta.'
          )
          setLoading(false)
          return { requiresLinking: true }
        } catch {
          // Fallback: en algunos proyectos Firebase no revela métodos de login.
          // Para no bloquear el flujo, redirigimos a vincular cuenta.
          setError(
            'Este correo ya existe. Continua con Vincular cuenta para asociar email y Google.'
          )
          setLoading(false)
          return { requiresLinking: true }
        }
      }

      setError(mapFirebaseError(code))
      setLoading(false)
      return { requiresLinking: false }
    }
  }

  async function linkEmailToGoogleAccount(email: string, password: string) {
    setError(null)
    setLoading(true)
    try {
      const emailNormalizado = email.trim().toLowerCase()
      const linkProvider = new GoogleAuthProvider()
      linkProvider.setCustomParameters({ prompt: 'select_account' })
      const googleResult = await signInWithPopup(auth, linkProvider)
      const googleEmail = (googleResult.user.email ?? '').trim().toLowerCase()

      if (!googleEmail || googleEmail !== emailNormalizado) {
        await signOut(auth).catch(() => {})
        throw new Error('Debes iniciar sesión con la cuenta de Google asociada a este correo.')
      }

      const emailCredential = EmailAuthProvider.credential(emailNormalizado, password)
      try {
        await linkWithCredential(googleResult.user, emailCredential)
      } catch (err: unknown) {
        const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : ''
        if (code !== 'auth/provider-already-linked') {
          throw err
        }
      }

      await verificarConBackend(googleResult.user)
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : ''
      if (err instanceof Error && err.message) {
        setError(err.message)
      } else {
        setError(mapFirebaseError(code))
      }
      setLoading(false)
    }
  }

  async function changePassword(newPassword: string) {
    const firebaseUser = auth.currentUser
    if (!firebaseUser || !firebaseUser.email) {
      throw new Error('No hay una sesión activa para cambiar la contraseña.')
    }
    if (newPassword.trim().length < 6) {
      throw new Error('La nueva contraseña debe tener al menos 6 caracteres.')
    }

    try {
      await updatePassword(firebaseUser, newPassword.trim())
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : ''
      if (code === 'auth/requires-recent-login') {
        const googleProvider = new GoogleAuthProvider()
        googleProvider.setCustomParameters({ prompt: 'select_account' })
        await reauthenticateWithPopup(firebaseUser, googleProvider)
        await updatePassword(firebaseUser, newPassword.trim())
        return
      }
      if (err instanceof Error && !code) {
        throw err
      }
      throw new Error(mapFirebaseError(code))
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
    <AuthContext.Provider
      value={{
        usuario,
        user: usuario,
        loading,
        error,
        clearError,
        login,
        loginWithEmail,
        checkEmailForRegister,
        registerWithEmail,
        linkEmailToGoogleAccount,
        changePassword,
        logout,
        updateNombre,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
