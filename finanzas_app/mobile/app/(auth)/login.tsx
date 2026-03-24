import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import * as Google from 'expo-auth-session/providers/google'
import { useAuth } from '../../context/AuthContext'

WebBrowser.maybeCompleteAuthSession()

export default function LoginScreen() {
  const { loginWithGoogleIdToken, loading: authLoading, error: authError } =
    useAuth()
  const [localError, setLocalError] = useState<string | null>(null)

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? ''

  const [, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: webClientId || 'placeholder-needs-env.apps.googleusercontent.com',
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

  async function handleLogin() {
    setLocalError(null)
    if (!webClientId) {
      setLocalError(
        'Falta EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID en .env (OAuth Web Client ID de Google Cloud / Firebase).'
      )
      return
    }
    await promptAsync()
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

      {!webClientId && (
        <Text className="text-white/40 text-xs text-center mb-4 px-2">
          Configura EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (cliente OAuth tipo &quot;Web&quot;
          en Google Cloud, mismo proyecto que Firebase).
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
          <Text className="text-dark font-bold text-base">
            Iniciar sesión con Google
          </Text>
        )}
      </TouchableOpacity>

      <Text className="text-white/30 text-xs text-center mt-8">
        Solo miembros de la familia pueden acceder.
        {Platform.OS === 'android' ? ' Expo Go + Google requien el Web Client ID.' : ''}
      </Text>
    </View>
  )
}
