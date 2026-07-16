import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useTarjetas } from '@finanzas/shared/hooks/useCatalogos'
import { catalogosApi } from '@finanzas/shared/api/catalogos'
import { movimientosApi } from '@finanzas/shared/api/movimientos'
import { useApi } from '@finanzas/shared/hooks/useApi'
import { useConfig } from '@finanzas/shared/context/ConfigContext'
import { MobileShell } from '../../../components/layout/MobileShell'

interface Tarjeta {
  id: number
  nombre: string
  banco: string
  tipo?: 'DEBITO' | 'CREDITO'
  ultimos_4_digitos?: string
  numero_cuenta?: string
  es_por_defecto?: boolean
  dia_facturacion: number | null
  dia_vencimiento: number | null
}

interface CuotaResumen {
  id: number
  movimiento?: number
  monto: number
  estado: 'PENDIENTE' | 'FACTURADO' | 'PAGADO'
}

interface MovimientoCreditoResumen {
  id: number
  tarjeta: number | null
}

function parseDia(val: string): number | null {
  const n = parseInt(val, 10)
  if (!Number.isFinite(n) || n < 1 || n > 31) return null
  return n
}

const FORM_VACIO = {
  nombre: '',
  banco: '',
  tipo: 'CREDITO' as 'DEBITO' | 'CREDITO',
  ultimos4: '',
  numeroCuenta: '',
  esPorDefecto: false,
  diaFac: '',
  diaVen: '',
}
type FormTarjetaState = typeof FORM_VACIO

function FormTarjeta(props: {
  form: FormTarjetaState
  setForm: Dispatch<SetStateAction<FormTarjetaState>>
  formError: string | null
  guardando: boolean
  titulo: string
  onGuardar: () => void
  onCancelar: () => void
}) {
  const { form, setForm, formError, guardando, titulo, onGuardar, onCancelar } = props
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
      <Text className="text-muted text-[10px] mb-1 ml-1">Tipo</Text>
      <View className="flex-row gap-2 mb-2">
        {(['CREDITO', 'DEBITO'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() =>
              setForm((f) => ({
                ...f,
                tipo: t,
                ...(t === 'DEBITO' ? { diaFac: '', diaVen: '' } : null),
              }))
            }
            className={`flex-1 py-2 rounded-lg border items-center ${
              form.tipo === t ? 'bg-dark border-dark' : 'bg-surface border-border'
            }`}
          >
            <Text className={`text-xs font-semibold ${form.tipo === t ? 'text-white' : 'text-dark'}`}>
              {t === 'CREDITO' ? 'Crédito' : 'Débito'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        value={form.ultimos4}
        onChangeText={(v) => setForm((f) => ({ ...f, ultimos4: v.replace(/\D/g, '').slice(0, 4) }))}
        placeholder="Últimos 4 dígitos"
        placeholderTextColor="#888884"
        keyboardType="numeric"
        maxLength={4}
        className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm mb-2"
      />
      {form.tipo === 'DEBITO' ? (
        <TextInput
          value={form.numeroCuenta}
          onChangeText={(v) =>
            setForm((f) => ({
              ...f,
              numeroCuenta: v.replace(/[^\d\s.\-]/g, '').slice(0, 34),
            }))
          }
          placeholder="Número de cuenta (opcional)"
          placeholderTextColor="#888884"
          keyboardType="numeric"
          className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm mb-2"
        />
      ) : null}
      {form.tipo === 'CREDITO' ? (
        <View className="flex-row gap-2 mb-2">
          <View className="flex-1">
            <Text className="text-muted text-[10px] mb-1 ml-1">Día cierre</Text>
            <TextInput
              value={form.diaFac}
              onChangeText={(v) => setForm((f) => ({ ...f, diaFac: v }))}
              placeholder="1-31"
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
              placeholder="1-31"
              placeholderTextColor="#888884"
              keyboardType="numeric"
              className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm"
            />
          </View>
        </View>
      ) : null}
      <TouchableOpacity
        onPress={() => setForm((f) => ({ ...f, esPorDefecto: !f.esPorDefecto }))}
        className="flex-row items-center gap-2 mb-3"
      >
        <View
          className={`w-5 h-5 rounded border items-center justify-center ${
            form.esPorDefecto ? 'bg-dark border-dark' : 'border-border bg-surface'
          }`}
        >
          {form.esPorDefecto ? <Text className="text-white text-[10px]">✓</Text> : null}
        </View>
        <Text className="text-sm text-dark flex-1">
          Usar por defecto al pagar con {form.tipo === 'DEBITO' ? 'débito' : 'crédito'}
        </Text>
      </TouchableOpacity>
      {formError && <Text className="text-danger text-xs mb-2">{formError}</Text>}
      <View className="flex-row gap-2">
        <TouchableOpacity
          onPress={onCancelar}
          className="flex-1 border border-border rounded-lg py-2.5 items-center"
        >
          <Text className="text-dark text-sm font-semibold">Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onGuardar}
          disabled={guardando}
          className="flex-1 bg-dark rounded-lg py-2.5 items-center"
        >
          <Text className="text-white text-sm font-semibold">
            {guardando ? 'Guardando...' : 'Guardar'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

export default function TarjetasScreen() {
  const { formatMonto } = useConfig()
  const router = useRouter()
  const { data: tarjetasRaw, loading: loadingTarjetas, refetch: refetchTarjetas } = useTarjetas()
  const tarjetas = (tarjetasRaw as Tarjeta[] | null) ?? []
  const tarjetasCredito = useMemo(
    () => tarjetas.filter((t) => (t.tipo ?? 'CREDITO') === 'CREDITO'),
    [tarjetas],
  )
  const tarjetasDebito = useMemo(
    () => tarjetas.filter((t) => t.tipo === 'DEBITO'),
    [tarjetas],
  )
  const {
    data: cuotasData,
    loading: loadingCuotas,
    error: errorCuotas,
    refetch: refetchCuotas,
  } = useApi<CuotaResumen[]>(
    () => movimientosApi.getCuotas({}) as Promise<{ data: CuotaResumen[] }>,
    [],
  )
  const {
    data: movimientosCreditoData,
    loading: loadingMovimientosCredito,
    error: errorMovimientosCredito,
    refetch: refetchMovimientosCredito,
  } = useApi<MovimientoCreditoResumen[]>(
    () =>
      movimientosApi.getMovimientos({
        tipo: 'EGRESO',
        metodo: 'CREDITO',
      }) as Promise<{ data: MovimientoCreditoResumen[] }>,
    [],
  )

  const [tarjetaSeleccionadaId, setTarjetaSeleccionadaId] = useState<number | null>(null)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [agregando, setAgregando] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [formError, setFormError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const deudaPorTarjeta = useMemo(() => {
    const movToTarjeta = new Map<number, number>()
    for (const mov of (movimientosCreditoData ?? []) as MovimientoCreditoResumen[]) {
      if (mov.tarjeta == null) continue
      movToTarjeta.set(mov.id, mov.tarjeta)
    }
    const deuda = new Map<number, number>()
    for (const cuota of (cuotasData ?? []) as CuotaResumen[]) {
      if (cuota.estado === 'PAGADO') continue
      const movId = Number(cuota.movimiento)
      const tarjetaId = movToTarjeta.get(movId)
      if (!tarjetaId) continue
      const previo = deuda.get(tarjetaId) ?? 0
      deuda.set(tarjetaId, previo + Number(cuota.monto || 0))
    }
    return deuda
  }, [cuotasData, movimientosCreditoData])
  const totalUtilizado = useMemo(
    () => Array.from(deudaPorTarjeta.values()).reduce((acc, x) => acc + x, 0),
    [deudaPorTarjeta],
  )

  useEffect(() => {
    if (tarjetaSeleccionadaId != null) return
    if (!tarjetas[0]) return
    setTarjetaSeleccionadaId(tarjetas[0].id)
  }, [tarjetas, tarjetaSeleccionadaId])
  useFocusEffect(
    useCallback(() => {
      // Recalcula utilizados al volver desde registrar/editar movimientos o pagos.
      void refetchTarjetas()
      void refetchCuotas()
      void refetchMovimientosCredito()
      return undefined
    }, [refetchTarjetas, refetchCuotas, refetchMovimientosCredito]),
  )

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
      tipo: t.tipo === 'DEBITO' ? 'DEBITO' : 'CREDITO',
      ultimos4: t.ultimos_4_digitos ?? '',
      numeroCuenta: t.numero_cuenta ?? '',
      esPorDefecto: Boolean(t.es_por_defecto),
      diaFac: t.dia_facturacion != null ? String(t.dia_facturacion) : '',
      diaVen: t.dia_vencimiento != null ? String(t.dia_vencimiento) : '',
    })
  }

  async function guardarNueva() {
    if (!form.nombre.trim() || !form.banco.trim()) {
      setFormError('Nombre y banco son obligatorios.')
      return
    }
    if (form.ultimos4 && form.ultimos4.length !== 4) {
      setFormError('Últimos 4: exactamente 4 dígitos o vacío.')
      return
    }
    setFormError(null)
    setGuardando(true)
    try {
      await catalogosApi.createTarjeta({
        nombre: form.nombre.trim(),
        banco: form.banco.trim(),
        tipo: form.tipo,
        ultimos_4_digitos: form.ultimos4,
        numero_cuenta: form.tipo === 'DEBITO' ? form.numeroCuenta.trim() : '',
        es_por_defecto: form.esPorDefecto,
        dia_facturacion: form.tipo === 'CREDITO' && form.diaFac ? parseDia(form.diaFac) : null,
        dia_vencimiento: form.tipo === 'CREDITO' && form.diaVen ? parseDia(form.diaVen) : null,
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
    if (!form.nombre.trim() || !form.banco.trim()) {
      setFormError('Nombre y banco son obligatorios.')
      return
    }
    if (form.ultimos4 && form.ultimos4.length !== 4) {
      setFormError('Últimos 4: exactamente 4 dígitos o vacío.')
      return
    }
    setFormError(null)
    setGuardando(true)
    try {
      await catalogosApi.updateTarjeta(editandoId, {
        nombre: form.nombre.trim(),
        banco: form.banco.trim(),
        tipo: form.tipo,
        ultimos_4_digitos: form.ultimos4,
        numero_cuenta: form.tipo === 'DEBITO' ? form.numeroCuenta.trim() : '',
        es_por_defecto: form.esPorDefecto,
        dia_facturacion: form.tipo === 'CREDITO' && form.diaFac ? parseDia(form.diaFac) : null,
        dia_vencimiento: form.tipo === 'CREDITO' && form.diaVen ? parseDia(form.diaVen) : null,
      })
      cancelarForm()
      void refetchTarjetas()
    } catch {
      setFormError('No se pudo actualizar.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <MobileShell title="Tarjetas">
      <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="px-5 pt-3">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-bold text-muted uppercase tracking-wide">Mis tarjetas</Text>
            {!agregando && editandoId === null && (
              <TouchableOpacity onPress={abrirNueva} className="px-3 py-1 bg-dark rounded-lg">
                <Text className="text-white text-xs font-semibold">+ Agregar</Text>
              </TouchableOpacity>
            )}
          </View>

          {tarjetasCredito.length > 0 ? (
            <View className="bg-white border border-border rounded-xl px-4 py-3 mb-3">
              <Text className="text-[11px] text-muted font-semibold uppercase tracking-wide">
                Utilizado total (crédito)
              </Text>
              <Text className="text-dark text-2xl font-bold mt-1">{formatMonto(totalUtilizado)}</Text>
            </View>
          ) : null}

          {(loadingTarjetas || loadingCuotas || loadingMovimientosCredito) && (
            <View className="py-6 items-center">
              <ActivityIndicator color="#0f0f0f" />
            </View>
          )}

          {(errorCuotas || errorMovimientosCredito) && (
            <View className="bg-danger/10 border border-danger/30 rounded-xl p-4 mb-3">
              <Text className="text-danger text-sm text-center">
                {errorCuotas || errorMovimientosCredito}
              </Text>
            </View>
          )}

          {!loadingTarjetas && tarjetas.length === 0 && !agregando && (
            <View className="bg-white border border-border rounded-xl p-6 mb-4 items-center">
              <Text className="text-muted text-sm text-center">
                No tienes tarjetas registradas.{'\n'}Agrega débito o crédito desde aquí.
              </Text>
            </View>
          )}

          {!loadingTarjetas &&
            (
              [
                { titulo: 'Crédito', items: tarjetasCredito },
                { titulo: 'Débito', items: tarjetasDebito },
              ] as const
            ).map((grupo) =>
              grupo.items.length === 0 ? null : (
                <View key={grupo.titulo} className="mb-4">
                  <Text className="text-sm font-semibold text-dark mb-2">{grupo.titulo}</Text>
                  {grupo.items.map((t) => {
                    if (editandoId === t.id) {
                      return (
                        <FormTarjeta
                          key={t.id}
                          titulo={`Editar ${t.nombre}`}
                          form={form}
                          setForm={setForm}
                          formError={formError}
                          guardando={guardando}
                          onGuardar={guardarEdicion}
                          onCancelar={cancelarForm}
                        />
                      )
                    }
                    const seleccionada = t.id === tarjetaSeleccionadaId
                    return (
                      <View
                        key={t.id}
                        className={`bg-white border rounded-xl px-4 py-3 mb-2 ${seleccionada ? 'border-dark' : 'border-border'}`}
                      >
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => setTarjetaSeleccionadaId(t.id)}
                        >
                          <View className="flex-row items-center">
                            <View className="flex-1 mr-2">
                              <Text className="text-dark font-semibold text-sm">
                                {t.nombre}
                                {t.ultimos_4_digitos ? ` ···${t.ultimos_4_digitos}` : ''}
                              </Text>
                              <Text className="text-muted text-xs mt-0.5">
                                {[t.banco, t.es_por_defecto ? 'Por defecto' : null]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </Text>
                              {t.tipo !== 'DEBITO' && (t.dia_facturacion || t.dia_vencimiento) && (
                                <Text className="text-muted text-xs mt-0.5">
                                  {[
                                    t.dia_facturacion ? `Cierre dia ${t.dia_facturacion}` : null,
                                    t.dia_vencimiento ? `Vence dia ${t.dia_vencimiento}` : null,
                                  ]
                                    .filter(Boolean)
                                    .join('  ·  ')}
                                </Text>
                              )}
                              {(t.tipo ?? 'CREDITO') === 'CREDITO' ? (
                                <View className="mt-2">
                                  <Text className="text-[10px] text-muted uppercase tracking-wide">
                                    Utilizado
                                  </Text>
                                  <Text className="text-dark text-sm font-semibold">
                                    {formatMonto(deudaPorTarjeta.get(t.id) ?? 0)}
                                  </Text>
                                </View>
                              ) : null}
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
                          {(t.tipo ?? 'CREDITO') === 'CREDITO' ? (
                            <TouchableOpacity
                              onPress={() =>
                                router.push(`/(tabs)/tarjeta-pagar?tarjeta=${t.id}` as never)
                              }
                              className="flex-1 bg-dark rounded-lg py-1.5 items-center"
                            >
                              <Text className="text-white text-xs font-semibold">Ver detalle</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    )
                  })}
                </View>
              ),
            )}

          {agregando && (
            <FormTarjeta
              titulo="Nueva tarjeta"
              form={form}
              setForm={setForm}
              formError={formError}
              guardando={guardando}
              onGuardar={guardarNueva}
              onCancelar={cancelarForm}
            />
          )}
        </View>
      </ScrollView>
    </MobileShell>
  )
}
