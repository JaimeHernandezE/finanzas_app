import { Slot } from 'expo-router'
import { ConfigProvider } from '@finanzas/shared/context/ConfigContext'
import { AuthProvider } from '../context/AuthContext'
import { ViajeProvider } from '../context/ViajeContext'
import { AppLock } from '../components/AppLock'

export default function RootLayout() {
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
