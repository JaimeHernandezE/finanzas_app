import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useState } from 'react'

export default function LoginScreen() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin() {
    setError(null)
    setLoading(true)
    try {
      // TODO: implementar Firebase Auth para mobile
      // const { signInWithGoogle } = await import('@/auth/firebase-mobile')
      // await signInWithGoogle()
      router.replace('/(tabs)')
    } catch {
      setError('Error al iniciar sesión. Intenta nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className="flex-1 bg-dark items-center justify-center px-8">
      <Text className="text-white text-4xl font-bold mb-1">Finanzas</Text>
      <Text className="text-white/50 text-base mb-12">Familiares</Text>

      {error && (
        <View className="bg-danger/20 border border-danger/40 rounded-xl px-4 py-3 mb-6 w-full">
          <Text className="text-danger text-sm text-center">{error}</Text>
        </View>
      )}

      <TouchableOpacity
        onPress={handleLogin}
        disabled={loading}
        className="bg-accent w-full py-4 rounded-xl items-center mb-4"
      >
        {loading ? (
          <ActivityIndicator color="#0f0f0f" />
        ) : (
          <Text className="text-dark font-bold text-base">Iniciar sesión con Google</Text>
        )}
      </TouchableOpacity>

      <Text className="text-white/30 text-xs text-center mt-8">
        Solo miembros de la familia pueden acceder.
      </Text>
    </View>
  )
}
