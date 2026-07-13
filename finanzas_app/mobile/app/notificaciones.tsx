import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect, useNavigation, useRouter } from 'expo-router'
import { apiErrorMessage, finanzasApi } from '@finanzas/shared/api'
import type { NotificacionUsuarioApi } from '@finanzas/shared/api/finanzas'
import { useConfig } from '@finanzas/shared/context/ConfigContext'
import {
  etiquetaDiferenciaCompensacion,
  montoNotifNum,
  parseCompensacionNotificacion,
} from '@finanzas/shared/utils/notificacionCompensacion'
import {
  linkPresupuestoNotificacion,
  parsePresupuestoNotificacion,
} from '@finanzas/shared/utils/notificacionPresupuesto'
import { MobileShell } from '../components/layout/MobileShell'
import { cerrarNotificaciones } from '../lib/navegacionNotificaciones'

function formatFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function CompensacionNotificacionResumen({
  compensacion,
  formatMonto,
}: {
  compensacion: NonNullable<ReturnType<typeof parseCompensacionNotificacion>>
  formatMonto: (n: number) => string
}) {
  return (
    <View className="bg-surface border border-border rounded-xl p-3 mb-3">
      <Text className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">
        Compensación entre las partes
      </Text>
      {compensacion.por_usuario.map((row) => {
        const pagado = montoNotifNum(row.pagado_efectivo)
        const deberia = montoNotifNum(row.gasto_prorrateado)
        const diff = montoNotifNum(row.diferencia)
        const { texto, tipo } = etiquetaDiferenciaCompensacion(diff, formatMonto)
        const color =
          tipo === 'debe' ? '#b91c1c' : tipo === 'recibe' ? '#15803d' : '#6b7280'
        return (
          <View key={row.usuario_id} className="mb-2">
            <Text className="text-dark text-sm font-semibold">{row.nombre}</Text>
            <Text className="text-muted text-xs leading-5">
              pagó {formatMonto(pagado)} — debería {formatMonto(deberia)} →{' '}
              <Text style={{ color, fontWeight: '600' }}>{texto}</Text>
            </Text>
          </View>
        )
      })}
      <View className="border-t border-border pt-2 mt-1">
        {compensacion.transferencias_sugeridas.length > 0 ? (
          compensacion.transferencias_sugeridas.map((tr) => (
            <Text
              key={`${tr.de_usuario_id}-${tr.a_usuario_id}`}
              className="text-dark text-sm leading-5 mb-1"
            >
              <Text className="font-bold">{tr.de_nombre}</Text>
              {' le transfiere '}
              <Text className="font-bold">{formatMonto(montoNotifNum(tr.monto))}</Text>
              {' a '}
              <Text className="font-bold">{tr.a_nombre}</Text>
            </Text>
          ))
        ) : (
          <Text className="text-muted text-sm">Sin transferencias sugeridas este mes</Text>
        )}
      </View>
    </View>
  )
}

function PresupuestoNotificacionResumen({
  presupuesto,
  formatMonto,
}: {
  presupuesto: NonNullable<ReturnType<typeof parsePresupuestoNotificacion>>
  formatMonto: (n: number) => string
}) {
  const gastado = montoNotifNum(presupuesto.gastado)
  const pres = montoNotifNum(presupuesto.monto_presupuestado)
  return (
    <View className="bg-surface border border-border rounded-xl p-3 mb-3">
      <Text className="text-[11px] font-bold text-muted uppercase tracking-wide mb-2">
        Presupuesto
      </Text>
      <Text className="text-dark text-sm leading-5 mb-1">
        {presupuesto.categoria_nombre} ({presupuesto.ambito === 'FAMILIAR' ? 'familiar' : 'personal'})
      </Text>
      <Text className="text-muted text-xs leading-5">
        {formatMonto(gastado)} de {formatMonto(pres)} ({presupuesto.porcentaje.toFixed(0)}%)
      </Text>
    </View>
  )
}

export default function NotificacionesScreen() {
  const router = useRouter()
  const navigation = useNavigation()
  const { formatMonto } = useConfig()
  const [items, setItems] = useState<NotificacionUsuarioApi[]>([])
  const [noLeidas, setNoLeidas] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [marcando, setMarcando] = useState(false)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const { data } = await finanzasApi.getNotificaciones()
      setItems(data.notificaciones)
      setNoLeidas(data.no_leidas)
    } catch (e) {
      setError(apiErrorMessage(e) || 'No se pudieron cargar las notificaciones.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const volver = useCallback(() => {
    cerrarNotificaciones(navigation, router)
  }, [navigation, router])

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        volver()
        return true
      })
      return () => sub.remove()
    }, [volver]),
  )

  const onRefresh = () => {
    setRefreshing(true)
    void cargar()
  }

  const marcarLeida = async (id: number) => {
    try {
      await finanzasApi.marcarNotificacionLeida(id)
      await cargar()
    } catch (e) {
      setError(apiErrorMessage(e) || 'No se pudo marcar como leída.')
    }
  }

  const marcarTodas = async () => {
    if (marcando || noLeidas === 0) return
    setMarcando(true)
    try {
      await finanzasApi.marcarTodasNotificacionesLeidas()
      await cargar()
    } catch (e) {
      setError(apiErrorMessage(e) || 'No se pudieron marcar todas como leídas.')
    } finally {
      setMarcando(false)
    }
  }

  return (
    <MobileShell title="Notificaciones">
      <TouchableOpacity onPress={volver} className="px-4 py-2">
        <Text className="text-muted text-sm">← Volver</Text>
      </TouchableOpacity>
      <ScrollView
        className="flex-1 px-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text className="text-sm text-muted mb-4">
          Avisos de compensación familiar y alertas cuando tus presupuestos alcanzan el umbral configurado.
        </Text>

        {noLeidas > 0 ? (
          <TouchableOpacity
            onPress={marcarTodas}
            disabled={marcando}
            className="bg-dark rounded-xl py-3 items-center mb-4"
          >
            <Text className="text-white font-medium">
              {marcando ? 'Marcando…' : `Marcar todas como leídas (${noLeidas})`}
            </Text>
          </TouchableOpacity>
        ) : null}

        {error ? <Text className="text-red-600 text-sm mb-3">{error}</Text> : null}

        {loading ? (
          <ActivityIndicator className="mt-8" />
        ) : items.length === 0 ? (
          <Text className="text-muted text-sm">No tienes notificaciones.</Text>
        ) : (
          items.map((n) => {
            const compensacion = parseCompensacionNotificacion(n.payload)
            const presupuesto = parsePresupuestoNotificacion(n.payload)
            const linkPresupuesto = presupuesto
              ? linkPresupuestoNotificacion(presupuesto, '/(tabs)/presupuesto')
              : null
            return (
            <View
              key={n.id}
              className={`border border-border rounded-xl p-4 mb-3 bg-card ${n.leida ? 'opacity-70' : ''}`}
            >
              <View className="flex-row justify-between gap-2 mb-2">
                <Text className="font-semibold text-base flex-1">{n.titulo}</Text>
                <Text className="text-xs text-muted">{formatFecha(n.creado_at)}</Text>
              </View>
              <Text className="text-sm text-foreground leading-5 mb-3">{n.mensaje}</Text>
              {compensacion ? (
                <CompensacionNotificacionResumen
                  compensacion={compensacion}
                  formatMonto={formatMonto}
                />
              ) : null}
              {presupuesto ? (
                <PresupuestoNotificacionResumen
                  presupuesto={presupuesto}
                  formatMonto={formatMonto}
                />
              ) : null}
              {linkPresupuesto ? (
                <TouchableOpacity
                  onPress={() => router.push(linkPresupuesto as never)}
                  className="mb-3"
                >
                  <Text className="text-muted text-xs">Ver presupuesto del mes →</Text>
                </TouchableOpacity>
              ) : null}
              {compensacion && n.payload?.mes && n.payload?.anio ? (
                <TouchableOpacity
                  onPress={() =>
                    router.push(
                      `/(tabs)/liquidacion?mes=${n.payload.mes}&anio=${n.payload.anio}` as never
                    )
                  }
                  className="mb-3"
                >
                  <Text className="text-muted text-xs">Ver resumen común del mes →</Text>
                </TouchableOpacity>
              ) : null}
              {!n.leida ? (
                <TouchableOpacity
                  onPress={() => marcarLeida(n.id)}
                  className="self-start border border-border rounded-lg px-3 py-1"
                >
                  <Text className="text-xs">Marcar como leída</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            )
          })
        )}
      </ScrollView>
    </MobileShell>
  )
}
