import { useState, useMemo } from 'react'
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
  Alert,
} from 'react-native'
import { useMovimientos } from '@finanzas/shared/hooks/useMovimientos'
import { useCategorias, useMetodosPago } from '@finanzas/shared/hooks/useCatalogos'
import { movimientosApi } from '@finanzas/shared/api/movimientos'
import { useConfig } from '@finanzas/shared/context/ConfigContext'

interface Movimiento {
  id:          number
  fecha:       string
  tipo:        'INGRESO' | 'EGRESO'
  ambito:      'PERSONAL' | 'COMUN'
  monto:       number
  comentario:  string
  categoria:   number
  metodo_pago: number
}

interface Categoria { id: number; nombre: string; tipo: string }
interface MetodoPago { id: number; nombre: string; tipo: string }

const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const FORM_INICIAL = {
  comentario:  '',
  monto:       '',
  categoria:   0,
  metodo_pago: 0,
  fecha:       new Date().toISOString().slice(0, 10),
}

export default function GastosScreen() {
  const { formatMonto } = useConfig()

  const hoy  = new Date()
  const mes  = hoy.getMonth() + 1
  const anio = hoy.getFullYear()

  const { movimientos: raw, loading, refetch } = useMovimientos({ mes, anio, ambito: 'COMUN' })
  const movimientos = raw as Movimiento[]

  const { data: catData }    = useCategorias()
  const { data: metData }    = useMetodosPago()
  const categorias           = (catData as Categoria[] | null) ?? []
  const metodos              = (metData as MetodoPago[] | null) ?? []
  const categoriasEgreso     = categorias.filter(c => c.tipo === 'EGRESO')

  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [form, setForm]         = useState(FORM_INICIAL)

  const totalMes = useMemo(
    () => movimientos.filter(m => m.tipo === 'EGRESO').reduce((s, m) => s + m.monto, 0),
    [movimientos],
  )

  function setField<K extends keyof typeof FORM_INICIAL>(key: K, val: typeof FORM_INICIAL[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function abrirForm() {
    setForm(FORM_INICIAL)
    setShowForm(true)
  }

  async function guardar() {
    if (!form.comentario.trim()) {
      Alert.alert('Falta descripción', 'Escribe una descripción para el gasto.')
      return
    }
    const monto = parseFloat(form.monto)
    if (!monto || monto <= 0) {
      Alert.alert('Monto inválido', 'Ingresa un monto mayor a 0.')
      return
    }
    if (!form.categoria) {
      Alert.alert('Falta categoría', 'Selecciona una categoría.')
      return
    }
    if (!form.metodo_pago) {
      Alert.alert('Falta método de pago', 'Selecciona un método de pago.')
      return
    }
    setSaving(true)
    try {
      await movimientosApi.createMovimiento({
        tipo:        'EGRESO',
        ambito:      'COMUN',
        fecha:       form.fecha,
        comentario:  form.comentario.trim(),
        monto:       monto,
        categoria:   form.categoria,
        metodo_pago: form.metodo_pago,
      })
      setShowForm(false)
      refetch()
    } catch {
      Alert.alert('Error', 'No se pudo guardar el gasto. Verifica la conexión.')
    } finally {
      setSaving(false)
    }
  }

  function renderItem({ item }: { item: Movimiento }) {
    const esEgreso = item.tipo === 'EGRESO'
    const fecha    = new Date(item.fecha + 'T12:00:00')
    const cat      = categorias.find(c => c.id === item.categoria)
    return (
      <View className="flex-row items-center justify-between py-3 px-4">
        <View className="flex-1 mr-3">
          <Text className="text-dark font-medium text-sm" numberOfLines={1}>
            {item.comentario || 'Sin descripción'}
          </Text>
          <Text className="text-muted text-xs mt-0.5">
            {fecha.getDate()} {MESES_CORTO[fecha.getMonth()]}
            {cat ? ` · ${cat.nombre}` : ''}
          </Text>
        </View>
        <Text className={`font-semibold text-sm ${esEgreso ? 'text-danger' : 'text-success'}`}>
          {esEgreso ? '−' : '+'}{formatMonto(item.monto)}
        </Text>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-surface">
      {/* Header */}
      <View className="px-5 pt-12 pb-3 bg-white border-b border-border">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-bold text-dark">Gastos comunes</Text>
          <TouchableOpacity onPress={abrirForm} className="bg-accent px-4 py-2 rounded-lg">
            <Text className="text-dark font-bold text-sm">+ Nuevo</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-muted text-sm mt-1">
          {MESES_CORTO[mes - 1]} {anio} · Total: {formatMonto(totalMes)}
        </Text>
      </View>

      {/* Lista */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0f0f0f" />
        </View>
      ) : (
        <FlatList
          data={movimientos.sort((a, b) => b.fecha.localeCompare(a.fecha))}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View className="h-px bg-border mx-4" />}
          contentContainerStyle={movimientos.length === 0 ? { flex: 1 } : { paddingBottom: 20 }}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center">
              <Text className="text-muted text-sm">Sin gastos comunes este mes</Text>
            </View>
          }
        />
      )}

      {/* Modal nuevo gasto */}
      {showForm && (
        <View className="absolute inset-0 bg-black/50 justify-end">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View className="bg-white rounded-t-2xl">
              {/* Título */}
              <View className="flex-row items-center justify-between px-6 pt-5 pb-3 border-b border-border">
                <Text className="text-lg font-bold text-dark">Nuevo gasto común</Text>
                <TouchableOpacity onPress={() => setShowForm(false)}>
                  <Text className="text-muted text-2xl leading-none">×</Text>
                </TouchableOpacity>
              </View>

              <ScrollView className="px-6 pt-4" style={{ maxHeight: 480 }}>
                {/* Descripción */}
                <Text className="text-xs text-muted font-semibold mb-1">Descripción *</Text>
                <TextInput
                  value={form.comentario}
                  onChangeText={v => setField('comentario', v)}
                  placeholder="Ej: Supermercado La Reina"
                  className="border border-border rounded-lg px-3 py-2.5 text-dark mb-4"
                />

                {/* Monto */}
                <Text className="text-xs text-muted font-semibold mb-1">Monto (CLP) *</Text>
                <TextInput
                  value={form.monto}
                  onChangeText={v => setField('monto', v)}
                  placeholder="Ej: 25000"
                  keyboardType="numeric"
                  className="border border-border rounded-lg px-3 py-2.5 text-dark mb-4"
                />

                {/* Fecha */}
                <Text className="text-xs text-muted font-semibold mb-1">Fecha</Text>
                <TextInput
                  value={form.fecha}
                  onChangeText={v => setField('fecha', v)}
                  placeholder="YYYY-MM-DD"
                  className="border border-border rounded-lg px-3 py-2.5 text-dark mb-4"
                />

                {/* Categoría */}
                <Text className="text-xs text-muted font-semibold mb-2">Categoría *</Text>
                <View className="flex-row flex-wrap gap-2 mb-4">
                  {categoriasEgreso.map(cat => (
                    <TouchableOpacity
                      key={cat.id}
                      onPress={() => setField('categoria', cat.id)}
                      className={`px-3 py-1.5 rounded-lg border ${
                        form.categoria === cat.id
                          ? 'bg-dark border-dark'
                          : 'bg-white border-border'
                      }`}
                    >
                      <Text className={`text-xs font-medium ${
                        form.categoria === cat.id ? 'text-white' : 'text-dark'
                      }`}>
                        {cat.nombre}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Método de pago */}
                <Text className="text-xs text-muted font-semibold mb-2">Método de pago *</Text>
                <View className="flex-row flex-wrap gap-2 mb-6">
                  {metodos.map(m => (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => setField('metodo_pago', m.id)}
                      className={`px-3 py-1.5 rounded-lg border ${
                        form.metodo_pago === m.id
                          ? 'bg-accent border-accent'
                          : 'bg-white border-border'
                      }`}
                    >
                      <Text className="text-xs font-medium text-dark">{m.nombre}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* Botones */}
              <View className="flex-row gap-3 px-6 py-4 border-t border-border">
                <TouchableOpacity
                  onPress={() => setShowForm(false)}
                  className="flex-1 border border-border rounded-xl py-3 items-center"
                >
                  <Text className="text-dark font-semibold">Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={guardar}
                  disabled={saving}
                  className="flex-1 bg-dark rounded-xl py-3 items-center"
                >
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : <Text className="text-white font-bold">Guardar</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
    </View>
  )
}
