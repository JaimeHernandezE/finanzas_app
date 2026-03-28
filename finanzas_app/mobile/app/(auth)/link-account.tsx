import { useEffect, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import * as Google from 'expo-auth-session/providers/google'
import * as AuthSession from 'expo-auth-session'
import Constants from 'expo-constants'
import { useAuth } from '../../context/AuthContext'

WebBrowser.maybeCompleteAuthSession()

export default function LinkAccountScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ email?: string }>()
  const emailParam = typeof params.email === 'string' ? params.email : ''

  const {
    linkEmailToGoogleAccount,
    loading: authLoading,
    error: authError,
    clearError,
  } = useAuth()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [pendingPassword, setPendingPassword] = useState<string | null>(null)
  const [oauthLoading, setOauthLoading] = useState(false)

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

  const error = localError ?? authError

  useEffect(() => {
    if (!pendingPassword) return
    if (response?.type === 'success') {
      const idToken = response.params.id_token
      if (typeof idToken === 'string' && idToken.length > 0) {
        void linkEmailToGoogleAccount(idToken, emailParam, pendingPassword)
      } else {
        setLocalError('No se recibió un token válido desde Google.')
      }
      setOauthLoading(false)
      setPendingPassword(null)
    } else if (response?.type === 'error') {
      setLocalError('No se pudo completar el inicio de sesión con Google.')
      setOauthLoading(false)
      setPendingPassword(null)
    } else if (response?.type === 'cancel' || response?.type === 'dismiss') {
      setLocalError('Debes iniciar sesión con Google para vincular la cuenta.')
      setOauthLoading(false)
      setPendingPassword(null)
    }
  }, [response, pendingPassword, emailParam, linkEmailToGoogleAccount])

  async function handleLinkAccount() {
    clearError()
    setLocalError(null)

    const emailNormalizado = emailParam.trim().toLowerCase()
    if (!emailNormalizado) {
      setLocalError('No se recibió un correo para vincular.')
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
    if (!webClientId) {
      setLocalError(
        'Falta EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID en .env para iniciar sesión con Google.'
      )
      return
    }
    if (isExpoGo) {
      setLocalError(
        'Google OAuth no es compatible de forma confiable en Expo Go para este flujo. Usa un Development Build e inténtalo nuevamente.'
      )
      return
    }

    setPendingPassword(password)
    setOauthLoading(true)
    try {
      await promptAsync()
    } catch {
      setOauthLoading(false)
      setPendingPassword(null)
      setLocalError('No se pudo abrir el inicio de sesión con Google.')
    }
  }

  return (
    <View className="flex-1 bg-dark items-center justify-center px-8">
      <Text className="text-white text-3xl font-bold mb-1">Vincular cuenta</Text>
      <Text className="text-white/60 text-sm text-center mb-8">
        Este correo ya esta asociado a una cuenta de Google. Crea una contraseña para
        poder acceder tambien con email.
      </Text>

      <View className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 mb-4">
        <Text className="text-white/70 text-xs mb-1">Correo</Text>
        <Text className="text-white font-medium">{emailParam || 'Sin correo'}</Text>
      </View>

      {error && (
        <View className="bg-danger/20 border border-danger/40 rounded-xl px-4 py-3 mb-6 w-full">
          <Text className="text-danger text-sm text-center">{error}</Text>
        </View>
      )}

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
        onPress={handleLinkAccount}
        disabled={authLoading || oauthLoading}
        className="bg-accent w-full py-4 rounded-xl items-center mb-2"
      >
        {authLoading || oauthLoading ? (
          <ActivityIndicator color="#0f0f0f" />
        ) : (
          <Text className="text-dark font-bold text-base">Vincular cuenta</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => {
          clearError()
          setLocalError(null)
          router.replace('/(auth)/login')
        }}
        disabled={authLoading || oauthLoading}
        className="mt-2"
      >
        <Text className="text-white/70 text-sm">Volver a iniciar sesión</Text>
      </TouchableOpacity>
    </View>
  )
}
