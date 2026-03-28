import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useApi } from '@finanzas/shared/hooks/useApi'
import { finanzasApi } from '@finanzas/shared/api/finanzas'
import { useConfig } from '@finanzas/shared/context/ConfigContext'
import { MobileShell } from '../components/layout/MobileShell'
import { useAuth } from '../context/AuthContext'

interface IngresoComun {
  id: number
  usuario: number
  usuario_nombre: string
  origen: string
  monto: string | number
  mes: string // "YYYY-MM-DD"
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function montoNum(v: string | number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function mesStr(anio: number, mes: number): string {
  return `${anio}-${String(mes + 1).padStart(2, '0')}-01`
}

export default function SueldosScreen() {
  const { formatMonto } = useConfig()
  const { user } = useAuth()

  const hoy = new Date()
  const [mes, setMes] = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())

  // Form estado
  const [formOrigen, setFormOrigen] = useState('')
  const [formMonto, setFormMonto] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)

  const esActual = mes === hoy.getMonth() && anio === hoy.getFullYear()

  const { data, loading, error, refetch } = useApi<IngresoComun[]>(
    () => finanzasApi.getIngresosComunes({ mes: mes + 1, anio }) as Promise<{ data: IngresoComun[] }>,
    [mes, anio],
  )
  const ingresos = data ?? []

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

  const miId = user?.id != null ? Number(user.id) : NaN
  const misIngresos = useMemo(() => ingresos.filter((i) => Number(i.usuario) === miId), [ingresos, miId])
  const otrosIngresos = useMemo(() => ingresos.filter((i) => Number(i.usuario) !== miId), [ingresos, miId])
  const totalFamiliar = useMemo(() => ingresos.reduce((s, i) => s + montoNum(i.monto), 0), [ingresos])

  // Agrupar otros por nombre
  const otrosPorMiembro = useMemo(() => {
    const map = new Map<string, { nombre: string; total: number }>()
    for (const i of otrosIngresos) {
      const nombre = i.usuario_nombre ?? `Usuario ${i.usuario}`
      const prev = map.get(nombre) ?? { nombre, total: 0 }
      map.set(nombre, { nombre, total: prev.total + montoNum(i.monto) })
    }
    return Array.from(map.values())
  }, [otrosIngresos])

  function abrirNuevo() {
    setEditandoId(null)
    setFormOrigen('')
    setFormMonto('')
    setFormError(null)
  }

  function abrirEdicion(ingreso: IngresoComun) {
    setEditandoId(ingreso.id)
    setFormOrigen(ingreso.origen)
    setFormMonto(String(montoNum(ingreso.monto)))
    setFormError(null)
  }

  function cancelarForm() {
    setEditandoId(null)
    setFormOrigen('')
    setFormMonto('')
    setFormError(null)
  }

  async function guardar() {
    const monto = Number(formMonto.replace(',', '.').replace(/\s/g, ''))
    if (!formOrigen.trim()) { setFormError('Escribe una descripción del ingreso.'); return }
    if (!Number.isFinite(monto) || monto <= 0) { setFormError('Ingresa un monto válido.'); return }
    setFormError(null)
    setGuardando(true)
    try {
      const payload = { mes: mesStr(anio, mes), monto: String(monto), origen: formOrigen.trim() }
      if (editandoId != null) {
        await finanzasApi.updateIngresoComun(editandoId, { monto: payload.monto, origen: payload.origen })
      } else {
        await finanzasApi.createIngresoComun(payload)
      }
      cancelarForm()
      void refetch()
    } catch {
      setFormError('No se pudo guardar. Intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  function confirmarEliminar(ingreso: IngresoComun) {
    Alert.alert(
      'Eliminar ingreso',
      `¿Eliminar "${ingreso.origen}" por ${formatMonto(montoNum(ingreso.monto))}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await finanzasApi.deleteIngresoComun(ingreso.id)
            void refetch()
          },
        },
      ],
    )
  }

  const formularioVisible = editandoId !== null || (editandoId === null && formOrigen !== '')
  const mostrarBotonNuevo = editandoId === null && formOrigen === ''

  return (
    <MobileShell title="Sueldos">
      <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="px-5 pt-3">
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

          {/* Total familiar */}
          {!loading && !error && (
            <View className="bg-dark rounded-2xl px-5 py-4 mb-5">
              <Text className="text-white/60 text-xs uppercase tracking-wide mb-1">Total familiar</Text>
              <Text className="text-white text-2xl font-bold">{formatMonto(totalFamiliar)}</Text>
              {otrosPorMiembro.length > 0 && (
                <View className="mt-3 gap-1">
                  {otrosPorMiembro.map((m) => (
                    <View key={m.nombre} className="flex-row justify-between">
                      <Text className="text-white/60 text-xs">{m.nombre}</Text>
                      <Text className="text-white/80 text-xs font-semibold">{formatMonto(m.total)}</Text>
                    </View>
                  ))}
                  {misIngresos.length > 0 && (
                    <View className="flex-row justify-between">
                      <Text className="text-white/60 text-xs">Tú</Text>
                      <Text className="text-white/80 text-xs font-semibold">
                        {formatMonto(misIngresos.reduce((s, i) => s + montoNum(i.monto), 0))}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {loading && (
            <View className="py-12 items-center">
              <ActivityIndicator color="#0f0f0f" />
            </View>
          )}

          {error && (
            <View className="bg-danger/10 border border-danger/30 rounded-xl p-4 mb-4">
              <Text className="text-danger text-sm text-center">{error}</Text>
              <TouchableOpacity onPress={refetch} className="mt-2">
                <Text className="text-dark font-semibold text-sm text-center underline">Reintentar</Text>
              </TouchableOpacity>
            </View>
          )}

          {!loading && !error && (
            <>
              {/* Mis ingresos */}
              <Text className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Mis ingresos</Text>

              {misIngresos.length === 0 && !formularioVisible && (
                <View className="bg-white border border-border rounded-xl p-4 mb-3 items-center">
                  <Text className="text-muted text-sm">Sin ingresos registrados este mes.</Text>
                </View>
              )}

              {misIngresos.map((ingreso) => (
                <View key={ingreso.id}>
                  {editandoId === ingreso.id ? (
                    <View className="bg-white border border-border rounded-xl p-4 mb-2">
                      <Text className="text-xs font-semibold text-muted mb-2">Editar ingreso</Text>
                      <TextInput
                        value={formOrigen}
                        onChangeText={setFormOrigen}
                        placeholder="Descripción (ej: Sueldo, Freelance)"
                        placeholderTextColor="#888884"
                        className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm mb-2"
                      />
                      <TextInput
                        value={formMonto}
                        onChangeText={setFormMonto}
                        placeholder="Monto"
                        placeholderTextColor="#888884"
                        keyboardType="numeric"
                        className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm mb-2"
                      />
                      {formError && <Text className="text-danger text-xs mb-2">{formError}</Text>}
                      <View className="flex-row gap-2">
                        <TouchableOpacity onPress={cancelarForm} className="flex-1 border border-border rounded-lg py-2.5 items-center">
                          <Text className="text-dark text-sm font-semibold">Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={guardar}
                          disabled={guardando}
                          className="flex-1 bg-dark rounded-lg py-2.5 items-center"
                        >
                          <Text className="text-white text-sm font-semibold">{guardando ? 'Guardando…' : 'Guardar'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View className="bg-white border border-border rounded-xl px-4 py-3 mb-2 flex-row items-center">
                      <View className="flex-1 mr-2">
                        <Text className="text-dark font-medium text-sm">{ingreso.origen}</Text>
                      </View>
                      <Text className="text-dark font-semibold text-sm mr-3">{formatMonto(montoNum(ingreso.monto))}</Text>
                      <TouchableOpacity
                        onPress={() => abrirEdicion(ingreso)}
                        className="px-2 py-1 rounded-lg border border-border mr-1"
                        hitSlop={8}
                      >
                        <Text className="text-dark text-xs font-semibold">Editar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => confirmarEliminar(ingreso)} hitSlop={8}>
                        <Text className="text-danger text-sm">🗑</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}

              {/* Formulario nuevo */}
              {mostrarBotonNuevo ? (
                <TouchableOpacity
                  onPress={abrirNuevo}
                  className="border border-dashed border-border rounded-xl py-3 items-center mb-5 bg-white"
                >
                  <Text className="text-muted text-sm font-semibold">+ Agregar ingreso</Text>
                </TouchableOpacity>
              ) : editandoId === null ? (
                <View className="bg-white border border-border rounded-xl p-4 mb-5">
                  <Text className="text-xs font-semibold text-muted mb-2">Nuevo ingreso</Text>
                  <TextInput
                    value={formOrigen}
                    onChangeText={setFormOrigen}
                    placeholder="Descripción (ej: Sueldo, Freelance)"
                    placeholderTextColor="#888884"
                    className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm mb-2"
                  />
                  <TextInput
                    value={formMonto}
                    onChangeText={setFormMonto}
                    placeholder="Monto"
                    placeholderTextColor="#888884"
                    keyboardType="numeric"
                    className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm mb-2"
                  />
                  {formError && <Text className="text-danger text-xs mb-2">{formError}</Text>}
                  <View className="flex-row gap-2">
                    <TouchableOpacity onPress={cancelarForm} className="flex-1 border border-border rounded-lg py-2.5 items-center">
                      <Text className="text-dark text-sm font-semibold">Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={guardar}
                      disabled={guardando}
                      className="flex-1 bg-dark rounded-lg py-2.5 items-center"
                    >
                      <Text className="text-white text-sm font-semibold">{guardando ? 'Guardando…' : 'Guardar'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {/* Otros miembros */}
              {otrosIngresos.length > 0 && (
                <>
                  <Text className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Otros miembros</Text>
                  <View className="bg-white border border-border rounded-xl overflow-hidden mb-4">
                    {otrosIngresos.map((ingreso, idx) => (
                      <View
                        key={ingreso.id}
                        className={`px-4 py-3 flex-row items-center ${idx < otrosIngresos.length - 1 ? 'border-b border-border' : ''}`}
                      >
                        <View className="flex-1 mr-2">
                          <Text className="text-dark font-medium text-sm">{ingreso.origen}</Text>
                          <Text className="text-muted text-xs mt-0.5">{ingreso.usuario_nombre ?? `Usuario ${ingreso.usuario}`}</Text>
                        </View>
                        <Text className="text-dark font-semibold text-sm">{formatMonto(montoNum(ingreso.monto))}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </MobileShell>
  )
}
