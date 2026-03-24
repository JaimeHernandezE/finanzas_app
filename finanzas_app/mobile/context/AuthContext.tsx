import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import axios from 'axios'
import { GoogleAuthProvider, signInWithCredential, signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'

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
  /** id_token de Google OAuth (expo-auth-session) → Firebase → backend */
  loginWithGoogleIdToken: (googleIdToken: string) => Promise<void>
  logout:  () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    restaurarSesion()
  }, [])

  async function restaurarSesion() {
    try {
      const token = await SecureStore.getItemAsync('auth_token')
      if (!token) return
      const res = await axios.get(`${API_URL}/api/usuarios/me/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setUsuario(res.data)
    } catch {
      await SecureStore.deleteItemAsync('auth_token')
      await signOut(auth).catch(() => {})
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
        const { user } = await signInWithCredential(auth, credential)
        const firebaseToken = await user.getIdToken()
        await SecureStore.setItemAsync('auth_token', firebaseToken)
        const res = await axios.get(`${API_URL}/api/usuarios/me/`, {
          headers: { Authorization: `Bearer ${firebaseToken}` },
        })
        setUsuario(res.data)
        router.replace('/(tabs)')
      } catch (err: unknown) {
        await SecureStore.deleteItemAsync('auth_token')
        await signOut(auth).catch(() => {})
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          setError('Tu cuenta no está registrada en ninguna familia.')
        } else if (axios.isAxiosError(err) && err.response?.status === 401) {
          setError('No se pudo verificar la sesión con el servidor.')
        } else {
          const msg = err instanceof Error ? err.message : 'Error al iniciar sesión'
          setError(msg)
        }
      } finally {
        setLoading(false)
      }
    },
    [router]
  )

  async function logout() {
    await SecureStore.deleteItemAsync('auth_token')
    await signOut(auth).catch(() => {})
    setUsuario(null)
    router.replace('/(auth)/login')
  }

  return (
    <AuthContext.Provider
      value={{
        usuario,
        user: usuario,
        loading,
        error,
        loginWithGoogleIdToken,
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
