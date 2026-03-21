import { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useConfig } from '@finanzas/shared/context/ConfigContext'

export default function DashboardScreen() {
  const { formatMonto } = useConfig()
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Placeholder: cargar resumen del mes
    const timer = setTimeout(() => setLoading(false), 500)
    return () => clearTimeout(timer)
  }, [])

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator color="#0f0f0f" />
      </View>
    )
  }

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ padding: 20 }}>
      <Text className="text-2xl font-bold text-dark mb-1">Finanzas</Text>
      <Text className="text-sm text-muted mb-6">Resumen del mes</Text>

      {/* Tarjetas de resumen */}
      <View className="flex-row gap-3 mb-4">
        <View className="flex-1 bg-white border border-border rounded-xl p-4">
          <Text className="text-xs text-muted uppercase font-semibold mb-1">Ingresos</Text>
          <Text className="text-lg font-bold text-success">{formatMonto(0)}</Text>
        </View>
        <View className="flex-1 bg-white border border-border rounded-xl p-4">
          <Text className="text-xs text-muted uppercase font-semibold mb-1">Gastos</Text>
          <Text className="text-lg font-bold text-danger">{formatMonto(0)}</Text>
        </View>
      </View>

      <View className="bg-white border border-border rounded-xl p-4 mb-4">
        <Text className="text-xs text-muted uppercase font-semibold mb-1">Balance</Text>
        <Text className="text-2xl font-bold text-dark">{formatMonto(0)}</Text>
      </View>

      {/* Acciones rápidas */}
      <Text className="text-xs text-muted uppercase font-semibold mb-3">Acciones rápidas</Text>
      <View className="flex-row flex-wrap gap-3 mb-6">
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/gastos')}
          className="flex-1 bg-accent rounded-xl p-4 items-center"
        >
          <Text className="text-dark font-bold text-sm">+ Gasto</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/liquidacion')}
          className="flex-1 bg-dark rounded-xl p-4 items-center"
        >
          <Text className="text-white font-bold text-sm">Liquidación</Text>
        </TouchableOpacity>
      </View>

      {/* Últimos movimientos — placeholder */}
      <Text className="text-xs text-muted uppercase font-semibold mb-3">Últimos movimientos</Text>
      <View className="bg-white border border-border rounded-xl">
        <View className="p-4 items-center">
          <Text className="text-muted text-sm">Conéctate para ver tus movimientos</Text>
        </View>
      </View>
    </ScrollView>
  )
}
