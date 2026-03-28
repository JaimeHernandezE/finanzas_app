import { View } from 'react-native'
import { useLocalSearchParams, Redirect } from 'expo-router'
import { MobileShell } from '../components/layout/MobileShell'
import { MovimientoFormulario } from '../components/movimientos/MovimientoFormulario'

export default function NuevoMovimientoScreen() {
  const { cuenta } = useLocalSearchParams<{ cuenta?: string }>()
  const cuentaId = cuenta != null ? parseInt(String(cuenta), 10) : NaN

  if (!Number.isFinite(cuentaId) || cuentaId <= 0) {
    return <Redirect href="/(tabs)/index" />
  }

  return (
    <MobileShell title="Nuevo movimiento">
      <View className="flex-1 bg-surface">
        <MovimientoFormulario variant="standalone" cuentaPersonalFija={cuentaId} />
      </View>
    </MobileShell>
  )
}
