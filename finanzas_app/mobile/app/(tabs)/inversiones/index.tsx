import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useFondos } from '@finanzas/shared/hooks/useInversiones'
import { inversionesApi, apiErrorMessage } from '@finanzas/shared/api'
import { useConfig } from '@finanzas/shared/context/ConfigContext'
import type { Fondo } from '@finanzas/shared/types'
import { MobileShell } from '../../../components/layout/MobileShell'
import { useAuth } from '../../../context/AuthContext'
import { useEspacio } from '../../../context/EspacioContext'
import { queryClient } from '../../../lib/queryClient'

function montoNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function ResumenTotal({
  capitalTotal,
  valorTotal,
  gananciaTotal,
  rentabilidadTotal,
  formatMonto,
}: {
  capitalTotal: number
  valorTotal: number
  gananciaTotal: number
  rentabilidadTotal: number
  formatMonto: (n: number) => string
}) {
  const esPositivo = gananciaTotal >= 0
  const labelGanancia = gananciaTotal >= 0 ? 'Ganancia' : 'Pérdida'

  return (
    <View className="bg-white border border-border rounded-xl p-4 mb-4">
      <Text className="text-dark font-bold text-base mb-3">Resumen total</Text>
      <View className="gap-3">
        <View className="flex-row justify-between items-center">
          <Text className="text-muted text-xs uppercase tracking-wide">Capital total</Text>
          <Text className="text-dark font-semibold">{formatMonto(capitalTotal)}</Text>
        </View>
        <View className="flex-row justify-between items-center">
          <Text className="text-muted text-xs uppercase tracking-wide">Valor actual</Text>
          <Text className="text-dark font-semibold">{formatMonto(valorTotal)}</Text>
        </View>
        <View className="flex-row justify-between items-center">
          <Text className="text-muted text-xs uppercase tracking-wide">{labelGanancia}</Text>
          <View className="items-end">
            <Text className={`font-semibold ${esPositivo ? 'text-success' : 'text-danger'}`}>
              {formatMonto(Math.abs(gananciaTotal))}
            </Text>
            <Text className={`text-xs mt-0.5 ${esPositivo ? 'text-success' : 'text-danger'}`}>
              {rentabilidadTotal >= 0 ? '+' : ''}
              {rentabilidadTotal.toFixed(1)}%
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}

function FondoCard({
  fondo,
  formatMonto,
  onPress,
}: {
  fondo: Fondo
  formatMonto: (n: number) => string
  onPress: () => void
}) {
  const capitalTotal = montoNum(fondo.capital_total)
  const valorActual = montoNum(fondo.valor_actual)
  const ganancia = valorActual - capitalTotal
  const rentabilidad = capitalTotal > 0 ? (ganancia / capitalTotal) * 100 : 0
  const esPositivo = ganancia >= 0

  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-white border border-border rounded-xl p-4 mb-3"
      accessibilityRole="button"
      accessibilityLabel={`Abrir fondo ${fondo.nombre}`}
    >
      <View className="flex-row items-start justify-between mb-1">
        <Text className="text-dark font-bold text-base flex-1 mr-2" numberOfLines={2}>
          {fondo.nombre}
        </Text>
        <View className="bg-surface border border-border rounded-full px-2.5 py-0.5">
          <Text className="text-muted text-[10px] font-semibold uppercase">
            {fondo.es_compartido ? 'Familiar' : 'Personal'}
          </Text>
        </View>
      </View>
      <Text className="text-muted text-sm mb-3" numberOfLines={2}>
        {fondo.descripcion?.trim() || '—'}
      </Text>
      <View className="border-t border-border pt-3 gap-2">
        <View className="flex-row justify-between">
          <Text className="text-muted text-xs">Capital</Text>
          <Text className="text-dark text-sm font-medium">{formatMonto(capitalTotal)}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-muted text-xs">Valor actual</Text>
          <Text className="text-dark text-sm font-medium">{formatMonto(valorActual)}</Text>
        </View>
        <View className="flex-row justify-between items-center">
          <Text className="text-muted text-xs">Ganancia</Text>
          <View className="flex-row items-center gap-2">
            <Text className={`text-sm font-semibold ${esPositivo ? 'text-success' : 'text-danger'}`}>
              {formatMonto(ganancia)}
            </Text>
            <Text className={`text-xs ${esPositivo ? 'text-success' : 'text-danger'}`}>
              {rentabilidad >= 0 ? '+' : ''}
              {rentabilidad.toFixed(1)}%
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
}

export default function InversionesScreen() {
  const router = useRouter()
  const { formatMonto } = useConfig()
  const { user } = useAuth()
  const { mostrarModulosFamiliares, espacioActivo } = useEspacio()
  const { data: fondosData, loading, error, refetch } = useFondos()
  const fondos = (fondosData ?? []) as Fondo[]

  const soloLectura = user?.rol === 'LECTURA' || !!espacioActivo?.archivado

  const [formAbierto, setFormAbierto] = useState(false)
  const [nombreFondo, setNombreFondo] = useState('')
  const [descFondo, setDescFondo] = useState('')
  const [compartido, setCompartido] = useState(false)
  const [savingFondo, setSavingFondo] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      void refetch()
    }, [refetch]),
  )

  const { capitalTotal, valorTotal, gananciaTotal, rentabilidadTotal } = useMemo(() => {
    const cap = fondos.reduce((s, f) => s + montoNum(f.capital_total), 0)
    const val = fondos.reduce((s, f) => s + montoNum(f.valor_actual), 0)
    const gan = val - cap
    const rent = cap > 0 ? (gan / cap) * 100 : 0
    return {
      capitalTotal: cap,
      valorTotal: val,
      gananciaTotal: gan,
      rentabilidadTotal: rent,
    }
  }, [fondos])

  const crearFondo = async () => {
    const n = nombreFondo.trim()
    if (!n) {
      setFormError('El nombre es obligatorio.')
      return
    }
    setFormError(null)
    setSavingFondo(true)
    try {
      await inversionesApi.createFondo({
        nombre: n,
        descripcion: descFondo.trim(),
        es_compartido: mostrarModulosFamiliares ? compartido : false,
      })
      setNombreFondo('')
      setDescFondo('')
      setCompartido(false)
      setFormAbierto(false)
      await queryClient.invalidateQueries({ queryKey: ['fondos'] })
      await refetch()
    } catch (e: unknown) {
      setFormError(apiErrorMessage(e) || 'No se pudo crear el fondo.')
    } finally {
      setSavingFondo(false)
    }
  }

  if (!user) {
    return (
      <MobileShell title="Inversiones">
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-muted text-sm">Inicia sesión para ver tus inversiones.</Text>
        </View>
      </MobileShell>
    )
  }

  return (
    <MobileShell title="Inversiones">
      <ScrollView
        className="flex-1 bg-surface"
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          onPress={() => router.push('/(tabs)' as never)}
          className="self-start rounded-lg border border-border px-3 py-2 mb-4"
        >
          <Text className="text-dark text-xs font-semibold">← Volver</Text>
        </TouchableOpacity>

        {soloLectura ? (
          <Text className="text-muted text-sm mb-4">
            {espacioActivo?.archivado
              ? 'Este espacio está archivado: solo puedes consultar inversiones.'
              : 'Tu rol es solo lectura: no puedes crear ni editar fondos.'}
          </Text>
        ) : (
          <TouchableOpacity
            onPress={() => {
              setFormAbierto((a) => !a)
              setFormError(null)
            }}
            className="bg-dark rounded-xl py-3.5 items-center mb-4"
          >
            <Text className="text-accent font-bold text-sm">
              {formAbierto ? 'Cerrar' : '+ Nuevo fondo'}
            </Text>
          </TouchableOpacity>
        )}

        {formAbierto && !soloLectura ? (
          <View className="bg-white border border-border rounded-xl p-4 mb-4">
            <Text className="text-dark font-semibold text-sm mb-3">Nuevo fondo de inversión</Text>
            <Text className="text-xs text-muted font-semibold mb-1">Nombre</Text>
            <TextInput
              value={nombreFondo}
              onChangeText={setNombreFondo}
              placeholder="Ej: Fondo mutuo conservador"
              placeholderTextColor="#888884"
              className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm mb-3"
            />
            <Text className="text-xs text-muted font-semibold mb-1">Descripción (opcional)</Text>
            <TextInput
              value={descFondo}
              onChangeText={setDescFondo}
              placeholder="Notas o tipo de instrumento…"
              placeholderTextColor="#888884"
              multiline
              numberOfLines={2}
              className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm mb-3 min-h-[64px]"
              textAlignVertical="top"
            />
            {mostrarModulosFamiliares ? (
              <TouchableOpacity
                onPress={() => setCompartido((c) => !c)}
                className="flex-row items-center mb-3"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: compartido }}
              >
                <View
                  className={`w-5 h-5 rounded border mr-2 items-center justify-center ${
                    compartido ? 'bg-accent border-accent' : 'bg-white border-border'
                  }`}
                >
                  {compartido ? <Text className="text-dark text-xs font-bold">✓</Text> : null}
                </View>
                <Text className="text-dark text-sm flex-1">
                  Compartir con la familia (visible para todos)
                </Text>
              </TouchableOpacity>
            ) : null}
            {formError ? <Text className="text-danger text-sm mb-3">{formError}</Text> : null}
            <TouchableOpacity
              onPress={() => void crearFondo()}
              disabled={savingFondo}
              className={`rounded-xl py-3 items-center ${savingFondo ? 'bg-dark/50' : 'bg-accent'}`}
            >
              <Text className="text-dark font-bold text-sm">
                {savingFondo ? 'Creando…' : 'Crear fondo'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

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
        ) : (
          <>
            <ResumenTotal
              capitalTotal={capitalTotal}
              valorTotal={valorTotal}
              gananciaTotal={gananciaTotal}
              rentabilidadTotal={rentabilidadTotal}
              formatMonto={formatMonto}
            />
            {fondos.length === 0 ? (
              <View className="bg-white border border-border rounded-xl p-6 items-center">
                <Text className="text-muted text-sm text-center mb-2">
                  Aún no tienes fondos de inversión.
                </Text>
                {!soloLectura ? (
                  <Text className="text-muted text-xs text-center">
                    Crea el primero con «+ Nuevo fondo».
                  </Text>
                ) : null}
              </View>
            ) : (
              fondos.map((fondo) => (
                <FondoCard
                  key={fondo.id}
                  fondo={fondo}
                  formatMonto={formatMonto}
                  onPress={() => router.push(`/(tabs)/inversiones/${fondo.id}` as never)}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
    </MobileShell>
  )
}
