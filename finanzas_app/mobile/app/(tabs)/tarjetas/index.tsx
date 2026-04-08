import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTarjetas } from '@finanzas/shared/hooks/useCatalogos'
import { catalogosApi } from '@finanzas/shared/api/catalogos'
import { MobileShell } from '../../../components/layout/MobileShell'

interface Tarjeta {
  id: number
  nombre: string
  banco: string
  dia_facturacion: number | null
  dia_vencimiento: number | null
}

function parseDia(val: string): number | null {
  const n = parseInt(val, 10)
  if (!Number.isFinite(n) || n < 1 || n > 31) return null
  return n
}

const FORM_VACIO = { nombre: '', banco: '', diaFac: '', diaVen: '' }
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
  const router = useRouter()
  const { data: tarjetasRaw, loading: loadingTarjetas, refetch: refetchTarjetas } = useTarjetas()
  const tarjetas = (tarjetasRaw as Tarjeta[] | null) ?? []

  const [tarjetaSeleccionadaId, setTarjetaSeleccionadaId] = useState<number | null>(null)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [agregando, setAgregando] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [formError, setFormError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (tarjetaSeleccionadaId != null) return
    if (!tarjetas[0]) return
    setTarjetaSeleccionadaId(tarjetas[0].id)
  }, [tarjetas, tarjetaSeleccionadaId])

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
    if (!form.nombre.trim()) {
      setFormError('El nombre es obligatorio.')
      return
    }
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
    if (!form.nombre.trim()) {
      setFormError('El nombre es obligatorio.')
      return
    }
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

          {!loadingTarjetas &&
            tarjetas.map((t) => {
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
                  <TouchableOpacity activeOpacity={0.7} onPress={() => setTarjetaSeleccionadaId(t.id)}>
                    <View className="flex-row items-center">
                      <View className="flex-1 mr-2">
                        <Text className="text-dark font-semibold text-sm">{t.nombre}</Text>
                        {t.banco ? <Text className="text-muted text-xs mt-0.5">{t.banco}</Text> : null}
                        {(t.dia_facturacion || t.dia_vencimiento) && (
                          <Text className="text-muted text-xs mt-0.5">
                            {[
                              t.dia_facturacion ? `Cierre dia ${t.dia_facturacion}` : null,
                              t.dia_vencimiento ? `Vence dia ${t.dia_vencimiento}` : null,
                            ]
                              .filter(Boolean)
                              .join('  ·  ')}
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
                      onPress={() => router.push(`/(tabs)/tarjeta-pagar?tarjeta=${t.id}` as never)}
                      className="flex-1 bg-dark rounded-lg py-1.5 items-center"
                    >
                      <Text className="text-white text-xs font-semibold">Ver detalle</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )
            })}

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
