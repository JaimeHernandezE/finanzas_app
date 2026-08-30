import { type ReactNode } from 'react'
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native'

const DELAY_LONG_PRESS_MS = 800
const FONDO_SELECCIONADO = '#eef6d8'

interface FilaSeleccionableProps {
  seleccionActiva: boolean
  seleccionado: boolean
  onLongPress: () => void
  onPress: () => void
  children: ReactNode
  className?: string
  /** Fondo de la fila cuando no está seleccionada (p. ej. blanco o gris ajeno). */
  fondo?: string
  style?: StyleProp<ViewStyle>
}

/**
 * Envoltorio de fila con long-press (800 ms) para modo selección múltiple.
 * Fuera del modo, el tap corto no hace nada; con el modo activo, alterna.
 */
export function FilaSeleccionable({
  seleccionActiva,
  seleccionado,
  onLongPress,
  onPress,
  children,
  className = '',
  fondo = '#ffffff',
  style,
}: FilaSeleccionableProps) {
  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={DELAY_LONG_PRESS_MS}
      onPress={seleccionActiva ? onPress : undefined}
      className={className}
      style={[
        {
          backgroundColor: seleccionado ? FONDO_SELECCIONADO : fondo,
          ...(seleccionado ? { borderColor: '#c8f060' } : null),
        },
        style,
      ]}
    >
      <View className="flex-row items-stretch">
        {seleccionActiva && (
          <View className="w-9 items-center justify-center pl-2">
            <View
              className={`h-5 w-5 rounded-full border-2 items-center justify-center ${
                seleccionado ? 'border-[#0f0f0f] bg-[#c8f060]' : 'border-[#c4c4be] bg-white'
              }`}
            >
              {seleccionado && (
                <Text className="text-[11px] font-bold text-dark leading-none">✓</Text>
              )}
            </View>
          </View>
        )}
        <View className="flex-1 min-w-0">{children}</View>
      </View>
    </Pressable>
  )
}
