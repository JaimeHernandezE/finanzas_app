import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../context/AuthContext'

export default function RegisterScreen() {
  const router = useRouter()
  const { registerWithEmail, loading: authLoading, error: authError, clearError } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const error = localError ?? authError

  function validarEmail(valor: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim())
  }

  async function handleRegister() {
    clearError()
    setLocalError(null)

    const emailNormalizado = email.trim().toLowerCase()
    if (!validarEmail(emailNormalizado)) {
      setLocalError('Ingresa un correo válido.')
      return
    }
    if (password.length < 6) {
      setLocalError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setLocalError('Las contraseñas no coinciden.')
      return
    }

    const result = await registerWithEmail(emailNormalizado, password)
    if (result.requiresLinking) {
      router.replace({
        pathname: '/(auth)/link-account' as never,
        params: { email: emailNormalizado },
      })
    }
  }

  return (
    <View className="flex-1 bg-dark items-center justify-center px-8">
      <Text className="text-white text-3xl font-bold mb-1">Crear cuenta</Text>
      <Text className="text-white/50 text-base mb-10">Accede con email y contraseña</Text>

      {error && (
        <View className="bg-danger/20 border border-danger/40 rounded-xl px-4 py-3 mb-6 w-full">
          <Text className="text-danger text-sm text-center">{error}</Text>
        </View>
      )}

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Correo electrónico"
        placeholderTextColor="#8f8f8f"
        autoCapitalize="none"
        keyboardType="email-address"
        className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white mb-3"
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Contraseña"
        placeholderTextColor="#8f8f8f"
        secureTextEntry
        className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white mb-3"
      />
      <TextInput
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Confirmar contraseña"
        placeholderTextColor="#8f8f8f"
        secureTextEntry
        className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white mb-4"
      />

      <TouchableOpacity
        onPress={handleRegister}
        disabled={authLoading}
        className="bg-accent w-full py-4 rounded-xl items-center mb-2"
      >
        {authLoading ? (
          <ActivityIndicator color="#0f0f0f" />
        ) : (
          <Text className="text-dark font-bold text-base">Crear cuenta</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => {
          clearError()
          setLocalError(null)
          router.replace('/(auth)/login')
        }}
        disabled={authLoading}
        className="mt-2"
      >
        <Text className="text-white/70 text-sm">¿Ya tienes cuenta? Inicia sesión</Text>
      </TouchableOpacity>
    </View>
  )
}
