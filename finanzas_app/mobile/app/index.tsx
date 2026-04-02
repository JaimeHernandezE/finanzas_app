import { Redirect } from 'expo-router'
import { View } from 'react-native'
import { useAuth } from '../context/AuthContext'

export default function Index() {
  const { usuario, loading } = useAuth()

  // Mientras se restaura la sesión, mostrar fondo oscuro (AppLock ya muestra splash)
  if (loading) return <View style={{ flex: 1, backgroundColor: '#0f0f0f' }} />

  // Sesión restaurada → ir directo a la app sin pasar por login
  if (usuario) return <Redirect href="/(tabs)" />

  // Sin sesión → pedir credenciales
  return <Redirect href="/(auth)/login" />
}
