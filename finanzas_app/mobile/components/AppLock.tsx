import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import { useAuth } from '../context/AuthContext'

interface AppLockProps {
  children: React.ReactNode
}

export function AppLock({ children }: AppLockProps) {
  const { loading: authLoading } = useAuth()
  const [desbloqueado, setDesbloqueado] = useState(false)
  const intentado = useRef(false)

  // Esperamos a que la sesión se restaure antes de pedir el desbloqueo,
  // para evitar que el login form parpadee bajo la pantalla de bloqueo.
  useEffect(() => {
    if (authLoading) return
    if (!intentado.current) {
      intentado.current = true
      void autenticar()
    }
  }, [authLoading])

  async function autenticar() {
    const nivel = await LocalAuthentication.getEnrolledLevelAsync()
    const { SecurityLevel } = LocalAuthentication

    if (nivel === SecurityLevel.NONE) {
      // El dispositivo no tiene ningún método de bloqueo configurado → dejar pasar
      setDesbloqueado(true)
      return
    }

    // Si tiene biometría (huella/cara): usarla sin fallback a PIN.
    // Si solo tiene PIN/patrón: el sistema muestra el PIN directamente.
    const tieneBiometria = nivel >= SecurityLevel.BIOMETRIC_WEAK

    const resultado = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Accede a tus finanzas',
      disableDeviceFallback: tieneBiometria, // con huella: solo huella; sin huella: usa PIN del equipo
      cancelLabel: 'Cancelar',
    })

    if (resultado.success) setDesbloqueado(true)
  }

  function reintentar() {
    void autenticar()
  }

  // Splash mientras se restaura la sesión guardada
  if (authLoading) {
    return (
      <View className="flex-1 bg-dark items-center justify-center">
        <Text className="text-white text-2xl font-bold mb-2">Finanzas</Text>
        <Text className="text-white/50 text-sm">Familiares</Text>
      </View>
    )
  }

  // Pantalla de bloqueo
  if (!desbloqueado) {
    return (
      <View className="flex-1 bg-dark items-center justify-center">
        <Text className="text-white text-2xl font-bold mb-2">Finanzas</Text>
        <Text className="text-white/50 text-sm mb-10">Familiares</Text>
        <TouchableOpacity
          onPress={reintentar}
          className="bg-accent px-8 py-4 rounded-2xl"
        >
          <Text className="text-dark font-bold text-base">Desbloquear</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return <>{children}</>
}
