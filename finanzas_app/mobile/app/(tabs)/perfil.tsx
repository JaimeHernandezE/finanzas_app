import { useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../context/AuthContext'
import { MobileShell } from '../../components/layout/MobileShell'

function rolLabel(rol: string): string {
  if (rol === 'ADMIN') return 'Administrador'
  if (rol === 'LECTURA') return 'Solo lectura'
  return 'Miembro'
}

export default function PerfilScreen() {
  const router = useRouter()
  const { user, logout, updateNombre, changePassword } = useAuth()
  const [nombreEdit, setNombreEdit] = useState(user?.nombre ?? '')
  const [guardando, setGuardando] = useState(false)
  const [mensajeError, setMensajeError] = useState<string | null>(null)
  const [mensajeOk, setMensajeOk] = useState<string | null>(null)
  const [passwordNueva, setPasswordNueva] = useState('')
  const [passwordConfirmar, setPasswordConfirmar] = useState('')
  const [cambiandoPassword, setCambiandoPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordOk, setPasswordOk] = useState<string | null>(null)

  if (!user) {
    return (
      <MobileShell title="Perfil">
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-muted text-sm">No hay sesión iniciada.</Text>
          <TouchableOpacity
            onPress={() => router.replace('/(auth)/login' as never)}
            className="mt-4 bg-dark px-4 py-3 rounded-xl"
          >
            <Text className="text-white font-semibold">Ir al login</Text>
          </TouchableOpacity>
        </View>
      </MobileShell>
    )
  }

  const nombreTrim = nombreEdit.trim()
  const nombreCambiado = user.nombre.trim() !== nombreTrim
  const puedeGuardar = nombreTrim.length > 0 && nombreCambiado && !guardando
  const inicial = user.nombre.trim().charAt(0).toUpperCase() || '?'

  const handleGuardar = async () => {
    if (!puedeGuardar) return
    setGuardando(true)
    setMensajeError(null)
    setMensajeOk(null)
    try {
      await updateNombre(nombreTrim)
      setMensajeOk('Nombre actualizado.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo actualizar el nombre.'
      setMensajeError(msg)
    } finally {
      setGuardando(false)
    }
  }

  const handleCambiarPassword = async () => {
    setPasswordError(null)
    setPasswordOk(null)
    if (passwordNueva.trim().length < 6) {
      setPasswordError('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (passwordNueva !== passwordConfirmar) {
      setPasswordError('La confirmación no coincide con la nueva contraseña.')
      return
    }
    setCambiandoPassword(true)
    try {
      await changePassword(passwordNueva)
      setPasswordNueva('')
      setPasswordConfirmar('')
      setPasswordOk('Contraseña actualizada correctamente.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.'
      setPasswordError(msg)
    } finally {
      setCambiandoPassword(false)
    }
  }

  return (
    <MobileShell title="Perfil">
      <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ padding: 20, paddingBottom: 28 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          className="self-start rounded-lg border border-border px-3 py-2 mb-4"
        >
          <Text className="text-dark text-xs font-semibold">← Volver</Text>
        </TouchableOpacity>

        <View className="bg-white border border-border rounded-xl p-5 items-center mb-4">
          <View className="w-16 h-16 rounded-full bg-dark items-center justify-center mb-3">
            <Text className="text-accent text-xl font-bold">{inicial}</Text>
          </View>
          <Text className="text-dark font-bold text-lg">{user.nombre}</Text>
          <Text className="text-muted text-sm mt-1">{user.email}</Text>
          <View className="mt-3 px-3 py-1.5 rounded-full bg-dark/10 border border-dark/20">
            <Text className="text-dark text-xs font-semibold">{rolLabel(user.rol)}</Text>
          </View>
        </View>

        <View className="bg-white border border-border rounded-xl p-4 mb-4">
          <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-3">Información</Text>
          <Text className="text-xs text-muted font-semibold mb-1">Nombre</Text>
          <TextInput
            value={nombreEdit}
            onChangeText={setNombreEdit}
            className="border border-border rounded-lg px-3 py-2.5 text-dark mb-3"
          />
          <TouchableOpacity
            disabled={!puedeGuardar}
            onPress={handleGuardar}
            className={`rounded-xl py-3 items-center ${puedeGuardar ? 'bg-dark' : 'bg-border'}`}
          >
            {guardando ? (
              <ActivityIndicator color={puedeGuardar ? '#ffffff' : '#666666'} />
            ) : (
              <Text className={`font-semibold ${puedeGuardar ? 'text-white' : 'text-muted'}`}>Guardar</Text>
            )}
          </TouchableOpacity>
          {mensajeError && <Text className="text-danger text-xs mt-2">{mensajeError}</Text>}
          {mensajeOk && <Text className="text-success text-xs mt-2">{mensajeOk}</Text>}
        </View>

        <View className="bg-white border border-border rounded-xl p-4 mb-4">
          <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-3">Seguridad</Text>
          <TextInput
            value={passwordNueva}
            onChangeText={setPasswordNueva}
            secureTextEntry
            placeholder="Nueva contraseña"
            placeholderTextColor="#888884"
            className="border border-border rounded-lg px-3 py-2.5 text-dark mb-3"
          />
          <TextInput
            value={passwordConfirmar}
            onChangeText={setPasswordConfirmar}
            secureTextEntry
            placeholder="Confirmar contraseña"
            placeholderTextColor="#888884"
            className="border border-border rounded-lg px-3 py-2.5 text-dark mb-3"
          />
          <TouchableOpacity
            disabled={cambiandoPassword}
            onPress={handleCambiarPassword}
            className="rounded-xl py-3 items-center bg-dark"
          >
            {cambiandoPassword ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-white font-semibold">Cambiar contraseña</Text>
            )}
          </TouchableOpacity>
          {passwordError && <Text className="text-danger text-xs mt-2">{passwordError}</Text>}
          {passwordOk && <Text className="text-success text-xs mt-2">{passwordOk}</Text>}
        </View>

        <View className="bg-white border border-border rounded-xl p-4">
          <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-3">Sesión</Text>
          <TouchableOpacity onPress={() => void logout()} className="rounded-xl py-3 items-center border border-border">
            <Text className="text-dark font-semibold">Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </MobileShell>
  )
}
