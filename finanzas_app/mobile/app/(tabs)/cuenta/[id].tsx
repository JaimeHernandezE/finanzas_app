import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useMovimientos } from '@finanzas/shared/hooks/useMovimientos'
import { useApi } from '@finanzas/shared/hooks/useApi'
import { useCategorias } from '@finanzas/shared/hooks/useCatalogos'
import { useConfig } from '@finanzas/shared/context/ConfigContext'
import { finanzasApi, type CuentaPersonalApi } from '@finanzas/shared/api/finanzas'
import { MobileShell } from '../../../components/layout/MobileShell'
import { useAuth } from '../../../context/AuthContext'

interface Movimiento {
  id: number
  fecha: string
  comentario: string
  categoria_nombre: string
  monto: number
  tipo: 'INGRESO' | 'EGRESO'
  metodo_pago_tipo: 'EFECTIVO' | 'DEBITO' | 'CREDITO'
  /** Autor del movimiento (pk usuario); puede venir como número o string desde la API */
  usuario?: number | string
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

function montoSeguro(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(n) ? n : 0
}

/** IDs desde JSON a veces vienen como string; si la API no manda `usuario`, en cuenta propia se asume editable. */
function puedeEditarMovimientoEnCuenta(
  movUsuario: unknown,
  userId: unknown,
  cuentaEsPropia: boolean,
): boolean {
  const uidSesion = typeof userId === 'number' ? userId : Number(userId)
  if (!Number.isFinite(uidSesion)) return false
  if (movUsuario != null && movUsuario !== '') {
    const uMov = typeof movUsuario === 'number' ? movUsuario : Number(movUsuario)
    if (Number.isFinite(uMov)) return uMov === uidSesion
  }
  return cuentaEsPropia
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

export default function CuentaPersonalScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const { formatMonto } = useConfig()

  const id = idParam ? Number(idParam) : NaN

  const { data: cuentasData, loading: loadingCuentas, error: errorCuentas } = useApi<CuentaPersonalApi[]>(
    async () => {
      if (!user) return { data: [] }
      return finanzasApi.getCuentasPersonales()
    },
    [user?.email ?? '']
  )

  const cuenta = useMemo(() => {
    const list = (cuentasData ?? []) as CuentaPersonalApi[]
    return list.find((c) => c.id === id) ?? null
  }, [cuentasData, id])

  const hoy = new Date()
  const [mes, setMes] = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | 'INGRESO' | 'EGRESO'>('TODOS')
  const [busqueda, setBusqueda] = useState('')
  const [filtrosCategorias, setFiltrosCategorias] = useState<string[]>([])
  const [filtrosMetodos, setFiltrosMetodos] = useState<string[]>([])
  const [filtrosOpen, setFiltrosOpen] = useState(false)

  const { data: catData } = useCategorias()
  const categorias = (catData ?? []) as { id: number; nombre: string }[]

  const { movimientos: raw, loading, error, refetch, eliminar } = useMovimientos({
    cuenta: Number.isFinite(id) ? id : undefined,
    mes: mes + 1,
    anio,
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
    if (mes === 0) {
      setMes(11)
      setAnio((a) => a - 1)
    } else setMes((m) => m - 1)
  }

  function irSiguiente() {
    if (esActual) return
    if (mes === 11) {
      setMes(0)
      setAnio((a) => a + 1)
    } else setMes((m) => m + 1)
  }

  const movimientosFiltrados = useMemo(() => {
    return movimientosTyped.filter((m) => {
      if (filtrosCategorias.length > 0 && !filtrosCategorias.includes(m.categoria_nombre)) return false
      if (filtrosMetodos.length > 0 && !filtrosMetodos.includes(m.metodo_pago_tipo)) return false
      return true
    })
  }, [movimientosTyped, filtrosCategorias, filtrosMetodos])

  const grupos = useMemo(() => groupByDate(movimientosFiltrados), [movimientosFiltrados])
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

  function irNuevoMovimiento() {
    router.push(`/nuevo-movimiento?cuenta=${id}` as never)
  }

  function irEditarMovimiento(movId: number) {
    router.push(`/nuevo-movimiento?editar=${movId}&cuenta=${id}` as never)
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

  if (!user) {
    return (
      <MobileShell title="Cuenta">
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-muted text-sm">Inicia sesión para ver esta cuenta.</Text>
        </View>
      </MobileShell>
    )
  }

  if (loadingCuentas) {
    return (
      <MobileShell title="Cuenta">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0f0f0f" />
        </View>
      </MobileShell>
    )
  }

  if (errorCuentas || !cuenta) {
    return (
      <MobileShell title="Cuenta">
        <ScrollView className="flex-1 bg-surface px-5 pt-4">
          <TouchableOpacity
            onPress={() => router.replace('/(tabs)/index' as never)}
            className="self-start mb-4"
          >
            <Text className="text-dark text-sm font-semibold">← Volver</Text>
          </TouchableOpacity>
          <View className="bg-danger/10 border border-danger/30 rounded-xl p-4">
            <Text className="text-danger text-sm text-center">
              {errorCuentas ?? 'Cuenta no encontrada o sin acceso.'}
            </Text>
          </View>
        </ScrollView>
      </MobileShell>
    )
  }

  const tituloShell = cuenta.nombre

  return (
    <MobileShell title={tituloShell}>
      <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-3 pb-2">
          <TouchableOpacity
            onPress={() => router.replace('/(tabs)/index' as never)}
            className="self-start mb-3"
          >
            <Text className="text-dark text-sm font-semibold">← Volver</Text>
          </TouchableOpacity>

          {!cuenta.es_propia && cuenta.duenio_nombre && (
            <Text className="text-muted text-xs mb-2">Cuenta de {cuenta.duenio_nombre}</Text>
          )}

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
                className={`w-8 h-8 border rounded-lg items-center justify-center bg-white ${
                  esActual ? 'border-border/40' : 'border-border'
                }`}
              >
                <Text className={`text-lg ${esActual ? 'text-border' : 'text-dark'}`}>›</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            onPress={irNuevoMovimiento}
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
                className={`flex-1 py-2.5 items-center ${i > 0 ? 'border-l border-border' : ''} ${
                  filtroTipo === v ? 'bg-dark' : 'bg-white'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    filtroTipo === v ? 'text-white' : 'text-muted'
                  }`}
                >
                  {v === 'TODOS' ? 'Todos' : v === 'INGRESO' ? 'Ingreso' : 'Egreso'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Descripción, categoría o palabras clave…"
            placeholderTextColor="#888884"
            className="border border-border rounded-xl px-3 py-2.5 text-dark bg-white mb-2"
          />

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
        ) : grupos.length === 0 ? (
          <View className="mx-5 bg-white border border-border rounded-2xl p-8 items-center">
            <Text className="text-muted text-sm text-center">Sin movimientos para este período.</Text>
            {hayFiltros && (
              <TouchableOpacity onPress={limpiarFiltros} className="mt-4">
                <Text className="text-dark font-semibold text-sm underline">Limpiar filtros</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View className="px-5">
            {grupos.map((grupo) => {
              const subtotalEgresos = grupo.movimientos.reduce((acc, m) => {
                if (m.tipo !== 'EGRESO') return acc
                return acc + montoSeguro(m.monto)
              }, 0)
              const mostrarSubtotal = subtotalEgresos > 0

              return (
                <View key={grupo.fecha} className="mb-5">
                  <View className="flex-row items-baseline flex-wrap mb-2">
                    <Text className="text-xs font-bold text-muted tracking-wide">{grupo.label.toUpperCase()}</Text>
                    {mostrarSubtotal && (
                      <>
                        <Text className="text-xs text-muted mx-1">—</Text>
                        <Text className="text-xs font-semibold text-dark">{formatMonto(subtotalEgresos)}</Text>
                      </>
                    )}
                  </View>
                  <View className="bg-white border border-border rounded-xl overflow-hidden">
                    {grupo.movimientos.map((mov, idx) => {
                      const badge = METODO_BADGE[mov.metodo_pago_tipo ?? 'EFECTIVO']
                      const esIngreso = mov.tipo === 'INGRESO'
                      const m = montoSeguro(mov.monto)
                      const puedeEditar = puedeEditarMovimientoEnCuenta(
                        mov.usuario,
                        user?.id,
                        cuenta.es_propia,
                      )
                      return (
                        <View
                          key={mov.id}
                          className={`px-4 py-3 flex-row items-center ${idx < grupo.movimientos.length - 1 ? 'border-b border-border' : ''}`}
                        >
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
                                  onPress={() => irEditarMovimiento(mov.id)}
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
                      )
                    })}
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>

      <Modal visible={filtrosOpen} transparent animationType="slide" onRequestClose={() => setFiltrosOpen(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-2xl max-h-[85%]">
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-border">
              <Text className="text-lg font-bold text-dark">Filtros</Text>
              <TouchableOpacity onPress={() => setFiltrosOpen(false)}>
                <Text className="text-muted text-xl">×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView className="px-5 py-4">
              <Text className="text-xs text-muted font-semibold uppercase mb-2">Categoría</Text>
              {categorias.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => toggleCategoria(cat.nombre)}
                  className="flex-row items-center py-2.5 border-b border-border"
                >
                  <View
                    className={`w-5 h-5 rounded border mr-3 items-center justify-center ${
                      filtrosCategorias.includes(cat.nombre) ? 'bg-dark border-dark' : 'border-border'
                    }`}
                  >
                    {filtrosCategorias.includes(cat.nombre) && (
                      <Text className="text-white text-xs font-bold">✓</Text>
                    )}
                  </View>
                  <Text className="text-dark text-sm">{cat.nombre}</Text>
                </TouchableOpacity>
              ))}

              <Text className="text-xs text-muted font-semibold uppercase mt-4 mb-2">Método de pago</Text>
              {(['EFECTIVO', 'DEBITO', 'CREDITO'] as const).map((met) => {
                const label = met === 'EFECTIVO' ? 'Efectivo' : met === 'DEBITO' ? 'Débito' : 'Crédito'
                return (
                  <TouchableOpacity
                    key={met}
                    onPress={() => toggleMetodo(met)}
                    className="flex-row items-center py-2.5 border-b border-border"
                  >
                    <View
                      className={`w-5 h-5 rounded border mr-3 items-center justify-center ${
                        filtrosMetodos.includes(met) ? 'bg-dark border-dark' : 'border-border'
                      }`}
                    >
                      {filtrosMetodos.includes(met) && (
                        <Text className="text-white text-xs font-bold">✓</Text>
                      )}
                    </View>
                    <Text className="text-dark text-sm">{label}</Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
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
    </MobileShell>
  )
}
