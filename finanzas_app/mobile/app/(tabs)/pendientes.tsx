import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MobileShell } from '../../components/layout/MobileShell'
import { useConfig } from '@finanzas/shared/context/ConfigContext'
import { useCategorias, useMetodosPago, useTarjetas } from '@finanzas/shared/hooks/useCatalogos'
import { pendientesApi, apiErrorMessage, finanzasApi } from '@finanzas/shared/api'
import type { CuentaPersonalApi } from '@finanzas/shared/api/finanzas'
import type { MovimientoPendienteApi, ConfirmarPendienteBody } from '@finanzas/shared/api/pendientes'

type EditState = {
  ambito: 'PERSONAL' | 'COMUN'
  cuenta: number | ''
  categoria: number | ''
  metodo_pago: number | ''
  tarjeta: number | ''
  comercio: string
  num_cuotas: string
}

type CategoriaOpt = {
  id: number
  nombre: string
  tipo: string
  es_padre?: boolean
  cuenta_personal?: number | null
}

const ORIGEN_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  WHATSAPP:    { label: 'Otro',      bg: '#e5e7eb', color: '#4b5563' },
  TELEGRAM:    { label: 'Otro',      bg: '#e5e7eb', color: '#4b5563' },
  EMAIL_BANCO: { label: 'Correo',    bg: '#fef3c7', color: '#92400e' },
  MANUAL:      { label: 'Manual',    bg: '#f3f4f6', color: '#6b7280' },
}

function formatFechaHora(fecha: string, hora: string | null | undefined): string {
  if (!hora) return fecha || 'Sin fecha'
  return `${fecha} · ${hora.slice(0, 5)}`
}

function etiquetaBanco(banco: string | null | undefined): string {
  const raw = (banco || '').trim()
  if (!raw) return ''
  const map: Record<string, string> = {
    BCI: 'BCI',
    SANTANDER: 'Santander',
    BANCOESTADO: 'BancoEstado',
    GENERICO: '',
  }
  const upper = raw.toUpperCase()
  if (upper in map) return map[upper]
  return raw
}

function metaTarjetaBanco(p: MovimientoPendienteApi): string {
  const ultimos4 = p.ultimos_4 || p.tarjeta_sugerida_ultimos_4 || ''
  const banco = etiquetaBanco(p.banco || p.tarjeta_sugerida_banco)
  const partes: string[] = []
  if (ultimos4) partes.push(`···${ultimos4}`)
  if (banco) partes.push(banco)
  return partes.length ? ` · ${partes.join(' · ')}` : ''
}

function comentarioDesdeEdit(e: EditState, hora: string | null | undefined): string {
  const partes = [e.comercio.trim()]
  if (hora) partes.push(hora.slice(0, 5))
  return partes.filter(Boolean).join(' · ')
}

export default function PendientesScreen() {
  const insets = useSafeAreaInsets()
  const { formatMonto } = useConfig()
  const { data: catsPersonal } = useCategorias({ ambito: 'PERSONAL', tipo: 'EGRESO' })
  const { data: catsFamiliar } = useCategorias({ ambito: 'FAMILIAR', tipo: 'EGRESO' })
  const { data: metodos } = useMetodosPago()
  const { data: tarjetas } = useTarjetas()
  const qCuentas = useQuery<CuentaPersonalApi[]>({
    queryKey: ['cuentasPersonales'],
    queryFn: () => finanzasApi.getCuentasPersonales().then((r) => r.data),
  })

  const [items, setItems] = useState<MovimientoPendienteApi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [edits, setEdits] = useState<Record<number, EditState>>({})

  const cuentas = qCuentas.data ?? []
  const cuentaDefaultId = useMemo(() => {
    const propia = cuentas.find((c) => c.es_propia)
    return propia?.id ?? cuentas[0]?.id ?? ''
  }, [cuentas])

  const destinoValue = (ambito: 'PERSONAL' | 'COMUN', cuenta: number | '') => {
    if (ambito === 'COMUN') return 'comun'
    return cuenta ? `cuenta:${cuenta}` : ''
  }

  const destinoOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = []
    for (const c of cuentas) {
      opts.push({ value: `cuenta:${c.id}`, label: `Personal · ${c.nombre}` })
    }
    opts.push({ value: 'comun', label: 'Común · Gastos comunes' })
    return opts
  }, [cuentas])

  const metodoPorId = useMemo(() => {
    const map = new Map<number, { id: number; nombre: string; tipo: string }>()
    for (const m of metodos ?? []) map.set(m.id, m)
    return map
  }, [metodos])

  const catsPara = (ambito: 'PERSONAL' | 'COMUN', cuentaId: number | '') => {
    if (ambito === 'COMUN') {
      return ((catsFamiliar ?? []) as CategoriaOpt[]).filter(
        (c) => c.tipo === 'EGRESO' && !c.es_padre,
      )
    }
    const list = ((catsPersonal ?? []) as CategoriaOpt[]).filter(
      (c) => c.tipo === 'EGRESO' && !c.es_padre,
    )
    if (!cuentaId) return list
    return list.filter((c) => c.cuenta_personal === cuentaId)
  }

  const tarjetasParaMetodo = (metodoId: number | '') => {
    if (!metodoId) return tarjetas ?? []
    const tipo = metodoPorId.get(metodoId)?.tipo
    if (tipo === 'CREDITO') return (tarjetas ?? []).filter((t: { tipo?: string }) => (t.tipo ?? 'CREDITO') === 'CREDITO')
    if (tipo === 'DEBITO') return (tarjetas ?? []).filter((t: { tipo?: string }) => t.tipo === 'DEBITO')
    return tarjetas ?? []
  }

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await pendientesApi.listar()
      setItems(data)
      setEdits((prev) => {
        const next: Record<number, EditState> = {}
        for (const p of data) {
          const ambito = p.ambito_sugerido === 'COMUN' ? 'COMUN' : 'PERSONAL'
          const prevEdit = prev[p.id]
          next[p.id] = {
            ambito,
            cuenta:
              p.cuenta_sugerida
              ?? (ambito === 'PERSONAL'
                ? (prevEdit?.cuenta || cuentaDefaultId || '')
                : ''),
            categoria: p.categoria_sugerida ?? '',
            metodo_pago: p.metodo_pago_sugerido ?? '',
            tarjeta: p.tarjeta_sugerida ?? '',
            comercio: p.comercio || '',
            num_cuotas: prevEdit?.num_cuotas || '1',
          }
        }
        return next
      })
    } catch (e) {
      setError(apiErrorMessage(e, 'No se pudieron cargar los pendientes.'))
    } finally {
      setLoading(false)
    }
  }, [cuentaDefaultId])

  useFocusEffect(
    useCallback(() => {
      void cargar()
    }, [cargar])
  )

  useEffect(() => {
    if (!cuentaDefaultId) return
    setEdits((prev) => {
      let changed = false
      const next: Record<number, EditState> = { ...prev }
      for (const [key, e] of Object.entries(next)) {
        if (e.ambito === 'PERSONAL' && !e.cuenta) {
          next[Number(key)] = { ...e, cuenta: Number(cuentaDefaultId) }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [cuentaDefaultId])

  const patchEdit = (id: number, patch: Partial<EditState>) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  const onDestinoChange = (id: number, value: string) => {
    const ambito: 'PERSONAL' | 'COMUN' = value === 'comun' ? 'COMUN' : 'PERSONAL'
    const cuenta =
      ambito === 'COMUN'
        ? ''
        : value.startsWith('cuenta:')
          ? Number(value.slice('cuenta:'.length))
          : (cuentaDefaultId || '')
    const cats = catsPara(ambito, cuenta)
    const actual = edits[id]?.categoria
    const sigue = actual && cats.some((c) => c.id === actual)
    patchEdit(id, { ambito, cuenta, categoria: sigue ? actual : '' })
  }

  const onMetodoChange = (id: number, metodo_pago: number | '') => {
    const disponibles = tarjetasParaMetodo(metodo_pago)
    const actual = edits[id]?.tarjeta
    const sigue = actual && disponibles.some((t: { id: number }) => t.id === actual)
    const sugerida = items.find((p) => p.id === id)?.tarjeta_sugerida
    const fallback =
      (sugerida && disponibles.some((t: { id: number }) => t.id === sugerida) ? sugerida : undefined)
      ?? disponibles.find((t: { es_por_defecto?: boolean }) => t.es_por_defecto)?.id
      ?? disponibles[0]?.id
      ?? ''
    patchEdit(id, { metodo_pago, tarjeta: sigue ? actual : fallback })
  }

  const refrescarCorreo = async () => {
    setSyncing(true)
    setError(null)
    setInfo(null)
    try {
      const { data } = await pendientesApi.sincronizarCorreo()
      setInfo(data.mensaje)
      await cargar()
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo sincronizar el correo.'))
    } finally {
      setSyncing(false)
    }
  }

  const confirmar = async (p: MovimientoPendienteApi) => {
    const e = edits[p.id]
    if (!e?.categoria || !e.metodo_pago) {
      Alert.alert('Campos requeridos', 'Elige cuenta, categoría y método de pago antes de confirmar.')
      return
    }
    if (e.ambito === 'PERSONAL' && cuentas.length > 0 && !e.cuenta) {
      Alert.alert('Cuenta requerida', 'Elige una cuenta personal.')
      return
    }
    if (e.ambito !== 'PERSONAL' && e.ambito !== 'COMUN') {
      Alert.alert('Cuenta requerida', 'Elige una cuenta o gastos comunes.')
      return
    }
    const tipoMetodo = metodoPorId.get(Number(e.metodo_pago))?.tipo
    const necesitaTarjeta = tipoMetodo === 'CREDITO' || tipoMetodo === 'DEBITO'
    const tarjetasDisp = tarjetasParaMetodo(e.metodo_pago)
    if (necesitaTarjeta && tarjetasDisp.length > 0 && !e.tarjeta) {
      Alert.alert('Tarjeta requerida', 'Elige una tarjeta de crédito o débito.')
      return
    }
    if (tipoMetodo === 'CREDITO') {
      const n = parseInt(e.num_cuotas || '1', 10)
      if (!n || n < 1) {
        Alert.alert('Cuotas', 'Indica el número de cuotas (mínimo 1).')
        return
      }
    }
    setBusyId(p.id)
    setError(null)
    setInfo(null)
    try {
      const body: ConfirmarPendienteBody = {
        ambito: e.ambito,
        categoria: Number(e.categoria),
        metodo_pago: Number(e.metodo_pago),
        comentario: comentarioDesdeEdit(e, p.hora) || undefined,
      }
      if (e.ambito === 'PERSONAL' && e.cuenta) body.cuenta = Number(e.cuenta)
      else if (e.ambito === 'COMUN') body.cuenta = null
      if (e.tarjeta) body.tarjeta = Number(e.tarjeta)
      if (tipoMetodo === 'CREDITO') body.num_cuotas = parseInt(e.num_cuotas || '1', 10)
      await pendientesApi.confirmar(p.id, body)
      await cargar()
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo confirmar.'))
    } finally {
      setBusyId(null)
    }
  }

  const descartar = async (id: number) => {
    Alert.alert('Descartar', '¿Seguro que quieres descartar este movimiento?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Descartar',
        style: 'destructive',
        onPress: async () => {
          setBusyId(id)
          setError(null)
          setInfo(null)
          try {
            await pendientesApi.descartar(id)
            await cargar()
          } catch (err) {
            setError(apiErrorMessage(err, 'No se pudo descartar.'))
          } finally {
            setBusyId(null)
          }
        },
      },
    ])
  }

  function PickerRow({
    label,
    options,
    value,
    onChange,
  }: {
    label: string
    options: { value: string; label: string }[]
    value: string
    onChange: (v: string) => void
  }) {
    return (
      <View className="mb-2">
        <Text className="text-xs text-muted mb-1">{label}</Text>
        <View className="flex-row flex-wrap gap-1">
          {options.map((opt) => {
            const selected = opt.value === value
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => onChange(opt.value)}
                className={`px-3 py-1.5 rounded-lg border ${
                  selected ? 'bg-accent border-accent' : 'bg-surface border-border'
                }`}
              >
                <Text
                  className={`text-xs font-medium ${selected ? 'text-dark' : 'text-muted'}`}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>
    )
  }

  const renderCard = ({ item: p }: { item: MovimientoPendienteApi }) => {
    const e = edits[p.id]
    if (!e) return null
    const ambito = e.ambito
    const cuenta = e.cuenta
    const cats = catsPara(ambito, cuenta)
    const tipoMetodo = e.metodo_pago ? metodoPorId.get(Number(e.metodo_pago))?.tipo : undefined
    const tarjetasOpts = tarjetasParaMetodo(e.metodo_pago)
    const badge = ORIGEN_BADGE[p.origen] ?? ORIGEN_BADGE.MANUAL
    const busy = busyId === p.id

    return (
      <View className="bg-white rounded-2xl border border-border mx-4 mb-3 p-4">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-lg font-bold text-dark">
            {formatMonto(Number(p.monto))}
          </Text>
          <View style={{ backgroundColor: badge.bg }} className="px-2 py-0.5 rounded-md">
            <Text style={{ color: badge.color }} className="text-[11px] font-semibold">
              {badge.label}
            </Text>
          </View>
        </View>

        <Text className="text-xs text-muted mb-3">
          {formatFechaHora(p.fecha, p.hora)}
          {metaTarjetaBanco(p)}
        </Text>

        <View className="mb-2">
          <Text className="text-xs text-muted mb-1">Comercio</Text>
          <TextInput
            className="border border-border rounded-lg px-3 py-2 text-sm text-dark bg-surface"
            value={e.comercio}
            onChangeText={(v) => patchEdit(p.id, { comercio: v })}
            placeholder="Nombre del comercio"
            placeholderTextColor="#a9a9a4"
          />
        </View>

        <PickerRow
          label="Cuenta"
          value={destinoValue(ambito, cuenta)}
          options={destinoOptions}
          onChange={(v) => onDestinoChange(p.id, v)}
        />

        <PickerRow
          label="Categoría"
          value={String(e.categoria)}
          options={[
            { value: '', label: 'Elegir…' },
            ...cats.map((c) => ({
              value: String(c.id),
              label: c.nombre,
            })),
          ]}
          onChange={(v) => patchEdit(p.id, { categoria: v ? Number(v) : '' })}
        />

        <PickerRow
          label="Método"
          value={String(e.metodo_pago)}
          options={[
            { value: '', label: 'Elegir…' },
            ...(metodos ?? []).map((m: { id: number; nombre: string }) => ({
              value: String(m.id),
              label: m.nombre,
            })),
          ]}
          onChange={(v) => onMetodoChange(p.id, v ? Number(v) : '')}
        />

        {(tipoMetodo === 'CREDITO' || tipoMetodo === 'DEBITO') && (
          <PickerRow
            label="Tarjeta"
            value={String(e.tarjeta)}
            options={[
              { value: '', label: tarjetasOpts.length ? 'Elegir…' : 'Sin tarjetas' },
              ...tarjetasOpts.map((t: { id: number; nombre: string; ultimos_4_digitos?: string; es_por_defecto?: boolean }) => ({
                value: String(t.id),
                label: t.ultimos_4_digitos
                  ? `${t.nombre} ···${t.ultimos_4_digitos}${t.es_por_defecto ? ' *' : ''}`
                  : t.nombre,
              })),
            ]}
            onChange={(v) => patchEdit(p.id, { tarjeta: v ? Number(v) : '' })}
          />
        )}

        {tipoMetodo === 'CREDITO' && (
          <View className="mb-2">
            <Text className="text-xs text-muted mb-1">Cuotas</Text>
            <TextInput
              className="border border-border rounded-lg px-3 py-2 text-sm text-dark bg-surface w-20"
              value={e.num_cuotas}
              onChangeText={(v) => patchEdit(p.id, { num_cuotas: v.replace(/[^0-9]/g, '') })}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor="#a9a9a4"
            />
          </View>
        )}

        <View className="flex-row gap-2 mt-3">
          <TouchableOpacity
            onPress={() => void confirmar(p)}
            disabled={busy || syncing}
            className={`flex-1 py-3 rounded-xl items-center ${busy ? 'bg-accent/60' : 'bg-accent'}`}
          >
            {busy ? (
              <ActivityIndicator color="#0f0f0f" />
            ) : (
              <Text className="text-dark font-bold text-sm">Confirmar</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void descartar(p.id)}
            disabled={busy || syncing}
            className="flex-1 py-3 rounded-xl items-center border border-border"
          >
            <Text className="text-muted font-semibold text-sm">Descartar</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <MobileShell title="Pendientes">
      {error && (
        <View className="mx-4 mt-3 p-3 bg-danger/10 border border-danger/30 rounded-xl">
          <Text className="text-danger text-sm">{error}</Text>
        </View>
      )}
      {info && (
        <View className="mx-4 mt-3 p-3 bg-accent/20 border border-accent/30 rounded-xl">
          <Text className="text-dark text-sm">{info}</Text>
        </View>
      )}

      <View className="flex-row items-center justify-between px-4 pt-3 pb-2">
        <Text className="text-xs text-muted">
          Borradores capturados por correo.
        </Text>
        <TouchableOpacity
          onPress={() => void refrescarCorreo()}
          disabled={syncing || busyId !== null}
          className={`px-3 py-1.5 rounded-lg ${syncing ? 'bg-muted/20' : 'bg-dark'}`}
        >
          {syncing ? (
            <ActivityIndicator color="#c8f060" size="small" />
          ) : (
            <Text className="text-accent text-xs font-semibold">Buscar en correo</Text>
          )}
        </TouchableOpacity>
      </View>

      {loading && items.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#c8f060" size="large" />
        </View>
      ) : items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-muted text-center">No hay movimientos pendientes.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => String(p.id)}
          renderItem={renderCard}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 100 }}
          refreshControl={
            <RefreshControl
              refreshing={loading && items.length > 0}
              onRefresh={cargar}
              tintColor="#c8f060"
            />
          }
        />
      )}
    </MobileShell>
  )
}
