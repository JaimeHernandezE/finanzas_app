import '../lib/apiConfig'
import { useEffect } from 'react'
import { Slot } from 'expo-router'
import { ConfigProvider } from '@finanzas/shared/context/ConfigContext'
import { AuthProvider } from '../context/AuthContext'
import { ViajeProvider } from '../context/ViajeContext'
import { AppLock } from '../components/AppLock'
import { ConfiguracionFaltante } from '../components/ConfiguracionFaltante'
import { isFirebaseConfigured } from '../lib/firebase'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { onlineManager } from '@tanstack/react-query'
import NetInfo from '@react-native-community/netinfo'
import { queryClient, persister, persistOptions } from '../lib/queryClient'
import { SyncStatusBanner } from '../components/SyncStatusBanner'

export default function RootLayout() {
  useEffect(() => {
    // Conecta React Query a conectividad real de RN:
    // si no hay red, evita intentar fetch innecesario.
    const unsubscribeOnlineManager = onlineManager.setEventListener((setOnline) => {
      const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
        setOnline(Boolean(state.isConnected))
      })
      return unsubscribeNetInfo
    })

    return () => {
      unsubscribeOnlineManager()
    }
  }, [])

  if (!isFirebaseConfigured()) {
    return <ConfiguracionFaltante />
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      onSuccess={() => {
        // Cache restaurado desde disco — se puede loguear o medir aquí
      }}
    >
      <ConfigProvider>
        <AuthProvider>
          <ViajeProvider>
            <AppLock>
              <SyncStatusBanner />
              <Slot />
            </AppLock>
          </ViajeProvider>
        </AuthProvider>
      </ConfigProvider>
    </PersistQueryClientProvider>
  )
}
