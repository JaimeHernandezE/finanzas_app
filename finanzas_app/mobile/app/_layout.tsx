import '../lib/apiConfig'
import { Slot } from 'expo-router'
import { ConfigProvider } from '@finanzas/shared/context/ConfigContext'
import { AuthProvider } from '../context/AuthContext'
import { ViajeProvider } from '../context/ViajeContext'
import { AppLock } from '../components/AppLock'
import { ConfiguracionFaltante } from '../components/ConfiguracionFaltante'
import { isFirebaseConfigured } from '../lib/firebase'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryClient, persister, persistOptions } from '../lib/queryClient'

export default function RootLayout() {
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
              <Slot />
            </AppLock>
          </ViajeProvider>
        </AuthProvider>
      </ConfigProvider>
    </PersistQueryClientProvider>
  )
}
