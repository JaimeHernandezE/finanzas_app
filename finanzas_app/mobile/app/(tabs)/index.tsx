import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { useMovimientos } from '../../hooks/useMovimientos'
import { useApi } from '@finanzas/shared/hooks/useApi'
import { useConfig } from '@finanzas/shared/context/ConfigContext'
import { finanzasApi, movimientosApi } from '@finanzas/shared/api'
import type { PresupuestoMesFila } from '@finanzas/shared/api/finanzas'
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

interface CuentaPersonalApi {
  id: number
  nombre: string
  es_propia: boolean
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

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

function porcentaje(gastado: number, presupuestado: number): number {
  if (presupuestado <= 0) return 0
  return Math.min((gastado / presupuestado) * 100, 100)
}

function colorBarra(pct: number): string {
  if (pct >= 100) return '#ef4444'
  if (pct >= 80) return '#f59e0b'
  return '#22c55e'
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

  const queryClient = useQueryClient()
  const isFetchingRQ = useIsFetching()
  const [refreshing, setRefreshing] = useState(false)

  const esActual = mes === hoy.getMonth() && anio === hoy.getFullYear()

  const { mesPrevio, anioPrevio } = useMemo(() => {
    if (mes === 0) return { mesPrevio: 12, anioPrevio: anio - 1 }
    return { mesPrevio: mes, anioPrevio: anio }
  }, [mes, anio])

  // ── Queries del dashboard (todas offline-first via React Query) ────────────

  const qDeuda = useQuery({
    queryKey: ['deudaPendiente'],
    queryFn: () => movimientosApi.getCuotasDeudaPendiente().then((r: any) => r.data),
  })

  const qEfectivo = useQuery({
    queryKey: ['efectivoDisponible'],
    queryFn: () => finanzasApi.getEfectivoDisponible().then((r: any) => r.data as { efectivo: string }),
  })

  const qCuentas = useQuery<CuentaPersonalApi[]>({
    queryKey: ['cuentasPersonales'],
    queryFn: () => finanzasApi.getCuentasPersonales().then((r: any) => r.data as CuentaPersonalApi[]),
  })

  const qLiquidacion = useQuery<LiquidacionApi>({
    queryKey: ['liquidacion', mes + 1, anio],
    queryFn: () => finanzasApi.getLiquidacion(mes + 1, anio).then((r: any) => r.data as LiquidacionApi),
  })

  const qPresupuesto = useQuery<PresupuestoMesFila[]>({
    queryKey: ['presupuestoMes', mes + 1, anio, cuentaTab],
    queryFn: () =>
      finanzasApi.getPresupuestoMes({
        mes: mes + 1,
        anio,
        ambito: 'PERSONAL',
        cuenta: cuentaTab ?? undefined,
      }).then((r: any) => r.data as PresupuestoMesFila[]),
  })

  const qLiquidacionAnterior = useQuery<LiquidacionApi>({
    queryKey: ['liquidacion', mesPrevio, anioPrevio],
    queryFn: () => finanzasApi.getLiquidacion(mesPrevio, anioPrevio).then((r: any) => r.data as LiquidacionApi),
  })

  const qCompensacion = useQuery({
    queryKey: ['compensacion', mes + 1, anio],
    queryFn: () => finanzasApi.getCompensacionProyectada(mes + 1, anio).then((r: any) => r.data),
    enabled: esActual,
  })

  const qSueldos = useQuery({
    queryKey: ['sueldosProrrateo', mes + 1, anio],
    queryFn: () =>
      finanzasApi.getSueldosEstimadosProrrateo(mes + 1, anio)
        .then((r: any) => r.data as { mes: number; anio: number; montos: Record<string, string> }),
    enabled: esActual,
  })

  // Pull-to-refresh: fuerza refetch de todas las queries del dashboard
  const refetchAll = useCallback(async () => {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['movimientos'] }),
      queryClient.refetchQueries({ queryKey: ['deudaPendiente'] }),
      queryClient.refetchQueries({ queryKey: ['efectivoDisponible'] }),
      queryClient.refetchQueries({ queryKey: ['cuentasPersonales'] }),
      queryClient.refetchQueries({ queryKey: ['liquidacion'] }),
      queryClient.refetchQueries({ queryKey: ['presupuestoMes'] }),
      queryClient.refetchQueries({ queryKey: ['compensacion'] }),
      queryClient.refetchQueries({ queryKey: ['sueldosProrrateo'] }),
    ])
  }, [queryClient])

  // Cuando se invalidan movimientos (tras crear/editar/eliminar),
  // invalida también las queries derivadas del dashboard
  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        Array.isArray(event.query.queryKey) &&
        event.query.queryKey[0] === 'movimientos'
      ) {
        void queryClient.invalidateQueries({ queryKey: ['efectivoDisponible'] })
        void queryClient.invalidateQueries({ queryKey: ['deudaPendiente'] })
        void queryClient.invalidateQueries({ queryKey: ['liquidacion'] })
        void queryClient.invalidateQueries({ queryKey: ['presupuestoMes'] })
        void queryClient.invalidateQueries({ queryKey: ['compensacion'] })
      }
    })
  }, [queryClient])

  async function onRefresh() {
    setRefreshing(true)
    await refetchAll()
    setRefreshing(false)
  }

  const cuentasPersonales = useMemo(() => {
    const list = (qCuentas.data ?? []).filter((c) => c.es_propia)
    return list.sort((a, b) => {
      const aPersonal = a.nombre.trim().toLowerCase() === 'personal'
      const bPersonal = b.nombre.trim().toLowerCase() === 'personal'
      if (aPersonal && !bPersonal) return -1
      if (!aPersonal && bPersonal) return 1
      return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    })
  }, [qCuentas.data])

  // Auto-seleccionar primera cuenta
  useEffect(() => {
    if (!cuentasPersonales.length) { setCuentaTab(null); return }
    if (cuentaTab === null || !cuentasPersonales.some(c => c.id === cuentaTab)) {
      setCuentaTab(cuentasPersonales[0].id)
    }
  }, [cuentasPersonales, cuentaTab])

  const deudaTc = useMemo(
    () => Math.round(Number(qDeuda.data?.total) || 0),
    [qDeuda.data],
  )

  const [sueldosProrrateo, setSueldosProrrateo] = useState<Record<number, number>>({})

  useEffect(() => {
    const compensacion = qCompensacion.data as any
    if (!esActual || !compensacion?.miembros?.length) {
      setSueldosProrrateo({})
      return
    }
    if (qLiquidacionAnterior.isPending || qSueldos.isPending) return

    const prevById = Object.fromEntries(
      (qLiquidacionAnterior.data?.ingresos ?? []).map((i) => [
        i.usuario_id,
        Math.round(Number(i.total) || 0),
      ])
    )
    const apiMontos = (qSueldos.data?.montos ?? {}) as Record<string, string>
    const next: Record<number, number> = {}
    for (const m of compensacion.miembros) {
      const k = String(m.usuario_id)
      const apiVal = apiMontos[k]
      if (apiVal !== undefined && apiVal !== null && apiVal !== '') {
        next[m.usuario_id] = Math.round(Number(apiVal) || 0)
      } else {
        next[m.usuario_id] = prevById[m.usuario_id] ?? 0
      }
    }
    setSueldosProrrateo(next)
  }, [
    esActual,
    qCompensacion.data,
    qLiquidacionAnterior.data,
    qLiquidacionAnterior.isPending,
    qSueldos.data,
    qSueldos.isPending,
  ])

  const saldoCompensacionDetalle = useMemo(() => {
    const vacio = { compensacion: 0 }
    const compensacion = qCompensacion.data as any
    if (!esActual || qCompensacion.error || !compensacion?.miembros?.length || !user) return vacio
    const n = compensacion.miembros.length
    const netoFam = toPesos(compensacion.neto_familiar_comun)
    const totalEstimado = compensacion.miembros.reduce(
      (sum: number, m: any) => sum + (sueldosProrrateo[m.usuario_id] ?? 0),
      0,
    )
    const self = compensacion.miembros.find((m: any) => m.usuario_id === user.id)
    if (!self) return vacio
    const netoUsuario = toPesos(self.neto_comun_mes)
    const miEstimado = sueldosProrrateo[user.id] ?? 0
    let esperado = 0
    if (totalEstimado > 0) {
      esperado = (miEstimado / totalEstimado) * netoFam
    } else if (n > 0) {
      esperado = netoFam / n
    }
    return { compensacion: Math.round(esperado) - Math.round(netoUsuario) }
  }, [esActual, qCompensacion.data, qCompensacion.error, user, sueldosProrrateo])

  const sueldoProyectado = useMemo(() => {
    if (!user) return 0
    return Math.round(sueldosProrrateo[user.id] ?? 0)
  }, [sueldosProrrateo, user])

  const efectivo = useMemo(
    () => Math.round(Number(qEfectivo.data?.efectivo) || 0),
    [qEfectivo.data],
  )
  const compensacionEstimada = saldoCompensacionDetalle.compensacion
  const saldo = useMemo(() => {
    if (!esActual) return efectivo - deudaTc
    return sueldoProyectado + efectivo - deudaTc + compensacionEstimada
  }, [esActual, sueldoProyectado, efectivo, deudaTc, compensacionEstimada])

  // Movimientos filtrados por la cuenta seleccionada (para categorías y lista)
  const movimientosCuenta = useMemo(() => {
    if (cuentaTab === null) return movimientos
    return movimientos.filter(m => m.cuenta === cuentaTab)
  }, [movimientos, cuentaTab])

  const { ultimos } = useMemo(() => {
    const ultimos = [...movimientosCuenta]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 10)
    return { ultimos }
  }, [movimientosCuenta])

  const categoriasComparadas = useMemo(() => {
    return (qPresupuesto.data ?? [])
      .filter((f) => f.presupuesto_id != null)
      .map((f) => {
        const presupuestado = Math.round(Number(f.monto_presupuestado) || 0)
        const gastado = Math.round(Number(f.gastado) || 0)
        const pct = porcentaje(gastado, presupuestado)
        return {
          categoriaId: f.categoria_id,
          categoria: f.categoria_nombre || 'Otros',
          gastado,
          presupuestado,
          pct,
        }
      })
      .sort((a, b) => b.pct - a.pct)
  }, [qPresupuesto.data])

  const totalCatGastado = useMemo(
    () => categoriasComparadas.reduce((s, c) => s + c.gastado, 0),
    [categoriasComparadas],
  )
  const totalCatPresupuestado = useMemo(
    () => categoriasComparadas.reduce((s, c) => s + c.presupuestado, 0),
    [categoriasComparadas],
  )

  function irAnterior() {
    if (mes === 0) { setMes(11); setAnio(a => a - 1) }
    else setMes(m => m - 1)
  }

  function irSiguiente() {
    if (esActual) return
    if (mes === 11) { setMes(0); setAnio(a => a + 1) }
    else setMes(m => m + 1)
  }

  const hasError = error ||
    (qEfectivo.error ? String(qEfectivo.error) : null) ||
    (qLiquidacion.error ? String(qLiquidacion.error) : null) ||
    (qLiquidacionAnterior.error ? String(qLiquidacionAnterior.error) : null)

  // isPending solo es true cuando no hay NINGÚN dato en cache (primera carga real).
  // Con staleTime:Infinity + persister, en aperturas normales todos tienen data → no bloquea.
  const isLoading = !refreshing && (
    loading ||
    qEfectivo.isPending ||
    qDeuda.isPending ||
    qLiquidacion.isPending ||
    qLiquidacionAnterior.isPending ||
    (esActual && qSueldos.isPending)
  )
  // Indicador discreto de sincronía en segundo plano
  const isSyncing = !refreshing && isFetchingRQ > 0

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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6b7280"
            colors={['#0f0f0f']}
          />
        }
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
            {isSyncing && (
              <ActivityIndicator size="small" color="#9ca3af" style={{ marginLeft: 8 }} />
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
              {deudaTc > 0 && (
                <TouchableOpacity
                  onPress={() => router.push('/(tabs)/tarjetas' as never)}
                  className="bg-accent rounded-xl px-4 py-3 mt-4 items-center"
                >
                  <Text className="text-dark font-bold text-sm">Ir a pagar tarjeta</Text>
                </TouchableOpacity>
              )}
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
                <Text className="text-dark font-semibold text-sm">
                  {formatMonto(Math.abs(totalCatGastado))} de {formatMonto(Math.abs(totalCatPresupuestado))}
                </Text>
              </View>

              {qPresupuesto.isPending ? (
                <Text className="text-muted text-sm text-center py-2">Cargando comparación…</Text>
              ) : qPresupuesto.error ? (
                <Text className="text-muted text-sm text-center py-2">No se pudo cargar presupuesto del período.</Text>
              ) : categoriasComparadas.length === 0 ? (
                <Text className="text-muted text-sm text-center py-2">Sin presupuestos configurados para este período/cuenta.</Text>
              ) : (
                <View className="gap-3">
                  {categoriasComparadas.map((cat) => {
                    const pct = cat.pct
                    return (
                      <View key={cat.categoriaId}>
                        <View className="flex-row items-center justify-between mb-1">
                          <Text className="text-sm text-dark font-medium flex-1 mr-2" numberOfLines={1}>
                            {cat.categoria}
                          </Text>
                          <Text className="text-xs text-muted">
                            {formatMonto(cat.gastado)} de {formatMonto(cat.presupuestado)}
                          </Text>
                        </View>
                        <View className="flex-row items-center">
                          <View className="flex-1 h-2 bg-[#f0f0ec] rounded overflow-hidden mr-3">
                            <View
                              className="h-2 rounded"
                              style={{ width: `${pct}%`, backgroundColor: colorBarra(pct) }}
                            />
                          </View>
                          <Text
                            className="text-xs font-semibold text-right w-[54px]"
                            style={{ color: colorBarra(pct) }}
                          >
                            {Math.round(pct)}%
                          </Text>
                        </View>
                        {cat.gastado > cat.presupuestado && cat.presupuestado > 0 && (
                          <Text className="text-danger text-[10px] mt-1">
                            Excedido en {formatMonto(cat.gastado - cat.presupuestado)}
                          </Text>
                        )}
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
