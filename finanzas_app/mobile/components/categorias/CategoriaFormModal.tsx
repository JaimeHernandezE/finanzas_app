import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { catalogosApi } from '@finanzas/shared/api/catalogos'
import { apiErrorMessage } from '@finanzas/shared/api'
import type { CuentaPersonalApi } from '@finanzas/shared/api/finanzas'
import { queryClient } from '../../lib/queryClient'
import type { CategoriaUIModel } from './categoriaUtils'

export interface CategoriaFormModalProps {
  visible: boolean
  onClose: () => void
  modo: 'crear' | 'editar'
  ambito: 'FAMILIAR' | 'PERSONAL'
  /** Tipo seleccionado en la pantalla principal al pulsar + Agregar */
  tipoInicial: 'INGRESO' | 'EGRESO'
  categoria: CategoriaUIModel | null
  todasCategorias: CategoriaUIModel[]
  cuentasPropias: CuentaPersonalApi[]
}

export function CategoriaFormModal({
  visible,
  onClose,
  modo,
  ambito,
  tipoInicial,
  categoria,
  todasCategorias,
  cuentasPropias,
}: CategoriaFormModalProps) {
  const insets = useSafeAreaInsets()
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<'INGRESO' | 'EGRESO'>('EGRESO')
  const [esInversion, setEsInversion] = useState(false)
  const [categoriaPadreId, setCategoriaPadreId] = useState<string>('')
  const [cuentaPersonalId, setCuentaPersonalId] = useState<string>('')
  const [pickerPadreOpen, setPickerPadreOpen] = useState(false)
  const [pickerCuentaOpen, setPickerCuentaOpen] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setErrorMsg(null)
    if (modo === 'editar' && categoria) {
      setNombre(categoria.nombre)
      setTipo(categoria.tipo)
      setEsInversion(categoria.esInversion)
      setCategoriaPadreId(categoria.categoriaPadre ? String(categoria.categoriaPadre) : '')
      setCuentaPersonalId(categoria.cuentaPersonal ? String(categoria.cuentaPersonal) : '')
    } else {
      setNombre('')
      setTipo(tipoInicial)
      setEsInversion(false)
      setCategoriaPadreId('')
      setCuentaPersonalId('')
    }
  }, [visible, modo, categoria, tipoInicial])

  const padresDisponibles = useMemo(() => {
    const editingId = modo === 'editar' && categoria ? categoria.id : null
    return todasCategorias.filter(
      (x) =>
        x.ambito === ambito &&
        x.tipo === tipo &&
        x.categoriaPadre == null &&
        (!editingId || x.id !== editingId),
    )
  }, [todasCategorias, ambito, tipo, modo, categoria])

  const nombrePadre = useMemo(() => {
    if (!categoriaPadreId) return null
    return padresDisponibles.find((p) => p.id === categoriaPadreId)?.nombre ?? null
  }, [categoriaPadreId, padresDisponibles])

  const nombreCuenta = useMemo(() => {
    if (!cuentaPersonalId) return null
    return cuentasPropias.find((c) => String(c.id) === cuentaPersonalId)?.nombre ?? null
  }, [cuentaPersonalId, cuentasPropias])

  async function handleGuardar() {
    const trim = nombre.trim()
    if (!trim) {
      setErrorMsg('Indica un nombre.')
      return
    }
    setGuardando(true)
    setErrorMsg(null)
    try {
      if (modo === 'crear') {
        await catalogosApi.createCategoria({
          nombre: trim,
          tipo,
          ambito,
          es_inversion: esInversion,
          cuenta_personal:
            ambito === 'PERSONAL' && cuentaPersonalId ? Number(cuentaPersonalId) : null,
          categoria_padre: categoriaPadreId ? Number(categoriaPadreId) : null,
        })
      } else if (categoria) {
        await catalogosApi.updateCategoria(Number(categoria.id), {
          nombre: trim,
          tipo,
          es_inversion: esInversion,
          cuenta_personal:
            ambito === 'PERSONAL' ? (cuentaPersonalId ? Number(cuentaPersonalId) : null) : null,
          categoria_padre: categoriaPadreId ? Number(categoriaPadreId) : null,
        })
      }
      await queryClient.invalidateQueries({ queryKey: ['categorias'] })
      onClose()
    } catch (e: unknown) {
      setErrorMsg(apiErrorMessage(e) || 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  function SegmentedTipo() {
    return (
      <View className="flex-row rounded-xl border border-border overflow-hidden mb-4">
        <TouchableOpacity
          onPress={() => setTipo('EGRESO')}
          className={`flex-1 py-3 items-center ${tipo === 'EGRESO' ? 'bg-dark' : 'bg-white'}`}
        >
          <Text className={`font-semibold text-sm ${tipo === 'EGRESO' ? 'text-white' : 'text-dark'}`}>
            Egreso
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTipo('INGRESO')}
          className={`flex-1 py-3 items-center ${tipo === 'INGRESO' ? 'bg-dark' : 'bg-white'}`}
        >
          <Text className={`font-semibold text-sm ${tipo === 'INGRESO' ? 'text-white' : 'text-dark'}`}>
            Ingreso
          </Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <KeyboardAvoidingView
        className="flex-1 bg-surface"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ paddingTop: insets.top }}
      >
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-border bg-white">
          <TouchableOpacity onPress={onClose} disabled={guardando}>
            <Text className="text-dark font-semibold">Cancelar</Text>
          </TouchableOpacity>
          <Text className="text-dark font-bold text-base">
            {modo === 'crear' ? 'Nueva categoría' : 'Editar categoría'}
          </Text>
          <TouchableOpacity onPress={() => void handleGuardar()} disabled={guardando}>
            {guardando ? (
              <ActivityIndicator />
            ) : (
              <Text className="text-accent font-bold">Guardar</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          className="flex-1 px-4 pt-4"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          <Text className="text-xs text-muted font-semibold mb-1">Nombre</Text>
          <TextInput
            value={nombre}
            onChangeText={setNombre}
            placeholder="Nombre de la categoría"
            placeholderTextColor="#888884"
            className="border border-border rounded-xl px-3 py-3 text-dark bg-white mb-4"
          />

          <Text className="text-xs text-muted font-semibold mb-2">Tipo</Text>
          <SegmentedTipo />

          <View className="flex-row items-center justify-between py-2 mb-4 border-b border-border">
            <Text className="text-dark">Marcar como inversión</Text>
            <Switch value={esInversion} onValueChange={setEsInversion} />
          </View>

          <Text className="text-xs text-muted font-semibold mb-2">Categoría padre</Text>
          <TouchableOpacity
            onPress={() => setPickerPadreOpen(true)}
            className="border border-border rounded-xl px-3 py-3 bg-white mb-4"
          >
            <Text className={nombrePadre ? 'text-dark font-medium' : 'text-muted'}>
              {nombrePadre ?? 'Sin padre (categoría raíz)'}
            </Text>
          </TouchableOpacity>

          {ambito === 'PERSONAL' ? (
            <>
              <Text className="text-xs text-muted font-semibold mb-2">Cuenta personal</Text>
              <TouchableOpacity
                onPress={() => setPickerCuentaOpen(true)}
                className="border border-border rounded-xl px-3 py-3 bg-white mb-4"
              >
                <Text className={nombreCuenta ? 'text-dark font-medium' : 'text-muted'}>
                  {nombreCuenta ?? 'Sin cuenta'}
                </Text>
              </TouchableOpacity>
            </>
          ) : null}

          {errorMsg ? <Text className="text-danger text-sm mb-2">{errorMsg}</Text> : null}
        </ScrollView>

        {/* Picker padre */}
        <Modal visible={pickerPadreOpen} transparent animationType="fade">
          <View className="flex-1 justify-end">
            <Pressable className="flex-1 bg-black/50" onPress={() => setPickerPadreOpen(false)} />
            <View className="bg-white rounded-t-2xl max-h-[70%] pb-6">
              <Text className="text-center font-bold py-3 border-b border-border">Categoría padre</Text>
              <ScrollView className="max-h-96">
                <TouchableOpacity
                  onPress={() => {
                    setCategoriaPadreId('')
                    setPickerPadreOpen(false)
                  }}
                  className="px-4 py-4 border-b border-border"
                >
                  <Text className="text-dark">Sin padre</Text>
                </TouchableOpacity>
                {padresDisponibles.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => {
                      setCategoriaPadreId(p.id)
                      setPickerPadreOpen(false)
                    }}
                    className="px-4 py-4 border-b border-border"
                  >
                    <Text className="text-dark">{p.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Picker cuenta */}
        <Modal visible={pickerCuentaOpen} transparent animationType="fade">
          <View className="flex-1 justify-end">
            <Pressable className="flex-1 bg-black/50" onPress={() => setPickerCuentaOpen(false)} />
            <View className="bg-white rounded-t-2xl max-h-[70%] pb-6">
              <Text className="text-center font-bold py-3 border-b border-border">Cuenta personal</Text>
              <ScrollView className="max-h-96">
                <TouchableOpacity
                  onPress={() => {
                    setCuentaPersonalId('')
                    setPickerCuentaOpen(false)
                  }}
                  className="px-4 py-4 border-b border-border"
                >
                  <Text className="text-dark">Sin cuenta</Text>
                </TouchableOpacity>
                {cuentasPropias.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => {
                      setCuentaPersonalId(String(c.id))
                      setPickerCuentaOpen(false)
                    }}
                    className="px-4 py-4 border-b border-border"
                  >
                    <Text className="text-dark">{c.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  )
}
