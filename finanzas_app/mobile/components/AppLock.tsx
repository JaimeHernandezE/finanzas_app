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

  // Esperamos a que se restaure la sesión antes de pedir la huella,
  // así el usuario no ve el login form parpadeando bajo la pantalla de bloqueo.
  useEffect(() => {
    if (authLoading) return
    if (!intentado.current) {
      intentado.current = true
      void autenticar()
    }
  }, [authLoading])

  async function autenticar() {
    const disponible = await LocalAuthentication.hasHardwareAsync()
    const inscrito = await LocalAuthentication.isEnrolledAsync()
    if (!disponible || !inscrito) {
      // Dispositivo sin biometría registrada → dejar pasar
      setDesbloqueado(true)
      return
    }
    const resultado = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Accede a tus finanzas',
      disableDeviceFallback: true, // solo huella/cara, sin PIN
      cancelLabel: 'Cancelar',
    })
    if (resultado.success) setDesbloqueado(true)
  }

  function reintentar() {
    intentado.current = false
    intentado.current = true
    void autenticar()
  }

  // Mientras se restaura la sesión guardada → splash
  if (authLoading) {
    return (
      <View className="flex-1 bg-dark items-center justify-center">
        <Text className="text-white text-2xl font-bold mb-2">Finanzas</Text>
        <Text className="text-white/50 text-sm">Familiares</Text>
      </View>
    )
  }

  // Sesión restaurada pero biometría pendiente
  if (!desbloqueado) {
    return (
      <View className="flex-1 bg-dark items-center justify-center">
        <Text className="text-white text-2xl font-bold mb-2">Finanzas</Text>
        <Text className="text-white/50 text-sm mb-10">Familiares</Text>
        <TouchableOpacity
          onPress={reintentar}
          className="bg-accent px-8 py-4 rounded-2xl"
        >
          <Text className="text-dark font-bold text-base">Desbloquear con huella</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return <>{children}</>
}


  async function autenticar() {
    const disponible = await LocalAuthentication.hasHardwareAsync()
    const inscrito = await LocalAuthentication.isEnrolledAsync()
    if (!disponible || !inscrito) {
      // Dispositivo sin biometría registrada → dejar pasar
      setDesbloqueado(true)
      return
    }
    const resultado = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Accede a tus finanzas',
      disableDeviceFallback: true, // solo huella/cara, sin PIN
      cancelLabel: 'Cancelar',
    })
    if (resultado.success) setDesbloqueado(true)
  }

  function reintentar() {
    intentado.current = false
    setDesbloqueado(false)
    void autenticar()
    intentado.current = true
  }

  // Mientras se verifica la sesión guardada → splash
  if (authLoading) {
    return (
      <View className="flex-1 bg-dark items-center justify-center">
        <Text className="text-white text-2xl font-bold mb-2">Finanzas</Text>
        <Text className="text-white/50 text-sm">Familiares</Text>
      </View>
    )
  }

  // Sesión existe pero todavía no desbloqueado → pantalla de huella
  if (!desbloqueado) {
    return (
      <View className="flex-1 bg-dark items-center justify-center">
        <Text className="text-white text-2xl font-bold mb-2">Finanzas</Text>
        <Text className="text-white/50 text-sm mb-10">Familiares</Text>
        <TouchableOpacity
          onPress={reintentar}
          className="bg-accent px-8 py-4 rounded-2xl"
        >
          <Text className="text-dark font-bold text-base">Desbloquear con huella</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return <>{children}</>
}
