import { useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { apiErrorMessage } from '@finanzas/shared/api'
import { MobileShell } from '../../components/layout/MobileShell'
import { useAuth } from '../../context/AuthContext'

export default function NotificacionesConfigScreen() {
  const router = useRouter()
  const { user, updatePreferencias } = useAuth()
  const [activa, setActiva] = useState(user?.notif_presupuesto_activa !== false)
  const [umbral, setUmbral] = useState(String(user?.notif_presupuesto_umbral_pct ?? 80))
  const [guardando, setGuardando] = useState(false)
  const [mensajeOk, setMensajeOk] = useState<string | null>(null)
  const [mensajeError, setMensajeError] = useState<string | null>(null)

  const handleGuardar = async () => {
    if (guardando) return
    const umbralNum = Number(umbral)
    if (!Number.isFinite(umbralNum) || umbralNum < 50 || umbralNum > 100) {
      setMensajeError('El umbral debe estar entre 50 y 100.')
      setMensajeOk(null)
      return
    }
    setGuardando(true)
    setMensajeOk(null)
    setMensajeError(null)
    try {
      await updatePreferencias({
        notif_presupuesto_activa: activa,
        notif_presupuesto_umbral_pct: Math.round(umbralNum),
      })
      setMensajeOk('Preferencias guardadas.')
    } catch (e) {
      setMensajeError(apiErrorMessage(e) || 'No se pudieron guardar las preferencias.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <MobileShell title="Notificaciones">
      <TouchableOpacity onPress={() => router.back()} className="px-4 py-2">
        <Text className="text-muted text-sm">← Volver</Text>
      </TouchableOpacity>
      <ScrollView className="flex-1 px-4 pb-8">
        <Text className="text-sm text-muted mb-4 leading-5">
          Configura cuándo recibir avisos in-app sobre el avance de tus presupuestos.
          También recibirás un aviso al superar el 100% si tu umbral es menor.
        </Text>

        <View className="bg-white border border-border rounded-xl p-4 mb-4">
          <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-2">
            Alertas de presupuesto
          </Text>
          <Text className="text-dark text-sm mb-3 leading-5">
            Avisa cuando una categoría con presupuesto alcance el porcentaje configurado.
          </Text>
          <View className="flex-row items-center justify-between">
            <Text className="text-dark text-sm">{activa ? 'Activadas' : 'Desactivadas'}</Text>
            <Switch value={activa} onValueChange={setActiva} />
          </View>
        </View>

        <View className="bg-white border border-border rounded-xl p-4 mb-4">
          <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-2">
            Umbral de aviso
          </Text>
          <Text className="text-dark text-sm mb-3 leading-5">
            Porcentaje de gasto vs presupuesto mensual por categoría (50–100%).
          </Text>
          <View className="flex-row items-center gap-2">
            <TextInput
              value={umbral}
              onChangeText={setUmbral}
              keyboardType="number-pad"
              editable={activa}
              className="flex-1 border border-border rounded-lg px-3 py-2 text-dark"
            />
            <Text className="text-muted">%</Text>
          </View>
        </View>

        <TouchableOpacity
          disabled={guardando}
          onPress={() => void handleGuardar()}
          className={`rounded-xl py-3 items-center mb-3 ${guardando ? 'bg-border' : 'bg-dark'}`}
        >
          {guardando ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-white font-semibold">Guardar preferencias</Text>
          )}
        </TouchableOpacity>

        {mensajeOk ? <Text className="text-success text-sm mb-2">{mensajeOk}</Text> : null}
        {mensajeError ? <Text className="text-danger text-sm mb-2">{mensajeError}</Text> : null}

        <TouchableOpacity onPress={() => router.push('/notificaciones' as never)} className="mt-2">
          <Text className="text-muted text-sm">Ver notificaciones recibidas →</Text>
        </TouchableOpacity>
      </ScrollView>
    </MobileShell>
  )
}
