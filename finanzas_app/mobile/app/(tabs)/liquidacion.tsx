import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useConfig } from '@finanzas/shared/context/ConfigContext'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

interface MiembroLiquidacion {
  nombre:     string
  ingreso:    number
  proporcion: number
  corresponde: number
  pagado:     number
  diferencia: number
}

export default function LiquidacionScreen() {
  const { formatMonto } = useConfig()
  const hoy = new Date()
  const [mes, setMes] = useState(hoy.getMonth())
  const [anio] = useState(hoy.getFullYear())
  const [loading] = useState(false)
  const [miembros] = useState<MiembroLiquidacion[]>([])

  const irAnterior = () => setMes(m => (m === 0 ? 11 : m - 1))
  const irSiguiente = () => {
    const esActual = mes === hoy.getMonth()
    if (!esActual) setMes(m => (m === 11 ? 0 : m + 1))
  }
  const esActual = mes === hoy.getMonth() && anio === hoy.getFullYear()

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ padding: 20 }}>
      <Text className="text-xl font-bold text-dark mb-4">Liquidación</Text>

      {/* Navegador de mes */}
      <View className="flex-row items-center gap-3 mb-6">
        <TouchableOpacity onPress={irAnterior} className="w-8 h-8 items-center justify-center">
          <Text className="text-dark text-xl">‹</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center font-semibold text-dark">
          {MESES[mes]} {anio}
        </Text>
        <TouchableOpacity
          onPress={irSiguiente}
          disabled={esActual}
          className="w-8 h-8 items-center justify-center"
        >
          <Text className={`text-xl ${esActual ? 'text-border' : 'text-dark'}`}>›</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#0f0f0f" />
      ) : miembros.length === 0 ? (
        <View className="bg-white border border-border rounded-xl p-6 items-center">
          <Text className="text-muted text-sm text-center">
            No hay datos de liquidación para este mes.{'\n'}
            Asegúrate de haber registrado ingresos comunes.
          </Text>
        </View>
      ) : (
        miembros.map((m, i) => (
          <View key={i} className="bg-white border border-border rounded-xl p-4 mb-3">
            <Text className="font-bold text-dark mb-3">{m.nombre}</Text>
            <View className="flex-row justify-between mb-1">
              <Text className="text-muted text-sm">Ingreso declarado</Text>
              <Text className="text-dark text-sm font-medium">{formatMonto(m.ingreso)}</Text>
            </View>
            <View className="flex-row justify-between mb-1">
              <Text className="text-muted text-sm">Proporción</Text>
              <Text className="text-dark text-sm font-medium">{m.proporcion.toFixed(1)}%</Text>
            </View>
            <View className="flex-row justify-between mb-1">
              <Text className="text-muted text-sm">Le corresponde</Text>
              <Text className="text-dark text-sm font-medium">{formatMonto(m.corresponde)}</Text>
            </View>
            <View className="h-px bg-border my-2" />
            <View className="flex-row justify-between">
              <Text className="text-sm font-semibold text-dark">Diferencia</Text>
              <Text
                className={`text-sm font-bold ${m.diferencia >= 0 ? 'text-success' : 'text-danger'}`}
              >
                {m.diferencia >= 0 ? '+' : ''}{formatMonto(m.diferencia)}
              </Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  )
}
