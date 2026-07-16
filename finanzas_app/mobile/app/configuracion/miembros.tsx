import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { MobileShell } from '../../components/layout/MobileShell'
import { familiaApi, apiErrorMessage } from '@finanzas/shared/api'
import type { MiembroApi, InvitacionApi } from '@finanzas/shared/api/familia'
import { useAuth } from '../../context/AuthContext'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function rolLabel(rol: string): string {
  if (rol === 'ADMIN') return 'Admin'
  if (rol === 'LECTURA') return 'Lectura'
  return 'Miembro'
}

export default function MiembrosConfigScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const [miembros, setMiembros] = useState<MiembroApi[]>([])
  const [invitaciones, setInvitaciones] = useState<InvitacionApi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [emailInvitacion, setEmailInvitacion] = useState('')
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [mRes, iRes] = await Promise.all([
        familiaApi.getMiembros(),
        familiaApi.getInvitaciones(),
      ])
      setMiembros(mRes.data)
      setInvitaciones(iRes.data)
    } catch (e) {
      setError(apiErrorMessage(e, 'No se pudieron cargar los miembros.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { void cargar() }, [cargar]))

  const invitar = async () => {
    const email = emailInvitacion.trim().toLowerCase()
    if (!EMAIL_REGEX.test(email)) {
      setError('Ingresa un email válido.')
      return
    }
    setBusy(true)
    setError(null)
    setOkMsg(null)
    try {
      await familiaApi.createInvitacion(email)
      setEmailInvitacion('')
      setOkMsg(`Invitación enviada a ${email}.`)
      await cargar()
    } catch (e) {
      setError(apiErrorMessage(e, 'No se pudo enviar la invitación.'))
    } finally {
      setBusy(false)
    }
  }

  const cancelarInvitacion = (inv: InvitacionApi) => {
    Alert.alert('Cancelar invitación', `¿Cancelar la invitación a ${inv.email}?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Cancelar invitación',
        style: 'destructive',
        onPress: async () => {
          setBusy(true)
          setError(null)
          try {
            await familiaApi.deleteInvitacion(inv.id)
            await cargar()
          } catch (e) {
            setError(apiErrorMessage(e, 'No se pudo cancelar la invitación.'))
          } finally {
            setBusy(false)
          }
        },
      },
    ])
  }

  const cambiarRol = (m: MiembroApi) => {
    const opciones: MiembroApi['rol'][] = ['ADMIN', 'MIEMBRO', 'LECTURA']
    const labels: Record<string, string> = {
      ADMIN: 'Administrador',
      MIEMBRO: 'Miembro',
      LECTURA: 'Solo lectura',
    }
    Alert.alert(
      `Cambiar rol de ${m.nombre}`,
      'Elige el nuevo rol:',
      [
        ...opciones
          .filter((r) => r !== m.rol)
          .map((r) => ({
            text: labels[r],
            onPress: async () => {
              setBusy(true)
              setError(null)
              try {
                await familiaApi.patchMiembroRol(m.id, r)
                await cargar()
              } catch (e) {
                setError(apiErrorMessage(e, 'No se pudo cambiar el rol.'))
              } finally {
                setBusy(false)
              }
            },
          })),
        { text: 'Cancelar', style: 'cancel' },
      ],
    )
  }

  const quitarMiembro = (m: MiembroApi) => {
    Alert.alert(
      'Quitar miembro',
      `¿Quitar a ${m.nombre} de la familia?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar',
          style: 'destructive',
          onPress: async () => {
            setBusy(true)
            setError(null)
            try {
              await familiaApi.patchMiembroActivo(m.id, false)
              await cargar()
            } catch (e) {
              setError(apiErrorMessage(e, 'No se pudo quitar al miembro.'))
            } finally {
              setBusy(false)
            }
          },
        },
      ],
    )
  }

  const esAdmin = user?.rol === 'ADMIN'

  return (
    <MobileShell title="Miembros">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <TouchableOpacity onPress={() => router.back()} className="mb-3">
          <Text className="text-muted text-sm">← Volver</Text>
        </TouchableOpacity>

        {error && (
          <View className="p-3 bg-danger/10 border border-danger/30 rounded-xl mb-3">
            <Text className="text-danger text-sm">{error}</Text>
          </View>
        )}
        {okMsg && (
          <View className="p-3 bg-accent/20 border border-accent/30 rounded-xl mb-3">
            <Text className="text-dark text-sm">{okMsg}</Text>
          </View>
        )}

        {loading ? (
          <View className="py-12 items-center">
            <ActivityIndicator color="#c8f060" size="large" />
          </View>
        ) : (
          <>
            {/* Miembros */}
            <View className="bg-white border border-border rounded-xl p-4 mb-4">
              <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-3">
                Miembros ({miembros.length})
              </Text>
              {miembros.map((m) => (
                <View
                  key={m.id}
                  className="flex-row items-center justify-between py-3 border-b border-border"
                >
                  <View className="flex-1 mr-3">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-dark text-sm font-medium">{m.nombre}</Text>
                      <View className="bg-surface border border-border rounded-md px-1.5 py-0.5">
                        <Text className="text-muted text-[10px] font-semibold">
                          {rolLabel(m.rol)}
                        </Text>
                      </View>
                    </View>
                    <Text className="text-muted text-xs mt-0.5">{m.email}</Text>
                  </View>
                  {esAdmin && m.id !== user?.id && (
                    <View className="flex-row gap-2">
                      <TouchableOpacity onPress={() => cambiarRol(m)} disabled={busy}>
                        <Text className="text-muted text-xs">Rol</Text>
                      </TouchableOpacity>
                      {m.puede_quitar && (
                        <TouchableOpacity onPress={() => quitarMiembro(m)} disabled={busy}>
                          <Text className="text-danger text-xs">Quitar</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              ))}
            </View>

            {/* Invitaciones pendientes */}
            <View className="bg-white border border-border rounded-xl p-4 mb-4">
              <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-3">
                Invitaciones pendientes
              </Text>
              {invitaciones.length === 0 ? (
                <Text className="text-muted text-xs">No hay invitaciones pendientes.</Text>
              ) : (
                invitaciones.map((inv) => (
                  <View
                    key={inv.id}
                    className="flex-row items-center justify-between py-2.5 border-b border-border"
                  >
                    <View className="flex-1">
                      <Text className="text-dark text-sm">{inv.email}</Text>
                      <Text className="text-muted text-xs mt-0.5">
                        {new Date(inv.fecha_envio + 'T12:00:00').toLocaleDateString('es-CL', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </Text>
                    </View>
                    {esAdmin && (
                      <TouchableOpacity onPress={() => cancelarInvitacion(inv)} disabled={busy}>
                        <Text className="text-danger text-xs">Cancelar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </View>

            {/* Invitar */}
            {esAdmin && (
              <View className="bg-white border border-border rounded-xl p-4 mb-4">
                <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-2">
                  Invitar miembro
                </Text>
                <View className="flex-row gap-2">
                  <TextInput
                    value={emailInvitacion}
                    onChangeText={setEmailInvitacion}
                    placeholder="email@ejemplo.com"
                    placeholderTextColor="#a9a9a4"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    className="flex-1 border border-border rounded-lg px-3 py-2 text-dark text-sm"
                    onSubmitEditing={() => void invitar()}
                  />
                  <TouchableOpacity
                    onPress={() => void invitar()}
                    disabled={busy || !emailInvitacion.trim()}
                    className={`rounded-lg px-4 items-center justify-center ${
                      busy ? 'bg-border' : 'bg-dark'
                    }`}
                  >
                    {busy ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <Text className="text-white text-sm font-semibold">Invitar</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </MobileShell>
  )
}
