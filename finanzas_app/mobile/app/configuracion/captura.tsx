import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { MobileShell } from '../../components/layout/MobileShell'
import { pendientesApi, apiErrorMessage } from '@finanzas/shared/api'

interface CapturaCorreoConfig {
  conectado: boolean
  proveedor: 'GMAIL' | 'OUTLOOK'
  email: string
  remitentes_banco: string[]
  intervalo_minutos: number
  notificaciones_activas: boolean
  ultimo_sync_at: string | null
  ultimo_error: string
  intervalo_minimo_permitido: number
}

interface VinculoEstado {
  telegram_vinculado: boolean
  whatsapp_vinculado: boolean
  whatsapp_phone: string
  telegram_chat_id_presente: boolean
}

export default function CapturaConfigScreen() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [estado, setEstado] = useState<VinculoEstado | null>(null)
  const [codigoTg, setCodigoTg] = useState<string | null>(null)
  const [codigoWa, setCodigoWa] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [correo, setCorreo] = useState<CapturaCorreoConfig | null>(null)
  const [remitentes, setRemitentes] = useState<string[]>([])
  const [remitenteNuevo, setRemitenteNuevo] = useState('')
  const [intervalo, setIntervalo] = useState(15)
  const [notifActivas, setNotifActivas] = useState(true)

  const aplicarCorreo = (data: CapturaCorreoConfig) => {
    setCorreo(data)
    setRemitentes(data.remitentes_banco || [])
    setIntervalo(data.intervalo_minutos)
    setNotifActivas(data.notificaciones_activas)
  }

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [vinculo, correoRes] = await Promise.all([
        pendientesApi.estadoVinculo(),
        pendientesApi.getCorreo(),
      ])
      setEstado(vinculo.data)
      aplicarCorreo(correoRes.data)
    } catch (e) {
      setError(apiErrorMessage(e, 'No se pudo cargar la configuración.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const generar = async (canal: 'TELEGRAM' | 'WHATSAPP') => {
    setBusy(true)
    setError(null)
    setOkMsg(null)
    try {
      const { data } = await pendientesApi.generarVinculo(canal)
      if (canal === 'TELEGRAM') setCodigoTg(data.codigo)
      else setCodigoWa(data.codigo)
    } catch (e) {
      setError(apiErrorMessage(e, 'No se pudo generar el código.'))
    } finally {
      setBusy(false)
    }
  }

  const agregarRemitente = () => {
    const s = remitenteNuevo.trim().toLowerCase()
    if (!s || !s.includes('@')) {
      setError('El remitente debe ser un email o un dominio con @ (ej. @bci.cl).')
      return
    }
    if (remitentes.includes(s)) {
      setRemitenteNuevo('')
      return
    }
    setRemitentes([...remitentes, s])
    setRemitenteNuevo('')
    setError(null)
  }

  const guardarPrefs = async () => {
    setBusy(true)
    setError(null)
    setOkMsg(null)
    try {
      const { data } = await pendientesApi.updateCorreoPrefs({
        remitentes_banco: remitentes,
        intervalo_minutos: intervalo,
        notificaciones_activas: notifActivas,
      })
      aplicarCorreo(data)
      setOkMsg('Preferencias guardadas.')
    } catch (e) {
      setError(apiErrorMessage(e, 'No se pudieron guardar las preferencias.'))
    } finally {
      setBusy(false)
    }
  }

  const desconectarCorreo = async () => {
    setBusy(true)
    setError(null)
    setOkMsg(null)
    try {
      const { data } = await pendientesApi.desconectarCorreo()
      aplicarCorreo(data)
      setOkMsg('Correo desconectado.')
    } catch (e) {
      setError(apiErrorMessage(e, 'No se pudo desconectar.'))
    } finally {
      setBusy(false)
    }
  }

  const copiarCodigo = (codigo: string) => {
    Clipboard.setString(`/vincular ${codigo}`)
    Alert.alert('Copiado', `/vincular ${codigo} copiado al portapapeles.`)
  }

  const INTERVALOS = [5, 10, 15, 30, 60]
  const minIntervalo = correo?.intervalo_minimo_permitido ?? 5

  if (loading) {
    return (
      <MobileShell title="Captura">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#c8f060" size="large" />
        </View>
      </MobileShell>
    )
  }

  return (
    <MobileShell title="Captura">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <TouchableOpacity onPress={() => router.back()} className="mb-3">
          <Text className="text-muted text-sm">← Volver</Text>
        </TouchableOpacity>

        <Text className="text-xs text-muted mb-4 leading-4">
          Conecta tu correo y registra los remitentes de tu banco. Confirma pendientes en{' '}
          <Text className="font-semibold">Pendientes</Text>.
        </Text>

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

        {/* Correo bancario */}
        <View className="bg-white border border-border rounded-xl p-4 mb-4">
          <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-2">
            Correo bancario
          </Text>
          <Text className="text-dark text-xs mb-3 leading-4">
            Conecta Gmail u Outlook. La conexión OAuth se realiza desde la versión web
            (Configuración → Captura).
          </Text>

          {correo?.conectado ? (
            <>
              <View className="flex-row items-center gap-2 mb-2">
                <View className="w-2 h-2 rounded-full bg-success" />
                <Text className="text-dark text-sm font-medium">
                  {correo.proveedor === 'GMAIL' ? 'Gmail' : 'Outlook'} · {correo.email}
                </Text>
              </View>
              {correo.ultimo_sync_at && (
                <Text className="text-muted text-xs mb-2">
                  Última sync: {new Date(correo.ultimo_sync_at).toLocaleString('es-CL')}
                </Text>
              )}
              {correo.ultimo_error ? (
                <Text className="text-danger text-xs mb-2">{correo.ultimo_error}</Text>
              ) : null}
              <TouchableOpacity
                onPress={() => void desconectarCorreo()}
                disabled={busy}
                className="rounded-xl py-2.5 items-center border border-border mt-1"
              >
                <Text className="text-muted font-semibold text-sm">Desconectar</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View className="bg-surface rounded-lg p-3">
              <Text className="text-muted text-xs leading-4">
                No conectado. Conéctalo desde la versión web (Configuración → Captura)
                para autorizar Gmail u Outlook con OAuth.
              </Text>
            </View>
          )}
        </View>

        {/* Remitentes */}
        <View className="bg-white border border-border rounded-xl p-4 mb-4">
          <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-2">
            Remitentes de bancos
          </Text>
          <Text className="text-dark text-xs mb-3 leading-4">
            Ej. alertas@bci.cl o @santander.cl. Solo estos correos generan pendientes.
          </Text>
          <View className="flex-row gap-2 mb-3">
            <TextInput
              value={remitenteNuevo}
              onChangeText={setRemitenteNuevo}
              placeholder="alertas@banco.cl"
              placeholderTextColor="#a9a9a4"
              keyboardType="email-address"
              autoCapitalize="none"
              className="flex-1 border border-border rounded-lg px-3 py-2 text-dark text-sm"
              onSubmitEditing={agregarRemitente}
            />
            <TouchableOpacity
              onPress={agregarRemitente}
              className="bg-dark rounded-lg px-4 items-center justify-center"
            >
              <Text className="text-white text-sm font-semibold">+</Text>
            </TouchableOpacity>
          </View>
          {remitentes.length === 0 ? (
            <Text className="text-muted text-xs">Aún no hay remitentes.</Text>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {remitentes.map((r) => (
                <View key={r} className="flex-row items-center bg-surface border border-border rounded-lg px-3 py-1.5">
                  <Text className="text-dark text-xs mr-2">{r}</Text>
                  <TouchableOpacity onPress={() => setRemitentes(remitentes.filter((x) => x !== r))}>
                    <Text className="text-muted text-sm">×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Intervalo y notificaciones */}
        <View className="bg-white border border-border rounded-xl p-4 mb-4">
          <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-2">
            Preferencias
          </Text>

          <Text className="text-dark text-xs mb-2">Tasa de refresco</Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {INTERVALOS.filter((n) => n >= minIntervalo).map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => setIntervalo(n)}
                className={`px-3 py-2 rounded-lg border ${
                  intervalo === n ? 'bg-accent border-accent' : 'bg-surface border-border'
                }`}
              >
                <Text className={`text-xs font-medium ${intervalo === n ? 'text-dark' : 'text-muted'}`}>
                  {n} min
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-dark text-sm flex-1 mr-3">Avisarme al recibir pendiente</Text>
            <Switch value={notifActivas} onValueChange={setNotifActivas} />
          </View>

          <TouchableOpacity
            onPress={() => void guardarPrefs()}
            disabled={busy}
            className={`rounded-xl py-3 items-center ${busy ? 'bg-border' : 'bg-dark'}`}
          >
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-white font-semibold">Guardar preferencias</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Telegram */}
        <View className="bg-white border border-border rounded-xl p-4 mb-4">
          <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-2">
            Telegram
          </Text>
          <View className="flex-row items-center gap-2 mb-3">
            <View className={`w-2 h-2 rounded-full ${estado?.telegram_vinculado ? 'bg-success' : 'bg-muted/40'}`} />
            <Text className="text-dark text-sm">
              {estado?.telegram_vinculado ? 'Vinculado' : 'No vinculado'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => void generar('TELEGRAM')}
            disabled={busy}
            className={`rounded-xl py-2.5 items-center ${busy ? 'bg-border' : 'bg-dark'}`}
          >
            <Text className="text-white font-semibold text-sm">Generar código</Text>
          </TouchableOpacity>
          {codigoTg && (
            <TouchableOpacity
              onPress={() => copiarCodigo(codigoTg)}
              className="mt-3 p-3 bg-surface rounded-lg"
            >
              <Text className="text-dark text-sm font-mono">
                /vincular {codigoTg}
              </Text>
              <Text className="text-muted text-xs mt-1">Toca para copiar</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* WhatsApp */}
        <View className="bg-white border border-border rounded-xl p-4 mb-4">
          <Text className="text-xs text-muted uppercase font-semibold tracking-wide mb-2">
            WhatsApp
          </Text>
          <View className="flex-row items-center gap-2 mb-3">
            <View className={`w-2 h-2 rounded-full ${estado?.whatsapp_vinculado ? 'bg-success' : 'bg-muted/40'}`} />
            <Text className="text-dark text-sm">
              {estado?.whatsapp_vinculado
                ? `Vinculado${estado.whatsapp_phone ? ` (${estado.whatsapp_phone})` : ''}`
                : 'No vinculado'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => void generar('WHATSAPP')}
            disabled={busy}
            className={`rounded-xl py-2.5 items-center ${busy ? 'bg-border' : 'bg-dark'}`}
          >
            <Text className="text-white font-semibold text-sm">Generar código</Text>
          </TouchableOpacity>
          {codigoWa && (
            <TouchableOpacity
              onPress={() => copiarCodigo(codigoWa)}
              className="mt-3 p-3 bg-surface rounded-lg"
            >
              <Text className="text-dark text-sm font-mono">
                /vincular {codigoWa}
              </Text>
              <Text className="text-muted text-xs mt-1">Toca para copiar</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </MobileShell>
  )
}
