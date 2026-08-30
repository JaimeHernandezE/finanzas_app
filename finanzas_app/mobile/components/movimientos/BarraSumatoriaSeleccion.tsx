import { Text, TouchableOpacity, View } from 'react-native'

interface BarraSumatoriaSeleccionProps {
  cantidad: number
  sumaFirmada: string
  onListo: () => void
  onEliminar?: () => void
  eliminando?: boolean
}

/**
 * Barra inferior sticky con cantidad de ítems seleccionados y sumatoria.
 * Visible solo cuando hay selección activa (el padre controla el render).
 */
export function BarraSumatoriaSeleccion({
  cantidad,
  sumaFirmada,
  onListo,
  onEliminar,
  eliminando = false,
}: BarraSumatoriaSeleccionProps) {
  const etiqueta =
    cantidad === 1 ? '1 ítem' : `${cantidad} ítems`

  return (
    <View className="mx-3 mb-1 rounded-2xl border border-[#202020] bg-[#0f0f0f] px-4 py-3 flex-row items-center gap-3">
      <TouchableOpacity
        onPress={onListo}
        hitSlop={8}
        disabled={eliminando}
        accessibilityLabel="Listo, salir de selección"
        className="rounded-lg border border-[#3a3a36] px-3 py-1.5"
        style={{ opacity: eliminando ? 0.45 : 1 }}
      >
        <Text className="text-[#c8f060] text-sm font-semibold">Listo</Text>
      </TouchableOpacity>
      <Text className="flex-1 text-[#a9a9a4] text-sm font-medium" numberOfLines={1}>
        {etiqueta}
      </Text>
      <Text className="text-white text-base font-bold tabular-nums mr-1" numberOfLines={1}>
        {sumaFirmada}
      </Text>
      {onEliminar && (
        <TouchableOpacity
          onPress={onEliminar}
          hitSlop={8}
          disabled={eliminando}
          accessibilityLabel="Eliminar seleccionados"
          className="rounded-lg border border-[#5c2a2a] bg-[#2a1515] px-3 py-1.5"
          style={{ opacity: eliminando ? 0.45 : 1 }}
        >
          <Text className="text-[#ff6b6b] text-sm font-semibold">
            {eliminando ? '…' : 'Eliminar'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

/** Formatea la suma firmada de montos (ingreso +, egreso −). */
export function formatSumaSeleccion(
  suma: number,
  formatMonto: (n: number) => string,
): string {
  if (suma === 0) return formatMonto(0)
  if (suma > 0) return `+${formatMonto(suma)}`
  return `−${formatMonto(-suma)}`
}

export function montoConSigno(tipo: string, monto: number | string): number {
  const n = typeof monto === 'number' ? monto : Number(monto)
  const valor = Number.isFinite(n) ? n : 0
  return tipo === 'INGRESO' ? valor : -valor
}
