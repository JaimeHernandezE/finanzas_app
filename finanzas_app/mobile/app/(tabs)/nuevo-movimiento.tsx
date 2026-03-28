import { View } from 'react-native'
import { useLocalSearchParams, Redirect } from 'expo-router'
import { MobileShell } from '../../components/layout/MobileShell'
import { MovimientoFormulario } from '../../components/movimientos/MovimientoFormulario'

export default function NuevoMovimientoScreen() {
  const { cuenta, editar } = useLocalSearchParams<{ cuenta?: string; editar?: string }>()
  const cuentaId = cuenta != null ? parseInt(String(cuenta), 10) : NaN
  const editarId = editar != null ? parseInt(String(editar), 10) : NaN
  const esEdicion = Number.isFinite(editarId) && editarId > 0

  if (!esEdicion && (!Number.isFinite(cuentaId) || cuentaId <= 0)) {
    return <Redirect href="/(tabs)/index" />
  }

  const titulo = esEdicion ? 'Editar movimiento' : 'Nuevo movimiento'

  return (
    <MobileShell title={titulo}>
      <View className="flex-1 bg-surface">
        <MovimientoFormulario variant="standalone" cuentaPersonalFija={esEdicion ? undefined : cuentaId} />
      </View>
    </MobileShell>
  )
}
