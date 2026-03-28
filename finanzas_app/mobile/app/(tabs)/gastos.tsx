import { useRef } from 'react'
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Platform } from 'react-native'
import { useMovimientos } from '@finanzas/shared/hooks/useMovimientos'
import { useCategorias } from '@finanzas/shared/hooks/useCatalogos'
import { useConfig } from '@finanzas/shared/context/ConfigContext'
import { MobileShell } from '../../components/layout/MobileShell'
import { useAuth } from '../../context/AuthContext'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  MovimientoFormulario,
  type MovimientoFormularioRef,
} from '../../components/movimientos/MovimientoFormulario'

interface Movimiento {
  id: number
  fecha: string
  tipo: 'INGRESO' | 'EGRESO'
  ambito: 'PERSONAL' | 'COMUN'
  monto: number
  comentario: string
  categoria: number
  metodo_pago: number
  usuario?: number | string
}

interface Categoria {
  id: number
  nombre: string
  tipo: string
}

const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const TAB_BAR_HEIGHT = 66

export default function GastosScreen() {
  const { formatMonto } = useConfig()
  const { user } = useAuth()
  const formRef = useRef<MovimientoFormularioRef>(null)
  const insets = useSafeAreaInsets()

  const hoy = new Date()
  const mes = hoy.getMonth() + 1
  const anio = hoy.getFullYear()

  const { movimientos: raw, loading, refetch } = useMovimientos({ mes, anio, ambito: 'COMUN' })
  const movimientos = raw as Movimiento[]

  const { data: catData } = useCategorias()
  const categorias = (catData as Categoria[] | null) ?? []

  const totalMes = movimientos
    .filter((m) => m.tipo === 'EGRESO')
    .reduce((s, m) => s + m.monto, 0)

  const tabBarBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8)
  const modalSheetMarginBottom = tabBarBottom + TAB_BAR_HEIGHT + 12

  function renderItem({ item }: { item: Movimiento }) {
    const esEgreso = item.tipo === 'EGRESO'
    const fecha = new Date(item.fecha + 'T12:00:00')
    const cat = categorias.find((c) => c.id === item.categoria)
    const puedeEditar =
      user != null &&
      item.usuario != null &&
      item.usuario !== '' &&
      Number(item.usuario) === Number(user.id)
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
        <View className="flex-row items-center gap-2">
          {puedeEditar && (
            <TouchableOpacity
              onPress={() => formRef.current?.iniciarEdicion(item.id)}
              className="px-2 py-1 rounded-lg border border-border"
            >
              <Text className="text-dark text-xs font-semibold">Editar</Text>
            </TouchableOpacity>
          )}
          <Text
            className={`font-semibold text-sm min-w-[72px] text-right ${esEgreso ? 'text-danger' : 'text-success'}`}
          >
            {esEgreso ? '−' : '+'}
            {formatMonto(item.monto)}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <MobileShell title="Gastos comunes">
      <View className="flex-1 bg-surface">
        <View className="px-5 pt-4 pb-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-muted text-xs uppercase tracking-wide font-semibold">
              {MESES_CORTO[mes - 1]} {anio}
            </Text>
            <TouchableOpacity
              onPress={() => formRef.current?.abrirNuevoComun()}
              className="bg-accent px-4 py-2 rounded-lg"
            >
              <Text className="text-dark font-bold text-sm">+ Nuevo</Text>
            </TouchableOpacity>
          </View>
          <Text className="text-dark text-sm mt-2 font-medium">
            Total del mes: {formatMonto(totalMes)}
          </Text>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#0f0f0f" />
          </View>
        ) : (
          <FlatList
            data={[...movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha))}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View className="h-px bg-border mx-4" />}
            contentContainerStyle={
              movimientos.length === 0 ? { flex: 1, paddingBottom: 130 } : { paddingBottom: 130 }
            }
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center">
                <Text className="text-muted text-sm">Sin gastos comunes este mes</Text>
              </View>
            }
          />
        )}
      </View>

      <MovimientoFormulario
        ref={formRef}
        variant="overlay"
        sheetMarginBottom={modalSheetMarginBottom}
        refetchMovimientosComun={refetch}
      />
    </MobileShell>
  )
}
