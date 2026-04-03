import { type Dispatch, type SetStateAction, useCallback, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useApi } from '@finanzas/shared/hooks/useApi'
import { useTarjetas } from '@finanzas/shared/hooks/useCatalogos'
import { queryClient } from '../../lib/queryClient'
import { invalidateFinanzasTrasMovimiento } from '../../lib/invalidateFinanzasTrasMovimiento'
import { catalogosApi } from '@finanzas/shared/api/catalogos'
import { movimientosApi } from '@finanzas/shared/api/movimientos'
import { useConfig } from '@finanzas/shared/context/ConfigContext'
import { MobileShell } from '../../components/layout/MobileShell'
import {
  MovimientoFormulario,
  type MovimientoFormularioRef,
} from '../../components/movimientos/MovimientoFormulario'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Tarjeta {
  id: number
  nombre: string
  banco: string
  dia_facturacion: number | null
  dia_vencimiento: number | null
}

interface Cuota {
  id: number
  movimiento?: number | null
  numero: number
  monto: string | number
  mes_facturacion: string
  estado: 'PENDIENTE' | 'FACTURADO' | 'PAGADO'
  incluir: boolean
  movimiento_comentario?: string | null
  movimiento_categoria_nombre?: string | null
}

type VistaTarjeta = 'UTILIZADO' | 'FACTURADO'

interface CargoAdicional {
  id: number
  descripcion: string
  monto: number
}

interface MovimientoCredito {
  id: number
  fecha: string
  tipo: 'INGRESO' | 'EGRESO'
  ambito: 'PERSONAL' | 'COMUN'
  monto: string | number
  comentario: string
  categoria_nombre: string
  cuenta: number | null
  cuenta_nombre?: string | null
  tarjeta: number | null
  tarjeta_nombre?: string | null
  usuario?: number | string
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const ESTADO_BADGE: Record<Cuota['estado'], { label: string; bg: string; color: string }> = {
  PENDIENTE: { label: 'Pendiente', bg: '#fff7ed', color: '#f59e0b' },
  FACTURADO: { label: 'Facturado', bg: '#eff6ff', color: '#3b82f6' },
  PAGADO:    { label: 'Pagado',    bg: '#f0fdf4', color: '#22c55e' },
}

function montoNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

type DetalleMovMap = Map<number, { cat: string; com: string }>

/** Lee categoría/comentario de la cuota (API) o variantes camelCase si vinieran transformadas. */
function camposDesdeCuotaApi(c: Cuota): { cat: string; com: string } {
  const r = c as Cuota & Record<string, unknown>
  const cat = String(
    r.movimiento_categoria_nombre ?? r.movimientoCategoriaNombre ?? '',
  ).trim()
  const com = String(r.movimiento_comentario ?? r.movimientoComentario ?? '').trim()
  return { cat, com }
}

/**
 * Una línea: «Categoría - Comentario».
 * Si la API de cuotas no trae texto, usa los movimientos TC ya cargados (lista utilizado).
 */
function lineaCategoriaComentarioCuota(c: Cuota, detallePorMov?: DetalleMovMap): string | null {
  let { cat, com } = camposDesdeCuotaApi(c)
  const midRaw = c.movimiento
  const mid = midRaw != null ? Number(midRaw) : NaN
  if (detallePorMov && Number.isFinite(mid)) {
    const det = detallePorMov.get(mid)
    if (det) {
      if (!cat) cat = det.cat
      if (!com) com = det.com
    }
  }
  if (cat && com) return `${cat} - ${com}`
  if (cat) return cat
  if (com) return com
  return null
}

function parseDia(val: string): number | null {
  const n = parseInt(val, 10)
  if (!Number.isFinite(n) || n < 1 || n > 31) return null
  return n
}

const FORM_VACIO = { nombre: '', banco: '', diaFac: '', diaVen: '' }

type FormTarjetaState = typeof FORM_VACIO

function FormTarjeta(props: {
  form: FormTarjetaState
  setForm: Dispatch<SetStateAction<FormTarjetaState>>
  formError: string | null
  guardando: boolean
  titulo: string
  onGuardar: () => void
  onCancelar: () => void
}) {
  const { form, setForm, formError, guardando, titulo, onGuardar, onCancelar } = props
  return (
    <View className="bg-white border border-border rounded-xl p-4 mb-3">
      <Text className="text-xs font-semibold text-muted mb-3">{titulo}</Text>
      <TextInput
        value={form.nombre}
        onChangeText={(v) => setForm((f) => ({ ...f, nombre: v }))}
        placeholder="Nombre (ej: Visa BCI)"
        placeholderTextColor="#888884"
        className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm mb-2"
      />
      <TextInput
        value={form.banco}
        onChangeText={(v) => setForm((f) => ({ ...f, banco: v }))}
        placeholder="Banco (ej: BCI, Santander)"
        placeholderTextColor="#888884"
        className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm mb-2"
      />
      <View className="flex-row gap-2 mb-2">
        <View className="flex-1">
          <Text className="text-muted text-[10px] mb-1 ml-1">Día cierre</Text>
          <TextInput
            value={form.diaFac}
            onChangeText={(v) => setForm((f) => ({ ...f, diaFac: v }))}
            placeholder="1–31"
            placeholderTextColor="#888884"
            keyboardType="numeric"
            className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm"
          />
        </View>
        <View className="flex-1">
          <Text className="text-muted text-[10px] mb-1 ml-1">Día vencimiento</Text>
          <TextInput
            value={form.diaVen}
            onChangeText={(v) => setForm((f) => ({ ...f, diaVen: v }))}
            placeholder="1–31"
            placeholderTextColor="#888884"
            keyboardType="numeric"
            className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm"
          />
        </View>
      </View>
      {formError && <Text className="text-danger text-xs mb-2">{formError}</Text>}
      <View className="flex-row gap-2">
        <TouchableOpacity
          onPress={onCancelar}
          className="flex-1 border border-border rounded-lg py-2.5 items-center"
        >
          <Text className="text-dark text-sm font-semibold">Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onGuardar}
          disabled={guardando}
          className="flex-1 bg-dark rounded-lg py-2.5 items-center"
        >
          <Text className="text-white text-sm font-semibold">
            {guardando ? 'Guardando…' : 'Guardar'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TarjetasScreen() {
  const { formatMonto } = useConfig()
  const router = useRouter()

  // ── CRUD tarjetas ──
  const { data: tarjetasRaw, loading: loadingTarjetas, refetch: refetchTarjetas } = useTarjetas()
  const tarjetas = (tarjetasRaw as Tarjeta[] | null) ?? []

  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [agregando, setAgregando] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [formError, setFormError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // ── Cuotas ──
  const hoy = new Date()
  const [tarjetaId, setTarjetaId] = useState<number | null>(null)
  const [mes, setMes] = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [vistaActiva, setVistaActiva] = useState<VistaTarjeta>('UTILIZADO')
  const [actualizando, setActualizando] = useState<Set<number>>(new Set())
  const [cargosAdicionales, setCargosAdicionales] = useState<CargoAdicional[]>([])
  const [formularioCargoVisible, setFormularioCargoVisible] = useState(false)
  const [cargoDesc, setCargoDesc] = useState('')
  const [cargoMonto, setCargoMonto] = useState('')
  const [modalConfirmarPago, setModalConfirmarPago] = useState(false)
  const [guardandoPago, setGuardandoPago] = useState(false)
  const [exitoPostPago, setExitoPostPago] = useState(false)
  const [totalPagado, setTotalPagado] = useState(0)
  const [menuPagoVisible, setMenuPagoVisible] = useState(false)
  /** `null` = todos los ítems activos seleccionados (valor por defecto al abrir). Si no fuera `null`, un toggle sobre Set vacío solo añadiría un id e «invertiría» la selección. */
  const [seleccionPagoIds, setSeleccionPagoIds] = useState<Set<number> | null>(null)

  const movFormRef = useRef<MovimientoFormularioRef>(null)

  const esActual = mes === hoy.getMonth() && anio === hoy.getFullYear()
  const tarjetaIdEfectivo = tarjetaId ?? tarjetas[0]?.id ?? null

  const { data: cuotasData, loading: loadingCuotas, error: errorCuotas, refetch: refetchCuotas } = useApi<Cuota[]>(
    () => {
      if (tarjetaIdEfectivo == null) return Promise.resolve({ data: [] as Cuota[] })
      return movimientosApi.getCuotas({
        tarjeta: tarjetaIdEfectivo,
        mes: mes + 1,
        anio,
      }) as Promise<{ data: Cuota[] }>
    },
    [tarjetaIdEfectivo, mes, anio],
  )
  const cuotas = cuotasData ?? []

  // ── Utilizado / control de avance ──
  const { data: cuotasTarjetaData, loading: loadingCuotasTarjeta, error: errorCuotasTarjeta, refetch: refetchCuotasTarjeta } =
    useApi<Cuota[]>(
      () => {
        if (tarjetaIdEfectivo == null) return Promise.resolve({ data: [] as Cuota[] })
        return movimientosApi.getCuotas({ tarjeta: tarjetaIdEfectivo }) as Promise<{ data: Cuota[] }>
      },
      [tarjetaIdEfectivo],
    )
  const cuotasTarjeta = cuotasTarjetaData ?? []

  const toMonthIndex = (fechaIso: string): number | null => {
    if (!fechaIso) return null
    const d = new Date(fechaIso)
    if (!Number.isFinite(d.getTime())) return null
    return d.getFullYear() * 12 + d.getMonth()
  }

  const maxMesActivoIdx = useMemo(() => {
    const activos = cuotasTarjeta.filter((c) => c.estado !== 'PAGADO')
    if (activos.length === 0) return null
    const idxs = activos
      .map((c) => toMonthIndex(c.mes_facturacion))
      .filter((v): v is number => v !== null)
    if (idxs.length === 0) return null
    return Math.max(...idxs)
  }, [cuotasTarjeta])

  const puedeAvanzar = maxMesActivoIdx !== null && anio * 12 + mes < maxMesActivoIdx

  // ── Movimientos utilizados (para vista UTILIZADO) ──
  const { data: movPersonalData, loading: movPersonalLoading, error: movPersonalError, refetch: refetchMovPersonal } =
    useApi<MovimientoCredito[]>(
      () => {
        if (tarjetaIdEfectivo == null) return Promise.resolve({ data: [] as MovimientoCredito[] })
        return movimientosApi.getMovimientos({
          tipo: 'EGRESO',
          ambito: 'PERSONAL',
          solo_mios: true,
          metodo: 'CREDITO',
        }) as Promise<{ data: MovimientoCredito[] }>
      },
      [tarjetaIdEfectivo],
    )

  const { data: movComunData, loading: movComunLoading, error: movComunError, refetch: refetchMovComun } = useApi<
    MovimientoCredito[]
  >(
    () => {
      if (tarjetaIdEfectivo == null) return Promise.resolve({ data: [] as MovimientoCredito[] })
      return movimientosApi.getMovimientos({
        tipo: 'EGRESO',
        ambito: 'COMUN',
        metodo: 'CREDITO',
      }) as Promise<{ data: MovimientoCredito[] }>
    },
    [tarjetaIdEfectivo],
  )

  const movPersonal = movPersonalData ?? []
  const movComun = movComunData ?? []

  /** Para mostrar «categoría - comentario» en cuotas aunque el serializer no los envíe. */
  const detallePorMovimientoId = useMemo(() => {
    const map: DetalleMovMap = new Map()
    if (tarjetaIdEfectivo == null) return map
    const put = (m: MovimientoCredito) => {
      if (m.tarjeta !== tarjetaIdEfectivo) return
      const id = Number(m.id)
      if (!Number.isFinite(id)) return
      map.set(id, {
        cat: String(m.categoria_nombre ?? '').trim(),
        com: String(m.comentario ?? '').trim(),
      })
    }
    movPersonal.forEach(put)
    movComun.forEach(put)
    return map
  }, [movPersonal, movComun, tarjetaIdEfectivo])

  const omitirPrimerFoco = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (omitirPrimerFoco.current) { omitirPrimerFoco.current = false; return }
      void refetchTarjetas()
      void refetchCuotas()
    }, [refetchTarjetas, refetchCuotas]),
  )

  // ── Helpers CRUD ──

  function cancelarForm() {
    setAgregando(false)
    setEditandoId(null)
    setForm(FORM_VACIO)
    setFormError(null)
  }

  function abrirNueva() {
    cancelarForm()
    setAgregando(true)
  }

  function abrirEdicion(t: Tarjeta) {
    cancelarForm()
    setEditandoId(t.id)
    setForm({
      nombre: t.nombre,
      banco: t.banco ?? '',
      diaFac: t.dia_facturacion != null ? String(t.dia_facturacion) : '',
      diaVen: t.dia_vencimiento != null ? String(t.dia_vencimiento) : '',
    })
  }

  async function guardarNueva() {
    if (!form.nombre.trim()) { setFormError('El nombre es obligatorio.'); return }
    setFormError(null)
    setGuardando(true)
    try {
      await catalogosApi.createTarjeta({
        nombre: form.nombre.trim(),
        banco: form.banco.trim() || '',
        dia_facturacion: form.diaFac ? parseDia(form.diaFac) : null,
        dia_vencimiento: form.diaVen ? parseDia(form.diaVen) : null,
      })
      cancelarForm()
      void refetchTarjetas()
    } catch {
      setFormError('No se pudo crear la tarjeta.')
    } finally {
      setGuardando(false)
    }
  }

  async function guardarEdicion() {
    if (editandoId == null) return
    if (!form.nombre.trim()) { setFormError('El nombre es obligatorio.'); return }
    setFormError(null)
    setGuardando(true)
    try {
      await catalogosApi.updateTarjeta(editandoId, {
        nombre: form.nombre.trim(),
        banco: form.banco.trim() || '',
        dia_facturacion: form.diaFac ? parseDia(form.diaFac) : null,
        dia_vencimiento: form.diaVen ? parseDia(form.diaVen) : null,
      })
      cancelarForm()
      void refetchTarjetas()
    } catch {
      setFormError('No se pudo actualizar.')
    } finally {
      setGuardando(false)
    }
  }

  // ── Helpers cuotas ──

  function irAnterior() {
    if (mes === 0) { setMes(11); setAnio((a) => a - 1) }
    else setMes((m) => m - 1)
  }

  function irSiguiente() {
    if (!puedeAvanzar) return
    if (mes === 11) { setMes(0); setAnio((a) => a + 1) }
    else setMes((m) => m + 1)
  }

  const cuotasFiltradas = cuotas

  const cuotasIncluidas = useMemo(
    () => cuotas.filter((c) => c.incluir && c.estado !== 'PAGADO'),
    [cuotas],
  )

  const totalIncluido = useMemo(
    () => cuotasIncluidas.reduce((s, c) => s + montoNum(c.monto), 0),
    [cuotasIncluidas],
  )

  const totalFull = useMemo(
    () => cuotas.reduce((s, c) => s + montoNum(c.monto), 0),
    [cuotas],
  )

  const totalExcluido = useMemo(
    () => cuotas.filter((c) => !c.incluir).reduce((s, c) => s + montoNum(c.monto), 0),
    [cuotas],
  )

  const cargosTotal = useMemo(() => cargosAdicionales.reduce((s, c) => s + montoNum(c.monto), 0), [cargosAdicionales])
  const total = totalIncluido + cargosTotal

  const cuotasIncluidasCount = useMemo(
    () => cuotas.filter((c) => c.incluir && c.estado !== 'PAGADO').length,
    [cuotas],
  )

  const cuotasExcluidasCount = useMemo(
    () => cuotas.filter((c) => !c.incluir).length,
    [cuotas],
  )

  const estadoPorMovimiento = useMemo(() => {
    const map = new Map<number, 'ACTIVO' | 'PAGADO'>()
    for (const c of cuotasTarjeta) {
      if (c.movimiento == null) continue
      const movId = Number(c.movimiento)
      if (!Number.isFinite(movId)) continue
      const prev = map.get(movId)
      if (c.estado !== 'PAGADO') map.set(movId, 'ACTIVO')
      else if (!prev) map.set(movId, 'PAGADO')
    }
    return map
  }, [cuotasTarjeta])

  const utilizadoPersonalVisible = useMemo(() => {
    return movPersonal
      .filter((m) => m.tarjeta === tarjetaIdEfectivo && estadoPorMovimiento.has(m.id))
      .filter((m) => estadoPorMovimiento.get(m.id) != null)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 10)
  }, [movPersonal, tarjetaIdEfectivo, estadoPorMovimiento])

  const utilizadoComunVisible = useMemo(() => {
    return movComun
      .filter((m) => m.tarjeta === tarjetaIdEfectivo && estadoPorMovimiento.has(m.id))
      .filter((m) => estadoPorMovimiento.get(m.id) != null)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 10)
  }, [movComun, tarjetaIdEfectivo, estadoPorMovimiento])

  const totalCuotasPorMovimiento = useMemo(() => {
    const map = new Map<number, number>()
    for (const c of cuotasTarjeta) {
      if (c.movimiento == null) continue
      const mid = Number(c.movimiento)
      if (!Number.isFinite(mid)) continue
      const prev = map.get(mid) ?? 0
      map.set(mid, Math.max(prev, c.numero))
    }
    return map
  }, [cuotasTarjeta])

  const utilizadoPersonalPorCuenta = useMemo(() => {
    const map = new Map<
      string,
      { cuentaNombre: string; total: number; movimientos: MovimientoCredito[] }
    >()

    for (const m of movPersonal) {
      if (tarjetaIdEfectivo == null) continue
      if (m.tarjeta !== tarjetaIdEfectivo) continue
      if (estadoPorMovimiento.get(m.id) !== 'ACTIVO') continue
      const cuentaNombre = (m.cuenta_nombre ?? 'Sin cuenta').trim()
      const key = String(m.cuenta ?? 'sin-cuenta')
      const entry = map.get(key) ?? { cuentaNombre, total: 0, movimientos: [] }
      entry.total += montoNum(m.monto)
      entry.movimientos.push(m)
      map.set(key, entry)
    }

    return Array.from(map.values()).sort((a, b) => a.cuentaNombre.localeCompare(b.cuentaNombre, 'es'))
  }, [movPersonal, tarjetaIdEfectivo, estadoPorMovimiento])

  const totalDeudaActiva = useMemo(
    () => cuotasTarjeta.filter((c) => c.estado !== 'PAGADO').reduce((s, c) => s + montoNum(c.monto), 0),
    [cuotasTarjeta],
  )

  const totalDeudaActivaPersonal = useMemo(() => {
    return utilizadoPersonalVisible
      .filter((m) => estadoPorMovimiento.get(m.id) === 'ACTIVO')
      .reduce((s, m) => s + montoNum(m.monto), 0)
  }, [utilizadoPersonalVisible, estadoPorMovimiento])

  const totalDeudaActivaComun = Math.max(0, totalDeudaActiva - totalDeudaActivaPersonal)

  async function toggleIncluir(cuota: Cuota) {
    setActualizando((prev) => new Set(prev).add(cuota.id))
    try {
      await movimientosApi.updateCuota(cuota.id, { incluir: !cuota.incluir })
      void refetchCuotas()
    } catch {
      Alert.alert('Error', 'No se pudo actualizar la cuota.')
    } finally {
      setActualizando((prev) => { const s = new Set(prev); s.delete(cuota.id); return s })
    }
  }

  function parseMontoEnteroDesdeInput(input: string): number {
    const digits = input.replace(/\D/g, '')
    if (!digits) return 0
    return parseInt(digits, 10)
  }

  function agregarCargoAdicional() {
    const desc = cargoDesc.trim()
    const monto = parseMontoEnteroDesdeInput(cargoMonto)
    if (!desc) {
      Alert.alert('Falta descripción', 'Ingresa una descripción para el cargo.')
      return
    }
    if (!Number.isFinite(monto) || monto <= 0) {
      Alert.alert('Monto inválido', 'Ingresa un monto mayor a 0.')
      return
    }
    setCargosAdicionales((prev) => [...prev, { id: Date.now(), descripcion: desc, monto }])
    setCargoDesc('')
    setCargoMonto('')
    setFormularioCargoVisible(false)
  }

  function eliminarCargoAdicional(id: number) {
    setCargosAdicionales((prev) => prev.filter((c) => c.id !== id))
  }

  async function registrarPago() {
    const cuotasPorPagar = cuotas.filter((c) => c.incluir && c.estado !== 'PAGADO')
    if (cuotasPorPagar.length === 0 && total <= 0) return

    setModalConfirmarPago(false)
    setGuardandoPago(true)
    try {
      setActualizando(new Set(cuotasPorPagar.map((c) => c.id)))
      await movimientosApi.pagarTarjeta({
        tarjeta_id: tarjetaIdEfectivo as number,
        mes: mes + 1,
        anio,
        fecha_pago: new Date().toISOString().slice(0, 10),
        cuota_ids: cuotasPorPagar.map((c) => c.id),
      })
      setCargosAdicionales([])
      const totalCuotasPagadas = cuotasPorPagar.reduce((s, c) => s + montoNum(c.monto), 0)
      setTotalPagado(totalCuotasPagadas)
      setExitoPostPago(true)
      invalidateFinanzasTrasMovimiento(queryClient)
      void refetchCuotas()
      void refetchCuotasTarjeta()
      void refetchMovPersonal()
      void refetchMovComun()
    } catch {
      Alert.alert('Error', 'No se pudo registrar el pago.')
    } finally {
      setActualizando(new Set())
      setGuardandoPago(false)
    }
  }

  function abrirMenuPagarTarjeta(tarjeta: Tarjeta) {
    setTarjetaId(tarjeta.id)
    setMenuPagoVisible(true)
    // selección inicial se recalcula al render según cuotas activas
    setSeleccionPagoIds(null)
    void refetchCuotasTarjeta()
    void refetchMovPersonal()
    void refetchMovComun()
  }

  function toggleSeleccionPago(id: number) {
    setSeleccionPagoIds((prev) => {
      const todos = cuotasActivasConTipo.map((c) => c.id)
      if (prev == null) {
        const next = new Set(todos)
        next.delete(id)
        return next
      }
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const cuotasActivasMenuPago = useMemo(
    () => cuotasTarjeta.filter((c) => c.estado !== 'PAGADO'),
    [cuotasTarjeta],
  )

  const nowMonthIdx = hoy.getFullYear() * 12 + hoy.getMonth()
  const cuotasActivasConTipo = useMemo(() => {
    return cuotasActivasMenuPago.map((c) => {
      const idx = toMonthIndex(c.mes_facturacion)
      const porFacturar = idx != null && idx > nowMonthIdx
      return { ...c, porFacturar }
    })
  }, [cuotasActivasMenuPago, nowMonthIdx])

  const seleccionEfectivaPagoIds = useMemo(() => {
    if (seleccionPagoIds != null) return seleccionPagoIds
    return new Set(cuotasActivasConTipo.map((c) => c.id))
  }, [seleccionPagoIds, cuotasActivasConTipo])

  const totalSeleccionPago = useMemo(() => {
    return cuotasActivasConTipo
      .filter((c) => seleccionEfectivaPagoIds.has(c.id))
      .reduce((s, c) => s + montoNum(c.monto), 0)
  }, [cuotasActivasConTipo, seleccionEfectivaPagoIds])

  async function registrarPagoSeleccionadoMenu() {
    const ids = [...seleccionEfectivaPagoIds]
    if (ids.length === 0) return
    setGuardandoPago(true)
    try {
      await movimientosApi.pagarTarjeta({
        tarjeta_id: tarjetaIdEfectivo as number,
        mes: mes + 1,
        anio,
        fecha_pago: new Date().toISOString().slice(0, 10),
        cuota_ids: ids,
      })
      setMenuPagoVisible(false)
      setVistaActiva('FACTURADO')
      invalidateFinanzasTrasMovimiento(queryClient)
      void refetchCuotas()
      void refetchCuotasTarjeta()
      void refetchMovPersonal()
      void refetchMovComun()
    } catch {
      Alert.alert('Error', 'No se pudo registrar el pago de los ítems seleccionados.')
    } finally {
      setGuardandoPago(false)
    }
  }

  function abrirFormMovimientoConTarjeta() {
    if (tarjetaIdEfectivo == null) return
    movFormRef.current?.abrirNuevoConTarjetaCredito(tarjetaIdEfectivo)
  }

  function trasGuardarMovimientoDesdeTarjeta() {
    invalidateFinanzasTrasMovimiento(queryClient)
    void refetchCuotas()
    void refetchCuotasTarjeta()
    void refetchMovPersonal()
    void refetchMovComun()
    setVistaActiva('FACTURADO')
  }

  const tarjetaSeleccionada = useMemo(
    () => tarjetas.find((t) => t.id === tarjetaIdEfectivo) ?? null,
    [tarjetas, tarjetaIdEfectivo],
  )

  // ── Render ──

  return (
    <MobileShell title="Tarjetas">
      <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="px-5 pt-3">

          {/* ── Sección: Mis tarjetas ── */}
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-bold text-muted uppercase tracking-wide">Mis tarjetas</Text>
            {!agregando && editandoId === null && (
              <TouchableOpacity onPress={abrirNueva} className="px-3 py-1 bg-dark rounded-lg">
                <Text className="text-white text-xs font-semibold">+ Agregar</Text>
              </TouchableOpacity>
            )}
          </View>

          {loadingTarjetas && (
            <View className="py-6 items-center">
              <ActivityIndicator color="#0f0f0f" />
            </View>
          )}

          {!loadingTarjetas && tarjetas.length === 0 && !agregando && (
            <View className="bg-white border border-border rounded-xl p-6 mb-4 items-center">
              <Text className="text-muted text-sm text-center">
                No tienes tarjetas registradas.{'\n'}Agrega una para gestionar tus cuotas.
              </Text>
            </View>
          )}

          {!loadingTarjetas && tarjetas.map((t) => {
            if (editandoId === t.id) {
              return (
                <FormTarjeta
                  key={t.id}
                  titulo={`Editar ${t.nombre}`}
                  form={form}
                  setForm={setForm}
                  formError={formError}
                  guardando={guardando}
                  onGuardar={guardarEdicion}
                  onCancelar={cancelarForm}
                />
              )
            }
            const seleccionada = t.id === tarjetaIdEfectivo
            return (
              <View
                key={t.id}
                className={`bg-white border rounded-xl px-4 py-3 mb-2 ${seleccionada ? 'border-dark' : 'border-border'}`}
              >
                <TouchableOpacity activeOpacity={0.7} onPress={() => setTarjetaId(t.id)}>
                  <View className="flex-row items-center">
                    <View className="flex-1 mr-2">
                      <Text className="text-dark font-semibold text-sm">{t.nombre}</Text>
                      {t.banco ? <Text className="text-muted text-xs mt-0.5">{t.banco}</Text> : null}
                      {(t.dia_facturacion || t.dia_vencimiento) && (
                        <Text className="text-muted text-xs mt-0.5">
                          {[
                            t.dia_facturacion ? `Cierre día ${t.dia_facturacion}` : null,
                            t.dia_vencimiento ? `Vence día ${t.dia_vencimiento}` : null,
                          ].filter(Boolean).join('  ·  ')}
                        </Text>
                      )}
                    </View>
                    {seleccionada && (
                      <View className="w-5 h-5 rounded-full bg-dark items-center justify-center">
                        <Text className="text-white text-xs font-bold">✓</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
                <View className="flex-row gap-2 mt-2 pt-2 border-t border-border">
                  <TouchableOpacity
                    onPress={() => abrirEdicion(t)}
                    className="flex-1 border border-border rounded-lg py-1.5 items-center"
                  >
                    <Text className="text-dark text-xs font-semibold">Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => abrirMenuPagarTarjeta(t)}
                    className="flex-1 bg-dark rounded-lg py-1.5 items-center"
                  >
                    <Text className="text-white text-xs font-semibold">Pagar tarjeta</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          })}

          {agregando && (
            <FormTarjeta
              titulo="Nueva tarjeta"
              form={form}
              setForm={setForm}
              formError={formError}
              guardando={guardando}
              onGuardar={guardarNueva}
              onCancelar={cancelarForm}
            />
          )}

          {/* ── Sección: Pagar tarjeta (flujo completo) ── */}
          {tarjetaIdEfectivo != null && (
            <>
              <View className="h-px bg-border my-5" />

              <Text className="text-xs font-bold text-muted uppercase tracking-wide mb-2">
                Pagar tarjeta
              </Text>
              {tarjetaSeleccionada && (
                <Text className="text-dark font-semibold text-sm mb-3">
                  {tarjetaSeleccionada.nombre}
                </Text>
              )}

              {tarjetaSeleccionada?.dia_facturacion != null && (
                <Text className="text-muted text-xs mb-4">
                  Ciclo: del {tarjetaSeleccionada.dia_facturacion + 1} del mes anterior al{' '}
                  {tarjetaSeleccionada.dia_facturacion} de este mes
                  {tarjetaSeleccionada.dia_vencimiento != null
                    ? ` · Vence el ${tarjetaSeleccionada.dia_vencimiento} del mes siguiente`
                    : ''}
                </Text>
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
                  disabled={!puedeAvanzar}
                  className={`w-8 h-8 border rounded-lg items-center justify-center bg-white ${
                    !puedeAvanzar ? 'border-border/40' : 'border-border'
                  }`}
                >
                  <Text className={`text-lg ${!puedeAvanzar ? 'text-border' : 'text-dark'}`}>›</Text>
                </TouchableOpacity>
              </View>

              {/* Tabs Utilizado / Facturado */}
              <View className="flex-row border border-border rounded-lg overflow-hidden mb-4 bg-white">
                {(['UTILIZADO', 'FACTURADO'] as const).map((v, i) => (
                  <TouchableOpacity
                    key={v}
                    onPress={() => setVistaActiva(v)}
                    className={`flex-1 py-2.5 items-center ${
                      i > 0 ? 'border-l border-border' : ''
                    } ${vistaActiva === v ? 'bg-dark' : 'bg-white'}`}
                  >
                    <Text className={`text-xs font-semibold ${vistaActiva === v ? 'text-white' : 'text-muted'}`}>
                      {v === 'UTILIZADO' ? 'Utilizado' : 'Facturado'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {exitoPostPago ? (
                <View className="bg-white border border-border rounded-2xl p-5 mb-4">
                  <Text className="text-dark font-bold text-lg mb-2">Pago registrado</Text>
                  <Text className="text-muted text-sm mb-2">
                    {tarjetaSeleccionada?.nombre ?? 'Tarjeta'} — {MESES[mes]} {anio}
                  </Text>
                  <Text className="text-dark font-bold text-2xl mb-4">{formatMonto(totalPagado)}</Text>
                  <View className="flex-row gap-3">
                    {puedeAvanzar && (
                      <TouchableOpacity
                        onPress={() => {
                          setExitoPostPago(false)
                          if (puedeAvanzar) {
                            if (mes === 11) { setMes(0); setAnio((a) => a + 1) }
                            else setMes((m) => m + 1)
                          }
                        }}
                        className="flex-1 border border-border rounded-xl py-3 items-center"
                      >
                        <Text className="text-dark font-semibold text-sm">Ver otro mes</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => {
                        setExitoPostPago(false)
                        router.push('/(tabs)/index' as never)
                      }}
                      className={`flex-1 ${puedeAvanzar ? 'bg-dark rounded-xl py-3 items-center' : 'bg-dark rounded-xl py-3 items-center'}`}
                    >
                      <Text className="text-white font-semibold text-sm">Ir al dashboard</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  {vistaActiva === 'UTILIZADO' ? (
                    <>
                      {loadingCuotasTarjeta || movPersonalLoading || movComunLoading ? (
                        <View className="py-8 items-center">
                          <ActivityIndicator color="#0f0f0f" />
                        </View>
                      ) : errorCuotasTarjeta || movPersonalError || movComunError ? (
                        <View className="bg-danger/10 border border-danger/30 rounded-xl p-4">
                          <Text className="text-danger text-sm text-center">
                            {errorCuotasTarjeta || movPersonalError || movComunError || 'Error al cargar datos.'}
                          </Text>
                          <TouchableOpacity
                            onPress={() => {
                              void refetchCuotasTarjeta()
                              void refetchMovPersonal()
                              void refetchMovComun()
                            }}
                            className="mt-2"
                          >
                            <Text className="text-dark font-semibold text-sm text-center underline">Reintentar</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <>
                          <View className="bg-dark rounded-2xl p-5 mb-4">
                            <Text className="text-white/60 text-xs uppercase tracking-wide mb-1">Utilizado</Text>
                            <Text className="text-white font-bold text-2xl mb-1">
                              {formatMonto(totalDeudaActiva)}
                            </Text>
                            <Text className="text-white/60 text-xs">
                              Personales: {formatMonto(totalDeudaActivaPersonal)} · Comunes: {formatMonto(totalDeudaActivaComun)}
                            </Text>
                          </View>

                          <View className="mb-5">
                            <Text className="text-xs text-muted font-semibold uppercase mb-3">Gastos personales</Text>
                            {utilizadoPersonalPorCuenta.length === 0 ? (
                              <Text className="text-muted text-sm">Sin movimientos personales para este período.</Text>
                            ) : (
                              utilizadoPersonalPorCuenta.slice(0, 3).map((g) => (
                                <View key={g.cuentaNombre} className="bg-white border border-border rounded-xl p-4 mb-3">
                                  <View className="flex-row items-center justify-between mb-2">
                                    <Text className="text-dark font-semibold text-sm">{g.cuentaNombre}</Text>
                                    <Text className="text-dark font-semibold text-sm">{formatMonto(g.total)}</Text>
                                  </View>
                                  {g.movimientos.slice(0, 4).map((m) => {
                                    const estado = estadoPorMovimiento.get(m.id) ?? 'PAGADO'
                                    return (
                                      <View key={m.id} className="flex-row items-center justify-between py-2 border-t border-border">
                                        <View className="flex-1 pr-2">
                                          <Text className="text-muted text-xs">
                                            {m.fecha}
                                          </Text>
                                          <Text className="text-dark text-sm font-medium" numberOfLines={1}>
                                            {m.comentario || '—'}
                                          </Text>
                                          <Text className="text-muted text-xs">{m.categoria_nombre}</Text>
                                        </View>
                                        <View
                                          className="px-2 py-1 rounded-lg"
                                          style={{
                                            backgroundColor: estado === 'ACTIVO' ? '#fff7ed' : '#f0fdf4',
                                          }}
                                        >
                                          <Text
                                            className="text-xs font-semibold"
                                            style={{ color: estado === 'ACTIVO' ? '#f59e0b' : '#22c55e' }}
                                          >
                                            {estado === 'ACTIVO' ? 'Activo' : 'Pagado'}
                                          </Text>
                                        </View>
                                      </View>
                                    )
                                  })}
                                </View>
                              ))
                            )}
                            {utilizadoPersonalPorCuenta.length > 0 && (
                              <TouchableOpacity
                                onPress={() => {
                                  const first = utilizadoPersonalPorCuenta[0]?.movimientos[0]
                                  if (first?.cuenta != null) router.push(`/cuenta/${first.cuenta}` as never)
                                }}
                                className="mt-2"
                              >
                                <Text className="text-dark font-semibold text-sm underline">Ver detalle</Text>
                              </TouchableOpacity>
                            )}
                          </View>

                          <View>
                            <Text className="text-xs text-muted font-semibold uppercase mb-3">Gastos comunes</Text>
                            {utilizadoComunVisible.length === 0 ? (
                              <Text className="text-muted text-sm">Sin movimientos comunes para este período.</Text>
                            ) : (
                              <View className="bg-white border border-border rounded-xl p-4 mb-3">
                                {utilizadoComunVisible.slice(0, 6).map((m) => {
                                  const estado = estadoPorMovimiento.get(m.id) ?? 'PAGADO'
                                  return (
                                    <View key={m.id} className="flex-row items-center justify-between py-2 border-t border-border">
                                      <View className="flex-1 pr-2">
                                        <Text className="text-muted text-xs">{m.fecha}</Text>
                                        <Text className="text-dark text-sm font-medium" numberOfLines={1}>
                                          {m.comentario || '—'}
                                        </Text>
                                        <Text className="text-muted text-xs">{m.categoria_nombre}</Text>
                                      </View>
                                      <View
                                        className="px-2 py-1 rounded-lg"
                                        style={{ backgroundColor: estado === 'ACTIVO' ? '#fff7ed' : '#f0fdf4' }}
                                      >
                                        <Text
                                          className="text-xs font-semibold"
                                          style={{ color: estado === 'ACTIVO' ? '#f59e0b' : '#22c55e' }}
                                        >
                                          {estado === 'ACTIVO' ? 'Activo' : 'Pagado'}
                                        </Text>
                                      </View>
                                    </View>
                                  )
                                })}
                              </View>
                            )}
                            {utilizadoComunVisible.length > 0 && (
                              <TouchableOpacity onPress={() => router.push('/(tabs)/gastos' as never)} className="mt-2">
                                <Text className="text-dark font-semibold text-sm underline">Ver detalle</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {/* FACTURADO */}
                      {loadingCuotas ? (
                        <View className="py-8 items-center">
                          <ActivityIndicator color="#0f0f0f" />
                        </View>
                      ) : errorCuotas ? (
                        <View className="bg-danger/10 border border-danger/30 rounded-xl p-4">
                          <Text className="text-danger text-sm text-center">{errorCuotas}</Text>
                          <TouchableOpacity onPress={refetchCuotas} className="mt-2">
                            <Text className="text-dark font-semibold text-sm text-center underline">Reintentar</Text>
                          </TouchableOpacity>
                        </View>
                      ) : cuotas.length === 0 ? (
                        <View className="bg-white border border-border rounded-2xl p-8 items-center">
                          <Text className="text-muted text-sm text-center">Sin cuotas para este período.</Text>
                        </View>
                      ) : (
                        <>
                          <View className="flex-row items-center justify-between mb-3">
                            <Text className="text-xs text-muted font-semibold uppercase">Cuotas del mes</Text>
                            <View
                              className="px-3 py-1 rounded-full"
                              style={{
                                backgroundColor: cuotas.some((c) => c.estado !== 'PAGADO') ? '#fff7ed' : '#f0fdf4',
                              }}
                            >
                              <Text
                                className="text-xs font-semibold"
                                style={{ color: cuotas.some((c) => c.estado !== 'PAGADO') ? '#f59e0b' : '#22c55e' }}
                              >
                                {cuotas.some((c) => c.estado !== 'PAGADO') ? 'Pendiente' : 'Pagado'}
                              </Text>
                            </View>
                          </View>

                          <TouchableOpacity
                            onPress={abrirFormMovimientoConTarjeta}
                            className="bg-accent rounded-xl px-4 py-3 items-center mb-4"
                          >
                            <Text className="text-dark font-bold text-sm">+ Gasto</Text>
                          </TouchableOpacity>

                          <View className="bg-white border border-border rounded-xl overflow-hidden mb-4">
                            {cuotas.map((cuota, idx) => {
                              const badge = ESTADO_BADGE[cuota.estado]
                              const cargando = actualizando.has(cuota.id)
                              const isLast = idx === cuotas.length - 1
                              const deshabilitado = cuota.estado === 'PAGADO'
                              const totalCuotasMovimiento =
                                cuota.movimiento != null
                                  ? totalCuotasPorMovimiento.get(cuota.movimiento)
                                  : undefined
                              const lineaMov = lineaCategoriaComentarioCuota(cuota, detallePorMovimientoId)
                              return (
                                <View
                                  key={cuota.id}
                                  className={`px-4 py-3 flex-row ${!isLast ? 'border-b border-border' : ''}`}
                                  style={{ alignItems: 'flex-start' }}
                                >
                                  <TouchableOpacity
                                    onPress={() => {
                                      if (deshabilitado) return
                                      toggleIncluir(cuota)
                                    }}
                                    disabled={deshabilitado || cargando}
                                    className={`w-5 h-5 rounded border mr-3 mt-0.5 items-center justify-center ${
                                      cuota.incluir ? 'bg-dark border-dark' : 'border-border'
                                    }`}
                                  >
                                    {cargando ? (
                                      <ActivityIndicator size="small" color={cuota.incluir ? '#fff' : '#0f0f0f'} />
                                    ) : cuota.incluir ? (
                                      <Text className="text-white text-xs font-bold">✓</Text>
                                    ) : null}
                                  </TouchableOpacity>

                                  <View className="flex-1 min-w-0 mr-2">
                                    <Text className="text-dark font-medium text-sm" numberOfLines={1}>
                                      Cuota {cuota.numero}/{totalCuotasMovimiento ?? cuota.numero}
                                    </Text>
                                    <Text className="text-muted text-xs mt-0.5">{cuota.estado}</Text>
                                    {lineaMov ? (
                                      <Text className="text-dark text-xs mt-1.5 leading-snug" numberOfLines={4}>
                                        {lineaMov}
                                      </Text>
                                    ) : (
                                      <Text className="text-muted text-[11px] mt-1.5 italic" numberOfLines={1}>
                                        Sin categoría ni comentario
                                      </Text>
                                    )}
                                  </View>

                                  <View className="items-end gap-1 shrink-0">
                                    <Text className="text-dark font-semibold text-sm">{formatMonto(montoNum(cuota.monto))}</Text>
                                    <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: badge.bg }}>
                                      <Text className="text-[10px] font-semibold" style={{ color: badge.color }}>
                                        {badge.label}
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                              )
                            })}
                          </View>

                          {/* CARGOS ADICIONALES */}
                          <View className="bg-white border border-border rounded-xl p-4 mb-4">
                            <View className="flex-row items-center justify-between mb-3">
                              <Text className="text-xs text-muted font-semibold uppercase">Cargos adicionales</Text>
                              {!formularioCargoVisible && (
                                <TouchableOpacity
                                  onPress={() => {
                                    setFormularioCargoVisible(true)
                                    setCargoDesc('')
                                    setCargoMonto('')
                                  }}
                                  className="px-3 py-2 rounded-lg bg-white border border-border"
                                >
                                  <Text className="text-dark font-semibold text-sm">+ Agregar</Text>
                                </TouchableOpacity>
                              )}
                            </View>

                            {formularioCargoVisible && (
                              <View className="mb-3">
                                <TextInput
                                  value={cargoDesc}
                                  onChangeText={setCargoDesc}
                                  placeholder="Descripción (ej: Interés marzo)"
                                  placeholderTextColor="#888884"
                                  className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm mb-2"
                                />
                                <TextInput
                                  value={cargoMonto}
                                  onChangeText={(v) => setCargoMonto(v.replace(/\\D/g, '').slice(0, 12))}
                                  keyboardType="numeric"
                                  placeholder="Monto"
                                  placeholderTextColor="#888884"
                                  className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm mb-2"
                                />
                                <View className="flex-row gap-2">
                                  <TouchableOpacity
                                    onPress={agregarCargoAdicional}
                                    className="flex-1 bg-dark rounded-lg py-2.5 items-center"
                                  >
                                    <Text className="text-white font-semibold text-sm">✓</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => {
                                      setFormularioCargoVisible(false)
                                      setCargoDesc('')
                                      setCargoMonto('')
                                    }}
                                    className="flex-1 border border-border rounded-lg py-2.5 items-center"
                                  >
                                    <Text className="text-dark font-semibold text-sm">Cancelar</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            )}

                            {cargosAdicionales.length === 0 ? (
                              <Text className="text-muted text-sm">Sin cargos adicionales.</Text>
                            ) : (
                              <View>
                                {cargosAdicionales.map((c) => (
                                  <View key={c.id} className="flex-row items-center justify-between py-2 border-t border-border">
                                    <View className="flex-1 pr-3">
                                      <Text className="text-dark font-semibold text-sm" numberOfLines={1}>
                                        {c.descripcion}
                                      </Text>
                                      <Text className="text-muted text-xs">Intereses TC</Text>
                                    </View>
                                    <Text className="text-dark font-semibold text-sm mr-2">{formatMonto(c.monto)}</Text>
                                    <TouchableOpacity onPress={() => eliminarCargoAdicional(c.id)} hitSlop={8}>
                                      <Text className="text-danger text-sm">🗑</Text>
                                    </TouchableOpacity>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>

                          {/* TOTALES + REGISTRAR PAGO */}
                          <View className="bg-dark rounded-2xl px-5 py-4 mb-4">
                            <View className="flex-row justify-between items-center mb-1">
                              <Text className="text-white/60 text-xs uppercase tracking-wide">Incluido</Text>
                              <Text className="text-white font-bold text-sm">{formatMonto(totalIncluido)}</Text>
                            </View>
                            <View className="flex-row justify-between items-center mb-1">
                              <Text className="text-white/60 text-xs uppercase tracking-wide">Excluido</Text>
                              <Text className="text-white font-bold text-sm">{formatMonto(totalExcluido)}</Text>
                            </View>
                            {cargosTotal > 0 && (
                              <View className="flex-row justify-between items-center mb-1">
                                <Text className="text-white/60 text-xs uppercase tracking-wide">Cargos</Text>
                                <Text className="text-white font-bold text-sm">{formatMonto(cargosTotal)}</Text>
                              </View>
                            )}

                            <View className="h-px bg-white/10 my-3" />

                            <View className="flex-row justify-between items-center mb-3">
                              <Text className="text-white/60 text-xs uppercase tracking-wide">Total a pagar</Text>
                              <Text className="text-white font-bold text-xl">{formatMonto(total)}</Text>
                            </View>

                            <TouchableOpacity
                              disabled={guardandoPago || total === 0 || cuotasIncluidasCount === 0}
                              onPress={() => setModalConfirmarPago(true)}
                              className={`rounded-xl py-3.5 items-center ${guardandoPago || total === 0 || cuotasIncluidasCount === 0 ? 'bg-white/20' : 'bg-accent'}`}
                            >
                              <Text className="text-dark font-bold text-sm">
                                {guardandoPago ? 'Registrando…' : 'Registrar pago'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {/* Modal confirmación pago */}
              <Modal visible={modalConfirmarPago} transparent animationType="fade" onRequestClose={() => setModalConfirmarPago(false)}>
                <View className="flex-1 bg-black/50 justify-center px-6">
                  <View className="bg-white rounded-2xl p-5">
                    <Text className="text-lg font-bold text-dark mb-2">Registrar pago</Text>
                    <Text className="text-muted text-sm mb-3">
                      {tarjetaSeleccionada?.nombre ?? 'Tarjeta'} — {MESES[mes]} {anio}
                    </Text>
                    <Text className="text-dark text-sm mb-2">
                      {cuotasIncluidasCount} cuota{cuotasIncluidasCount !== 1 ? 's' : ''} incluidas
                    </Text>
                    {cuotasExcluidasCount > 0 && (
                      <Text className="text-muted text-sm mb-3">
                        {cuotasExcluidasCount} cuota{cuotasExcluidasCount !== 1 ? 's' : ''} pasa(n) al mes siguiente
                      </Text>
                    )}
                    <Text className="text-dark font-bold text-base mb-4">
                      Total a pagar {formatMonto(total)}
                    </Text>
                    <View className="flex-row gap-3">
                      <TouchableOpacity
                        onPress={() => setModalConfirmarPago(false)}
                        className="flex-1 border border-border rounded-xl py-3 items-center"
                      >
                        <Text className="text-dark font-semibold text-sm">Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => void registrarPago()}
                        disabled={guardandoPago}
                        className="flex-1 bg-dark rounded-xl py-3 items-center"
                      >
                        <Text className="text-white font-semibold text-sm">{guardandoPago ? 'Confirmando…' : 'Confirmar'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>

              {/* Menú pago rápido: facturado + por facturar */}
              <Modal visible={menuPagoVisible} transparent animationType="slide" onRequestClose={() => setMenuPagoVisible(false)}>
                <View className="flex-1 bg-black/50 justify-end">
                  <View className="bg-white rounded-t-2xl px-5 pt-4 pb-5" style={{ maxHeight: '85%' }}>
                    <View className="flex-row items-center justify-between mb-3">
                      <Text className="text-lg font-bold text-dark">Pagar tarjeta</Text>
                      <TouchableOpacity onPress={() => setMenuPagoVisible(false)}>
                        <Text className="text-muted text-xl">×</Text>
                      </TouchableOpacity>
                    </View>
                    <Text className="text-muted text-sm mb-3">
                      {tarjetaSeleccionada?.nombre ?? 'Tarjeta'} · Selecciona ítems facturados y por facturar.
                    </Text>

                    {loadingCuotasTarjeta ? (
                      <View className="py-8 items-center">
                        <ActivityIndicator color="#0f0f0f" />
                      </View>
                    ) : errorCuotasTarjeta ? (
                      <View className="bg-danger/10 border border-danger/30 rounded-xl p-4">
                        <Text className="text-danger text-sm text-center">{errorCuotasTarjeta}</Text>
                      </View>
                    ) : cuotasActivasConTipo.length === 0 ? (
                      <View className="bg-white border border-border rounded-xl p-6 items-center">
                        <Text className="text-muted text-sm text-center">No hay cuotas pendientes para esta tarjeta.</Text>
                      </View>
                    ) : (
                      <>
                        <View className="bg-dark rounded-xl p-4 mb-3">
                          <Text className="text-white/60 text-xs uppercase">Total seleccionado</Text>
                          <Text className="text-white font-bold text-2xl">{formatMonto(totalSeleccionPago)}</Text>
                        </View>

                        <ScrollView className="border border-border rounded-xl mb-4">
                          {cuotasActivasConTipo.map((c, idx) => {
                            const selected = seleccionEfectivaPagoIds.has(c.id)
                            const isLast = idx === cuotasActivasConTipo.length - 1
                            const lineaMov = lineaCategoriaComentarioCuota(c, detallePorMovimientoId)
                            return (
                              <TouchableOpacity
                                key={c.id}
                                onPress={() => toggleSeleccionPago(c.id)}
                                className={`px-4 py-3 flex-row ${!isLast ? 'border-b border-border' : ''}`}
                                style={{ alignItems: 'flex-start' }}
                              >
                                <View className={`w-5 h-5 rounded border mr-3 mt-0.5 items-center justify-center ${selected ? 'bg-dark border-dark' : 'border-border'}`}>
                                  {selected && <Text className="text-white text-xs font-bold">✓</Text>}
                                </View>
                                <View className="flex-1 min-w-0 mr-2">
                                  <Text className="text-dark font-medium text-sm" numberOfLines={1}>
                                    Cuota {c.numero}
                                  </Text>
                                  <Text className="text-muted text-xs mt-0.5">
                                    {c.porFacturar ? 'Por facturar' : 'Facturado'} · {c.mes_facturacion}
                                  </Text>
                                  {lineaMov ? (
                                    <Text className="text-dark text-xs mt-1.5 leading-snug" numberOfLines={4}>
                                      {lineaMov}
                                    </Text>
                                  ) : (
                                    <Text className="text-muted text-[11px] mt-1.5 italic" numberOfLines={1}>
                                      Sin categoría ni comentario
                                    </Text>
                                  )}
                                </View>
                                <Text className="text-dark font-semibold text-sm shrink-0">{formatMonto(montoNum(c.monto))}</Text>
                              </TouchableOpacity>
                            )
                          })}
                        </ScrollView>

                        <TouchableOpacity
                          onPress={() => {
                            setMenuPagoVisible(false)
                            abrirFormMovimientoConTarjeta()
                          }}
                          className="mb-3 rounded-xl border-2 border-border bg-white py-3.5 items-center"
                        >
                          <Text className="text-dark font-bold text-sm">+ Nuevo movimiento con esta tarjeta</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          disabled={guardandoPago || seleccionEfectivaPagoIds.size === 0}
                          onPress={() => void registrarPagoSeleccionadoMenu()}
                          className={`rounded-xl py-3.5 items-center ${guardandoPago || seleccionEfectivaPagoIds.size === 0 ? 'bg-dark/30' : 'bg-dark'}`}
                        >
                          <Text className="text-white font-bold text-sm">
                            {guardandoPago ? 'Registrando pago…' : 'Registrar pago'}
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              </Modal>
            </>
          )}
        </View>
      </ScrollView>
      <MovimientoFormulario
        ref={movFormRef}
        variant="overlay"
        onPostMovimientoGuardado={trasGuardarMovimientoDesdeTarjeta}
      />
    </MobileShell>
  )
}
