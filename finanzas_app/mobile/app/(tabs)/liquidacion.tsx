import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useApi } from '@finanzas/shared/hooks/useApi'
import { finanzasApi } from '@finanzas/shared/api/finanzas'
import { useConfig } from '@finanzas/shared/context/ConfigContext'
import { MobileShell } from '../../components/layout/MobileShell'

interface IngresoMiembro { usuarioId: string; nombre: string; monto: number }
interface GastoMiembro   { usuarioId: string; nombre: string; montoRegistrado: number }
interface PeriodoData {
  ingresos: IngresoMiembro[]
  gastos: GastoMiembro[]
  usandoSueldosAnteriores?: boolean
  mesAnterior?: string
}

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]
const COLORES_MIEMBRO = ['#c8f060','#60c8f0','#f060c8','#f0c860']

function calcular(data: PeriodoData) {
  const totalIngresos = data.ingresos.reduce((s, i) => s + i.monto, 0)
  const proporciones  = data.ingresos.map((i) => ({
    ...i,
    porcentaje: totalIngresos > 0 ? (i.monto / totalIngresos) * 100 : 0,
  }))
  const totalGastos  = data.gastos.reduce((s, g) => s + g.montoRegistrado, 0)
  const deberíaPagar = proporciones.map((p) => ({
    usuarioId: p.usuarioId, nombre: p.nombre, porcentaje: p.porcentaje,
    monto: totalGastos * (p.porcentaje / 100),
  }))
  const compensaciones = deberíaPagar.map((d) => {
    const pagado = data.gastos.find((g) => g.usuarioId === d.usuarioId)?.montoRegistrado ?? 0
    return { usuarioId: d.usuarioId, nombre: d.nombre, pagado, debería: d.monto, diferencia: pagado - d.monto }
  })
  const deudores   = compensaciones.filter((c) => c.diferencia < -0.5).sort((a,b) => a.diferencia - b.diferencia)
  const acreedores = compensaciones.filter((c) => c.diferencia >  0.5).sort((a,b) => b.diferencia - a.diferencia)
  const transferencias: { de: string; a: string; monto: number }[] = []
  if (deudores.length > 0 && acreedores.length > 0)
    transferencias.push({ de: deudores[0].nombre, a: acreedores[0].nombre, monto: Math.round(Math.abs(deudores[0].diferencia)) })
  return { totalIngresos, proporciones, totalGastos, deberíaPagar, compensaciones, transferencias }
}

function SeccionCard({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View className="bg-white border border-border rounded-2xl p-4 mb-4">
      <Text className="text-xs font-bold text-muted uppercase tracking-wide mb-3">{titulo}</Text>
      {children}
    </View>
  )
}

function BarraRow({ nombre, valor, max, color, metaDerecha }: {
  nombre: string; valor: number; max: number; color: string; metaDerecha?: string
}) {
  const { formatMonto } = useConfig()
  const pct = max > 0 ? (valor / max) * 100 : 0
  return (
    <View className="mb-3">
      <View className="flex-row justify-between items-center mb-1">
        <Text className="text-dark text-sm font-medium flex-1 mr-2" numberOfLines={1}>{nombre}</Text>
        <View className="flex-row items-center gap-2">
          {metaDerecha ? <Text className="text-muted text-xs">{metaDerecha}</Text> : null}
          <Text className="text-dark text-sm font-semibold">{formatMonto(valor)}</Text>
        </View>
      </View>
      <View className="h-2 bg-border rounded-full overflow-hidden">
        <View className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </View>
    </View>
  )
}

function FilaTotal({ label, monto }: { label: string; monto: number }) {
  const { formatMonto } = useConfig()
  return (
    <View className="flex-row justify-between items-center pt-3 mt-1 border-t border-border">
      <Text className="text-dark text-sm font-semibold">{label}</Text>
      <Text className="text-dark text-base font-bold">{formatMonto(monto)}</Text>
    </View>
  )
}

export default function LiquidacionScreen() {
  const { formatMonto } = useConfig()
  const hoy = new Date()
  const [mes,  setMes]  = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())
  const esActual = mes === hoy.getMonth() && anio === hoy.getFullYear()

  const { data: raw, loading, error, refetch } = useApi(
    () => finanzasApi.getLiquidacion(mes + 1, anio),
    [mes, anio],
  )

  const data: PeriodoData | null = useMemo(() => {
    if (!raw) return null
    const r = raw as {
      ingresos?: { usuario_id: number; nombre: string; total: string }[]
      gastos_comunes?: { usuario_id: number; nombre: string; total: string }[]
      usando_sueldos_anteriores?: boolean
      mes_anterior?: string
    }
    return {
      ingresos: (r.ingresos ?? []).map((i) => ({ usuarioId: String(i.usuario_id), nombre: i.nombre, monto: Number(i.total) || 0 })),
      gastos:   (r.gastos_comunes ?? []).map((g) => ({ usuarioId: String(g.usuario_id), nombre: g.nombre, montoRegistrado: Number(g.total) || 0 })),
      usandoSueldosAnteriores: r.usando_sueldos_anteriores,
      mesAnterior: r.mes_anterior,
    }
  }, [raw])

  const { totalIngresos, proporciones, totalGastos, deberíaPagar, compensaciones, transferencias } =
    useMemo(() => data ? calcular(data) : { totalIngresos:0, proporciones:[], totalGastos:0, deberíaPagar:[], compensaciones:[], transferencias:[] }, [data])

  const omitirPrimerFoco = useRef(true)
  useFocusEffect(useCallback(() => {
    if (omitirPrimerFoco.current) { omitirPrimerFoco.current = false; return }
    void refetch()
  }, [refetch]))

  function irAnterior() {
    if (mes === 0) { setMes(11); setAnio((a) => a - 1) } else setMes((m) => m - 1)
  }
  function irSiguiente() {
    if (esActual) return
    if (mes === 11) { setMes(0); setAnio((a) => a + 1) } else setMes((m) => m + 1)
  }

  const sinDatos = !data || (data.ingresos.length === 0 && data.gastos.length === 0)

  return (
    <MobileShell title="Resumen común">
      <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        {/* Navegación mes */}
        <View className="flex-row items-center gap-2 mb-5">
          <TouchableOpacity onPress={irAnterior} className="w-8 h-8 border border-border rounded-lg items-center justify-center bg-white">
            <Text className="text-dark text-lg">‹</Text>
          </TouchableOpacity>
          <Text className="text-dark font-semibold text-sm flex-1 text-center">{MESES[mes]} {anio}</Text>
          <TouchableOpacity onPress={irSiguiente} disabled={esActual}
            className={`w-8 h-8 border rounded-lg items-center justify-center bg-white ${esActual ? 'border-border/40' : 'border-border'}`}>
            <Text className={`text-lg ${esActual ? 'text-border' : 'text-dark'}`}>›</Text>
          </TouchableOpacity>
        </View>

        {loading && <View className="py-16 items-center"><ActivityIndicator color="#0f0f0f" /></View>}

        {!loading && error && (
          <View className="bg-danger/10 border border-danger/30 rounded-xl p-4">
            <Text className="text-danger text-sm text-center">{error}</Text>
            <TouchableOpacity onPress={refetch} className="mt-2">
              <Text className="text-dark font-semibold text-sm text-center underline">Reintentar</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && sinDatos && (
          <View className="bg-white border border-border rounded-2xl p-8 items-center">
            <Text className="text-muted text-sm text-center">
              Sin datos para este mes.{'\n'}Declara sueldos y registra gastos comunes para calcular la liquidación.
            </Text>
          </View>
        )}

        {!loading && !error && data && !sinDatos && (
          <>
            {data.usandoSueldosAnteriores && (
              <View className="bg-accent/20 border border-accent/60 rounded-xl px-4 py-3 mb-4">
                <Text className="text-dark text-xs">
                  ⚠ Usando sueldos de {data.mesAnterior}. Declara los de {MESES[mes]} en la sección Sueldos.
                </Text>
              </View>
            )}

            {/* 1. Sueldos declarados */}
            <SeccionCard titulo="Sueldos declarados">
              {proporciones.map((ing, i) => (
                <BarraRow key={ing.usuarioId} nombre={ing.nombre} valor={ing.monto}
                  max={totalIngresos} color={COLORES_MIEMBRO[i % COLORES_MIEMBRO.length]}
                  metaDerecha={`${ing.porcentaje.toFixed(1)}%`} />
              ))}
              <FilaTotal label="Total familia" monto={totalIngresos} />
            </SeccionCard>

            {/* 2. Gastos comunes del mes */}
            <SeccionCard titulo="Gastos comunes del mes">
              {data.gastos.map((g, i) => (
                <BarraRow key={g.usuarioId} nombre={g.nombre} valor={g.montoRegistrado}
                  max={totalGastos} color={COLORES_MIEMBRO[i % COLORES_MIEMBRO.length]}
                  metaDerecha={`por ${g.nombre.split(' ')[0]}`} />
              ))}
              <FilaTotal label="Total gastos" monto={totalGastos} />
            </SeccionCard>

            {/* 3. Prorrateo */}
            <SeccionCard titulo="Prorrateo">
              {deberíaPagar.map((d) => (
                <View key={d.usuarioId} className="flex-row items-center mb-2">
                  <Text className="text-dark text-sm font-medium w-20 flex-shrink-0">{d.nombre}</Text>
                  <Text className="text-muted text-xs flex-1 text-center">
                    {d.porcentaje.toFixed(1)}% × {formatMonto(totalGastos)}
                  </Text>
                  <Text className="text-dark text-sm font-semibold flex-shrink-0">{formatMonto(d.monto)}</Text>
                </View>
              ))}
            </SeccionCard>

            {/* 4. Compensación */}
            <SeccionCard titulo="Compensación">
              {compensaciones.map((c) => {
                const esDeudor   = c.diferencia < -0.5
                const esAcreedor = c.diferencia >  0.5
                const colorTexto = esDeudor ? '#ef4444' : esAcreedor ? '#22c55e' : '#6b7280'
                const resultado  = esDeudor
                  ? `debe ${formatMonto(Math.abs(c.diferencia))}`
                  : esAcreedor ? `recibe ${formatMonto(c.diferencia)}` : 'está al día'
                return (
                  <View key={c.usuarioId} className="mb-3">
                    <Text className="text-dark text-sm font-semibold mb-0.5">{c.nombre}</Text>
                    <View className="flex-row flex-wrap items-center gap-1">
                      <Text className="text-muted text-xs">pagó {formatMonto(c.pagado)}</Text>
                      <Text className="text-muted text-xs">—</Text>
                      <Text className="text-muted text-xs">debería {formatMonto(c.debería)}</Text>
                      <Text className="text-muted text-xs">→</Text>
                      <Text className="text-xs font-semibold" style={{ color: colorTexto }}>{resultado}</Text>
                    </View>
                  </View>
                )
              })}

              <View className="mt-1">
                {transferencias.length > 0 ? (
                  <View className="bg-dark rounded-xl px-4 py-3">
                    <Text className="text-white text-sm text-center leading-5">
                      <Text className="font-bold">{transferencias[0].de}</Text>
                      {' le transfiere '}
                      <Text className="font-bold text-accent">{formatMonto(transferencias[0].monto)}</Text>
                      {' a '}
                      <Text className="font-bold">{transferencias[0].a}</Text>
                    </Text>
                    {esActual && (
                      <Text className="text-white/50 text-xs text-center mt-1">
                        Proyección basada en {formatMonto(totalGastos)} registrados hasta hoy
                      </Text>
                    )}
                  </View>
                ) : (
                  <View className="bg-success/10 border border-success/30 rounded-xl px-4 py-3">
                    <Text className="text-success text-sm text-center font-semibold">
                      ✓ Sin transferencias necesarias este mes
                    </Text>
                  </View>
                )}
              </View>
            </SeccionCard>
          </>
        )}
      </ScrollView>
    </MobileShell>
  )
}
