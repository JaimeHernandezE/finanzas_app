import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import axios from 'axios'
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  fetchSignInMethodsForEmail,
  GoogleAuthProvider,
  linkWithCredential,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type User,
} from 'firebase/auth'
import { FirebaseError } from 'firebase/app'
import { getFirebaseAuth } from '../lib/firebase'
import { API_BASE_URL } from '../lib/apiConfig'

export interface Usuario {
  id:      number
  uid?:    string
  email:   string
  nombre:  string
  foto:    string | null
  rol:     string
  familia: { id: number; nombre: string } | null
}

interface AuthContextType {
  usuario: Usuario | null
  /** Alias para compatibilidad con hooks que usan user */
  user:    Usuario | null
  loading: boolean
  error:   string | null
  clearError: () => void
  /** id_token de Google OAuth (expo-auth-session) → Firebase → backend */
  loginWithGoogleIdToken: (googleIdToken: string) => Promise<void>
  loginWithEmail: (email: string, password: string) => Promise<void>
  registerWithEmail: (
    email: string,
    password: string
  ) => Promise<{ requiresLinking: boolean }>
  linkEmailToGoogleAccount: (
    googleIdToken: string,
    email: string,
    password: string
  ) => Promise<void>
  changePassword: (newPassword: string) => Promise<void>
  updateNombre: (nombre: string) => Promise<void>
  logout:  () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

const GOOGLE_PROVIDER_ID = GoogleAuthProvider.PROVIDER_ID
const PASSWORD_PROVIDER_ID = EmailAuthProvider.PROVIDER_ID

function getFirebaseCode(error: unknown): string | null {
  if (error instanceof FirebaseError) return error.code
  return null
}

function mapFirebaseError(code: string): string {
  switch (code) {
    case 'auth/operation-not-allowed':
      return 'El acceso con email/contraseña no está habilitado en Firebase.'
    case 'auth/invalid-api-key':
      return 'La configuración de Firebase es inválida (API key).'
    case 'auth/app-not-authorized':
      return 'Esta app no está autorizada para usar Firebase Auth.'
    case 'auth/user-token-expired':
      return 'Tu sesión expiró. Inicia sesión nuevamente.'
    case 'auth/invalid-user-token':
      return 'La sesión no es válida. Vuelve a iniciar sesión.'
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera unos minutos e inténtalo otra vez.'
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
    case 'auth/user-disabled':
      return 'Esta cuenta está deshabilitada.'
    case 'auth/account-exists-with-different-credential':
      return 'Este correo ya está asociado a otro método de acceso.'
    case 'auth/provider-already-linked':
      return 'El método email/contraseña ya está vinculado a esta cuenta.'
    case 'auth/credential-already-in-use':
      return 'Esa credencial ya está en uso por otra cuenta.'
    case 'auth/requires-recent-login':
      return 'Por seguridad, vuelve a iniciar sesión e intenta nuevamente.'
    default:
      return code
        ? `Ocurrió un error de autenticación (${code}).`
        : 'Ocurrió un error de autenticación.'
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetriableStatus(status?: number): boolean {
  return status === 502 || status === 503 || status === 504
}

async function getMeConReintento(firebaseToken: string) {
  let lastError: unknown = null
  const waits = [0, 900, 1900]
  for (let i = 0; i < waits.length; i++) {
    if (waits[i] > 0) await sleep(waits[i])
    try {
      return await axios.get(`${API_BASE_URL}/api/usuarios/me/`, {
        headers: { Authorization: `Bearer ${firebaseToken}` },
      })
    } catch (err) {
      lastError = err
      if (!axios.isAxiosError(err) || !isRetriableStatus(err.response?.status)) {
        throw err
      }
    }
  }
  throw lastError
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    restaurarSesion()
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const handleAuthError = useCallback(
    (err: unknown, fallbackMessage: string) => {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 404) {
          setError('Tu cuenta no está registrada en ninguna familia.')
          return
        }
        if (err.response?.status === 401) {
          setError('No se pudo verificar la sesión con el servidor.')
          return
        }
      }

      const firebaseCode = getFirebaseCode(err)
      if (firebaseCode) {
        setError(mapFirebaseError(firebaseCode))
        return
      }

      const msg = err instanceof Error ? err.message : fallbackMessage
      setError(msg)
    },
    []
  )

  const sincronizarSesionBackend = useCallback(
    async (firebaseToken: string, redirectToTabs = true) => {
      await SecureStore.setItemAsync('auth_token', firebaseToken)
      try {
        const res = await getMeConReintento(firebaseToken)
        setUsuario(res.data)
      } catch (err) {
        // Paridad con web: si /me responde 404, intentar registro automático.
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          const reg = await axios.post(
            `${API_BASE_URL}/api/usuarios/registro/`,
            {},
            { headers: { Authorization: `Bearer ${firebaseToken}` } }
          )
          setUsuario(reg.data)
        } else {
          throw err
        }
      }
      if (redirectToTabs) {
        router.replace('/(tabs)')
      }
    },
    [router]
  )

  const sincronizarDesdeUsuarioFirebase = useCallback(
    async (firebaseUser: User, redirectToTabs = true) => {
      const firebaseToken = await firebaseUser.getIdToken()
      await sincronizarSesionBackend(firebaseToken, redirectToTabs)
    },
    [sincronizarSesionBackend]
  )

  async function restaurarSesion() {
    try {
      const storedToken = await SecureStore.getItemAsync('auth_token')
      if (!storedToken) return

      // Esperar a que Firebase cargue su sesión persistida (AsyncStorage).
      // authStateReady() resuelve en cuanto el estado inicial está disponible.
      const auth = getFirebaseAuth()
      await auth.authStateReady()

      // Si Firebase tiene usuario activo, obtener un token fresco
      // (el token almacenado puede haber expirado tras >1h sin uso).
      let tokenToUse = storedToken
      const firebaseUser = auth.currentUser
      if (firebaseUser) {
        tokenToUse = await firebaseUser.getIdToken()
        await SecureStore.setItemAsync('auth_token', tokenToUse)
      }

      const res = await getMeConReintento(tokenToUse)
      setUsuario(res.data)
    } catch {
      await SecureStore.deleteItemAsync('auth_token')
      await signOut(getFirebaseAuth()).catch(() => {})
    } finally {
      setLoading(false)
    }
  }

  const loginWithGoogleIdToken = useCallback(
    async (googleIdToken: string) => {
      setError(null)
      setLoading(true)
      try {
        const credential = GoogleAuthProvider.credential(googleIdToken)
        const { user } = await signInWithCredential(getFirebaseAuth(), credential)
        await sincronizarDesdeUsuarioFirebase(user)
      } catch (err: unknown) {
        await SecureStore.deleteItemAsync('auth_token')
        await signOut(getFirebaseAuth()).catch(() => {})
        handleAuthError(err, 'Error al iniciar sesión con Google.')
      } finally {
        setLoading(false)
      }
    },
    [handleAuthError, sincronizarDesdeUsuarioFirebase]
  )

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      setError(null)
      setLoading(true)
      try {
        const emailNormalizado = email.trim().toLowerCase()
        const { user } = await signInWithEmailAndPassword(
          getFirebaseAuth(),
          emailNormalizado,
          password
        )
        await sincronizarDesdeUsuarioFirebase(user)
      } catch (err: unknown) {
        await SecureStore.deleteItemAsync('auth_token')
        handleAuthError(err, 'Error al iniciar sesión con email.')
      } finally {
        setLoading(false)
      }
    },
    [handleAuthError, sincronizarDesdeUsuarioFirebase]
  )

  const registerWithEmail = useCallback(
    async (email: string, password: string) => {
      setError(null)
      setLoading(true)
      try {
        const emailNormalizado = email.trim().toLowerCase()
        const { user } = await createUserWithEmailAndPassword(
          getFirebaseAuth(),
          emailNormalizado,
          password
        )
        await sincronizarDesdeUsuarioFirebase(user)
        return { requiresLinking: false }
      } catch (err: unknown) {
        const code = getFirebaseCode(err)
        const emailNormalizado = email.trim().toLowerCase()
        if (code === 'auth/email-already-in-use' || code === 'auth/account-exists-with-different-credential') {
          try {
            const methods = await fetchSignInMethodsForEmail(
              getFirebaseAuth(),
              emailNormalizado
            )
            const tienePassword = methods.includes(PASSWORD_PROVIDER_ID)
            const sugiereGoogle = methods.length === 0 || methods.includes(GOOGLE_PROVIDER_ID)

            if (sugiereGoogle && !tienePassword) {
              setError(
                'Este correo ya está asociado a una cuenta de Google. Crea una contraseña para poder acceder también con email.'
              )
              return { requiresLinking: true }
            }

            if (tienePassword) {
              setError('Este correo ya está registrado. Inicia sesión con email.')
              return { requiresLinking: false }
            }

            setError(
              'Este correo ya existe. Si usas Google para entrar, continúa con vincular cuenta.'
            )
            return { requiresLinking: true }
          } catch (methodError: unknown) {
            void methodError
            setError(
              'Este correo ya existe. Continúa con vincular cuenta para asociar email y Google.'
            )
            return { requiresLinking: true }
          }
        }

        handleAuthError(err, 'Error al crear la cuenta con email.')
        return { requiresLinking: false }
      } finally {
        setLoading(false)
      }
    },
    [handleAuthError, sincronizarDesdeUsuarioFirebase]
  )

  const linkEmailToGoogleAccount = useCallback(
    async (googleIdToken: string, email: string, password: string) => {
      setError(null)
      setLoading(true)
      try {
        const emailNormalizado = email.trim().toLowerCase()
        const googleCredential = GoogleAuthProvider.credential(googleIdToken)
        const googleSession = await signInWithCredential(
          getFirebaseAuth(),
          googleCredential
        )
        const emailGoogle = (googleSession.user.email ?? '').trim().toLowerCase()

        if (!emailGoogle || emailGoogle !== emailNormalizado) {
          throw new Error('Debes iniciar sesión con la cuenta de Google asociada a este correo.')
        }

        const emailCredential = EmailAuthProvider.credential(emailNormalizado, password)

        try {
          await linkWithCredential(googleSession.user, emailCredential)
        } catch (linkError: unknown) {
          const linkCode = getFirebaseCode(linkError)
          if (linkCode !== 'auth/provider-already-linked') {
            throw linkError
          }
        }

        await sincronizarDesdeUsuarioFirebase(googleSession.user)
      } catch (err: unknown) {
        await SecureStore.deleteItemAsync('auth_token')
        handleAuthError(err, 'No se pudo vincular la cuenta con email.')
      } finally {
        setLoading(false)
      }
    },
    [handleAuthError, sincronizarDesdeUsuarioFirebase]
  )

  async function logout() {
    await SecureStore.deleteItemAsync('auth_token')
    await signOut(getFirebaseAuth()).catch(() => {})
    setUsuario(null)
    router.replace('/(auth)/login')
  }

  async function changePassword(newPassword: string) {
    const firebaseUser = getFirebaseAuth().currentUser
    if (!firebaseUser) {
      throw new Error('No hay una sesión activa para cambiar la contraseña.')
    }
    if (newPassword.trim().length < 6) {
      throw new Error('La nueva contraseña debe tener al menos 6 caracteres.')
    }

    try {
      await updatePassword(firebaseUser, newPassword.trim())
    } catch (err: unknown) {
      const firebaseCode = getFirebaseCode(err)
      if (firebaseCode === 'auth/requires-recent-login') {
        throw new Error('Por seguridad, vuelve a iniciar sesión e intenta nuevamente.')
      }
      if (firebaseCode) {
        throw new Error(mapFirebaseError(firebaseCode))
      }
      throw new Error('No se pudo actualizar la contraseña.')
    }
  }

  async function updateNombre(nombre: string) {
    const nombreLimpio = nombre.trim()
    if (!nombreLimpio) {
      throw new Error('El nombre no puede estar vacío.')
    }

    const token = await SecureStore.getItemAsync('auth_token')
    if (!token) {
      throw new Error('Sesión no disponible.')
    }

    const res = await axios.patch(
      `${API_BASE_URL}/api/usuarios/me/`,
      { nombre: nombreLimpio },
      { headers: { Authorization: `Bearer ${token}` } }
    )

    const data = res.data as Usuario
    setUsuario((prev) => {
      if (!prev) return data
      return {
        ...prev,
        ...data,
        foto: data?.foto ?? prev.foto ?? null,
      }
    })
  }

  return (
    <AuthContext.Provider
      value={{
        usuario,
        user: usuario,
        loading,
        error,
        clearError,
        loginWithGoogleIdToken,
        loginWithEmail,
        registerWithEmail,
        linkEmailToGoogleAccount,
        changePassword,
        updateNombre,
        logout,
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
