import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useMovimientos } from '@finanzas/shared/hooks/useMovimientos'
import { useApi } from '@finanzas/shared/hooks/useApi'
import { useConfig } from '@finanzas/shared/context/ConfigContext'
import { finanzasApi, movimientosApi } from '@finanzas/shared/api'
import { MobileShell } from '../../components/layout/MobileShell'
import { useAuth } from '../../context/AuthContext'

interface Movimiento {
  id:               number
  fecha:            string
  tipo:             'INGRESO' | 'EGRESO'
  ambito:           'PERSONAL' | 'COMUN'
  cuenta:           number | null
  monto:            number
  comentario:       string
  categoria:        number | null
  categoria_nombre: string
  metodo_pago_tipo: 'EFECTIVO' | 'DEBITO' | 'CREDITO'
  usuario?:         number | string
}

interface LiquidacionApi {
  ingresos: Array<{ usuario_id: number; total: string }>
  gastos_comunes: Array<{ usuario_id: number; total: string }>
}

interface CategoriaGasto {
  categoria: string
  monto: number
  color: string
}

interface CuentaPersonalApi {
  id: number
  nombre: string
  es_propia: boolean
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const COLORS = ['#c8f060', '#60c8f0', '#f060c8', '#f0c860', '#60f0c8', '#c860f0']

const METODO_BADGE: Record<'EFECTIVO' | 'DEBITO' | 'CREDITO', { label: string; bg: string; color: string }> = {
  EFECTIVO: { label: 'EF', bg: '#f0f0ec', color: '#6b7280' },
  DEBITO:   { label: 'TD', bg: '#e8f4ff', color: '#3b82f6' },
  CREDITO:  { label: 'TC', bg: '#fff0f0', color: '#ff4d4d' },
}

function toPesos(n: unknown): number {
  const x = Number(n)
  return Number.isFinite(x) ? Math.round(x) : 0
}

function montoAbs(n: unknown): number {
  return Math.abs(toPesos(n))
}

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const mes = date.toLocaleDateString('es-CL', { month: 'short' }).replace('.', '')
  return `${String(date.getDate()).padStart(2, '0')} ${mes}`
}

export default function DashboardScreen() {
  const { formatMonto } = useConfig()
  const router = useRouter()
  const { user } = useAuth()

  const hoy = new Date()
  const [mes, setMes] = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [cuentaTab, setCuentaTab] = useState<number | null>(null)
  const [showSelectorCuenta, setShowSelectorCuenta] = useState(false)
  const scrollRef = useRef<ScrollView>(null)
  const [selectorY, setSelectorY] = useState(0)

  const { movimientos: raw, loading, error, refetch } = useMovimientos({
    mes: mes + 1,
    anio,
    ambito: 'PERSONAL',
    solo_mios: true,
  })
  const movimientos = raw as Movimiento[]

  const { data: deudaRes, loading: loadingDeuda } = useApi(
    () => movimientosApi.getCuotasDeudaPendiente(),
    []
  )
  const { data: cuentasRes } = useApi<CuentaPersonalApi[]>(
    () => finanzasApi.getCuentasPersonales(),
    []
  )
  const { data: liquidacionRes, loading: loadingLiquidacion, error: errorLiquidacion } =
    useApi<LiquidacionApi>(() => finanzasApi.getLiquidacion(mes + 1, anio), [mes, anio])

  const esActual = mes === hoy.getMonth() && anio === hoy.getFullYear()

  const cuentasPersonales = useMemo(() => {
    const list = ((cuentasRes ?? []) as CuentaPersonalApi[]).filter((c) => c.es_propia)
    return list.sort((a, b) => {
      const aPersonal = a.nombre.trim().toLowerCase() === 'personal'
      const bPersonal = b.nombre.trim().toLowerCase() === 'personal'
      if (aPersonal && !bPersonal) return -1
      if (!aPersonal && bPersonal) return 1
      return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    })
  }, [cuentasRes])

  // Auto-seleccionar primera cuenta
  useEffect(() => {
    if (!cuentasPersonales.length) { setCuentaTab(null); return }
    if (cuentaTab === null || !cuentasPersonales.some(c => c.id === cuentaTab)) {
      setCuentaTab(cuentasPersonales[0].id)
    }
  }, [cuentasPersonales, cuentaTab])

  const deudaTc = useMemo(() => {
    const data = deudaRes as { total?: string } | null
    return Math.round(Number(data?.total) || 0)
  }, [deudaRes])

  const ajusteLiquidacionComun = useMemo(() => {
    if (!liquidacionRes || !user) return 0
    const totalIngresos = (liquidacionRes.ingresos ?? []).reduce(
      (acc, i) => acc + toPesos(i.total), 0
    )
    const totalGastosComunes = (liquidacionRes.gastos_comunes ?? []).reduce(
      (acc, g) => acc + toPesos(g.total), 0
    )
    if (totalIngresos <= 0 || totalGastosComunes <= 0) return 0
    const ingresoUsuario = (liquidacionRes.ingresos ?? [])
      .filter(i => i.usuario_id === user.id)
      .reduce((acc, i) => acc + toPesos(i.total), 0)
    const aporteEsperado = (ingresoUsuario / totalIngresos) * totalGastosComunes
    const pagadoPorUsuario = (liquidacionRes.gastos_comunes ?? [])
      .filter(g => g.usuario_id === user.id)
      .reduce((acc, g) => acc + toPesos(g.total), 0)
    return Math.round(pagadoPorUsuario - aporteEsperado)
  }, [liquidacionRes, user])

  // Efectivo total sobre todos los movimientos personales del usuario
  const efectivo = useMemo(() => {
    return movimientos
      .filter(m => m.metodo_pago_tipo !== 'CREDITO')
      .reduce(
        (acc, m) => acc + (m.tipo === 'INGRESO' ? montoAbs(m.monto) : -montoAbs(m.monto)),
        0
      )
  }, [movimientos])

  const saldo = efectivo - deudaTc + ajusteLiquidacionComun

  // Movimientos filtrados por la cuenta seleccionada (para categorías y lista)
  const movimientosCuenta = useMemo(() => {
    if (cuentaTab === null) return movimientos
    return movimientos.filter(m => m.cuenta === cuentaTab)
  }, [movimientos, cuentaTab])

  const { ultimos, categoriasSorted, maxCat, totalCat } = useMemo(() => {
    const ultimos = [...movimientosCuenta]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 10)

    const byCat = new Map<string, number>()
    for (const m of movimientosCuenta) {
      if (m.tipo !== 'EGRESO') continue
      const name = m.categoria_nombre || 'Otros'
      byCat.set(name, (byCat.get(name) ?? 0) + montoAbs(m.monto))
    }
    const categoriasSorted: CategoriaGasto[] = Array.from(byCat.entries())
      .map(([categoria, monto], i) => ({ categoria, monto, color: COLORS[i % COLORS.length] }))
      .sort((a, b) => b.monto - a.monto)
    const maxCat = categoriasSorted[0]?.monto ?? 1
    const totalCat = categoriasSorted.reduce((s, c) => s + c.monto, 0)

    return { ultimos, categoriasSorted, maxCat, totalCat }
  }, [movimientosCuenta])

  function irAnterior() {
    if (mes === 0) { setMes(11); setAnio(a => a - 1) }
    else setMes(m => m - 1)
  }

  function irSiguiente() {
    if (esActual) return
    if (mes === 11) { setMes(0); setAnio(a => a + 1) }
    else setMes(m => m + 1)
  }

  const hasError = error || errorLiquidacion
  const isLoading = loading || loadingDeuda || loadingLiquidacion

  useEffect(() => {
    if (!showSelectorCuenta) return
    const timeout = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(selectorY - 20, 0), animated: true })
    }, 50)
    return () => clearTimeout(timeout)
  }, [showSelectorCuenta, selectorY])

  function abrirGastoPersonal(cuentaId?: number) {
    if (cuentaId != null) {
      router.push(`/nuevo-movimiento?cuenta=${cuentaId}` as never)
      return
    }
    router.push('/(tabs)/gastos?nuevo=1&ambito=PERSONAL' as never)
  }

  function onPressGastoPersonal() {
    if (cuentasPersonales.length === 0) {
      Alert.alert(
        'Sin cuentas personales',
        'Primero crea una cuenta personal para registrar gastos personales.'
      )
      return
    }
    if (cuentasPersonales.length === 1) {
      abrirGastoPersonal(cuentasPersonales[0].id)
      return
    }
    setShowSelectorCuenta((prev) => !prev)
  }

  function handleSelectorLayout(event: LayoutChangeEvent) {
    setSelectorY(event.nativeEvent.layout.y)
  }

  return (
    <MobileShell title="Dashboard">
      <ScrollView
        ref={scrollRef}
        className="flex-1 bg-surface"
        contentContainerStyle={{ padding: 20, paddingBottom: 28 }}
      >
        {/* Encabezado + navegación de mes */}
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center">
            <Text className="text-2xl font-bold text-dark">Resumen</Text>
            {esActual && (
              <View className="bg-accent rounded-full px-2.5 py-1 ml-2">
                <Text className="text-[10px] text-dark font-semibold uppercase">Mes actual</Text>
              </View>
            )}
          </View>

          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              onPress={irAnterior}
              className="w-8 h-8 border border-border rounded-lg items-center justify-center"
            >
              <Text className="text-dark text-lg">‹</Text>
            </TouchableOpacity>
            <Text className="text-dark font-semibold text-sm min-w-[130px] text-center">
              {MESES[mes]} {anio}
            </Text>
            <TouchableOpacity
              onPress={irSiguiente}
              disabled={esActual}
              className={`w-8 h-8 border rounded-lg items-center justify-center ${
                esActual ? 'border-border/50' : 'border-border'
              }`}
            >
              <Text className={`text-lg ${esActual ? 'text-border' : 'text-dark'}`}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isLoading ? (
          <View className="items-center py-12">
            <ActivityIndicator color="#0f0f0f" />
          </View>
        ) : hasError ? (
          <View className="bg-danger/10 border border-danger/30 rounded-xl p-4 mb-4">
            <Text className="text-danger text-sm text-center">
              {hasError || 'Error al cargar el dashboard.'}
            </Text>
            <TouchableOpacity onPress={refetch} className="mt-2 items-center">
              <Text className="text-dark font-semibold text-sm underline">Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Tarjetas métricas */}
            <View className="gap-3 mb-6">
              <View className="bg-white rounded-2xl p-5">
                <Text className="text-sm text-muted mb-1">Efectivo disponible</Text>
                <Text className="text-[28px] font-bold text-dark">
                  {efectivo < 0 ? `−${formatMonto(Math.abs(efectivo))}` : formatMonto(efectivo)}
                </Text>
              </View>

              <View className="bg-white rounded-2xl p-5">
                <Text className="text-sm text-muted mb-1">Deuda tarjetas</Text>
                <Text className="text-[28px] font-bold text-danger">{formatMonto(Math.abs(deudaTc))}</Text>
              </View>

              <View className="bg-dark rounded-2xl p-5">
                <Text className="text-sm text-white/60 mb-1">Saldo proyectado</Text>
                <Text className={`text-[28px] font-bold ${saldo < 0 ? 'text-danger' : 'text-accent'}`}>
                  {saldo < 0 ? `−${formatMonto(Math.abs(saldo))}` : formatMonto(saldo)}
                </Text>
              </View>
            </View>

            {/* Tabs por cuenta personal */}
            {cuentasPersonales.length > 0 && (
              <View className="flex-row flex-wrap gap-2 mb-4">
                {cuentasPersonales.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setCuentaTab(c.id)}
                    className={`px-4 py-2 rounded-full border ${
                      cuentaTab === c.id ? 'bg-dark border-dark' : 'bg-white border-border'
                    }`}
                  >
                    <Text className={`text-xs font-semibold ${cuentaTab === c.id ? 'text-white' : 'text-dark'}`}>
                      {c.nombre}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Acciones rápidas */}
            <Text className="text-xs text-muted uppercase font-semibold mb-3">Acciones rápidas</Text>
            <View className="flex-row gap-3 mb-4">
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/gastos?nuevo=1')}
                className="flex-1 bg-accent rounded-xl p-4 items-center"
              >
                <Text className="text-dark font-bold text-sm">+ Gasto común</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onPressGastoPersonal}
                className="flex-1 bg-dark rounded-xl p-4 items-center"
              >
                <Text className="text-white font-bold text-sm">+ Gasto personal</Text>
              </TouchableOpacity>
            </View>

            {showSelectorCuenta && cuentasPersonales.length > 1 && (
              <View
                onLayout={handleSelectorLayout}
                className="bg-white border border-border rounded-xl p-4 mb-4"
              >
                <Text className="text-xs text-muted uppercase font-semibold mb-3">
                  Elegir cuenta personal
                </Text>
                <View className="gap-2">
                  {cuentasPersonales.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => {
                        setShowSelectorCuenta(false)
                        abrirGastoPersonal(c.id)
                      }}
                      className="border border-border rounded-lg px-3 py-3"
                    >
                      <Text className="text-dark font-semibold text-sm">{c.nombre}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Gastos por categoría */}
            <View className="bg-white rounded-2xl p-5 mb-4">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-dark font-semibold text-sm">Gastos por categoría</Text>
                <Text className="text-dark font-semibold text-sm">{formatMonto(Math.abs(totalCat))}</Text>
              </View>

              {categoriasSorted.length === 0 ? (
                <Text className="text-muted text-sm text-center py-2">Sin gastos en este mes.</Text>
              ) : (
                <View className="gap-3">
                  {categoriasSorted.map((cat) => {
                    const pct = maxCat > 0 ? (cat.monto / maxCat) * 100 : 0
                    return (
                      <View key={cat.categoria} className="flex-row items-center">
                        <Text className="text-sm text-dark w-[110px]" numberOfLines={1}>
                          {cat.categoria}
                        </Text>
                        <View className="flex-1 h-2 bg-[#f0f0ec] rounded overflow-hidden mx-3">
                          <View
                            className="h-2 rounded"
                            style={{ width: `${pct}%`, backgroundColor: cat.color }}
                          />
                        </View>
                        <Text className="text-xs font-semibold text-dark text-right w-[82px]">
                          {formatMonto(Math.abs(cat.monto))}
                        </Text>
                      </View>
                    )
                  })}
                </View>
              )}
            </View>

            {/* Lista de movimientos */}
            <View className="bg-white rounded-2xl overflow-hidden mb-4">
              <View className="px-5 py-4 border-b border-border flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-dark">Gastos personales</Text>
                <Text className="text-xs text-muted">
                  {ultimos.length} movimiento{ultimos.length !== 1 ? 's' : ''}
                </Text>
              </View>

              {ultimos.length === 0 ? (
                <Text className="text-muted text-sm text-center py-5">Sin movimientos este mes.</Text>
              ) : (
                <>
                  {ultimos.map((item, i) => {
                    const esIngreso = item.tipo === 'INGRESO'
                    const badge = METODO_BADGE[item.metodo_pago_tipo ?? 'EFECTIVO']
                    const montoFmt = esIngreso
                      ? formatMonto(montoAbs(item.monto))
                      : `−${formatMonto(montoAbs(item.monto))}`

                    const puedeEditar =
                      user != null &&
                      item.usuario != null &&
                      item.usuario !== '' &&
                      Number(item.usuario) === Number(user.id)

                    return (
                      <View
                        key={item.id}
                        className={`px-5 py-3 flex-row items-start ${i < ultimos.length - 1 ? 'border-b border-border' : ''}`}
                      >
                        <Text className="text-[11px] text-muted min-w-[48px] pt-0.5">
                          {fechaCorta(item.fecha)}
                        </Text>
                        <View className="flex-1 min-w-0">
                          <Text className="text-sm text-dark font-medium" numberOfLines={1}>
                            {item.comentario || '—'}
                          </Text>
                          <Text className="text-[11px] text-muted mt-0.5">
                            {item.categoria_nombre || 'Sin categoría'}
                          </Text>
                        </View>
                        <View className="items-end ml-3">
                          <Text className={`text-sm font-semibold ${esIngreso ? 'text-success' : 'text-dark'}`}>
                            {montoFmt}
                          </Text>
                          <View className="flex-row items-center mt-1 gap-2">
                            <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: badge.bg }}>
                              <Text className="text-[10px] font-semibold" style={{ color: badge.color }}>
                                {badge.label}
                              </Text>
                            </View>
                            {puedeEditar && (
                              <TouchableOpacity
                                onPress={() =>
                                  router.push(
                                    `/nuevo-movimiento?editar=${item.id}&cuenta=${item.cuenta ?? ''}` as never
                                  )
                                }
                                hitSlop={8}
                              >
                                <Text className="text-dark text-xs font-semibold">Editar</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      </View>
                    )
                  })}

                  {cuentaTab != null && (
                    <TouchableOpacity
                      onPress={() => router.push(`/cuenta/${cuentaTab}` as never)}
                      className="px-5 py-3 border-t border-border"
                    >
                      <Text className="text-dark text-xs font-semibold text-center">Ver todos →</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </MobileShell>
  )
}
