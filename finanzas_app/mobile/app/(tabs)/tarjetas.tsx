import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useApi } from '@finanzas/shared/hooks/useApi'
import { useTarjetas } from '@finanzas/shared/hooks/useCatalogos'
import { movimientosApi } from '@finanzas/shared/api/movimientos'
import { useConfig } from '@finanzas/shared/context/ConfigContext'
import { MobileShell } from '../../components/layout/MobileShell'

interface Tarjeta {
  id: number
  nombre: string
  banco: string
  dia_facturacion: number | null
  dia_vencimiento: number | null
}

interface Cuota {
  id: number
  descripcion: string
  monto_cuota: string | number
  cuota_numero: number
  total_cuotas: number
  estado: 'PENDIENTE' | 'FACTURADO' | 'PAGADO'
  incluir: boolean
  movimiento_descripcion?: string
  ambito?: 'PERSONAL' | 'COMUN'
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const ESTADO_BADGE: Record<Cuota['estado'], { label: string; bg: string; color: string }> = {
  PENDIENTE:  { label: 'Pendiente',  bg: '#fff7ed', color: '#f59e0b' },
  FACTURADO:  { label: 'Facturado',  bg: '#eff6ff', color: '#3b82f6' },
  PAGADO:     { label: 'Pagado',     bg: '#f0fdf4', color: '#22c55e' },
}

function montoNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export default function TarjetasScreen() {
  const { formatMonto } = useConfig()

  const hoy = new Date()
  const [mes, setMes] = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [tarjetaId, setTarjetaId] = useState<number | null>(null)
  const [vista, setVista] = useState<'FACTURADO' | 'PAGADO'>('FACTURADO')
  const [actualizando, setActualizando] = useState<Set<number>>(new Set())

  const esActual = mes === hoy.getMonth() && anio === hoy.getFullYear()

  const { data: tarjetasData, loading: loadingTarjetas } = useTarjetas()
  const tarjetas = (tarjetasData as Tarjeta[] | null) ?? []

  // Seleccionar primera tarjeta automáticamente
  const tarjetaIdEfectivo = tarjetaId ?? tarjetas[0]?.id ?? null

  const { data: cuotasData, loading: loadingCuotas, error: errorCuotas, refetch } = useApi<Cuota[]>(
    () => movimientosApi.getCuotas({
      tarjeta: tarjetaIdEfectivo ?? undefined,
      mes: mes + 1,
      anio,
    }) as Promise<{ data: Cuota[] }>,
    [tarjetaIdEfectivo, mes, anio],
  )
  const cuotas = cuotasData ?? []

  const omitirPrimerFoco = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (omitirPrimerFoco.current) { omitirPrimerFoco.current = false; return }
      void refetch()
    }, [refetch]),
  )

  function irAnterior() {
    if (mes === 0) { setMes(11); setAnio((a) => a - 1) }
    else setMes((m) => m - 1)
  }

  function irSiguiente() {
    if (esActual) return
    if (mes === 11) { setMes(0); setAnio((a) => a + 1) }
    else setMes((m) => m + 1)
  }

  const cuotasFiltradas = useMemo(
    () => cuotas.filter((c) => c.estado === vista),
    [cuotas, vista],
  )

  const cuotasIncluidas = useMemo(
    () => cuotasFiltradas.filter((c) => c.incluir),
    [cuotasFiltradas],
  )

  const totalIncluido = useMemo(
    () => cuotasIncluidas.reduce((s, c) => s + montoNum(c.monto_cuota), 0),
    [cuotasIncluidas],
  )

  const totalFull = useMemo(
    () => cuotasFiltradas.reduce((s, c) => s + montoNum(c.monto_cuota), 0),
    [cuotasFiltradas],
  )

  const tarjetaActual = tarjetas.find((t) => t.id === tarjetaIdEfectivo)

  async function toggleIncluir(cuota: Cuota) {
    setActualizando((prev) => new Set(prev).add(cuota.id))
    try {
      await movimientosApi.updateCuota(cuota.id, { incluir: !cuota.incluir })
      void refetch()
    } catch {
      Alert.alert('Error', 'No se pudo actualizar la cuota.')
    } finally {
      setActualizando((prev) => { const s = new Set(prev); s.delete(cuota.id); return s })
    }
  }

  async function marcarPagadas() {
    const pendientes = cuotasFiltradas.filter((c) => c.incluir)
    if (pendientes.length === 0) return
    Alert.alert(
      'Marcar como pagadas',
      `¿Marcar ${pendientes.length} cuota${pendientes.length !== 1 ? 's' : ''} como PAGADO?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setActualizando(new Set(pendientes.map((c) => c.id)))
            try {
              await Promise.all(pendientes.map((c) => movimientosApi.updateCuota(c.id, { estado: 'PAGADO' })))
              void refetch()
            } catch {
              Alert.alert('Error', 'No se pudieron marcar todas las cuotas.')
            } finally {
              setActualizando(new Set())
            }
          },
        },
      ],
    )
  }

  if (loadingTarjetas) {
    return (
      <MobileShell title="Tarjetas">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0f0f0f" />
        </View>
      </MobileShell>
    )
  }

  if (tarjetas.length === 0) {
    return (
      <MobileShell title="Tarjetas">
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-muted text-sm text-center">No hay tarjetas de crédito registradas.</Text>
        </View>
      </MobileShell>
    )
  }

  return (
    <MobileShell title="Tarjetas">
      <View className="flex-1 bg-surface">
        {/* Selector de tarjeta */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="border-b border-border bg-white"
          contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12, gap: 8 }}
        >
          {tarjetas.map((t) => {
            const activa = t.id === tarjetaIdEfectivo
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => setTarjetaId(t.id)}
                className={`px-4 py-2 rounded-xl border ${activa ? 'bg-dark border-dark' : 'bg-white border-border'}`}
              >
                <Text className={`text-sm font-semibold ${activa ? 'text-white' : 'text-dark'}`}>{t.nombre}</Text>
                {t.banco ? <Text className={`text-xs ${activa ? 'text-white/60' : 'text-muted'}`}>{t.banco}</Text> : null}
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 120 }}>
          <View className="px-5 pt-3">
            {/* Info billing */}
            {tarjetaActual && (tarjetaActual.dia_facturacion || tarjetaActual.dia_vencimiento) && (
              <View className="flex-row gap-4 mb-3">
                {tarjetaActual.dia_facturacion && (
                  <Text className="text-muted text-xs">
                    Cierre: <Text className="text-dark font-semibold">día {tarjetaActual.dia_facturacion}</Text>
                  </Text>
                )}
                {tarjetaActual.dia_vencimiento && (
                  <Text className="text-muted text-xs">
                    Vencimiento: <Text className="text-dark font-semibold">día {tarjetaActual.dia_vencimiento}</Text>
                  </Text>
                )}
              </View>
            )}

            {/* Navegación mes */}
            <View className="flex-row items-center gap-2 mb-4">
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

            {/* Toggle FACTURADO / PAGADO */}
            <View className="flex-row border border-border rounded-lg overflow-hidden mb-4 bg-white">
              {(['FACTURADO', 'PAGADO'] as const).map((v, i) => (
                <TouchableOpacity
                  key={v}
                  onPress={() => setVista(v)}
                  className={`flex-1 py-2.5 items-center ${i > 0 ? 'border-l border-border' : ''} ${vista === v ? 'bg-dark' : 'bg-white'}`}
                >
                  <Text className={`text-xs font-semibold ${vista === v ? 'text-white' : 'text-muted'}`}>
                    {v === 'FACTURADO' ? 'Por pagar' : 'Pagado'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Resumen totales */}
            {!loadingCuotas && cuotasFiltradas.length > 0 && (
              <View className="bg-dark rounded-2xl px-5 py-4 mb-4">
                <View className="flex-row justify-between items-center">
                  <View>
                    <Text className="text-white/60 text-xs uppercase tracking-wide">
                      {vista === 'FACTURADO' ? 'Seleccionado a pagar' : 'Total pagado'}
                    </Text>
                    <Text className="text-white text-xl font-bold mt-0.5">
                      {formatMonto(vista === 'FACTURADO' ? totalIncluido : totalFull)}
                    </Text>
                  </View>
                  {vista === 'FACTURADO' && totalFull !== totalIncluido && (
                    <View>
                      <Text className="text-white/40 text-xs text-right">Total facturado</Text>
                      <Text className="text-white/60 text-sm font-semibold text-right">{formatMonto(totalFull)}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Lista cuotas */}
            {loadingCuotas ? (
              <View className="py-12 items-center">
                <ActivityIndicator color="#0f0f0f" />
              </View>
            ) : errorCuotas ? (
              <View className="bg-danger/10 border border-danger/30 rounded-xl p-4">
                <Text className="text-danger text-sm text-center">{errorCuotas}</Text>
                <TouchableOpacity onPress={refetch} className="mt-2">
                  <Text className="text-dark font-semibold text-sm text-center underline">Reintentar</Text>
                </TouchableOpacity>
              </View>
            ) : cuotasFiltradas.length === 0 ? (
              <View className="bg-white border border-border rounded-2xl p-8 items-center">
                <Text className="text-muted text-sm text-center">
                  {vista === 'FACTURADO' ? 'Sin cuotas por pagar este mes.' : 'Sin cuotas pagadas este mes.'}
                </Text>
              </View>
            ) : (
              <>
                <Text className="text-xs font-bold text-muted uppercase tracking-wide mb-2">
                  {cuotasFiltradas.length} cuota{cuotasFiltradas.length !== 1 ? 's' : ''}
                </Text>
                <View className="bg-white border border-border rounded-xl overflow-hidden mb-4">
                  {cuotasFiltradas.map((cuota, idx) => {
                    const badge = ESTADO_BADGE[cuota.estado]
                    const cargando = actualizando.has(cuota.id)
                    const isLast = idx === cuotasFiltradas.length - 1

                    return (
                      <View
                        key={cuota.id}
                        className={`px-4 py-3 flex-row items-center ${!isLast ? 'border-b border-border' : ''}`}
                      >
                        {/* Checkbox incluir (solo en vista FACTURADO) */}
                        {vista === 'FACTURADO' && (
                          <TouchableOpacity
                            onPress={() => toggleIncluir(cuota)}
                            disabled={cargando}
                            className={`w-5 h-5 rounded border mr-3 items-center justify-center ${cuota.incluir ? 'bg-dark border-dark' : 'border-border'}`}
                          >
                            {cargando
                              ? <ActivityIndicator size="small" color={cuota.incluir ? '#fff' : '#0f0f0f'} />
                              : cuota.incluir && <Text className="text-white text-xs font-bold">✓</Text>
                            }
                          </TouchableOpacity>
                        )}

                        <View className="flex-1 min-w-0 mr-2">
                          <Text className="text-dark font-medium text-sm" numberOfLines={2}>
                            {cuota.descripcion || cuota.movimiento_descripcion || '—'}
                          </Text>
                          <Text className="text-muted text-xs mt-0.5">
                            Cuota {cuota.cuota_numero}/{cuota.total_cuotas}
                            {cuota.ambito === 'COMUN' ? ' · Común' : ''}
                          </Text>
                        </View>

                        <View className="items-end gap-1">
                          <Text className="text-dark font-semibold text-sm">{formatMonto(montoNum(cuota.monto_cuota))}</Text>
                          <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: badge.bg }}>
                            <Text className="text-[10px] font-semibold" style={{ color: badge.color }}>
                              {badge.label}
                            </Text>
                          </View>
                        </View>
                      </View>
                    )
                  })}
                </View>

                {/* Botón pagar */}
                {vista === 'FACTURADO' && cuotasIncluidas.length > 0 && (
                  <TouchableOpacity
                    onPress={marcarPagadas}
                    className="bg-dark rounded-xl py-3.5 items-center"
                  >
                    <Text className="text-white font-bold text-sm">
                      Marcar {cuotasIncluidas.length} cuota{cuotasIncluidas.length !== 1 ? 's' : ''} como pagadas
                    </Text>
                    <Text className="text-white/60 text-xs mt-0.5">{formatMonto(totalIncluido)}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </ScrollView>
      </View>
    </MobileShell>
  )
}
