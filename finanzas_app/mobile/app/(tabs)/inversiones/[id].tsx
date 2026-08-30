import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useFondoDetalle } from '@finanzas/shared/hooks/useInversiones'
import { inversionesApi, apiErrorMessage } from '@finanzas/shared/api'
import { useConfig } from '@finanzas/shared/context/ConfigContext'
import type { EventoFondo, FondoDetalle } from '@finanzas/shared/types'
import { MobileShell } from '../../../components/layout/MobileShell'
import { useAuth } from '../../../context/AuthContext'
import { useEspacio } from '../../../context/EspacioContext'
import { hoyIsoEnZonaHoraria } from '../../../lib/fechasZona'
import { queryClient } from '../../../lib/queryClient'
import {
  formatoMontoClpMostrar,
  montoClpANumero,
  normalizarDigitosMontoClp,
} from '../../../utils/montoClp'

function montoNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function formatFecha(fecha: string): string {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
  })
}

function isoADateLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return new Date()
  return new Date(y, m - 1, d)
}

function dateAIsoLocal(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function normalizarTipoEvento(tipo: string): EventoFondo['tipo'] {
  if (tipo === 'VALOR') return 'VALOR'
  if (tipo === 'RETIRO') return 'RETIRO'
  return 'APORTE'
}

function labelEvento(tipo: EventoFondo['tipo']): string {
  if (tipo === 'VALOR') return 'Valor actualizado'
  if (tipo === 'RETIRO') return 'Retiro'
  return 'Aporte'
}

export default function FondoDetalleScreen() {
  const router = useRouter()
  const { formatMonto, config } = useConfig()
  const { user } = useAuth()
  const { espacioActivo } = useEspacio()
  const params = useLocalSearchParams<{ id: string }>()
  const fondoId = Number(params.id)
  const idValido = Number.isFinite(fondoId) && fondoId > 0

  const zonaEfectiva = user?.zona_horaria ?? config?.zona_horaria ?? 'America/Santiago'
  const soloLectura = user?.rol === 'LECTURA' || !!espacioActivo?.archivado

  const { data: fondoData, loading, error, refetch } = useFondoDetalle(idValido ? fondoId : 0)
  const fondo = fondoData as FondoDetalle | null | undefined

  const [openForm, setOpenForm] = useState<'valor' | 'movimiento' | null>(null)
  const [formValorFecha, setFormValorFecha] = useState(() => hoyIsoEnZonaHoraria(zonaEfectiva))
  const [formValorMonto, setFormValorMonto] = useState('')
  const [formMovFecha, setFormMovFecha] = useState(() => hoyIsoEnZonaHoraria(zonaEfectiva))
  const [formMovMonto, setFormMovMonto] = useState('')
  const [formMovNota, setFormMovNota] = useState('')
  const [formMovTipo, setFormMovTipo] = useState<'APORTE' | 'RETIRO'>('APORTE')
  const [showFechaPicker, setShowFechaPicker] = useState<'valor' | 'movimiento' | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      if (idValido) void refetch()
    }, [idValido, refetch]),
  )

  const eventosOrdenados: EventoFondo[] = useMemo(() => {
    const h = fondo?.historial ?? []
    return [...h]
      .map((e) => ({
        id: e.id,
        tipo: normalizarTipoEvento(String(e.tipo)),
        fecha: e.fecha,
        monto: e.monto,
        nota: e.nota ?? undefined,
      }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
  }, [fondo?.historial])

  const capitalTotal = montoNum(fondo?.capital_total)
  const valorActual = montoNum(fondo?.valor_actual)
  const ganancia = montoNum(fondo?.ganancia)
  const rentabilidad = montoNum(fondo?.rentabilidad)
  const esGananciaPositiva = ganancia >= 0

  const invalidar = async () => {
    await queryClient.invalidateQueries({ queryKey: ['fondos'] })
    if (idValido) {
      await queryClient.invalidateQueries({ queryKey: ['fondo', fondoId] })
    }
    await refetch()
  }

  const openRegistrarValor = () => {
    setOpenForm('valor')
    setFormValorFecha(hoyIsoEnZonaHoraria(zonaEfectiva))
    setFormValorMonto('')
    setFormError(null)
    setShowFechaPicker(null)
  }

  const openAgregarMovimiento = () => {
    setOpenForm('movimiento')
    setFormMovFecha(hoyIsoEnZonaHoraria(zonaEfectiva))
    setFormMovMonto('')
    setFormMovNota('')
    setFormMovTipo('APORTE')
    setFormError(null)
    setShowFechaPicker(null)
  }

  const handleConfirmValor = async () => {
    const monto = formValorMonto.trim().replace(',', '.')
    if (!monto || Number(monto) < 0 || !Number.isFinite(Number(monto))) {
      setFormError('Ingresa un valor válido.')
      return
    }
    setGuardando(true)
    setFormError(null)
    try {
      await inversionesApi.agregarValor(fondoId, {
        fecha: formValorFecha,
        valor_cuota: monto,
      })
      setFormValorMonto('')
      setFormValorFecha(hoyIsoEnZonaHoraria(zonaEfectiva))
      setOpenForm(null)
      await invalidar()
    } catch (e: unknown) {
      setFormError(apiErrorMessage(e) || 'No se pudo registrar el valor.')
    } finally {
      setGuardando(false)
    }
  }

  const handleConfirmMovimiento = async () => {
    const n = montoClpANumero(formMovMonto)
    if (n <= 0) {
      setFormError('Ingresa un monto mayor a 0.')
      return
    }
    const montoFirmado = formMovTipo === 'RETIRO' ? -n : n
    setGuardando(true)
    setFormError(null)
    try {
      await inversionesApi.agregarAporte(fondoId, {
        fecha: formMovFecha,
        monto: String(montoFirmado),
        nota: formMovNota.trim() || undefined,
      })
      setFormMovMonto('')
      setFormMovNota('')
      setFormMovFecha(hoyIsoEnZonaHoraria(zonaEfectiva))
      setFormMovTipo('APORTE')
      setOpenForm(null)
      await invalidar()
    } catch (e: unknown) {
      setFormError(apiErrorMessage(e) || 'No se pudo guardar el movimiento.')
    } finally {
      setGuardando(false)
    }
  }

  const handleEliminar = (evento: EventoFondo) => {
    if (soloLectura) return
    const mensaje =
      evento.tipo === 'VALOR'
        ? '¿Eliminar este registro de valor? Esta acción no se puede deshacer.'
        : evento.tipo === 'RETIRO'
          ? '¿Eliminar este retiro? Esta acción no se puede deshacer.'
          : '¿Eliminar este aporte? Esta acción no se puede deshacer.'
    Alert.alert('Eliminar registro', mensaje, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              if (evento.tipo === 'VALOR') await inversionesApi.eliminarValor(evento.id)
              else await inversionesApi.eliminarAporte(evento.id)
              await invalidar()
            } catch (e: unknown) {
              Alert.alert('Error', apiErrorMessage(e) || 'No se pudo eliminar.')
            }
          })()
        },
      },
    ])
  }

  const titulo = fondo?.nombre?.trim() || 'Fondo'

  if (!user) {
    return (
      <MobileShell title="Inversiones">
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-muted text-sm">Inicia sesión para ver el fondo.</Text>
        </View>
      </MobileShell>
    )
  }

  if (!idValido) {
    return (
      <MobileShell title="Inversiones">
        <View className="flex-1 px-5 pt-4">
          <Text className="text-muted text-sm mb-3">Fondo no encontrado.</Text>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/inversiones' as never)}
            className="self-start rounded-lg border border-border px-3 py-2"
          >
            <Text className="text-dark text-xs font-semibold">← Inversiones</Text>
          </TouchableOpacity>
        </View>
      </MobileShell>
    )
  }

  return (
    <MobileShell title={titulo}>
      <ScrollView
        className="flex-1 bg-surface"
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/inversiones' as never)}
          className="self-start rounded-lg border border-border px-3 py-2 mb-4"
        >
          <Text className="text-dark text-xs font-semibold">← Inversiones</Text>
        </TouchableOpacity>

        {loading ? (
          <View className="py-12 items-center">
            <ActivityIndicator color="#c8f060" />
          </View>
        ) : error ? (
          <View className="bg-white border border-border rounded-xl p-4">
            <Text className="text-danger text-sm mb-3">{error}</Text>
            <TouchableOpacity
              onPress={() => void refetch()}
              className="bg-dark rounded-xl py-3 items-center"
            >
              <Text className="text-accent font-semibold text-sm">Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : !fondo ? (
          <View className="bg-white border border-border rounded-xl p-4">
            <Text className="text-muted text-sm">Fondo no encontrado.</Text>
          </View>
        ) : (
          <>
            {fondo.descripcion?.trim() ? (
              <Text className="text-muted text-sm mb-4">{fondo.descripcion.trim()}</Text>
            ) : null}

            <View className="bg-white border border-border rounded-xl p-4 mb-4 gap-2">
              <View className="flex-row justify-between">
                <Text className="text-muted text-xs uppercase tracking-wide">Capital</Text>
                <Text className="text-dark font-semibold">{formatMonto(capitalTotal)}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-muted text-xs uppercase tracking-wide">Valor actual</Text>
                <Text className="text-dark font-semibold">{formatMonto(valorActual)}</Text>
              </View>
              <View className="flex-row justify-between items-center">
                <Text className="text-muted text-xs uppercase tracking-wide">Ganancia</Text>
                <Text
                  className={`font-semibold ${esGananciaPositiva ? 'text-success' : 'text-danger'}`}
                >
                  {esGananciaPositiva ? '+' : ''}
                  {rentabilidad.toFixed(1)}% ({formatMonto(ganancia)})
                </Text>
              </View>
            </View>

            {soloLectura ? (
              <Text className="text-muted text-sm mb-4">
                {espacioActivo?.archivado
                  ? 'Espacio archivado: solo consulta.'
                  : 'Rol solo lectura: no puedes registrar movimientos ni valores.'}
              </Text>
            ) : (
              <View className="flex-row gap-2 mb-4">
                <TouchableOpacity
                  onPress={openRegistrarValor}
                  className="flex-1 bg-dark rounded-xl py-3.5 items-center"
                >
                  <Text className="text-accent font-bold text-sm">+ Registrar valor</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={openAgregarMovimiento}
                  className="flex-1 bg-dark rounded-xl py-3.5 items-center"
                >
                  <Text className="text-accent font-bold text-sm">+ Agregar movimiento</Text>
                </TouchableOpacity>
              </View>
            )}

            {openForm === 'valor' && !soloLectura ? (
              <View className="bg-white border border-border rounded-xl p-4 mb-4">
                <Text className="text-dark font-semibold text-sm mb-3">Registrar valor</Text>
                <Text className="text-xs text-muted font-semibold mb-1">Fecha</Text>
                <TouchableOpacity
                  onPress={() => setShowFechaPicker('valor')}
                  className="border border-border rounded-lg px-3 py-2.5 bg-surface mb-3"
                >
                  <Text className="text-dark text-sm">{formatFecha(formValorFecha)}</Text>
                </TouchableOpacity>
                {showFechaPicker === 'valor' ? (
                  <DateTimePicker
                    value={isoADateLocal(formValorFecha)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_event, selectedDate) => {
                      if (Platform.OS === 'android') setShowFechaPicker(null)
                      if (!selectedDate) return
                      setFormValorFecha(dateAIsoLocal(selectedDate))
                    }}
                  />
                ) : null}
                <Text className="text-xs text-muted font-semibold mb-1">Valor actual del fondo</Text>
                <TextInput
                  value={formValorMonto}
                  onChangeText={(v) => setFormValorMonto(v.replace(/[^0-9.,]/g, ''))}
                  placeholder="Ej: 1250,5"
                  placeholderTextColor="#888884"
                  keyboardType="decimal-pad"
                  className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm mb-3"
                />
                {formError ? <Text className="text-danger text-sm mb-3">{formError}</Text> : null}
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => {
                      setOpenForm(null)
                      setFormError(null)
                      setShowFechaPicker(null)
                    }}
                    className="flex-1 border border-border rounded-xl py-3 items-center"
                    disabled={guardando}
                  >
                    <Text className="text-dark font-semibold text-sm">Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void handleConfirmValor()}
                    disabled={guardando}
                    className={`flex-1 rounded-xl py-3 items-center ${guardando ? 'bg-accent/50' : 'bg-accent'}`}
                  >
                    <Text className="text-dark font-bold text-sm">
                      {guardando ? 'Guardando…' : 'Confirmar'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {openForm === 'movimiento' && !soloLectura ? (
              <View className="bg-white border border-border rounded-xl p-4 mb-4">
                <Text className="text-dark font-semibold text-sm mb-3">Agregar movimiento</Text>
                <Text className="text-xs text-muted font-semibold mb-1">Tipo</Text>
                <View className="flex-row gap-2 mb-3">
                  {(['APORTE', 'RETIRO'] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setFormMovTipo(t)}
                      className={`flex-1 py-2.5 rounded-lg border items-center ${
                        formMovTipo === t ? 'bg-accent border-accent' : 'bg-white border-border'
                      }`}
                    >
                      <Text
                        className={`text-sm font-semibold ${
                          formMovTipo === t ? 'text-dark' : 'text-muted'
                        }`}
                      >
                        {t === 'APORTE' ? 'Aporte' : 'Retiro'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text className="text-xs text-muted font-semibold mb-1">Fecha</Text>
                <TouchableOpacity
                  onPress={() => setShowFechaPicker('movimiento')}
                  className="border border-border rounded-lg px-3 py-2.5 bg-surface mb-3"
                >
                  <Text className="text-dark text-sm">{formatFecha(formMovFecha)}</Text>
                </TouchableOpacity>
                {showFechaPicker === 'movimiento' ? (
                  <DateTimePicker
                    value={isoADateLocal(formMovFecha)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_event, selectedDate) => {
                      if (Platform.OS === 'android') setShowFechaPicker(null)
                      if (!selectedDate) return
                      setFormMovFecha(dateAIsoLocal(selectedDate))
                    }}
                  />
                ) : null}
                <Text className="text-xs text-muted font-semibold mb-1">
                  {formMovTipo === 'RETIRO' ? 'Monto del retiro' : 'Monto del aporte'}
                </Text>
                <TextInput
                  value={formatoMontoClpMostrar(formMovMonto)}
                  onChangeText={(v) => setFormMovMonto(normalizarDigitosMontoClp(v))}
                  placeholder="$0"
                  placeholderTextColor="#888884"
                  keyboardType="number-pad"
                  className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm mb-3"
                />
                <Text className="text-xs text-muted font-semibold mb-1">Nota (opcional)</Text>
                <TextInput
                  value={formMovNota}
                  onChangeText={setFormMovNota}
                  placeholder="Nota"
                  placeholderTextColor="#888884"
                  className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm mb-3"
                />
                {formError ? <Text className="text-danger text-sm mb-3">{formError}</Text> : null}
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => {
                      setOpenForm(null)
                      setFormError(null)
                      setShowFechaPicker(null)
                    }}
                    className="flex-1 border border-border rounded-xl py-3 items-center"
                    disabled={guardando}
                  >
                    <Text className="text-dark font-semibold text-sm">Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void handleConfirmMovimiento()}
                    disabled={guardando}
                    className={`flex-1 rounded-xl py-3 items-center ${guardando ? 'bg-accent/50' : 'bg-accent'}`}
                  >
                    <Text className="text-dark font-bold text-sm">
                      {guardando ? 'Guardando…' : 'Confirmar'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            <Text className="text-[11px] tracking-widest text-muted font-semibold uppercase mb-2">
              Historial
            </Text>

            {eventosOrdenados.length === 0 ? (
              <View className="bg-white border border-border rounded-xl p-6 items-center">
                <Text className="text-muted text-2xl mb-2">○</Text>
                <Text className="text-muted text-sm text-center mb-3">
                  Sin registros para este fondo
                </Text>
                {!soloLectura ? (
                  <TouchableOpacity onPress={openAgregarMovimiento}>
                    <Text className="text-dark font-semibold text-sm">
                      Agrega el primer valor o movimiento →
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <View className="bg-white border border-border rounded-xl overflow-hidden">
                {eventosOrdenados.map((ev, idx) => (
                  <View
                    key={`${ev.tipo}-${ev.id}`}
                    className={`flex-row items-center px-4 py-3 ${
                      idx < eventosOrdenados.length - 1 ? 'border-b border-border' : ''
                    }`}
                  >
                    <View
                      className={`w-9 h-9 rounded-full items-center justify-center mr-3 ${
                        ev.tipo === 'VALOR'
                          ? 'bg-accent/30'
                          : ev.tipo === 'RETIRO'
                            ? 'bg-danger/15'
                            : 'bg-success/15'
                      }`}
                    >
                      <Text className="text-sm">
                        {ev.tipo === 'VALOR' ? '▲' : ev.tipo === 'RETIRO' ? '↓' : '💰'}
                      </Text>
                    </View>
                    <View className="flex-1 min-w-0 mr-2">
                      <Text className="text-muted text-xs">{formatFecha(ev.fecha)}</Text>
                      <Text className="text-dark text-sm font-medium">{labelEvento(ev.tipo)}</Text>
                      {(ev.tipo === 'APORTE' || ev.tipo === 'RETIRO') && ev.nota ? (
                        <Text className="text-muted text-xs mt-0.5" numberOfLines={2}>
                          {ev.nota}
                        </Text>
                      ) : null}
                    </View>
                    <View className="items-end">
                      <Text
                        className={`text-sm font-semibold ${
                          ev.tipo === 'APORTE'
                            ? 'text-success'
                            : ev.tipo === 'RETIRO'
                              ? 'text-danger'
                              : 'text-dark'
                        }`}
                      >
                        {formatMonto(montoNum(ev.monto))}
                      </Text>
                      {!soloLectura ? (
                        <TouchableOpacity
                          onPress={() => handleEliminar(ev)}
                          className="mt-1 px-2 py-1"
                          accessibilityLabel="Eliminar"
                        >
                          <Text className="text-danger text-xs font-semibold">Eliminar</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </MobileShell>
  )
}
