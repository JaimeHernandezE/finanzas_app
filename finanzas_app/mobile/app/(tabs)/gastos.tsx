import { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native'
import { useConfig } from '@finanzas/shared/context/ConfigContext'

interface MovimientoItem {
  id:          number
  fecha:       string
  comentario:  string
  monto:       number
  tipo:        'INGRESO' | 'EGRESO'
  ambito:      'PERSONAL' | 'COMUN'
}

export default function GastosScreen() {
  const { formatMonto } = useConfig()
  const [showForm, setShowForm] = useState(false)
  const [loading] = useState(false)
  const [movimientos] = useState<MovimientoItem[]>([])

  const [comentario, setComentario] = useState('')
  const [monto, setMonto] = useState('')

  function renderItem({ item }: { item: MovimientoItem }) {
    const esEgreso = item.tipo === 'EGRESO'
    return (
      <View className="flex-row items-center justify-between py-3 px-4">
        <View className="flex-1 mr-3">
          <Text className="text-dark font-medium text-sm" numberOfLines={1}>
            {item.comentario || 'Sin descripción'}
          </Text>
          <Text className="text-muted text-xs mt-0.5">{item.fecha}</Text>
        </View>
        <Text
          className={`font-semibold text-sm ${esEgreso ? 'text-danger' : 'text-success'}`}
        >
          {esEgreso ? '−' : '+'}{formatMonto(item.monto)}
        </Text>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-surface">
      {/* Header */}
      <View className="px-5 pt-12 pb-4 bg-white border-b border-border flex-row items-center justify-between">
        <Text className="text-xl font-bold text-dark">Gastos comunes</Text>
        <TouchableOpacity
          onPress={() => setShowForm(true)}
          className="bg-accent px-4 py-2 rounded-lg"
        >
          <Text className="text-dark font-bold text-sm">+ Nuevo</Text>
        </TouchableOpacity>
      </View>

      {/* Lista */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0f0f0f" />
        </View>
      ) : (
        <FlatList
          data={movimientos}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View className="h-px bg-border mx-4" />}
          contentContainerStyle={movimientos.length === 0 ? { flex: 1 } : undefined}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center">
              <Text className="text-muted text-sm">No hay gastos comunes este mes</Text>
            </View>
          }
        />
      )}

      {/* Modal nuevo gasto */}
      {showForm && (
        <View className="absolute inset-0 bg-black/50 justify-end">
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View className="bg-white rounded-t-2xl p-6">
              <Text className="text-lg font-bold text-dark mb-4">Nuevo gasto</Text>
              <ScrollView>
                <Text className="text-xs text-muted font-semibold mb-1">Descripción</Text>
                <TextInput
                  value={comentario}
                  onChangeText={setComentario}
                  placeholder="Ej: Supermercado"
                  className="border border-border rounded-lg px-3 py-2.5 text-dark mb-4"
                />
                <Text className="text-xs text-muted font-semibold mb-1">Monto (CLP)</Text>
                <TextInput
                  value={monto}
                  onChangeText={setMonto}
                  placeholder="Ej: 15000"
                  keyboardType="numeric"
                  className="border border-border rounded-lg px-3 py-2.5 text-dark mb-6"
                />
              </ScrollView>
              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={() => setShowForm(false)}
                  className="flex-1 border border-border rounded-xl py-3 items-center"
                >
                  <Text className="text-dark font-semibold">Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 bg-dark rounded-xl py-3 items-center"
                  onPress={() => setShowForm(false)}
                >
                  <Text className="text-white font-bold">Guardar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
    </View>
  )
}
