import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import {
  estadoGrupoCategoria,
  filasCategoriasOrdenadas,
  hijosDe,
  type CategoriaFiltroFila,
} from '@finanzas/shared/utils/categoriasFiltroSidebar'
import {
  MESES_ETIQUETAS,
  rangoAniosSelect,
  type ModoPeriodo,
} from '@finanzas/shared/utils/periodoMovimientos'

type Props = {
  visible: boolean
  onRequestClose: () => void
  modoPeriodo: ModoPeriodo
  onModoPeriodoChange: (m: ModoPeriodo) => void
  mes: number
  anio: number
  onMesAnioChange: (mes: number, anio: number) => void
  rangoDesde: string
  rangoHasta: string
  onRangoChange: (desde: string, hasta: string) => void
  anioMaximo: number
  categorias: CategoriaFiltroFila[]
  filtrosCategorias: string[]
  onToggleCategoria: (c: CategoriaFiltroFila) => void
  filtrosMetodos: string[]
  onToggleMetodo: (met: 'EFECTIVO' | 'DEBITO' | 'CREDITO') => void
  onLimpiar: () => void
}

function metodoLabel(met: 'EFECTIVO' | 'DEBITO' | 'CREDITO') {
  if (met === 'EFECTIVO') return 'Efectivo'
  if (met === 'DEBITO') return 'Débito'
  return 'Crédito'
}

export function MovimientosFiltrosModal({
  visible,
  onRequestClose,
  modoPeriodo,
  onModoPeriodoChange,
  mes,
  anio,
  onMesAnioChange,
  rangoDesde,
  rangoHasta,
  onRangoChange,
  anioMaximo,
  categorias,
  filtrosCategorias,
  onToggleCategoria,
  filtrosMetodos,
  onToggleMetodo,
  onLimpiar,
}: Props) {
  const anos = rangoAniosSelect(anioMaximo, 18)
  const filasCat = filasCategoriasOrdenadas(categorias)

  const esActualMes = (() => {
    const h = new Date()
    return mes === h.getMonth() && anio === h.getFullYear()
  })()
  const esAnioMaximo = anio >= anioMaximo

  const irMesPrev = () => {
    if (mes === 0) onMesAnioChange(11, anio - 1)
    else onMesAnioChange(mes - 1, anio)
  }
  const irMesSig = () => {
    if (esActualMes) return
    if (mes === 11) onMesAnioChange(0, anio + 1)
    else onMesAnioChange(mes + 1, anio)
  }
  const irAnioPrev = () => onMesAnioChange(mes, anio - 1)
  const irAnioSig = () => {
    if (esAnioMaximo) return
    onMesAnioChange(mes, anio + 1)
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onRequestClose}>
      <View className="flex-1 justify-end">
        <Pressable
          className="absolute inset-0 bg-black/40"
          onPress={onRequestClose}
          accessibilityRole="button"
          accessibilityLabel="Cerrar filtros"
        />
        <View className="bg-white rounded-t-2xl max-h-[88%]">
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-border">
              <Text className="text-lg font-bold text-dark">Filtros</Text>
              <TouchableOpacity onPress={onRequestClose} hitSlop={12}>
                <Text className="text-muted text-xl">×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView className="px-5 py-4" keyboardShouldPersistTaps="handled">
              <Text className="text-xs text-muted font-semibold uppercase mb-2">Periodo</Text>
              <View className="flex-row flex-wrap gap-2 mb-3">
                {(
                  [
                    { m: 'MES' as const, label: 'Mes' },
                    { m: 'ANIO' as const, label: 'Año' },
                    { m: 'RANGO' as const, label: 'Fechas' },
                  ] as const
                ).map(({ m, label }) => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => onModoPeriodoChange(m)}
                    className={`px-3 py-2 rounded-lg border ${
                      modoPeriodo === m ? 'bg-dark border-dark' : 'border-border bg-white'
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${modoPeriodo === m ? 'text-white' : 'text-muted'}`}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {modoPeriodo === 'MES' && (
                <View className="mb-4 gap-2">
                  <View className="flex-row items-center gap-2">
                    <TouchableOpacity
                      onPress={irMesPrev}
                      className="w-8 h-8 border border-border rounded-lg items-center justify-center bg-white"
                    >
                      <Text className="text-dark text-lg">‹</Text>
                    </TouchableOpacity>
                    <Text className="flex-1 text-center text-dark font-semibold text-sm">
                      {MESES_ETIQUETAS[mes]}
                    </Text>
                    <TouchableOpacity
                      onPress={irMesSig}
                      disabled={esActualMes}
                      className={`w-8 h-8 border rounded-lg items-center justify-center bg-white ${
                        esActualMes ? 'border-border/40' : 'border-border'
                      }`}
                    >
                      <Text className={`text-lg ${esActualMes ? 'text-border' : 'text-dark'}`}>›</Text>
                    </TouchableOpacity>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <TouchableOpacity
                      onPress={irAnioPrev}
                      className="w-8 h-8 border border-border rounded-lg items-center justify-center bg-white"
                    >
                      <Text className="text-dark text-lg">‹</Text>
                    </TouchableOpacity>
                    <Text className="flex-1 text-center text-dark font-semibold text-sm">{anio}</Text>
                    <TouchableOpacity
                      onPress={irAnioSig}
                      disabled={esAnioMaximo}
                      className={`w-8 h-8 border rounded-lg items-center justify-center bg-white ${
                        esAnioMaximo ? 'border-border/40' : 'border-border'
                      }`}
                    >
                      <Text className={`text-lg ${esAnioMaximo ? 'text-border' : 'text-dark'}`}>›</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {modoPeriodo === 'ANIO' && (
                <View className="flex-row items-center gap-2 mb-4">
                  <TouchableOpacity
                    onPress={() => onMesAnioChange(mes, anio - 1)}
                    className="w-8 h-8 border border-border rounded-lg items-center justify-center bg-white"
                  >
                    <Text className="text-dark text-lg">‹</Text>
                  </TouchableOpacity>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1 max-h-10">
                    <View className="flex-row items-center gap-1 flex-wrap">
                      {anos.map((y) => (
                        <TouchableOpacity
                          key={y}
                          onPress={() => onMesAnioChange(mes, y)}
                          className={`px-2.5 py-1.5 rounded-lg border ${
                            anio === y ? 'bg-dark border-dark' : 'border-border bg-white'
                          }`}
                        >
                          <Text
                            className={`text-xs font-semibold ${anio === y ? 'text-white' : 'text-dark'}`}
                          >
                            {y}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                  <TouchableOpacity
                    onPress={() => {
                      if (!esAnioMaximo) onMesAnioChange(mes, anio + 1)
                    }}
                    disabled={esAnioMaximo}
                    className={`w-8 h-8 border rounded-lg items-center justify-center bg-white ${
                      esAnioMaximo ? 'border-border/40' : 'border-border'
                    }`}
                  >
                    <Text className={`text-lg ${esAnioMaximo ? 'text-border' : 'text-dark'}`}>›</Text>
                  </TouchableOpacity>
                </View>
              )}

              {modoPeriodo === 'RANGO' && (
                <View className="mb-4 gap-2">
                  <Text className="text-xs text-muted">Desde (AAAA-MM-DD)</Text>
                  <TextInput
                    value={rangoDesde}
                    onChangeText={(t) => onRangoChange(t, rangoHasta)}
                    placeholder="2026-01-01"
                    placeholderTextColor="#888884"
                    autoCapitalize="none"
                    className="border border-border rounded-xl px-3 py-2.5 text-dark bg-white text-sm"
                  />
                  <Text className="text-xs text-muted mt-1">Hasta (AAAA-MM-DD)</Text>
                  <TextInput
                    value={rangoHasta}
                    onChangeText={(t) => onRangoChange(rangoDesde, t)}
                    placeholder="2026-01-31"
                    placeholderTextColor="#888884"
                    autoCapitalize="none"
                    className="border border-border rounded-xl px-3 py-2.5 text-dark bg-white text-sm"
                  />
                </View>
              )}

              <Text className="text-xs text-muted font-semibold uppercase mt-2 mb-2">Categoría</Text>
              {filasCat.map(({ cat, depth }) => {
                const hijos = hijosDe(categorias, cat.id)
                const est = estadoGrupoCategoria(filtrosCategorias, cat, hijos)
                const checked = est === 'checked'
                const ind = est === 'indeterminate'
                return (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => onToggleCategoria(cat)}
                    className="flex-row items-center py-2.5 border-b border-border"
                    style={{ paddingLeft: depth > 0 ? 16 : 0 }}
                  >
                    <View
                      className={`w-5 h-5 rounded border mr-3 items-center justify-center ${
                        checked ? 'bg-dark border-dark' : 'border-border bg-white'
                      }`}
                    >
                      {checked && <Text className="text-white text-xs font-bold">✓</Text>}
                      {ind && <Text className="text-dark text-xs font-bold">−</Text>}
                    </View>
                    <Text className="text-dark text-sm flex-1">{cat.nombre}</Text>
                  </TouchableOpacity>
                )
              })}

              <Text className="text-xs text-muted font-semibold uppercase mt-4 mb-2">Método de pago</Text>
              {(['EFECTIVO', 'DEBITO', 'CREDITO'] as const).map((met) => {
                const selected = filtrosMetodos.includes(met)
                return (
                  <TouchableOpacity
                    key={met}
                    onPress={() => onToggleMetodo(met)}
                    className="flex-row items-center py-2.5 border-b border-border"
                  >
                    <View
                      className={`w-5 h-5 rounded border mr-3 items-center justify-center ${
                        selected ? 'bg-dark border-dark' : 'border-border bg-white'
                      }`}
                    >
                      {selected && <Text className="text-white text-xs font-bold">✓</Text>}
                    </View>
                    <Text className="text-dark text-sm">{metodoLabel(met)}</Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>

            <View className="flex-row gap-3 px-5 py-4 border-t border-border">
              <TouchableOpacity
                onPress={onLimpiar}
                className="flex-1 border border-border rounded-xl py-3 items-center"
              >
                <Text className="text-dark font-semibold">Limpiar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onRequestClose}
                className="flex-1 bg-dark rounded-xl py-3 items-center"
              >
                <Text className="text-white font-semibold">Aplicar</Text>
              </TouchableOpacity>
            </View>
          </View>
      </View>
    </Modal>
  )
}
