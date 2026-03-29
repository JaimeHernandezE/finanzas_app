import '../setApiBaseUrl'
import { Slot } from 'expo-router'
import { ConfigProvider } from '@finanzas/shared/context/ConfigContext'
import { AuthProvider } from '../context/AuthContext'
import { ViajeProvider } from '../context/ViajeContext'
import { AppLock } from '../components/AppLock'
import { ConfiguracionFaltante } from '../components/ConfiguracionFaltante'
import { isFirebaseConfigured } from '../lib/firebase'

export default function RootLayout() {
  if (!isFirebaseConfigured()) {
    return <ConfiguracionFaltante />
  }

  return (
    <ConfigProvider>
      <AuthProvider>
        <ViajeProvider>
          <AppLock>
            <Slot />
          </AppLock>
        </ViajeProvider>
      </AuthProvider>
    </ConfigProvider>
  )
}
