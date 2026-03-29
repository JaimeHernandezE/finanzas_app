import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'

interface AppLockProps {
  children: React.ReactNode
}

export function AppLock({ children }: AppLockProps) {
  // En desarrollo (expo start + emulador) no pedimos huella para poder depurar.
  // En release/APK __DEV__ es false: siempre aplica el cierre con huella o PIN.
  const [desbloqueado, setDesbloqueado] = useState(__DEV__)

  useEffect(() => {
    if (__DEV__) return
    autenticar()
  }, [])

  async function autenticar() {
    const disponible = await LocalAuthentication.hasHardwareAsync()
    if (!disponible) {
      setDesbloqueado(true)
      return
    }
    const resultado = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Accede a tus finanzas',
      fallbackLabel: 'Usar PIN',
    })
    if (resultado.success) setDesbloqueado(true)
  }

  if (!desbloqueado) {
    return (
      <View className="flex-1 bg-dark items-center justify-center">
        <Text className="text-white text-2xl font-bold mb-2">Finanzas</Text>
        <Text className="text-white/50 text-sm mb-8">Familiares</Text>
        <TouchableOpacity
          onPress={autenticar}
          className="bg-accent px-6 py-3 rounded-xl"
        >
          <Text className="text-dark font-bold">Desbloquear</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return <>{children}</>
}
