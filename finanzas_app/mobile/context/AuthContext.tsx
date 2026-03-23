import { createContext, useContext, useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import axios from 'axios'

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
  login:   () => Promise<void>
  logout:  () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // Al iniciar: restaurar sesión desde SecureStore
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
    } finally {
      setLoading(false)
    }
  }

  async function login() {
    setError(null)
    setLoading(true)
    try {
      // TODO: configurar Firebase Auth para mobile.
      // Pasos:
      //   1. Instalar @react-native-google-signin/google-signin
      //   2. Configurar GoogleSignin.configure({ webClientId: '...' })
      //   3. const { idToken } = await GoogleSignin.signIn()
      //   4. POST a /api/usuarios/auth/firebase/ con { firebase_token: idToken }
      //   5. Guardar access con SecureStore.setItemAsync('auth_token', res.data.access)
      //   6. setUsuario(res.data.usuario)
      throw new Error(
        'Firebase Auth pendiente de configurar para mobile.\n' +
        'Ver comentario TODO en mobile/context/AuthContext.tsx'
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al iniciar sesión'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    await SecureStore.deleteItemAsync('auth_token')
    setUsuario(null)
    router.replace('/(auth)/login')
  }

  // Auto-logout tras 5 minutos de inactividad (implementar con AppState en futura iteración)

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
