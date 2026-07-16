import { useCallback, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MobileShell } from '../../components/layout/MobileShell'
import { finanzasApi, apiErrorMessage } from '@finanzas/shared/api'
import type { AsistenteHistorialItem } from '@finanzas/shared/api/finanzas'

const MAX_HISTORIAL = 8

const EJEMPLOS = [
  '¿Cómo voy con mis presupuestos este mes?',
  '¿Me avisaste alguna alerta de presupuesto?',
  '¿Cómo cerramos el mes pasado en el común?',
]

type MensajeChat = {
  id: string
  role: 'user' | 'assistant'
  content: string
  herramientas?: string[]
  sugerencias?: string[]
}

let _seqId = 0
function uid(): string {
  return `m-${++_seqId}-${Math.random().toString(36).slice(2, 6)}`
}

export default function AsistenteScreen() {
  const insets = useSafeAreaInsets()
  const [mensajes, setMensajes] = useState<MensajeChat[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listaRef = useRef<FlatList<MensajeChat>>(null)

  const scrollAlFinal = () => {
    setTimeout(() => {
      listaRef.current?.scrollToEnd({ animated: true })
    }, 100)
  }

  const enviar = useCallback(
    async (mensajeRaw: string) => {
      const mensaje = mensajeRaw.trim()
      if (!mensaje || enviando) return

      setError(null)
      setTexto('')
      const userMsg: MensajeChat = { id: uid(), role: 'user', content: mensaje }
      setMensajes((prev) => [...prev, userMsg])
      setEnviando(true)
      scrollAlFinal()

      const historial: AsistenteHistorialItem[] = [...mensajes, userMsg]
        .slice(-MAX_HISTORIAL)
        .map((m) => ({ role: m.role, content: m.content }))
      const historialPrevio = historial.slice(0, -1)

      try {
        const { data } = await finanzasApi.consultarAsistente(mensaje, historialPrevio)
        const asistenteMsg: MensajeChat = {
          id: uid(),
          role: 'assistant',
          content: data.respuesta,
          herramientas: data.herramientas_usadas?.length ? data.herramientas_usadas : undefined,
          sugerencias: data.sugerencias_seguimiento?.length
            ? data.sugerencias_seguimiento
            : undefined,
        }
        setMensajes((prev) => [...prev, asistenteMsg])
        scrollAlFinal()
      } catch (err) {
        setError(apiErrorMessage(err))
      } finally {
        setEnviando(false)
      }
    },
    [enviando, mensajes],
  )

  const chips =
    mensajes.length === 0
      ? EJEMPLOS
      : mensajes[mensajes.length - 1]?.sugerencias ?? []

  const renderMensaje = ({ item: m }: { item: MensajeChat }) => {
    const isUser = m.role === 'user'
    return (
      <View className={`px-4 mb-3 ${isUser ? 'items-end' : 'items-start'}`}>
        <View
          className={`max-w-[85%] rounded-2xl px-4 py-3 ${
            isUser ? 'bg-dark' : 'bg-white border border-border'
          }`}
        >
          <Text className={`text-sm leading-5 ${isUser ? 'text-white' : 'text-dark'}`}>
            {m.content}
          </Text>
          {m.herramientas && m.herramientas.length > 0 && (
            <View className="flex-row flex-wrap gap-1 mt-2">
              {m.herramientas.map((t) => (
                <View key={t} className="bg-accent/20 px-2 py-0.5 rounded-md">
                  <Text className="text-[10px] text-dark/70">{t}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    )
  }

  return (
    <MobileShell title="Asistente">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {mensajes.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-2xl mb-2">💬</Text>
            <Text className="text-dark font-bold text-base mb-1 text-center">
              Asistente financiero
            </Text>
            <Text className="text-muted text-xs text-center leading-4">
              Preguntas en lenguaje natural sobre tus presupuestos, gastos y alertas.
              No crea ni modifica movimientos.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listaRef}
            data={mensajes}
            keyExtractor={(m) => m.id}
            renderItem={renderMensaje}
            contentContainerStyle={{ paddingTop: 12, paddingBottom: 8 }}
            onContentSizeChange={() => scrollAlFinal()}
          />
        )}

        {enviando && (
          <View className="px-4 pb-2 flex-row items-center gap-2">
            <ActivityIndicator color="#c8f060" size="small" />
            <Text className="text-muted text-xs">Consultando…</Text>
          </View>
        )}

        {error && (
          <View className="mx-4 mb-2 p-3 bg-danger/10 border border-danger/30 rounded-xl">
            <Text className="text-danger text-sm">{error}</Text>
          </View>
        )}

        {chips.length > 0 && !enviando && (
          <View className="px-4 pb-2">
            <View className="flex-row flex-wrap gap-2">
              {chips.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => void enviar(c)}
                  className="bg-surface border border-border rounded-xl px-3 py-2"
                >
                  <Text className="text-dark text-xs">{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View
          className="flex-row items-end gap-2 px-4 pt-2 pb-2 border-t border-border bg-white"
          style={{ paddingBottom: Math.max(insets.bottom, 8) + 80 }}
        >
          <TextInput
            className="flex-1 border border-border rounded-xl px-3 py-2 text-sm text-dark bg-surface min-h-[40px] max-h-[100px]"
            value={texto}
            onChangeText={setTexto}
            placeholder="Ej.: ¿Cómo voy con el presupuesto?"
            placeholderTextColor="#a9a9a4"
            multiline
            maxLength={2000}
            editable={!enviando}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={() => void enviar(texto)}
          />
          <TouchableOpacity
            onPress={() => void enviar(texto)}
            disabled={!texto.trim() || enviando}
            className={`w-10 h-10 rounded-xl items-center justify-center ${
              texto.trim() && !enviando ? 'bg-accent' : 'bg-muted/30'
            }`}
          >
            <Text className={`text-lg ${texto.trim() && !enviando ? 'text-dark' : 'text-muted'}`}>
              ↑
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </MobileShell>
  )
}
