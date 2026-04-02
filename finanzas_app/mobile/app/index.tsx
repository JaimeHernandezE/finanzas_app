import { Redirect } from 'expo-router'
import { ActivityIndicator, Text, View } from 'react-native'
import { useAuth } from '../context/AuthContext'

export default function Index() {
  const { usuario, loading } = useAuth()

  // Respaldo si esta pantalla monta con loading (p. ej. transición); AppLock ya muestra splash.
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#0f0f0f',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
        }}
      >
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 8 }}>
          Finanzas
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 28 }}>
          Familiares
        </Text>
        <ActivityIndicator size="large" color="#c8f060" />
        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, marginTop: 20, textAlign: 'center' }}>
          Cargando…
        </Text>
      </View>
    )
  }

  // Sesión restaurada → ir directo a la app sin pasar por login
  if (usuario) return <Redirect href="/(tabs)" />

  // Sin sesión → pedir credenciales
  return <Redirect href="/(auth)/login" />
}
