import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export type RolUsuario = 'ADMIN' | 'MIEMBRO' | 'LECTURA'

export interface UsuarioAuth {
  id: string
  nombre: string
  email: string
  foto?: string | null
  rol: RolUsuario
}

export interface AuthContextType {
  user: UsuarioAuth | null
  logout: () => void
}

// -----------------------------------------------------------------------------
// Mock — TODO: reemplazar por login real (Firebase + backend)
// -----------------------------------------------------------------------------

const MOCK_USER: UsuarioAuth = {
  id: 'jaime',
  nombre: 'Jaime Herrera',
  email: 'jhearquitecto@gmail.com',
  foto: null,
  rol: 'ADMIN',
}

// -----------------------------------------------------------------------------
// Contexto
// -----------------------------------------------------------------------------

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [user, setUser] = useState<UsuarioAuth | null>(MOCK_USER)

  const logout = useCallback(() => {
    setUser(null)
    navigate('/login')
  }, [navigate])

  const value: AuthContextType = useMemo(
    () => ({ user, logout }),
    [user, logout]
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return ctx
}
