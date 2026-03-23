import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { PantallaCarga } from '@/components/ui/PantallaCarga'

interface Props {
  children: React.ReactNode
}

export function RutaProtegida({ children }: Props) {
  const { usuario, loading } = useAuth()

  if (loading) return <PantallaCarga />
  if (!usuario) return <Navigate to="/" replace />

  return <>{children}</>
}
