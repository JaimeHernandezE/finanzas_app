import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { MobileShell } from '../../components/layout/MobileShell'
import { finanzasApi, apiErrorMessage } from '@finanzas/shared/api'
import type { CuentaPersonalApi } from '@finanzas/shared/api/finanzas'

function cuentaPersonalPrimero(a: CuentaPersonalApi, b: CuentaPersonalApi) {
  const aP = a.nombre.trim().toLowerCase() === 'personal'
  const bP = b.nombre.trim().toLowerCase() === 'personal'
  if (aP && !bP) return -1
  if (!aP && bP) return 1
  return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
}

export default function CuentasConfigScreen() {
  const router = useRouter()
  const [cuentas, setCuentas] = useState<CuentaPersonalApi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editDescripcion, setEditDescripcion] = useState('')
  const [editVisible, setEditVisible] = useState(false)

  const [adding, setAdding] = useState(false)
  const [addNombre, setAddNombre] = useState('')
  const [addDescripcion, setAddDescripcion] = useState('')
  const [addVisible, setAddVisible] = useState(false)

  const propias = useMemo(
    () => cuentas.filter((c) => c.es_propia).sort(cuentaPersonalPrimero),
    [cuentas],
  )
  const tuteladas = useMemo(
    () => cuentas.filter((c) => !c.es_propia),
    [cuentas],
  )

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await finanzasApi.getCuentasPersonales()
      setCuentas(data)
    } catch (e) {
      setError(apiErrorMessage(e, 'No se pudieron cargar las cuentas.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { void cargar() }, [cargar]))

  const startEdit = (c: CuentaPersonalApi) => {
    setEditingId(c.id)
    setEditNombre(c.nombre)
    setEditDescripcion(c.descripcion || '')
    setEditVisible(c.visible_familia)
    setAdding(false)
    setError(null)
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async () => {
    if (!editingId || !editNombre.trim()) return
    setSaving(true)
    setError(null)
    try {
      await finanzasApi.updateCuentaPersonal(editingId, {
        nombre: editNombre.trim(),
        descripcion: editDescripcion.trim(),
        visible_familia: editVisible,
      })
      setEditingId(null)
      await cargar()
    } catch (e) {
      setError(apiErrorMessage(e, 'Error al guardar.'))
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = (c: CuentaPersonalApi) => {
    Alert.alert(
      'Eliminar cuenta',
      `¿Eliminar «${c.nombre}»? No se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setSaving(true)
            setError(null)
            try {
              await finanzasApi.deleteCuentaPersonal(c.id)
              await cargar()
            } catch (e) {
              setError(apiErrorMessage(e, 'No se pudo eliminar (¿tiene movimientos asociados?).'))
            } finally {
              setSaving(false)
            }
          },
        },
      ],
    )
  }

  const startAdd = () => {
    setAdding(true)
    setAddNombre('')
    setAddDescripcion('')
    setAddVisible(false)
    setEditingId(null)
    setError(null)
  }

  const cancelAdd = () => setAdding(false)

  const saveAdd = async () => {
    if (!addNombre.trim()) return
    setSaving(true)
    setError(null)
    try {
      await finanzasApi.createCuentaPersonal({
        nombre: addNombre.trim(),
        descripcion: addDescripcion.trim() || undefined,
        visible_familia: addVisible,
      })
      setAdding(false)
      await cargar()
    } catch (e) {
      setError(apiErrorMessage(e, 'Error al crear la cuenta.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <MobileShell title="Cuentas">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <TouchableOpacity onPress={() => router.back()} className="mb-3">
          <Text className="text-muted text-sm">← Volver</Text>
        </TouchableOpacity>

        {error && (
          <View className="p-3 bg-danger/10 border border-danger/30 rounded-xl mb-3">
            <Text className="text-danger text-sm">{error}</Text>
          </View>
        )}

        {loading ? (
          <View className="py-12 items-center">
            <ActivityIndicator color="#c8f060" size="large" />
          </View>
        ) : (
          <>
            {/* Mis cuentas */}
            <View className="bg-white border border-border rounded-xl p-4 mb-4">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-xs text-muted uppercase font-semibold tracking-wide">
                  Mis cuentas
                </Text>
                <TouchableOpacity onPress={startAdd} disabled={saving}>
                  <Text className="text-accent text-sm font-semibold bg-dark px-3 py-1 rounded-lg">
                    + Agregar
                  </Text>
                </TouchableOpacity>
              </View>

              {propias.length === 0 && !adding && (
                <Text className="text-muted text-xs leading-4">
                  Aún no tienes cuentas. Agrega una para organizar tus gastos (ej. «Personal», «Trabajo»).
                </Text>
              )}

              {propias.map((c) => {
                if (editingId === c.id) {
                  return (
                    <View key={c.id} className="border border-accent/40 bg-accent/5 rounded-xl p-3 mb-2">
                      <TextInput
                        value={editNombre}
                        onChangeText={setEditNombre}
                        placeholder="Nombre"
                        placeholderTextColor="#a9a9a4"
                        className="border border-border rounded-lg px-3 py-2 text-dark text-sm mb-2"
                      />
                      <TextInput
                        value={editDescripcion}
                        onChangeText={setEditDescripcion}
                        placeholder="Descripción (opcional)"
                        placeholderTextColor="#a9a9a4"
                        className="border border-border rounded-lg px-3 py-2 text-dark text-sm mb-2"
                      />
                      <View className="flex-row items-center justify-between mb-3">
                        <Text className="text-dark text-xs">Visible para familia</Text>
                        <Switch value={editVisible} onValueChange={setEditVisible} />
                      </View>
                      <View className="flex-row gap-2">
                        <TouchableOpacity
                          onPress={() => void saveEdit()}
                          disabled={saving}
                          className="flex-1 bg-dark rounded-xl py-2.5 items-center"
                        >
                          <Text className="text-white font-semibold text-sm">Guardar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={cancelEdit}
                          className="flex-1 border border-border rounded-xl py-2.5 items-center"
                        >
                          <Text className="text-muted font-semibold text-sm">Cancelar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )
                }

                return (
                  <View
                    key={c.id}
                    className="flex-row items-center justify-between py-3 border-b border-border"
                  >
                    <View className="flex-1 mr-3">
                      <Text className="text-dark text-sm font-medium">{c.nombre}</Text>
                      {c.descripcion ? (
                        <Text className="text-muted text-xs mt-0.5">{c.descripcion}</Text>
                      ) : null}
                    </View>
                    <View className="flex-row gap-3">
                      <TouchableOpacity onPress={() => startEdit(c)}>
                        <Text className="text-muted text-sm">Editar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => confirmDelete(c)}>
                        <Text className="text-danger text-sm">Borrar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )
              })}

              {adding && (
                <View className="border border-accent/40 bg-accent/5 rounded-xl p-3 mt-2">
                  <TextInput
                    value={addNombre}
                    onChangeText={setAddNombre}
                    placeholder="Nombre"
                    placeholderTextColor="#a9a9a4"
                    className="border border-border rounded-lg px-3 py-2 text-dark text-sm mb-2"
                    autoFocus
                  />
                  <TextInput
                    value={addDescripcion}
                    onChangeText={setAddDescripcion}
                    placeholder="Descripción (opcional)"
                    placeholderTextColor="#a9a9a4"
                    className="border border-border rounded-lg px-3 py-2 text-dark text-sm mb-2"
                  />
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-dark text-xs">Visible para familia</Text>
                    <Switch value={addVisible} onValueChange={setAddVisible} />
                  </View>
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={() => void saveAdd()}
                      disabled={saving}
                      className="flex-1 bg-dark rounded-xl py-2.5 items-center"
                    >
                      <Text className="text-white font-semibold text-sm">Crear</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={cancelAdd}
                      className="flex-1 border border-border rounded-xl py-2.5 items-center"
                    >
                      <Text className="text-muted font-semibold text-sm">Cancelar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Cuentas tuteladas */}
            <View className="bg-white border border-border rounded-xl p-4 mb-4">
              <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-2">
                Cuentas que tutelo
              </Text>
              <Text className="text-muted text-xs mb-3 leading-4">
                Cuentas de otros miembros donde te delegaron acceso.
              </Text>
              {tuteladas.length === 0 ? (
                <Text className="text-muted text-xs">No tutelas ninguna cuenta.</Text>
              ) : (
                tuteladas.map((c) => (
                  <View key={c.id} className="py-2.5 border-b border-border">
                    <Text className="text-dark text-sm font-medium">{c.nombre}</Text>
                    {c.duenio_nombre && (
                      <Text className="text-muted text-xs mt-0.5">({c.duenio_nombre})</Text>
                    )}
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </MobileShell>
  )
}
