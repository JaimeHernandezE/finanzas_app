import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
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
import { useApi } from '@finanzas/shared/hooks/useApi'
import {
  finanzasApi,
  type CuentaPersonalApi,
  type PresupuestoMesFila,
} from '@finanzas/shared/api/finanzas'
import { movimientosApi } from '@finanzas/shared/api/movimientos'
import { useConfig } from '@finanzas/shared/context/ConfigContext'
import { MobileShell } from '../../components/layout/MobileShell'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function montoNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function montoEntero(v: string | number | null | undefined): number {
  const n = montoNum(v)
  return Number.isFinite(n) ? Math.round(n) : 0
}

function mesStr(anio: number, mes: number): string {
  return `${anio}-${String(mes + 1).padStart(2, '0')}-01`
}

function porcentaje(gastado: number, presupuestado: number): number {
  if (presupuestado <= 0) return 0
  return Math.min((gastado / presupuestado) * 100, 100)
}

function colorBarra(pct: number): string {
  if (pct >= 100) return '#ef4444'
  if (pct >= 80) return '#f59e0b'
  return '#22c55e'
}

export default function PresupuestoScreen() {
  const { formatMonto } = useConfig()
  const router = useRouter()

  const hoy = new Date()
  const [mes, setMes] = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [ambito, setAmbito] = useState<'FAMILIAR' | 'PERSONAL'>('FAMILIAR')
  const { data: cuentasData } = useApi<CuentaPersonalApi[]>(
    () => finanzasApi.getCuentasPersonales(),
    [],
  )
  const cuentasPropias = useMemo(
    () =>
      ((cuentasData ?? []) as CuentaPersonalApi[])
        .filter(c => c.es_propia)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })),
    [cuentasData],
  )
  const [cuentaPersonalId, setCuentaPersonalId] = useState<number | null>(null)

  // Estado formulario nuevo presupuesto
  const [asignandoCatId, setAsignandoCatId] = useState<number | null>(null)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [formMonto, setFormMonto] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const esActual = mes === hoy.getMonth() && anio === hoy.getFullYear()

  const { data, loading, error, refetch } = useApi<PresupuestoMesFila[]>(
    () =>
      finanzasApi.getPresupuestoMes({
        mes: mes + 1,
        anio,
        ambito,
        cuenta: ambito === 'PERSONAL' && cuentaPersonalId != null ? cuentaPersonalId : undefined,
      }),
    [mes, anio, ambito, cuentaPersonalId],
  )
  const { data: cuotasVigentesPorCategoria } = useApi<Record<number, number>>(
    async () => {
      try {
        const cuotasResp = await movimientosApi.getCuotas({
          mes: mes + 1,
          anio,
          estado: 'FACTURADO',
        })
        const cuotas = Array.isArray(cuotasResp.data) ? cuotasResp.data as Array<{
          movimiento: number
          monto: string | number
        }> : []
        if (!cuotas.length) return { data: {} }

        const movimientoIds = [...new Set(
          cuotas
            .map((c) => Number(c.movimiento))
            .filter((id) => Number.isFinite(id) && id > 0),
        )]
        if (!movimientoIds.length) return { data: {} }

        const detalleMovs = await Promise.all(
          movimientoIds.map(async (id) => {
            try {
              const resp = await movimientosApi.getMovimiento(id)
              return resp.data as {
                id?: number
                ambito?: 'PERSONAL' | 'COMUN' | 'FAMILIAR'
                cuenta?: number | null
                categoria?: number | null
                tipo?: 'EGRESO' | 'INGRESO'
              }
            } catch {
              return null
            }
          }),
        )

        const movPorId = new Map<number, {
          ambito?: 'PERSONAL' | 'COMUN' | 'FAMILIAR'
          cuenta?: number | null
          categoria?: number | null
          tipo?: 'EGRESO' | 'INGRESO'
        }>()
        for (const mov of detalleMovs) {
          const id = Number(mov?.id)
          if (!Number.isFinite(id) || id <= 0) continue
          movPorId.set(id, mov ?? {})
        }

        const acumulado: Record<number, number> = {}
        for (const cuota of cuotas) {
          const mid = Number(cuota.movimiento)
          if (!Number.isFinite(mid) || mid <= 0) continue
          const mov = movPorId.get(mid)
          if (!mov || mov.tipo !== 'EGRESO') continue

          const esComun = mov.ambito === 'COMUN' || mov.ambito === 'FAMILIAR'
          const coincideAmbito = ambito === 'FAMILIAR' ? esComun : mov.ambito === 'PERSONAL'
          if (!coincideAmbito) continue

          if (
            ambito === 'PERSONAL' &&
            cuentaPersonalId != null &&
            Number(mov.cuenta ?? NaN) !== cuentaPersonalId
          ) {
            continue
          }

          const categoriaId = Number(mov.categoria)
          if (!Number.isFinite(categoriaId) || categoriaId <= 0) continue
          acumulado[categoriaId] = (acumulado[categoriaId] ?? 0) + montoEntero(cuota.monto)
        }

        return { data: acumulado }
      } catch {
        return { data: {} }
      }
    },
    [mes, anio, ambito, cuentaPersonalId],
  )

  const filas = useMemo(() => {
    const base = data ?? []
    const extras = cuotasVigentesPorCategoria ?? {}
    const extrasEntries = Object.entries(extras)
      .map(([k, v]) => [Number(k), Number(v)] as const)
      .filter(([cid, monto]) => Number.isFinite(cid) && cid > 0 && Number.isFinite(monto) && monto !== 0)
    if (base.length === 0 || extrasEntries.length === 0) return base

    const ajustadas = base.map((f) => ({ ...f }))
    const porCategoria = new Map<number, PresupuestoMesFila>(ajustadas.map((f) => [f.categoria_id, f]))

    for (const [categoriaId, extra] of extrasEntries) {
      const fila = porCategoria.get(categoriaId)
      if (!fila) continue
      fila.gastado = montoEntero(fila.gastado) + Math.round(extra)
    }

    const hijosPorPadre = new Map<number, PresupuestoMesFila[]>()
    for (const fila of ajustadas) {
      if (fila.es_agregado_padre) continue
      if (fila.categoria_padre_id == null) continue
      const arr = hijosPorPadre.get(fila.categoria_padre_id) ?? []
      arr.push(fila)
      hijosPorPadre.set(fila.categoria_padre_id, arr)
    }
    for (const fila of ajustadas) {
      if (!fila.es_agregado_padre) continue
      const hijos = hijosPorPadre.get(fila.categoria_id) ?? []
      fila.gastado = hijos.reduce((sum, h) => sum + montoEntero(h.gastado), 0)
    }

    return ajustadas
  }, [data, cuotasVigentesPorCategoria])

  useEffect(() => {
    if (ambito !== 'PERSONAL') return
    if (!cuentasPropias.length) return
    if (cuentaPersonalId == null || !cuentasPropias.some(c => c.id === cuentaPersonalId)) {
      setCuentaPersonalId(cuentasPropias[0].id)
    }
  }, [ambito, cuentasPropias, cuentaPersonalId])

  const omitirPrimerFoco = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (omitirPrimerFoco.current) { omitirPrimerFoco.current = false; return }
      void refetch()
    }, [refetch]),
  )

  function irAnterior() {
    if (mes === 0) { setMes(11); setAnio((a) => a - 1) }
    else setMes((m) => m - 1)
  }

  function irSiguiente() {
    if (esActual) return
    if (mes === 11) { setMes(0); setAnio((a) => a + 1) }
    else setMes((m) => m + 1)
  }

  const sinPresupuesto = useMemo(
    () =>
      filas.filter((f) => f.presupuesto_id == null && f.gastado > 0 && !f.es_agregado_padre),
    [filas],
  )

  const totalPresupuestado = useMemo(
    () =>
      filas
        .filter((f) => !f.es_agregado_padre && f.presupuesto_id != null)
        .reduce((s, f) => s + montoNum(f.monto_presupuestado), 0),
    [filas],
  )
  const totalGastado = useMemo(
    () => filas.filter((f) => !f.es_agregado_padre).reduce((s, f) => s + f.gastado, 0),
    [filas],
  )
  const disponible = totalPresupuestado - totalGastado
  const pctGlobal = porcentaje(totalGastado, totalPresupuestado)

  const bloquesConPresupuesto = useMemo(() => {
    const conP = filas.filter((f) => {
      if (f.es_agregado_padre) {
        return montoNum(f.monto_presupuestado) > 0 || f.gastado > 0
      }
      return f.presupuesto_id != null
    })
    const padreIds = new Set(
      conP.filter((f) => f.es_agregado_padre).map((f) => f.categoria_id),
    )
    const hijosPorPadre = new Map<number, PresupuestoMesFila[]>()
    for (const f of conP) {
      const pid = f.categoria_padre_id
      if (pid != null && padreIds.has(pid)) {
        const arr = hijosPorPadre.get(pid) ?? []
        arr.push(f)
        hijosPorPadre.set(pid, arr)
      }
    }
    hijosPorPadre.forEach((arr) =>
      arr.sort((a, b) =>
        (a.categoria_nombre || '').localeCompare(b.categoria_nombre || '', 'es'),
      ),
    )
    const padres = conP.filter((f) => f.es_agregado_padre)
    const sueltas = conP.filter(
      (f) =>
        !f.es_agregado_padre &&
        !(f.categoria_padre_id != null && padreIds.has(f.categoria_padre_id)),
    )
    type Bloque =
      | { tipo: 'grupo'; parent: PresupuestoMesFila; hijos: PresupuestoMesFila[] }
      | { tipo: 'suelta'; fila: PresupuestoMesFila }
    const bloques: Bloque[] = [
      ...padres.map((p) => ({
        tipo: 'grupo' as const,
        parent: p,
        hijos: hijosPorPadre.get(p.categoria_id) ?? [],
      })),
      ...sueltas.map((fila) => ({ tipo: 'suelta' as const, fila })),
    ]
    bloques.sort((a, b) => {
      const rank = (bl: Bloque) => (bl.tipo === 'grupo' ? 0 : 1)
      const rA = rank(a)
      const rB = rank(b)
      if (rA !== rB) return rA - rB
      const na = a.tipo === 'grupo' ? a.parent.categoria_nombre || '' : a.fila.categoria_nombre || ''
      const nb = b.tipo === 'grupo' ? b.parent.categoria_nombre || '' : b.fila.categoria_nombre || ''
      return na.localeCompare(nb, 'es', { sensitivity: 'base' })
    })
    return bloques
  }, [filas])

  const [grupoAbierto, setGrupoAbierto] = useState<Record<number, boolean>>({})

  function toggleGrupo(padreId: number) {
    setGrupoAbierto((prev) => ({
      ...prev,
      [padreId]: !(prev[padreId] ?? false),
    }))
  }

  function cancelarForm() {
    setAsignandoCatId(null)
    setEditandoId(null)
    setFormMonto('')
    setFormError(null)
  }

  async function guardarNuevo(fila: PresupuestoMesFila) {
    const monto = Number(formMonto.replace(',', '.').replace(/\s/g, ''))
    if (!Number.isFinite(monto) || monto <= 0) { setFormError('Ingresa un monto válido.'); return }
    setFormError(null)
    setGuardando(true)
    try {
      await finanzasApi.createPresupuesto({
        categoria: fila.categoria_id,
        mes: mesStr(anio, mes),
        monto: String(monto),
        ambito,
        cuenta: ambito === 'PERSONAL' && cuentaPersonalId != null ? cuentaPersonalId : undefined,
      })
      cancelarForm()
      void refetch()
    } catch {
      setFormError('No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  async function guardarEdicion(fila: PresupuestoMesFila) {
    const monto = Number(formMonto.replace(',', '.').replace(/\s/g, ''))
    if (!Number.isFinite(monto) || monto <= 0) { setFormError('Ingresa un monto válido.'); return }
    if (fila.presupuesto_id == null) return
    setFormError(null)
    setGuardando(true)
    try {
      await finanzasApi.patchPresupuesto(fila.presupuesto_id, { monto: String(monto) })
      cancelarForm()
      void refetch()
    } catch {
      setFormError('No se pudo actualizar.')
    } finally {
      setGuardando(false)
    }
  }

  function confirmarEliminar(fila: PresupuestoMesFila) {
    if (fila.presupuesto_id == null) return
    Alert.alert(
      'Eliminar presupuesto',
      `¿Quitar presupuesto de "${fila.categoria_nombre}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await finanzasApi.deletePresupuesto(fila.presupuesto_id!)
            void refetch()
          },
        },
      ],
    )
  }

  function irListadoCategoria(categoriaId: number) {
    if (ambito === 'FAMILIAR') {
      router.push(`/(tabs)/gastos?categoria=${categoriaId}` as never)
      return
    }
    const cuentaDestino = cuentaPersonalId ?? cuentasPropias[0]?.id ?? null
    if (cuentaDestino == null) return
    router.push(`/cuenta/${cuentaDestino}?categoria=${categoriaId}` as never)
  }

  return (
    <MobileShell title="Presupuesto">
      <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="px-5 pt-3">
          {/* Toggle FAMILIAR / PERSONAL */}
          <View className="flex-row border border-border rounded-lg overflow-hidden mb-4 bg-white">
            {(['FAMILIAR', 'PERSONAL'] as const).map((v, i) => (
              <TouchableOpacity
                key={v}
                onPress={() => { setAmbito(v); cancelarForm() }}
                className={`flex-1 py-2.5 items-center ${i > 0 ? 'border-l border-border' : ''} ${ambito === v ? 'bg-dark' : 'bg-white'}`}
              >
                <Text className={`text-xs font-semibold ${ambito === v ? 'text-white' : 'text-muted'}`}>
                  {v === 'FAMILIAR' ? 'Familiar' : 'Personal'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {ambito === 'PERSONAL' && (
            <View className="flex-row flex-wrap gap-2 mb-4">
              {cuentasPropias.length === 0 ? (
                <Text className="text-muted text-xs">Sin cuentas personales</Text>
              ) : (
                cuentasPropias.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setCuentaPersonalId(c.id)}
                    className={`px-3 py-1.5 rounded-lg border ${
                      cuentaPersonalId === c.id ? 'bg-dark border-dark' : 'bg-white border-border'
                    }`}
                  >
                    <Text
                      className={`text-xs font-medium ${
                        cuentaPersonalId === c.id ? 'text-white' : 'text-dark'
                      }`}
                    >
                      {c.nombre}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* Navegación mes */}
          <View className="flex-row items-center gap-2 mb-4">
            <TouchableOpacity
              onPress={irAnterior}
              className="w-8 h-8 border border-border rounded-lg items-center justify-center bg-white"
            >
              <Text className="text-dark text-lg">‹</Text>
            </TouchableOpacity>
            <Text className="text-dark font-semibold text-sm flex-1 text-center">
              {MESES[mes]} {anio}
            </Text>
            <TouchableOpacity
              onPress={irSiguiente}
              disabled={esActual}
              className={`w-8 h-8 border rounded-lg items-center justify-center bg-white ${esActual ? 'border-border/40' : 'border-border'}`}
            >
              <Text className={`text-lg ${esActual ? 'text-border' : 'text-dark'}`}>›</Text>
            </TouchableOpacity>
          </View>

          {loading && (
            <View className="py-12 items-center">
              <ActivityIndicator color="#0f0f0f" />
            </View>
          )}

          {error && (
            <View className="bg-danger/10 border border-danger/30 rounded-xl p-4 mb-4">
              <Text className="text-danger text-sm text-center">{error}</Text>
              <TouchableOpacity onPress={refetch} className="mt-2">
                <Text className="text-dark font-semibold text-sm text-center underline">Reintentar</Text>
              </TouchableOpacity>
            </View>
          )}

          {!loading && !error && (
            <>
              {/* Cards resumen */}
              {totalPresupuestado > 0 && (
                <View className="flex-row gap-3 mb-5">
                  <View className="flex-1 bg-white border border-border rounded-xl p-3">
                    <Text className="text-muted text-[10px] uppercase tracking-wide mb-1">Presupuestado</Text>
                    <Text className="text-dark font-bold text-sm">{formatMonto(totalPresupuestado)}</Text>
                  </View>
                  <View className="flex-1 bg-white border border-border rounded-xl p-3">
                    <Text className="text-muted text-[10px] uppercase tracking-wide mb-1">Gastado</Text>
                    <Text className="text-dark font-bold text-sm">{formatMonto(totalGastado)}</Text>
                  </View>
                  <View className={`flex-1 rounded-xl p-3 border ${disponible >= 0 ? 'bg-white border-border' : 'bg-danger/10 border-danger/30'}`}>
                    <Text className="text-muted text-[10px] uppercase tracking-wide mb-1">
                      {disponible >= 0 ? 'Disponible' : 'Excedido'}
                    </Text>
                    <Text className={`font-bold text-sm ${disponible >= 0 ? 'text-success' : 'text-danger'}`}>
                      {formatMonto(Math.abs(disponible))}
                    </Text>
                  </View>
                </View>
              )}

              {/* Barra global */}
              {totalPresupuestado > 0 && (
                <View className="mb-5">
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-xs text-muted">Progreso global</Text>
                    <Text className="text-xs font-semibold text-dark">{Math.round(pctGlobal)}%</Text>
                  </View>
                  <View className="h-2 bg-border rounded-full overflow-hidden">
                    <View
                      className="h-2 rounded-full"
                      style={{ width: `${pctGlobal}%`, backgroundColor: colorBarra(pctGlobal) }}
                    />
                  </View>
                </View>
              )}

              {/* Categorías con presupuesto (padres con subcategorías desplegables) */}
              {bloquesConPresupuesto.length > 0 && (
                <>
                  <Text className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Con presupuesto</Text>
                  <View className="bg-white border border-border rounded-xl overflow-hidden mb-5">
                    {bloquesConPresupuesto.map((bloque, bi) => {
                      const isLastBlock = bi === bloquesConPresupuesto.length - 1
                      const blockBorder = !isLastBlock ? 'border-b border-border' : ''

                      if (bloque.tipo === 'suelta') {
                        const fila = bloque.fila
                        const presup = montoNum(fila.monto_presupuestado)
                        const pct = porcentaje(fila.gastado, presup)
                        const editando = editandoId === fila.presupuesto_id
                        return (
                          <View key={`s-${fila.categoria_id}`} className={`px-4 py-3 ${blockBorder}`}>
                            {editando ? (
                              <View>
                                <Text className="text-xs font-semibold text-muted mb-2">{fila.categoria_nombre}</Text>
                                <TextInput
                                  value={formMonto}
                                  onChangeText={setFormMonto}
                                  placeholder="Nuevo monto"
                                  placeholderTextColor="#888884"
                                  keyboardType="numeric"
                                  className="border border-border rounded-lg px-3 py-2 text-dark bg-surface text-sm mb-2"
                                  autoFocus
                                />
                                {formError && <Text className="text-danger text-xs mb-2">{formError}</Text>}
                                <View className="flex-row gap-2">
                                  <TouchableOpacity onPress={cancelarForm} className="flex-1 border border-border rounded-lg py-2 items-center">
                                    <Text className="text-dark text-xs font-semibold">Cancelar</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => guardarEdicion(fila)}
                                    disabled={guardando}
                                    className="flex-1 bg-dark rounded-lg py-2 items-center"
                                  >
                                    <Text className="text-white text-xs font-semibold">{guardando ? '…' : 'Guardar'}</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            ) : (
                              <>
                                <View className="flex-row items-center justify-between mb-1.5">
                                  <TouchableOpacity
                                    onPress={() => irListadoCategoria(fila.categoria_id)}
                                    className="flex-1 mr-2"
                                  >
                                    <Text className="text-dark font-medium text-sm">{fila.categoria_nombre}</Text>
                                  </TouchableOpacity>
                                  <View className="flex-row items-center gap-2">
                                    <TouchableOpacity
                                      onPress={() => {
                                        setEditandoId(fila.presupuesto_id)
                                        setFormMonto(String(presup))
                                        setFormError(null)
                                        setAsignandoCatId(null)
                                      }}
                                      hitSlop={8}
                                      className="px-2 py-0.5 rounded border border-border"
                                    >
                                      <Text className="text-dark text-[10px] font-semibold">Editar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => confirmarEliminar(fila)} hitSlop={8}>
                                      <Text className="text-danger text-xs">🗑</Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                                <View className="flex-row justify-between mb-1">
                                  <Text className="text-muted text-xs">{formatMonto(fila.gastado)} gastado</Text>
                                  <Text className="text-muted text-xs">{formatMonto(presup)} presup.</Text>
                                </View>
                                <View className="h-1.5 bg-border rounded-full overflow-hidden">
                                  <View
                                    className="h-1.5 rounded-full"
                                    style={{ width: `${pct}%`, backgroundColor: colorBarra(pct) }}
                                  />
                                </View>
                                {pct >= 100 && (
                                  <Text className="text-danger text-[10px] mt-1">
                                    Excedido en {formatMonto(fila.gastado - presup)}
                                  </Text>
                                )}
                              </>
                            )}
                          </View>
                        )
                      }

                      const { parent, hijos } = bloque
                      const presupP = montoNum(parent.monto_presupuestado)
                      const pctP = porcentaje(parent.gastado, presupP)
                      const abierto = grupoAbierto[parent.categoria_id] ?? false
                      return (
                        <View key={`g-${parent.categoria_id}`} className={blockBorder}>
                          <TouchableOpacity
                            onPress={() => toggleGrupo(parent.categoria_id)}
                            activeOpacity={0.75}
                            className="flex-row items-start px-4 py-3"
                          >
                            <View className="flex-1 pr-2">
                              <Text className="text-dark font-medium text-sm mb-1.5">
                                {parent.categoria_nombre} (total subcategorías)
                              </Text>
                              <View className="flex-row justify-between mb-1">
                                <Text className="text-muted text-xs">{formatMonto(parent.gastado)} gastado</Text>
                                <Text className="text-muted text-xs">{formatMonto(presupP)} presup.</Text>
                              </View>
                              <View className="h-1.5 bg-border rounded-full overflow-hidden">
                                <View
                                  className="h-1.5 rounded-full"
                                  style={{ width: `${pctP}%`, backgroundColor: colorBarra(pctP) }}
                                />
                              </View>
                            </View>
                            <Text className="text-muted text-xs mt-0.5">{abierto ? '▼' : '▶'}</Text>
                          </TouchableOpacity>
                          {abierto && hijos.length > 0 && (
                            <View className="border-t border-border">
                              {hijos.map((fila, hi) => {
                                const presup = montoNum(fila.monto_presupuestado)
                                const pct = porcentaje(fila.gastado, presup)
                                const editando = editandoId === fila.presupuesto_id
                                const sep = hi < hijos.length - 1 ? 'border-b border-border' : ''
                                return (
                                  <View key={fila.categoria_id} className={`pl-8 pr-4 py-3 ${sep}`}>
                                    {editando ? (
                                      <View>
                                        <Text className="text-xs font-semibold text-muted mb-2">{fila.categoria_nombre}</Text>
                                        <TextInput
                                          value={formMonto}
                                          onChangeText={setFormMonto}
                                          placeholder="Nuevo monto"
                                          placeholderTextColor="#888884"
                                          keyboardType="numeric"
                                          className="border border-border rounded-lg px-3 py-2 text-dark bg-surface text-sm mb-2"
                                          autoFocus
                                        />
                                        {formError && <Text className="text-danger text-xs mb-2">{formError}</Text>}
                                        <View className="flex-row gap-2">
                                          <TouchableOpacity onPress={cancelarForm} className="flex-1 border border-border rounded-lg py-2 items-center">
                                            <Text className="text-dark text-xs font-semibold">Cancelar</Text>
                                          </TouchableOpacity>
                                          <TouchableOpacity
                                            onPress={() => guardarEdicion(fila)}
                                            disabled={guardando}
                                            className="flex-1 bg-dark rounded-lg py-2 items-center"
                                          >
                                            <Text className="text-white text-xs font-semibold">{guardando ? '…' : 'Guardar'}</Text>
                                          </TouchableOpacity>
                                        </View>
                                      </View>
                                    ) : (
                                      <>
                                        <View className="flex-row items-center justify-between mb-1.5">
                                          <TouchableOpacity
                                            onPress={() => irListadoCategoria(fila.categoria_id)}
                                            className="flex-1 mr-2"
                                          >
                                            <Text className="text-dark font-medium text-sm">{fila.categoria_nombre}</Text>
                                          </TouchableOpacity>
                                          <View className="flex-row items-center gap-2">
                                            <TouchableOpacity
                                              onPress={() => {
                                                setEditandoId(fila.presupuesto_id)
                                                setFormMonto(String(presup))
                                                setFormError(null)
                                                setAsignandoCatId(null)
                                              }}
                                              hitSlop={8}
                                              className="px-2 py-0.5 rounded border border-border"
                                            >
                                              <Text className="text-dark text-[10px] font-semibold">Editar</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => confirmarEliminar(fila)} hitSlop={8}>
                                              <Text className="text-danger text-xs">🗑</Text>
                                            </TouchableOpacity>
                                          </View>
                                        </View>
                                        <View className="flex-row justify-between mb-1">
                                          <Text className="text-muted text-xs">{formatMonto(fila.gastado)} gastado</Text>
                                          <Text className="text-muted text-xs">{formatMonto(presup)} presup.</Text>
                                        </View>
                                        <View className="h-1.5 bg-border rounded-full overflow-hidden">
                                          <View
                                            className="h-1.5 rounded-full"
                                            style={{ width: `${pct}%`, backgroundColor: colorBarra(pct) }}
                                          />
                                        </View>
                                        {pct >= 100 && (
                                          <Text className="text-danger text-[10px] mt-1">
                                            Excedido en {formatMonto(fila.gastado - presup)}
                                          </Text>
                                        )}
                                      </>
                                    )}
                                  </View>
                                )
                              })}
                            </View>
                          )}
                          {abierto && hijos.length === 0 && (
                            <Text className="text-muted text-xs px-4 pb-3">Sin subcategorías con datos este mes.</Text>
                          )}
                        </View>
                      )
                    })}
                  </View>
                </>
              )}

              {/* Categorías sin presupuesto (con gasto) */}
              {sinPresupuesto.length > 0 && (
                <>
                  <Text className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Sin presupuesto asignado</Text>
                  <View className="bg-white border border-border rounded-xl overflow-hidden mb-5">
                    {sinPresupuesto.map((fila, idx) => {
                      const isLast = idx === sinPresupuesto.length - 1
                      const asignando = asignandoCatId === fila.categoria_id

                      return (
                        <View key={fila.categoria_id} className={`px-4 py-3 ${!isLast ? 'border-b border-border' : ''}`}>
                          {asignando ? (
                            <View>
                              <Text className="text-xs font-semibold text-muted mb-2">{fila.categoria_nombre}</Text>
                              <TextInput
                                value={formMonto}
                                onChangeText={setFormMonto}
                                placeholder="Monto presupuestado"
                                placeholderTextColor="#888884"
                                keyboardType="numeric"
                                className="border border-border rounded-lg px-3 py-2 text-dark bg-surface text-sm mb-2"
                                autoFocus
                              />
                              {formError && <Text className="text-danger text-xs mb-2">{formError}</Text>}
                              <View className="flex-row gap-2">
                                <TouchableOpacity onPress={cancelarForm} className="flex-1 border border-border rounded-lg py-2 items-center">
                                  <Text className="text-dark text-xs font-semibold">Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={() => guardarNuevo(fila)}
                                  disabled={guardando}
                                  className="flex-1 bg-dark rounded-lg py-2 items-center"
                                >
                                  <Text className="text-white text-xs font-semibold">{guardando ? '…' : 'Asignar'}</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          ) : (
                            <View className="flex-row items-center">
                              <View className="flex-1 mr-2">
                                <Text className="text-dark font-medium text-sm">{fila.categoria_nombre}</Text>
                                <Text className="text-muted text-xs mt-0.5">{formatMonto(fila.gastado)} gastado</Text>
                              </View>
                              <TouchableOpacity
                                onPress={() => {
                                  setAsignandoCatId(fila.categoria_id)
                                  setFormMonto('')
                                  setFormError(null)
                                  setEditandoId(null)
                                }}
                                className="px-3 py-1.5 rounded-lg border border-border"
                              >
                                <Text className="text-dark text-xs font-semibold">Asignar</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      )
                    })}
                  </View>
                </>
              )}

              {filas.length === 0 && (
                <View className="bg-white border border-border rounded-2xl p-8 items-center">
                  <Text className="text-muted text-sm text-center">Sin datos de presupuesto para este período.</Text>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </MobileShell>
  )
}
