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
import { useTarjetas } from '@finanzas/shared/hooks/useCatalogos'
import { catalogosApi } from '@finanzas/shared/api/catalogos'
import { movimientosApi } from '@finanzas/shared/api/movimientos'
import { useConfig } from '@finanzas/shared/context/ConfigContext'
import { MobileShell } from '../../components/layout/MobileShell'

// ─── Tipos ────────────────────────────────────────────────────────────────────

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

// ─── Constantes ───────────────────────────────────────────────────────────────

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const ESTADO_BADGE: Record<Cuota['estado'], { label: string; bg: string; color: string }> = {
  PENDIENTE: { label: 'Pendiente', bg: '#fff7ed', color: '#f59e0b' },
  FACTURADO: { label: 'Facturado', bg: '#eff6ff', color: '#3b82f6' },
  PAGADO:    { label: 'Pagado',    bg: '#f0fdf4', color: '#22c55e' },
}

function montoNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function parseDia(val: string): number | null {
  const n = parseInt(val, 10)
  if (!Number.isFinite(n) || n < 1 || n > 31) return null
  return n
}

const FORM_VACIO = { nombre: '', banco: '', diaFac: '', diaVen: '' }

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TarjetasScreen() {
  const { formatMonto } = useConfig()

  // ── CRUD tarjetas ──
  const { data: tarjetasRaw, loading: loadingTarjetas, refetch: refetchTarjetas } = useTarjetas()
  const tarjetas = (tarjetasRaw as Tarjeta[] | null) ?? []

  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [agregando, setAgregando] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [formError, setFormError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // ── Cuotas ──
  const hoy = new Date()
  const [tarjetaId, setTarjetaId] = useState<number | null>(null)
  const [mes, setMes] = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [vista, setVista] = useState<'FACTURADO' | 'PAGADO'>('FACTURADO')
  const [actualizando, setActualizando] = useState<Set<number>>(new Set())

  const esActual = mes === hoy.getMonth() && anio === hoy.getFullYear()
  const tarjetaIdEfectivo = tarjetaId ?? tarjetas[0]?.id ?? null

  const { data: cuotasData, loading: loadingCuotas, error: errorCuotas, refetch: refetchCuotas } = useApi<Cuota[]>(
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
      void refetchTarjetas()
      void refetchCuotas()
    }, [refetchTarjetas, refetchCuotas]),
  )

  // ── Helpers CRUD ──

  function cancelarForm() {
    setAgregando(false)
    setEditandoId(null)
    setForm(FORM_VACIO)
    setFormError(null)
  }

  function abrirNueva() {
    cancelarForm()
    setAgregando(true)
  }

  function abrirEdicion(t: Tarjeta) {
    cancelarForm()
    setEditandoId(t.id)
    setForm({
      nombre: t.nombre,
      banco: t.banco ?? '',
      diaFac: t.dia_facturacion != null ? String(t.dia_facturacion) : '',
      diaVen: t.dia_vencimiento != null ? String(t.dia_vencimiento) : '',
    })
  }

  async function guardarNueva() {
    if (!form.nombre.trim()) { setFormError('El nombre es obligatorio.'); return }
    setFormError(null)
    setGuardando(true)
    try {
      await catalogosApi.createTarjeta({
        nombre: form.nombre.trim(),
        banco: form.banco.trim() || '',
        dia_facturacion: form.diaFac ? parseDia(form.diaFac) : null,
        dia_vencimiento: form.diaVen ? parseDia(form.diaVen) : null,
      })
      cancelarForm()
      void refetchTarjetas()
    } catch {
      setFormError('No se pudo crear la tarjeta.')
    } finally {
      setGuardando(false)
    }
  }

  async function guardarEdicion() {
    if (editandoId == null) return
    if (!form.nombre.trim()) { setFormError('El nombre es obligatorio.'); return }
    setFormError(null)
    setGuardando(true)
    try {
      await catalogosApi.updateTarjeta(editandoId, {
        nombre: form.nombre.trim(),
        banco: form.banco.trim() || '',
        dia_facturacion: form.diaFac ? parseDia(form.diaFac) : null,
        dia_vencimiento: form.diaVen ? parseDia(form.diaVen) : null,
      })
      cancelarForm()
      void refetchTarjetas()
    } catch {
      setFormError('No se pudo actualizar.')
    } finally {
      setGuardando(false)
    }
  }

  function confirmarEliminar(t: Tarjeta) {
    Alert.alert(
      'Eliminar tarjeta',
      `¿Eliminar "${t.nombre}"? Se perderán las cuotas asociadas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await catalogosApi.deleteTarjeta(t.id)
              if (tarjetaId === t.id) setTarjetaId(null)
              void refetchTarjetas()
            } catch {
              Alert.alert('Error', 'No se pudo eliminar (¿tiene cuotas activas?).')
            }
          },
        },
      ],
    )
  }

  // ── Helpers cuotas ──

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

  async function toggleIncluir(cuota: Cuota) {
    setActualizando((prev) => new Set(prev).add(cuota.id))
    try {
      await movimientosApi.updateCuota(cuota.id, { incluir: !cuota.incluir })
      void refetchCuotas()
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
              void refetchCuotas()
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

  // ── Formulario inline ──

  function FormTarjeta({ onGuardar, titulo }: { onGuardar: () => void; titulo: string }) {
    return (
      <View className="bg-white border border-border rounded-xl p-4 mb-3">
        <Text className="text-xs font-semibold text-muted mb-3">{titulo}</Text>
        <TextInput
          value={form.nombre}
          onChangeText={(v) => setForm((f) => ({ ...f, nombre: v }))}
          placeholder="Nombre (ej: Visa BCI)"
          placeholderTextColor="#888884"
          className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm mb-2"
        />
        <TextInput
          value={form.banco}
          onChangeText={(v) => setForm((f) => ({ ...f, banco: v }))}
          placeholder="Banco (ej: BCI, Santander)"
          placeholderTextColor="#888884"
          className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm mb-2"
        />
        <View className="flex-row gap-2 mb-2">
          <View className="flex-1">
            <Text className="text-muted text-[10px] mb-1 ml-1">Día cierre</Text>
            <TextInput
              value={form.diaFac}
              onChangeText={(v) => setForm((f) => ({ ...f, diaFac: v }))}
              placeholder="1–31"
              placeholderTextColor="#888884"
              keyboardType="numeric"
              className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm"
            />
          </View>
          <View className="flex-1">
            <Text className="text-muted text-[10px] mb-1 ml-1">Día vencimiento</Text>
            <TextInput
              value={form.diaVen}
              onChangeText={(v) => setForm((f) => ({ ...f, diaVen: v }))}
              placeholder="1–31"
              placeholderTextColor="#888884"
              keyboardType="numeric"
              className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm"
            />
          </View>
        </View>
        {formError && <Text className="text-danger text-xs mb-2">{formError}</Text>}
        <View className="flex-row gap-2">
          <TouchableOpacity onPress={cancelarForm} className="flex-1 border border-border rounded-lg py-2.5 items-center">
            <Text className="text-dark text-sm font-semibold">Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onGuardar}
            disabled={guardando}
            className="flex-1 bg-dark rounded-lg py-2.5 items-center"
          >
            <Text className="text-white text-sm font-semibold">{guardando ? 'Guardando…' : 'Guardar'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── Render ──

  return (
    <MobileShell title="Tarjetas">
      <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="px-5 pt-3">

          {/* ── Sección: Mis tarjetas ── */}
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-bold text-muted uppercase tracking-wide">Mis tarjetas</Text>
            {!agregando && editandoId === null && (
              <TouchableOpacity onPress={abrirNueva} className="px-3 py-1 bg-dark rounded-lg">
                <Text className="text-white text-xs font-semibold">+ Agregar</Text>
              </TouchableOpacity>
            )}
          </View>

          {loadingTarjetas && (
            <View className="py-6 items-center">
              <ActivityIndicator color="#0f0f0f" />
            </View>
          )}

          {!loadingTarjetas && tarjetas.length === 0 && !agregando && (
            <View className="bg-white border border-border rounded-xl p-6 mb-4 items-center">
              <Text className="text-muted text-sm text-center">
                No tienes tarjetas registradas.{'\n'}Agrega una para gestionar tus cuotas.
              </Text>
            </View>
          )}

          {!loadingTarjetas && tarjetas.map((t) => {
            if (editandoId === t.id) {
              return <FormTarjeta key={t.id} titulo={`Editar ${t.nombre}`} onGuardar={guardarEdicion} />
            }
            const seleccionada = t.id === tarjetaIdEfectivo
            return (
              <View
                key={t.id}
                className={`bg-white border rounded-xl px-4 py-3 mb-2 ${seleccionada ? 'border-dark' : 'border-border'}`}
              >
                <TouchableOpacity activeOpacity={0.7} onPress={() => setTarjetaId(t.id)}>
                  <View className="flex-row items-center">
                    <View className="flex-1 mr-2">
                      <Text className="text-dark font-semibold text-sm">{t.nombre}</Text>
                      {t.banco ? <Text className="text-muted text-xs mt-0.5">{t.banco}</Text> : null}
                      {(t.dia_facturacion || t.dia_vencimiento) && (
                        <Text className="text-muted text-xs mt-0.5">
                          {[
                            t.dia_facturacion ? `Cierre día ${t.dia_facturacion}` : null,
                            t.dia_vencimiento ? `Vence día ${t.dia_vencimiento}` : null,
                          ].filter(Boolean).join('  ·  ')}
                        </Text>
                      )}
                    </View>
                    {seleccionada && (
                      <View className="w-5 h-5 rounded-full bg-dark items-center justify-center">
                        <Text className="text-white text-xs font-bold">✓</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
                <View className="flex-row gap-2 mt-2 pt-2 border-t border-border">
                  <TouchableOpacity
                    onPress={() => abrirEdicion(t)}
                    className="flex-1 border border-border rounded-lg py-1.5 items-center"
                  >
                    <Text className="text-dark text-xs font-semibold">Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => confirmarEliminar(t)}
                    className="flex-1 border border-danger/40 rounded-lg py-1.5 items-center"
                  >
                    <Text className="text-danger text-xs font-semibold">Eliminar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          })}

          {agregando && (
            <FormTarjeta titulo="Nueva tarjeta" onGuardar={guardarNueva} />
          )}

          {/* ── Sección: Cuotas (solo si hay tarjeta seleccionada) ── */}
          {tarjetaIdEfectivo != null && (
            <>
              <View className="h-px bg-border my-5" />

              <Text className="text-xs font-bold text-muted uppercase tracking-wide mb-3">
                Cuotas — {tarjetas.find((t) => t.id === tarjetaIdEfectivo)?.nombre}
              </Text>

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

              {/* Toggle Por pagar / Pagado */}
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
                <View className="py-8 items-center">
                  <ActivityIndicator color="#0f0f0f" />
                </View>
              ) : errorCuotas ? (
                <View className="bg-danger/10 border border-danger/30 rounded-xl p-4">
                  <Text className="text-danger text-sm text-center">{errorCuotas}</Text>
                  <TouchableOpacity onPress={refetchCuotas} className="mt-2">
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
                            <Text className="text-dark font-semibold text-sm">
                              {formatMonto(montoNum(cuota.monto_cuota))}
                            </Text>
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
            </>
          )}
        </View>
      </ScrollView>
    </MobileShell>
  )
}
