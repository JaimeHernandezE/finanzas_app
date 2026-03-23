import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { finanzasApi } from '@finanzas/shared/api/finanzas'
import { useConfig } from '@finanzas/shared/context/ConfigContext'

interface MiembroLiquidacion {
  nombre:      string
  ingreso:     number
  proporcion:  number
  corresponde: number
  pagado:      number
  diferencia:  number
}

interface ResumenLiquidacion {
  total_gastos_comunes: number
  miembros: MiembroLiquidacion[]
}

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

export default function LiquidacionScreen() {
  const { formatMonto } = useConfig()

  const hoy = new Date()
  const [mes,  setMes]  = useState(hoy.getMonth() + 1)
  const [anio, setAnio] = useState(hoy.getFullYear())

  const [data,     setData]     = useState<ResumenLiquidacion | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await finanzasApi.getLiquidacion(mes, anio)
      setData(res.data)
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } }
      setError(ax.response?.data?.error ?? 'Error al cargar la liquidación.')
    } finally {
      setLoading(false)
    }
  }, [mes, anio])

  useEffect(() => { cargar() }, [cargar])

  const esMesActual = mes === hoy.getMonth() + 1 && anio === hoy.getFullYear()

  function irAnterior() {
    if (mes === 1) { setMes(12); setAnio(a => a - 1) }
    else setMes(m => m - 1)
  }

  function irSiguiente() {
    if (esMesActual) return
    if (mes === 12) { setMes(1); setAnio(a => a + 1) }
    else setMes(m => m + 1)
  }

  return (
    <ScrollView
      className="flex-1 bg-surface"
      contentContainerStyle={{ padding: 20 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={cargar} />}
    >
      <Text className="text-xl font-bold text-dark mb-4">Liquidación</Text>

      {/* Navegador de mes */}
      <View className="flex-row items-center bg-white border border-border rounded-xl px-4 py-3 mb-6">
        <TouchableOpacity onPress={irAnterior} className="w-8 h-8 items-center justify-center">
          <Text className="text-dark text-2xl leading-none">‹</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center font-semibold text-dark">
          {MESES[mes - 1]} {anio}
        </Text>
        <TouchableOpacity
          onPress={irSiguiente}
          disabled={esMesActual}
          className="w-8 h-8 items-center justify-center"
        >
          <Text className={`text-2xl leading-none ${esMesActual ? 'text-border' : 'text-dark'}`}>›</Text>
        </TouchableOpacity>
      </View>

      {loading && !data ? (
        <View className="items-center py-12">
          <ActivityIndicator color="#0f0f0f" />
        </View>
      ) : error ? (
        <View className="bg-danger/10 border border-danger/30 rounded-xl p-4 mb-4">
          <Text className="text-danger text-sm text-center">{error}</Text>
          <TouchableOpacity onPress={cargar} className="mt-2 items-center">
            <Text className="text-dark font-semibold text-sm underline">Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : !data || data.miembros.length === 0 ? (
        <View className="bg-white border border-border rounded-xl p-6 items-center">
          <Text className="text-muted text-sm text-center">
            Sin datos de liquidación para este mes.{'\n'}
            Registra ingresos comunes para calcularla.
          </Text>
        </View>
      ) : (
        <>
          {/* Resumen total */}
          <View className="bg-dark rounded-xl p-4 mb-4">
            <Text className="text-white/60 text-xs uppercase font-semibold mb-1">Total gastos comunes</Text>
            <Text className="text-white text-2xl font-bold">
              {formatMonto(data.total_gastos_comunes)}
            </Text>
          </View>

          {/* Card por miembro */}
          {data.miembros.map((m, i) => {
            const color = m.diferencia >= 0 ? 'text-success' : 'text-danger'
            const sign  = m.diferencia >= 0 ? '+' : ''
            return (
              <View key={i} className="bg-white border border-border rounded-xl p-4 mb-3">
                <Text className="font-bold text-dark text-base mb-3">{m.nombre}</Text>

                <Fila label="Ingreso declarado" valor={formatMonto(m.ingreso)} />
                <Fila label="Proporción" valor={`${m.proporcion.toFixed(1)}%`} />
                <Fila label="Le corresponde" valor={formatMonto(m.corresponde)} />
                <Fila label="Pagado (gastos propios)" valor={formatMonto(m.pagado)} />

                <View className="h-px bg-border my-2" />

                <View className="flex-row justify-between items-center">
                  <Text className="text-sm font-semibold text-dark">Saldo</Text>
                  <Text className={`text-base font-bold ${color}`}>
                    {sign}{formatMonto(Math.abs(m.diferencia))}
                  </Text>
                </View>
                <Text className="text-xs text-muted mt-1">
                  {m.diferencia >= 0
                    ? 'Pagó de más — le deben este monto'
                    : 'Pagó de menos — debe este monto'}
                </Text>
              </View>
            )
          })}
        </>
      )}
    </ScrollView>
  )
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <View className="flex-row justify-between mb-1.5">
      <Text className="text-muted text-sm">{label}</Text>
      <Text className="text-dark text-sm font-medium">{valor}</Text>
    </View>
  )
}
