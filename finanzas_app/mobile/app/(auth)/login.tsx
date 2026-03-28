import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native'
import { useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import * as Google from 'expo-auth-session/providers/google'
import * as AuthSession from 'expo-auth-session'
import Constants from 'expo-constants'
import { useAuth } from '../../context/AuthContext'

WebBrowser.maybeCompleteAuthSession()

export default function LoginScreen() {
  const router = useRouter()
  const {
    loginWithGoogleIdToken,
    loginWithEmail,
    loading: authLoading,
    error: authError,
    clearError,
  } = useAuth()
  const [localError, setLocalError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? ''
  const androidClientId =
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? webClientId
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? webClientId
  const isExpoGo = Constants.appOwnership === 'expo'
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'finanzas',
    path: 'oauthredirect',
  })

  const [, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId,
    androidClientId,
    iosClientId,
    redirectUri,
  })

  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.params.id_token
      if (typeof idToken === 'string' && idToken.length > 0) {
        void loginWithGoogleIdToken(idToken)
      }
    } else if (response?.type === 'error') {
      setLocalError('No se pudo completar el inicio de sesión con Google.')
    }
  }, [response, loginWithGoogleIdToken])

  const error = localError ?? authError

  function validarEmail(valor: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim())
  }

  async function handleLogin() {
    clearError()
    setLocalError(null)
    if (!webClientId) {
      setLocalError(
        'Falta EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID en .env (OAuth Web Client ID de Google Cloud / Firebase).'
      )
      return
    }
    if (isExpoGo) {
      setLocalError(
        'Google OAuth no es compatible de forma confiable en Expo Go para este flujo. Usa un Development Build (npx expo run:android o EAS build) e inténtalo ahí.'
      )
      return
    }
    await promptAsync()
  }

  async function handleEmailLogin() {
    clearError()
    setLocalError(null)

    const emailNormalizado = email.trim().toLowerCase()
    if (!validarEmail(emailNormalizado)) {
      setLocalError('Ingresa un correo válido.')
      return
    }
    if (!password) {
      setLocalError('Ingresa tu contraseña.')
      return
    }

    await loginWithEmail(emailNormalizado, password)
  }

  return (
    <View className="flex-1 bg-surface px-6 pt-16 pb-8">
      <View className="mb-8">
        <Text className="text-dark text-4xl font-bold">Finanzas</Text>
        <Text className="text-muted text-base mt-1">Familiares</Text>
      </View>

      <View className="bg-white border border-border rounded-2xl p-5">
        <Text className="text-dark text-lg font-bold mb-1">Iniciar sesión</Text>
        <Text className="text-muted text-sm mb-5">Accede con Google o tu correo.</Text>

        {error && (
          <View className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 mb-4">
            <Text className="text-danger text-sm text-center">{error}</Text>
          </View>
        )}

        {!webClientId && (
          <Text className="text-muted text-xs text-center mb-4">
            Configura EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (cliente OAuth Web).
          </Text>
        )}

        <TouchableOpacity
          onPress={handleLogin}
          disabled={authLoading}
          className="bg-accent w-full py-4 rounded-xl items-center mb-4"
        >
          {authLoading ? (
            <ActivityIndicator color="#0f0f0f" />
          ) : (
            <Text className="text-dark font-bold text-base">Iniciar sesión con Google</Text>
          )}
        </TouchableOpacity>

        <View className="w-full border-t border-border my-4" />

        <Text className="text-xs text-muted font-semibold uppercase tracking-wide mb-1">Correo</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="correo@ejemplo.com"
          placeholderTextColor="#888884"
          autoCapitalize="none"
          keyboardType="email-address"
          className="w-full border border-border rounded-xl px-4 py-3 text-dark mb-3"
        />
        <Text className="text-xs text-muted font-semibold uppercase tracking-wide mb-1">Contraseña</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Tu contraseña"
          placeholderTextColor="#888884"
          secureTextEntry
          className="w-full border border-border rounded-xl px-4 py-3 text-dark mb-4"
        />

        <TouchableOpacity
          onPress={handleEmailLogin}
          disabled={authLoading}
          className="bg-dark w-full py-4 rounded-xl items-center mb-2"
        >
          {authLoading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-white font-bold text-base">Iniciar sesión con email</Text>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={() => {
          clearError()
          setLocalError(null)
          router.push('/(auth)/register' as never)
        }}
        disabled={authLoading}
        className="mt-5 self-center"
      >
        <Text className="text-dark text-sm">¿No tienes cuenta? <Text className="font-semibold">Regístrate</Text></Text>
      </TouchableOpacity>

      <Text className="text-muted text-xs text-center mt-auto">
        Solo miembros de la familia pueden acceder.
      </Text>
    </View>
  )
}
