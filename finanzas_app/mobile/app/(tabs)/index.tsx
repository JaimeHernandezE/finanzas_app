import { useMemo } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useMovimientos } from '@finanzas/shared/hooks/useMovimientos'
import { useConfig } from '@finanzas/shared/context/ConfigContext'

interface Movimiento {
  id:         number
  fecha:      string
  tipo:       'INGRESO' | 'EGRESO'
  ambito:     'PERSONAL' | 'COMUN'
  monto:      number
  comentario: string
  categoria:  number
}

const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export default function DashboardScreen() {
  const { formatMonto } = useConfig()
  const router = useRouter()

  const hoy   = new Date()
  const mes   = hoy.getMonth() + 1
  const anio  = hoy.getFullYear()

  const { movimientos: raw, loading, error, refetch } = useMovimientos({ mes, anio })
  const movimientos = raw as Movimiento[]

  const { totalIngresos, totalEgresos, balance, ultimos } = useMemo(() => {
    const totalIngresos = movimientos
      .filter(m => m.tipo === 'INGRESO')
      .reduce((s, m) => s + m.monto, 0)
    const totalEgresos = movimientos
      .filter(m => m.tipo === 'EGRESO')
      .reduce((s, m) => s + m.monto, 0)
    const balance  = totalIngresos - totalEgresos
    const ultimos  = [...movimientos]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 5)
    return { totalIngresos, totalEgresos, balance, ultimos }
  }, [movimientos])

  function renderItem({ item }: { item: Movimiento }) {
    const esEgreso = item.tipo === 'EGRESO'
    const fecha = new Date(item.fecha + 'T12:00:00')
    return (
      <View className="flex-row items-center justify-between py-3 px-4">
        <View className="flex-1 mr-3">
          <Text className="text-dark font-medium text-sm" numberOfLines={1}>
            {item.comentario || 'Sin descripción'}
          </Text>
          <Text className="text-muted text-xs mt-0.5">
            {fecha.getDate()} {MESES_CORTO[fecha.getMonth()]} · {item.ambito === 'COMUN' ? 'Común' : 'Personal'}
          </Text>
        </View>
        <Text className={`font-semibold text-sm ${esEgreso ? 'text-danger' : 'text-success'}`}>
          {esEgreso ? '−' : '+'}{formatMonto(item.monto)}
        </Text>
      </View>
    )
  }

  return (
    <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ padding: 20 }}>
      {/* Encabezado */}
      <Text className="text-2xl font-bold text-dark mb-0.5">Finanzas</Text>
      <Text className="text-sm text-muted mb-6">
        {MESES_CORTO[mes - 1]} {anio}
      </Text>

      {loading ? (
        <View className="items-center py-12">
          <ActivityIndicator color="#0f0f0f" />
        </View>
      ) : error ? (
        <View className="bg-danger/10 border border-danger/30 rounded-xl p-4 mb-4">
          <Text className="text-danger text-sm text-center">{error}</Text>
          <TouchableOpacity onPress={refetch} className="mt-2 items-center">
            <Text className="text-dark font-semibold text-sm underline">Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Tarjetas de resumen */}
          <View className="flex-row gap-3 mb-3">
            <View className="flex-1 bg-white border border-border rounded-xl p-4">
              <Text className="text-xs text-muted uppercase font-semibold mb-1">Ingresos</Text>
              <Text className="text-base font-bold text-success">{formatMonto(totalIngresos)}</Text>
            </View>
            <View className="flex-1 bg-white border border-border rounded-xl p-4">
              <Text className="text-xs text-muted uppercase font-semibold mb-1">Gastos</Text>
              <Text className="text-base font-bold text-danger">{formatMonto(totalEgresos)}</Text>
            </View>
          </View>

          <View className="bg-white border border-border rounded-xl p-4 mb-6">
            <Text className="text-xs text-muted uppercase font-semibold mb-1">Balance del mes</Text>
            <Text className={`text-2xl font-bold ${balance >= 0 ? 'text-dark' : 'text-danger'}`}>
              {balance >= 0 ? '' : '−'}{formatMonto(Math.abs(balance))}
            </Text>
          </View>

          {/* Acciones rápidas */}
          <Text className="text-xs text-muted uppercase font-semibold mb-3">Acciones rápidas</Text>
          <View className="flex-row gap-3 mb-6">
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/gastos')}
              className="flex-1 bg-accent rounded-xl p-4 items-center"
            >
              <Text className="text-dark font-bold text-sm">+ Gasto común</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/liquidacion')}
              className="flex-1 bg-dark rounded-xl p-4 items-center"
            >
              <Text className="text-white font-bold text-sm">Liquidación</Text>
            </TouchableOpacity>
          </View>

          {/* Últimos movimientos */}
          <Text className="text-xs text-muted uppercase font-semibold mb-3">Últimos movimientos</Text>
          {ultimos.length === 0 ? (
            <View className="bg-white border border-border rounded-xl p-6 items-center">
              <Text className="text-muted text-sm">Sin movimientos este mes</Text>
            </View>
          ) : (
            <View className="bg-white border border-border rounded-xl overflow-hidden">
              <FlatList
                data={ultimos}
                keyExtractor={item => String(item.id)}
                renderItem={renderItem}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View className="h-px bg-border mx-4" />}
              />
            </View>
          )}
        </>
      )}
    </ScrollView>
  )
}
