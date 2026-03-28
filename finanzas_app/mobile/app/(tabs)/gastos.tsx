import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
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
  categoria_nombre: string
  metodo_pago_tipo: 'EFECTIVO' | 'DEBITO' | 'CREDITO'
  usuario?: number | string
}

interface Categoria {
  id: number
  nombre: string
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const METODO_BADGE: Record<Movimiento['metodo_pago_tipo'], { label: string; bg: string; color: string }> = {
  EFECTIVO: { label: 'EF', bg: '#f0f0ec', color: '#6b7280' },
  DEBITO:   { label: 'TD', bg: '#e8f4ff', color: '#3b82f6' },
  CREDITO:  { label: 'TC', bg: '#fff0f0', color: '#ff4d4d' },
}

const TAB_BAR_HEIGHT = 66

function montoSeguro(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(n) ? n : 0
}

function hoyISO(): string {
  const h = new Date()
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`
}

function fechaGrupo(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES_CORTOS[m - 1]}`
}

function groupByDate(movimientos: Movimiento[]) {
  const today = hoyISO()
  const map = new Map<string, Movimiento[]>()
  for (const m of movimientos) {
    if (!map.has(m.fecha)) map.set(m.fecha, [])
    map.get(m.fecha)!.push(m)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([fecha, movs]) => ({
      fecha,
      label: fecha === today ? 'Hoy' : fechaGrupo(fecha),
      movimientos: movs,
    }))
}

export default function GastosScreen() {
  const { formatMonto } = useConfig()
  const { user } = useAuth()
  const formRef = useRef<MovimientoFormularioRef>(null)
  const insets = useSafeAreaInsets()

  const hoy = new Date()
  const [mes, setMes] = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | 'INGRESO' | 'EGRESO'>('TODOS')
  const [busqueda, setBusqueda] = useState('')
  const [filtrosCategorias, setFiltrosCategorias] = useState<string[]>([])
  const [filtrosMetodos, setFiltrosMetodos] = useState<string[]>([])
  const [filtrosOpen, setFiltrosOpen] = useState(false)

  const { data: catData } = useCategorias()
  const categorias = (catData as Categoria[] | null) ?? []

  const { movimientos: raw, loading, error, refetch, eliminar } = useMovimientos({
    mes: mes + 1,
    anio,
    ambito: 'COMUN',
    tipo: filtroTipo !== 'TODOS' ? filtroTipo : undefined,
    q: busqueda.trim() || undefined,
  })
  const movimientosTyped = (raw ?? []) as Movimiento[]

  const omitirRefetchEnPrimerFoco = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (omitirRefetchEnPrimerFoco.current) {
        omitirRefetchEnPrimerFoco.current = false
        return
      }
      void refetch()
    }, [refetch]),
  )

  const esActual = mes === hoy.getMonth() && anio === hoy.getFullYear()

  function irAnterior() {
    if (mes === 0) { setMes(11); setAnio((a) => a - 1) }
    else setMes((m) => m - 1)
  }

  function irSiguiente() {
    if (esActual) return
    if (mes === 11) { setMes(0); setAnio((a) => a + 1) }
    else setMes((m) => m + 1)
  }

  const movimientosFiltrados = useMemo(() => {
    return movimientosTyped.filter((m) => {
      if (filtrosCategorias.length > 0 && !filtrosCategorias.includes(m.categoria_nombre)) return false
      if (filtrosMetodos.length > 0 && !filtrosMetodos.includes(m.metodo_pago_tipo)) return false
      return true
    })
  }, [movimientosTyped, filtrosCategorias, filtrosMetodos])

  const grupos = useMemo(() => groupByDate(movimientosFiltrados), [movimientosFiltrados])

  const totalMes = useMemo(
    () => movimientosTyped.filter((m) => m.tipo === 'EGRESO').reduce((s, m) => s + montoSeguro(m.monto), 0),
    [movimientosTyped],
  )

  const filtrosActivos = filtrosCategorias.length + filtrosMetodos.length
  const hayFiltros = filtrosActivos > 0 || filtroTipo !== 'TODOS' || busqueda.trim().length > 0

  function limpiarFiltros() {
    setFiltrosCategorias([])
    setFiltrosMetodos([])
    setFiltrosOpen(false)
  }

  function toggleCategoria(nombre: string) {
    setFiltrosCategorias((prev) =>
      prev.includes(nombre) ? prev.filter((c) => c !== nombre) : [...prev, nombre]
    )
  }

  function toggleMetodo(met: string) {
    setFiltrosMetodos((prev) =>
      prev.includes(met) ? prev.filter((x) => x !== met) : [...prev, met]
    )
  }

  function confirmarEliminar(mov: Movimiento) {
    const m = montoSeguro(mov.monto)
    Alert.alert(
      'Eliminar movimiento',
      `¿Eliminar "${mov.comentario || '—'}" por ${formatMonto(m)}? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => void eliminar(mov.id).then(() => refetch()),
        },
      ]
    )
  }

  const tabBarBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8)
  const modalSheetMarginBottom = tabBarBottom + TAB_BAR_HEIGHT + 12

  // Sección para FlatList: cabecera de grupo + sus movimientos
  type ListItem =
    | { kind: 'header'; fecha: string; label: string; subtotal: number }
    | { kind: 'row'; mov: Movimiento; isLast: boolean }

  const listItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = []
    for (const grupo of grupos) {
      const subtotal = grupo.movimientos
        .filter((m) => m.tipo === 'EGRESO')
        .reduce((acc, m) => acc + montoSeguro(m.monto), 0)
      items.push({ kind: 'header', fecha: grupo.fecha, label: grupo.label, subtotal })
      grupo.movimientos.forEach((mov, idx) => {
        items.push({ kind: 'row', mov, isLast: idx === grupo.movimientos.length - 1 })
      })
    }
    return items
  }, [grupos])

  function renderItem({ item }: { item: ListItem }) {
    if (item.kind === 'header') {
      return (
        <View className="flex-row items-baseline flex-wrap mb-2 mt-4 px-5">
          <Text className="text-xs font-bold text-muted tracking-wide">{item.label.toUpperCase()}</Text>
          {item.subtotal > 0 && (
            <>
              <Text className="text-xs text-muted mx-1">—</Text>
              <Text className="text-xs font-semibold text-dark">{formatMonto(item.subtotal)}</Text>
            </>
          )}
        </View>
      )
    }

    const { mov, isLast } = item
    const badge = METODO_BADGE[mov.metodo_pago_tipo ?? 'EFECTIVO']
    const esIngreso = mov.tipo === 'INGRESO'
    const m = montoSeguro(mov.monto)
    const puedeEditar =
      user != null &&
      mov.usuario != null &&
      mov.usuario !== '' &&
      Number(mov.usuario) === Number(user.id)

    return (
      <View className={`mx-5 bg-white border-x border-t border-border ${isLast ? 'border-b rounded-b-xl mb-1' : ''} ${!isLast ? '' : ''} overflow-hidden`}>
        <View className="px-4 py-3 flex-row items-center">
          <View className="flex-1 min-w-0 mr-2">
            <Text className="text-dark font-medium text-sm" numberOfLines={2}>
              {mov.comentario || '—'}
            </Text>
            <Text className="text-muted text-xs mt-0.5">{mov.categoria_nombre}</Text>
          </View>
          <View className="items-end">
            <Text className={`text-sm font-semibold ${esIngreso ? 'text-success' : 'text-dark'}`}>
              {esIngreso ? '+' : '−'}
              {formatMonto(m)}
            </Text>
            <View className="flex-row items-center mt-1 gap-2 flex-wrap justify-end">
              <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: badge.bg }}>
                <Text className="text-[10px] font-semibold" style={{ color: badge.color }}>
                  {badge.label}
                </Text>
              </View>
              {puedeEditar && (
                <TouchableOpacity
                  onPress={() => formRef.current?.iniciarEdicion(mov.id)}
                  hitSlop={8}
                  className="px-2 py-1 rounded-lg border border-border"
                >
                  <Text className="text-dark text-xs font-semibold">Editar</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => confirmarEliminar(mov)} hitSlop={8}>
                <Text className="text-danger text-sm">🗑</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    )
  }

  // Primera fila de cada grupo necesita borde superior redondeado
  const listItemsConBordes = useMemo<ListItem[]>(() => {
    return listItems.map((item, idx) => {
      if (item.kind === 'row') {
        const prev = listItems[idx - 1]
        const isFirst = prev?.kind === 'header'
        return { ...item, isFirst }
      }
      return item
    })
  }, [listItems])

  return (
    <MobileShell title="Gastos comunes">
      <View className="flex-1 bg-surface">
        {/* Header controles */}
        <View className="px-5 pt-3 pb-2">
          {/* Navegación mes */}
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-2 flex-1">
              <TouchableOpacity
                onPress={irAnterior}
                className="w-8 h-8 border border-border rounded-lg items-center justify-center bg-white"
              >
                <Text className="text-dark text-lg">‹</Text>
              </TouchableOpacity>
              <Text className="text-dark font-semibold text-sm flex-1 text-center">
                {MESES[mes]} {anio}
              </Text>
              <TouchableOpacity
                onPress={irSiguiente}
                disabled={esActual}
                className={`w-8 h-8 border rounded-lg items-center justify-center bg-white ${esActual ? 'border-border/40' : 'border-border'}`}
              >
                <Text className={`text-lg ${esActual ? 'text-border' : 'text-dark'}`}>›</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Total egresos del mes */}
          <Text className="text-muted text-xs font-medium mb-3">
            Egresos del mes: <Text className="text-dark font-semibold">{formatMonto(totalMes)}</Text>
          </Text>

          {/* Botón nuevo */}
          <TouchableOpacity
            onPress={() => formRef.current?.abrirNuevoComun()}
            className="bg-dark rounded-xl py-3 items-center mb-4"
          >
            <Text className="text-white font-bold text-sm">+ Nuevo movimiento</Text>
          </TouchableOpacity>

          {/* Segmentado tipo */}
          <View className="flex-row border border-border rounded-lg overflow-hidden mb-3 bg-white">
            {(['TODOS', 'INGRESO', 'EGRESO'] as const).map((v, i) => (
              <TouchableOpacity
                key={v}
                onPress={() => setFiltroTipo(v)}
                className={`flex-1 py-2.5 items-center ${i > 0 ? 'border-l border-border' : ''} ${filtroTipo === v ? 'bg-dark' : 'bg-white'}`}
              >
                <Text className={`text-xs font-semibold ${filtroTipo === v ? 'text-white' : 'text-muted'}`}>
                  {v === 'TODOS' ? 'Todos' : v === 'INGRESO' ? 'Ingreso' : 'Egreso'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Búsqueda */}
          <TextInput
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Descripción, categoría o palabras clave…"
            placeholderTextColor="#888884"
            className="border border-border rounded-xl px-3 py-2.5 text-dark bg-white mb-2"
          />

          {/* Botón filtros */}
          <TouchableOpacity
            onPress={() => setFiltrosOpen(true)}
            className="border border-border rounded-xl py-2.5 items-center bg-white flex-row justify-center"
          >
            <Text className="text-dark font-semibold text-sm">Filtros</Text>
            {filtrosActivos > 0 && (
              <View className="ml-2 bg-accent rounded-full min-w-[22px] px-1.5 py-0.5">
                <Text className="text-dark text-xs font-bold text-center">{filtrosActivos}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Lista */}
        {loading ? (
          <View className="py-16 items-center">
            <ActivityIndicator color="#0f0f0f" />
          </View>
        ) : error ? (
          <View className="mx-5 bg-danger/10 border border-danger/30 rounded-xl p-4">
            <Text className="text-danger text-sm text-center">{error}</Text>
            <TouchableOpacity onPress={refetch} className="mt-2">
              <Text className="text-dark font-semibold text-sm text-center underline">Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={listItemsConBordes}
            keyExtractor={(item, idx) =>
              item.kind === 'header' ? `h-${item.fecha}` : `r-${item.mov.id}-${idx}`
            }
            renderItem={renderItem}
            contentContainerStyle={
              listItemsConBordes.length === 0
                ? { flex: 1, paddingBottom: 130 }
                : { paddingBottom: 130 }
            }
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-16">
                <Text className="text-muted text-sm text-center">Sin movimientos comunes para este período.</Text>
                {hayFiltros && (
                  <TouchableOpacity onPress={limpiarFiltros} className="mt-4">
                    <Text className="text-dark font-semibold text-sm underline">Limpiar filtros</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          />
        )}
      </View>

      {/* Modal filtros */}
      <Modal visible={filtrosOpen} transparent animationType="slide" onRequestClose={() => setFiltrosOpen(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-2xl max-h-[85%]">
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-border">
              <Text className="text-lg font-bold text-dark">Filtros</Text>
              <TouchableOpacity onPress={() => setFiltrosOpen(false)}>
                <Text className="text-muted text-xl">×</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              className="px-5 py-4"
              data={[
                { section: 'cat' as const },
                ...categorias.map((c) => ({ cat: c })),
                { section: 'met' as const },
                ...(['EFECTIVO', 'DEBITO', 'CREDITO'] as const).map((met) => ({ met })),
              ]}
              keyExtractor={(item, idx) => String(idx)}
              renderItem={({ item }) => {
                if ('section' in item) {
                  return (
                    <Text className="text-xs text-muted font-semibold uppercase mt-4 mb-2">
                      {item.section === 'cat' ? 'Categoría' : 'Método de pago'}
                    </Text>
                  )
                }
                if ('cat' in item) {
                  const selected = filtrosCategorias.includes(item.cat.nombre)
                  return (
                    <TouchableOpacity
                      onPress={() => toggleCategoria(item.cat.nombre)}
                      className="flex-row items-center py-2.5 border-b border-border"
                    >
                      <View className={`w-5 h-5 rounded border mr-3 items-center justify-center ${selected ? 'bg-dark border-dark' : 'border-border'}`}>
                        {selected && <Text className="text-white text-xs font-bold">✓</Text>}
                      </View>
                      <Text className="text-dark text-sm">{item.cat.nombre}</Text>
                    </TouchableOpacity>
                  )
                }
                const met = item.met
                const label = met === 'EFECTIVO' ? 'Efectivo' : met === 'DEBITO' ? 'Débito' : 'Crédito'
                const selected = filtrosMetodos.includes(met)
                return (
                  <TouchableOpacity
                    onPress={() => toggleMetodo(met)}
                    className="flex-row items-center py-2.5 border-b border-border"
                  >
                    <View className={`w-5 h-5 rounded border mr-3 items-center justify-center ${selected ? 'bg-dark border-dark' : 'border-border'}`}>
                      {selected && <Text className="text-white text-xs font-bold">✓</Text>}
                    </View>
                    <Text className="text-dark text-sm">{label}</Text>
                  </TouchableOpacity>
                )
              }}
            />
            <View className="flex-row gap-3 px-5 py-4 border-t border-border">
              <TouchableOpacity onPress={limpiarFiltros} className="flex-1 border border-border rounded-xl py-3 items-center">
                <Text className="text-dark font-semibold">Limpiar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setFiltrosOpen(false)}
                className="flex-1 bg-dark rounded-xl py-3 items-center"
              >
                <Text className="text-white font-semibold">Aplicar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Formulario overlay */}
      <MovimientoFormulario
        ref={formRef}
        variant="overlay"
        sheetMarginBottom={modalSheetMarginBottom}
        refetchMovimientosComun={refetch}
      />
    </MobileShell>
  )
}
