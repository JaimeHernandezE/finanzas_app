import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useApi } from '@finanzas/shared/hooks/useApi'
import { useTarjetas } from '@finanzas/shared/hooks/useCatalogos'
import { movimientosApi } from '@finanzas/shared/api/movimientos'
import { useConfig } from '@finanzas/shared/context/ConfigContext'
import { queryClient } from '../../lib/queryClient'
import { invalidateFinanzasTrasMovimiento } from '../../lib/invalidateFinanzasTrasMovimiento'
import { MobileShell } from '../../components/layout/MobileShell'
import {
  MovimientoFormulario,
  type MovimientoFormularioRef,
} from '../../components/movimientos/MovimientoFormulario'

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
  autor_nombre?: string
}

type VistaTarjeta = 'UTILIZADO' | 'FACTURADO'
type EstadoFacturacion = 'A_FACTURAR' | 'FACTURADO' | 'PAGADO' | 'VENCIDO'

interface CargoAdicional {
  id: number
  descripcion: string
  monto: number
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function montoNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function fechaCorta(iso: string): string {
  if (!iso) return '-'
  const partes = iso.split('-').map(Number)
  if (partes.length >= 3 && partes.every(Number.isFinite)) {
    const [y, m, d] = partes
    const local = new Date(y, m - 1, d)
    return local.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
  }
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return iso
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
}

function clampDiaMes(anio: number, mesIndex: number, dia: number): number {
  return Math.min(dia, new Date(anio, mesIndex + 1, 0).getDate())
}

function fechaIso(anio: number, mesIndex: number, dia: number): string {
  const d = clampDiaMes(anio, mesIndex, dia)
  return `${anio}-${String(mesIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

type DetalleMovMap = Map<number, { fecha: string; cat: string; com: string }>

function camposDesdeCuotaApi(c: Cuota): { cat: string; com: string } {
  const r = c as Cuota & Record<string, unknown>
  const cat = String(
    r.movimiento_categoria_nombre ?? r.movimientoCategoriaNombre ?? '',
  ).trim()
  const com = String(r.movimiento_comentario ?? r.movimientoComentario ?? '').trim()
  return { cat, com }
}

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

export default function TarjetaPagarScreen() {
  const { formatMonto } = useConfig()
  const router = useRouter()
  const params = useLocalSearchParams<{
    tarjeta?: string
    vista?: string
    mes?: string
    anio?: string
  }>()
  const movFormRef = useRef<MovimientoFormularioRef>(null)

  const hoy = new Date()
  const [mes, setMes] = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [vistaActiva, setVistaActiva] = useState<VistaTarjeta>('UTILIZADO')
  const [tarjetaId, setTarjetaId] = useState<number | null>(null)
  const [incluirPorCuota, setIncluirPorCuota] = useState<Record<number, boolean>>({})
  const [cargosAdicionales, setCargosAdicionales] = useState<CargoAdicional[]>([])
  const [formularioCargoVisible, setFormularioCargoVisible] = useState(false)
  const [cargoDesc, setCargoDesc] = useState('')
  const [cargoMonto, setCargoMonto] = useState('')
  const [modalConfirmarPago, setModalConfirmarPago] = useState(false)
  const [modalConfirmarPagoFinal, setModalConfirmarPagoFinal] = useState(false)
  const [guardandoPago, setGuardandoPago] = useState(false)
  const [exitoPostPago, setExitoPostPago] = useState(false)
  const [totalPagado, setTotalPagado] = useState(0)
  const initParamsApplied = useRef(false)

  const { data: tarjetasRaw, loading: loadingTarjetas, refetch: refetchTarjetas } = useTarjetas()
  const tarjetas = (tarjetasRaw as Tarjeta[] | null) ?? []

  useEffect(() => {
    if (!tarjetas.length) return
    const paramId = params.tarjeta != null ? parseInt(String(params.tarjeta), 10) : NaN
    if (Number.isFinite(paramId) && tarjetas.some((t) => t.id === paramId)) {
      setTarjetaId(paramId)
      return
    }
    if (tarjetaId == null || !tarjetas.some((t) => t.id === tarjetaId)) {
      setTarjetaId(tarjetas[0].id)
    }
  }, [params.tarjeta, tarjetas, tarjetaId])

  useEffect(() => {
    if (initParamsApplied.current) return
    initParamsApplied.current = true

    const vistaParam = String(params.vista ?? '').toUpperCase()
    if (vistaParam === 'UTILIZADO' || vistaParam === 'FACTURADO') {
      setVistaActiva(vistaParam as VistaTarjeta)
    }

    const mesParam = parseInt(String(params.mes ?? ''), 10)
    if (Number.isFinite(mesParam) && mesParam >= 0 && mesParam <= 11) {
      setMes(mesParam)
    }

    const anioParam = parseInt(String(params.anio ?? ''), 10)
    if (Number.isFinite(anioParam) && anioParam >= 2000 && anioParam <= 2100) {
      setAnio(anioParam)
    }
  }, [params.vista, params.mes, params.anio])

  const tarjetaIdEfectivo = tarjetaId ?? tarjetas[0]?.id ?? null
  const tarjetaSeleccionada = useMemo(
    () => tarjetas.find((t) => t.id === tarjetaIdEfectivo) ?? null,
    [tarjetas, tarjetaIdEfectivo],
  )

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
  const firmaInclusionCuotas = useMemo(
    () => cuotas.map((c) => `${c.id}:${c.incluir ? 1 : 0}`).join('|'),
    [cuotas],
  )
  useEffect(() => {
    setIncluirPorCuota((prev) => {
      const next: Record<number, boolean> = {}
      for (const c of cuotas) next[c.id] = Boolean(c.incluir)

      const prevKeys = Object.keys(prev).map(Number)
      const nextKeys = Object.keys(next).map(Number)
      if (prevKeys.length !== nextKeys.length) return next
      for (const k of nextKeys) {
        if (prev[k] !== next[k]) return next
      }
      return prev
    })
  }, [firmaInclusionCuotas, cuotas])

  const {
    data: cuotasTarjetaData,
    loading: loadingCuotasTarjeta,
    error: errorCuotasTarjeta,
    refetch: refetchCuotasTarjeta,
  } = useApi<Cuota[]>(
    () => {
      if (tarjetaIdEfectivo == null) return Promise.resolve({ data: [] as Cuota[] })
      return movimientosApi.getCuotas({ tarjeta: tarjetaIdEfectivo }) as Promise<{ data: Cuota[] }>
    },
    [tarjetaIdEfectivo],
  )
  const cuotasTarjeta = cuotasTarjetaData ?? []

  const {
    data: movPersonalData,
    loading: movPersonalLoading,
    error: movPersonalError,
    refetch: refetchMovPersonal,
  } = useApi<MovimientoCredito[]>(
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
  const {
    data: movComunData,
    loading: movComunLoading,
    error: movComunError,
    refetch: refetchMovComun,
  } = useApi<MovimientoCredito[]>(
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

  const detallePorMovimientoId = useMemo(() => {
    const map: DetalleMovMap = new Map()
    if (tarjetaIdEfectivo == null) return map
    const put = (m: MovimientoCredito) => {
      if (m.tarjeta !== tarjetaIdEfectivo) return
      const id = Number(m.id)
      if (!Number.isFinite(id)) return
      map.set(id, {
        fecha: m.fecha,
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
      const onBackPress = () => {
        router.replace('/(tabs)/tarjetas' as never)
        return true
      }
      const backSub = BackHandler.addEventListener('hardwareBackPress', onBackPress)

      if (omitirPrimerFoco.current) {
        omitirPrimerFoco.current = false
        return () => backSub.remove()
      }
      void refetchTarjetas()
      void refetchCuotas()
      void refetchCuotasTarjeta()
      void refetchMovPersonal()
      void refetchMovComun()
      return () => backSub.remove()
    }, [router, refetchTarjetas, refetchCuotas, refetchCuotasTarjeta, refetchMovPersonal, refetchMovComun]),
  )

  const toMonthIndex = (fechaIso: string): number | null => {
    if (!fechaIso) return null
    const raw = String(fechaIso).trim()
    if (!raw) return null

    // API suele enviar "YYYY-MM" para mes_facturacion.
    const ym = raw.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/)
    if (ym) {
      const y = Number(ym[1])
      const m = Number(ym[2])
      if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
        return y * 12 + (m - 1)
      }
    }

    const d = new Date(raw)
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
  const maxMesNavegableIdx = maxMesActivoIdx != null ? maxMesActivoIdx + 1 : null
  const hayCuotasActivas = useMemo(
    () => cuotasTarjeta.some((c) => c.estado !== 'PAGADO'),
    [cuotasTarjeta],
  )
  // Si hay cuotas activas pero no logramos inferir mes tope por datos incompletos, no bloqueamos avanzar.
  const puedeAvanzar =
    hayCuotasActivas && (maxMesNavegableIdx == null ? true : anio * 12 + mes < maxMesNavegableIdx)

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
  const deudaActivaPorMovimiento = useMemo(() => {
    const map = new Map<number, number>()
    for (const c of cuotasTarjeta) {
      if (c.estado === 'PAGADO' || c.movimiento == null) continue
      const movId = Number(c.movimiento)
      if (!Number.isFinite(movId)) continue
      const previo = map.get(movId) ?? 0
      map.set(movId, previo + montoNum(c.monto))
    }
    return map
  }, [cuotasTarjeta])

  const utilizadoPersonalVisible = useMemo(() => {
    return movPersonal
      .filter((m) => m.tarjeta === tarjetaIdEfectivo && deudaActivaPorMovimiento.has(m.id))
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 10)
  }, [movPersonal, tarjetaIdEfectivo, deudaActivaPorMovimiento])

  const utilizadoComunVisible = useMemo(() => {
    return movComun
      .filter((m) => m.tarjeta === tarjetaIdEfectivo && deudaActivaPorMovimiento.has(m.id))
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 10)
  }, [movComun, tarjetaIdEfectivo, deudaActivaPorMovimiento])

  const utilizadoPersonalPorCuenta = useMemo(() => {
    const map = new Map<string, { cuentaNombre: string; total: number; movimientos: MovimientoCredito[] }>()
    for (const m of utilizadoPersonalVisible) {
      const cuentaNombre = (m.cuenta_nombre ?? 'Sin cuenta').trim()
      const key = String(m.cuenta ?? 'sin-cuenta')
      const entry = map.get(key) ?? { cuentaNombre, total: 0, movimientos: [] }
      entry.total += deudaActivaPorMovimiento.get(m.id) ?? 0
      entry.movimientos.push(m)
      map.set(key, entry)
    }
    return Array.from(map.values()).sort((a, b) => a.cuentaNombre.localeCompare(b.cuentaNombre, 'es'))
  }, [utilizadoPersonalVisible, deudaActivaPorMovimiento])

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

  const totalDeudaActiva = useMemo(
    () => cuotasTarjeta.filter((c) => c.estado !== 'PAGADO').reduce((s, c) => s + montoNum(c.monto), 0),
    [cuotasTarjeta],
  )
  const totalDeudaActivaPersonal = useMemo(
    () => utilizadoPersonalVisible.reduce((s, m) => s + (deudaActivaPorMovimiento.get(m.id) ?? 0), 0),
    [utilizadoPersonalVisible, deudaActivaPorMovimiento],
  )
  const totalDeudaActivaComun = Math.max(0, totalDeudaActiva - totalDeudaActivaPersonal)

  const cuotaIncluida = useCallback(
    (cuota: Cuota) => incluirPorCuota[cuota.id] ?? Boolean(cuota.incluir),
    [incluirPorCuota],
  )

  const totalIncluido = useMemo(
    () =>
      cuotas
        .filter((c) => cuotaIncluida(c) && c.estado !== 'PAGADO')
        .reduce((s, c) => s + montoNum(c.monto), 0),
    [cuotas, cuotaIncluida],
  )
  const totalExcluido = useMemo(
    () => cuotas.filter((c) => !cuotaIncluida(c)).reduce((s, c) => s + montoNum(c.monto), 0),
    [cuotas, cuotaIncluida],
  )
  const cargosTotal = useMemo(() => cargosAdicionales.reduce((s, c) => s + montoNum(c.monto), 0), [cargosAdicionales])
  const total = totalIncluido + cargosTotal
  const cuotasIncluidasCount = useMemo(
    () => cuotas.filter((c) => cuotaIncluida(c) && c.estado !== 'PAGADO').length,
    [cuotas, cuotaIncluida],
  )
  const cuotasExcluidasCount = useMemo(
    () => cuotas.filter((c) => !cuotaIncluida(c)).length,
    [cuotas, cuotaIncluida],
  )
  const cicloFacturacionTexto = useMemo(() => {
    if (tarjetaSeleccionada?.dia_facturacion == null) return null
    const df = tarjetaSeleccionada.dia_facturacion
    const dv = tarjetaSeleccionada.dia_vencimiento
    const inicioMesAnterior = new Date(anio, mes - 1, 1)
    const cierreMesActual = new Date(anio, mes, 1)
    const inicio = fechaCorta(
      fechaIso(inicioMesAnterior.getFullYear(), inicioMesAnterior.getMonth(), df + 1),
    )
    const fin = fechaCorta(
      fechaIso(cierreMesActual.getFullYear(), cierreMesActual.getMonth(), df),
    )
    let vencimientoTexto = ''
    if (dv != null) {
      const vencMes = dv < df ? mes + 1 : mes
      const vencAnio = dv < df && mes === 11 ? anio + 1 : anio
      const fechaVencimiento = fechaCorta(fechaIso(vencAnio, vencMes, dv))
      vencimientoTexto = ` · Vence el ${fechaVencimiento}`
    }
    return `Ciclo: del ${inicio} al ${fin}${vencimientoTexto}`
  }, [tarjetaSeleccionada?.dia_facturacion, tarjetaSeleccionada?.dia_vencimiento, anio, mes])
  const estadoFacturacionData = useMemo(() => {
    const df = tarjetaSeleccionada?.dia_facturacion
    const dv = tarjetaSeleccionada?.dia_vencimiento
    const mesSeleccionadoIdx = anio * 12 + mes
    const cuotasPagadasMes = cuotas.filter(c => c.estado === 'PAGADO').length
    const cuotasPendientesMes = cuotas.some(c => c.estado !== 'PAGADO')
    const pendientesPrevios = cuotasTarjeta.some((c) => {
      if (c.estado === 'PAGADO') return false
      const idx = toMonthIndex(c.mes_facturacion)
      return idx != null && idx < mesSeleccionadoIdx
    })
    const hayPendiente = cuotasPendientesMes || pendientesPrevios

    if (!df) {
      if (cuotasPagadasMes > 0 && !hayPendiente) {
        return { estado: 'PAGADO' as EstadoFacturacion, cuotasPagadas: cuotasPagadasMes }
      }
      return { estado: hayPendiente ? 'FACTURADO' as EstadoFacturacion : 'A_FACTURAR' as EstadoFacturacion, cuotasPagadas: cuotasPagadasMes }
    }

    const hoy = new Date()
    const hoySinHora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
    const cierreSel = new Date(anio, mes, clampDiaMes(anio, mes, df))
    if (cuotasPagadasMes > 0 && !hayPendiente) {
      return { estado: 'PAGADO' as EstadoFacturacion, cuotasPagadas: cuotasPagadasMes }
    }

    if (!hayPendiente) {
      return { estado: hoySinHora <= cierreSel ? 'A_FACTURAR' as EstadoFacturacion : 'FACTURADO' as EstadoFacturacion, cuotasPagadas: 0 }
    }

    const prevIdxs = cuotasTarjeta
      .filter(c => c.estado !== 'PAGADO')
      .map(c => toMonthIndex(c.mes_facturacion))
      .filter((v): v is number => v != null && v < mesSeleccionadoIdx)
    const cicloObjetivoIdx = cuotasPendientesMes
      ? mesSeleccionadoIdx
      : (prevIdxs.length > 0 ? Math.max(...prevIdxs) : mesSeleccionadoIdx)
    const cicloAnio = Math.floor(cicloObjetivoIdx / 12)
    const cicloMes = cicloObjetivoIdx % 12
    const cierreCiclo = new Date(cicloAnio, cicloMes, clampDiaMes(cicloAnio, cicloMes, df))
    if (!pendientesPrevios && hoySinHora <= cierreCiclo) {
      return { estado: 'A_FACTURAR' as EstadoFacturacion, cuotasPagadas: 0 }
    }
    if (dv == null) {
      return { estado: 'FACTURADO' as EstadoFacturacion, cuotasPagadas: 0 }
    }
    const vencMes = dv < df ? cicloMes + 1 : cicloMes
    const vencAnio = dv < df && cicloMes === 11 ? cicloAnio + 1 : cicloAnio
    const fechaVencimiento = new Date(vencAnio, vencMes, clampDiaMes(vencAnio, vencMes, dv))
    return {
      estado: hoySinHora > fechaVencimiento ? 'VENCIDO' as EstadoFacturacion : 'FACTURADO' as EstadoFacturacion,
      cuotasPagadas: 0,
    }
  }, [tarjetaSeleccionada?.dia_facturacion, tarjetaSeleccionada?.dia_vencimiento, anio, mes, cuotas, cuotasTarjeta])
  const etiquetaFacturacion = estadoFacturacionData.estado === 'A_FACTURAR'
    ? 'A facturar'
    : estadoFacturacionData.estado === 'PAGADO'
      ? 'Pagado'
      : estadoFacturacionData.estado === 'VENCIDO'
        ? 'Vencido'
        : 'Facturado'
  const etiquetaFacturacionDetalle = estadoFacturacionData.estado === 'PAGADO'
    ? `Pagado (${estadoFacturacionData.cuotasPagadas} cuota${estadoFacturacionData.cuotasPagadas === 1 ? '' : 's'})`
    : etiquetaFacturacion

  function toggleIncluir(cuota: Cuota) {
    if (cuota.estado === 'PAGADO') return
    setIncluirPorCuota((prev) => ({ ...prev, [cuota.id]: !cuotaIncluida(cuota) }))
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
      Alert.alert('Falta descripcion', 'Ingresa una descripcion para el cargo.')
      return
    }
    if (!Number.isFinite(monto) || monto <= 0) {
      Alert.alert('Monto invalido', 'Ingresa un monto mayor a 0.')
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
    const cuotasPorPagar = cuotas.filter((c) => cuotaIncluida(c) && c.estado !== 'PAGADO')
    if (!tarjetaIdEfectivo || cuotasPorPagar.length === 0) {
      Alert.alert('Sin seleccion', 'No hay cuotas seleccionadas para pagar.')
      return
    }

    setGuardandoPago(true)
    try {
      await movimientosApi.pagarTarjeta({
        tarjeta_id: tarjetaIdEfectivo,
        mes: mes + 1,
        anio,
        fecha_pago: new Date().toISOString().slice(0, 10),
        cuota_ids: cuotasPorPagar.map((c) => c.id),
      })
      setCargosAdicionales([])
      const totalCuotasPagadas = cuotasPorPagar.reduce((s, c) => s + montoNum(c.monto), 0)
      setTotalPagado(totalCuotasPagadas)
      setExitoPostPago(true)
      setModalConfirmarPago(false)
      setModalConfirmarPagoFinal(false)
      invalidateFinanzasTrasMovimiento(queryClient)
      void refetchCuotas()
      void refetchCuotasTarjeta()
      void refetchMovPersonal()
      void refetchMovComun()
    } catch {
      Alert.alert('Error', 'No se pudo registrar el pago.')
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

  function irEditarMovimiento(movimientoId: number) {
    const returnTo = `/(tabs)/tarjeta-pagar?tarjeta=${tarjetaIdEfectivo ?? ''}&vista=${vistaActiva}&mes=${mes}&anio=${anio}`
    router.push(
      `/nuevo-movimiento?editar=${movimientoId}&returnTo=${encodeURIComponent(returnTo)}` as never,
    )
  }

  function irAnterior() {
    if (mes === 0) {
      setMes(11)
      setAnio((a) => a - 1)
    } else {
      setMes((m) => m - 1)
    }
  }
  function irSiguiente() {
    if (!puedeAvanzar) return
    if (mes === 11) {
      setMes(0)
      setAnio((a) => a + 1)
    } else {
      setMes((m) => m + 1)
    }
  }

  if (loadingTarjetas) {
    return (
      <MobileShell title="Pagar tarjeta">
        <View className="flex-1 items-center justify-center bg-surface">
          <ActivityIndicator color="#0f0f0f" />
        </View>
      </MobileShell>
    )
  }

  if (!tarjetaSeleccionada) {
    return (
      <MobileShell title="Pagar tarjeta">
        <View className="flex-1 bg-surface px-5 pt-6">
          <View className="bg-white border border-border rounded-xl p-5">
            <Text className="text-dark font-semibold text-base mb-2">No hay tarjetas disponibles</Text>
            <Text className="text-muted text-sm mb-4">Primero registra una tarjeta para continuar.</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/tarjetas' as never)} className="bg-dark rounded-xl py-3 items-center">
              <Text className="text-white font-semibold text-sm">Ir a tarjetas</Text>
            </TouchableOpacity>
          </View>
        </View>
      </MobileShell>
    )
  }

  return (
    <MobileShell title="Pagar tarjeta">
      <ScrollView className="flex-1 bg-surface" contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="px-5 pt-3">
          <TouchableOpacity
            onPress={() => router.replace('/(tabs)/tarjetas' as never)}
            className="mb-3 self-start"
          >
            <Text className="text-dark text-sm font-semibold">← Volver al listado</Text>
          </TouchableOpacity>
          <View className="mb-3">
            <Text className="text-xs font-bold text-muted uppercase tracking-wide mb-1">Tarjeta</Text>
            <Text className="text-dark font-semibold text-sm">{tarjetaSeleccionada.nombre}</Text>
            {!!tarjetaSeleccionada.banco && (
              <Text className="text-muted text-xs mt-0.5">{tarjetaSeleccionada.banco}</Text>
            )}
          </View>

          {cicloFacturacionTexto != null && (
            <Text className="text-muted text-xs mb-4">
              {cicloFacturacionTexto}
            </Text>
          )}

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

          <View className="flex-row border border-border rounded-lg overflow-hidden mb-4 bg-white">
            {(['UTILIZADO', 'FACTURADO'] as const).map((v, i) => (
              <TouchableOpacity
                key={v}
                onPress={() => setVistaActiva(v)}
                className={`flex-1 py-2.5 items-center ${i > 0 ? 'border-l border-border' : ''} ${
                  vistaActiva === v ? 'bg-dark' : 'bg-white'
                }`}
              >
                <Text className={`text-xs font-semibold ${vistaActiva === v ? 'text-white' : 'text-muted'}`}>
                  {v === 'UTILIZADO' ? 'Utilizado' : etiquetaFacturacion}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {exitoPostPago ? (
            <View className="bg-white border border-border rounded-2xl p-5 mb-4">
              <Text className="text-dark font-bold text-lg mb-2">Pago registrado</Text>
              <Text className="text-muted text-sm mb-2">
                {tarjetaSeleccionada.nombre} — {MESES[mes]} {anio}
              </Text>
              <Text className="text-dark font-bold text-2xl mb-4">{formatMonto(totalPagado)}</Text>
              <View className="flex-row gap-3">
                {puedeAvanzar && (
                  <TouchableOpacity
                    onPress={() => {
                      setExitoPostPago(false)
                      if (puedeAvanzar) {
                        if (mes === 11) {
                          setMes(0)
                          setAnio((a) => a + 1)
                        } else {
                          setMes((m) => m + 1)
                        }
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
                  className="flex-1 bg-dark rounded-xl py-3 items-center"
                >
                  <Text className="text-white font-semibold text-sm">Ir al dashboard</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : vistaActiva === 'UTILIZADO' ? (
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
                      utilizadoPersonalPorCuenta.map((g) => (
                        <View key={g.cuentaNombre} className="bg-white border border-border rounded-xl p-4 mb-3">
                          <View className="flex-row items-center justify-between mb-2">
                            <Text className="text-dark font-semibold text-sm">{g.cuentaNombre}</Text>
                            <Text className="text-dark font-semibold text-sm">{formatMonto(g.total)}</Text>
                          </View>
                          {g.movimientos.map((m) => {
                            const estado = estadoPorMovimiento.get(m.id) ?? 'PAGADO'
                            return (
                              <TouchableOpacity
                                key={m.id}
                                onPress={() => irEditarMovimiento(m.id)}
                                className="flex-row items-center justify-between py-2 border-t border-border"
                              >
                                <View className="flex-1 pr-2">
                                  <Text className="text-muted text-xs">{fechaCorta(m.fecha)}</Text>
                                  <Text className="text-dark text-sm font-medium" numberOfLines={1}>
                                    {m.comentario || '—'}
                                  </Text>
                                  <Text className="text-muted text-xs">{m.categoria_nombre}</Text>
                                </View>
                                <View className="items-end">
                                  <View
                                    className="px-2 py-1 rounded-lg mb-1"
                                    style={{ backgroundColor: estado === 'ACTIVO' ? '#fff7ed' : '#f0fdf4' }}
                                  >
                                    <Text
                                      className="text-xs font-semibold"
                                      style={{ color: estado === 'ACTIVO' ? '#f59e0b' : '#22c55e' }}
                                    >
                                      {estado === 'ACTIVO' ? 'Activo' : 'Pagado'}
                                    </Text>
                                  </View>
                                  <Text className="text-dark text-xs font-semibold">
                                    {formatMonto(deudaActivaPorMovimiento.get(m.id) ?? 0)}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            )
                          })}
                        </View>
                      ))
                    )}
                  </View>

                  <View>
                    <Text className="text-xs text-muted font-semibold uppercase mb-3">Gastos comunes</Text>
                    {utilizadoComunVisible.length === 0 ? (
                      <Text className="text-muted text-sm">Sin movimientos comunes para este período.</Text>
                    ) : (
                      <View className="bg-white border border-border rounded-xl p-4 mb-3">
                        {utilizadoComunVisible.map((m) => {
                          const estado = estadoPorMovimiento.get(m.id) ?? 'PAGADO'
                          return (
                            <TouchableOpacity
                              key={m.id}
                              onPress={() => irEditarMovimiento(m.id)}
                              className="flex-row items-center justify-between py-2 border-t border-border"
                            >
                              <View className="flex-1 pr-2">
                                <Text className="text-muted text-xs">{fechaCorta(m.fecha)}</Text>
                                <Text className="text-dark text-sm font-medium" numberOfLines={1}>
                                  {m.comentario || '—'}
                                </Text>
                                <Text className="text-muted text-xs">
                                  {m.categoria_nombre}
                                  {m.autor_nombre ? ` · ${m.autor_nombre}` : ''}
                                </Text>
                              </View>
                              <View className="items-end">
                                <View
                                  className="px-2 py-1 rounded-lg mb-1"
                                  style={{ backgroundColor: estado === 'ACTIVO' ? '#fff7ed' : '#f0fdf4' }}
                                >
                                  <Text
                                    className="text-xs font-semibold"
                                    style={{ color: estado === 'ACTIVO' ? '#f59e0b' : '#22c55e' }}
                                  >
                                    {estado === 'ACTIVO' ? 'Activo' : 'Pagado'}
                                  </Text>
                                </View>
                                <Text className="text-dark text-xs font-semibold">
                                  {formatMonto(deudaActivaPorMovimiento.get(m.id) ?? 0)}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                    )}
                  </View>
                </>
              )}
            </>
          ) : (
            <>
              {loadingCuotas ? (
                <View className="py-8 items-center">
                  <ActivityIndicator color="#0f0f0f" />
                </View>
              ) : errorCuotas ? (
                <View className="bg-danger/10 border border-danger/30 rounded-xl p-4">
                  <Text className="text-danger text-sm text-center">{errorCuotas}</Text>
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
                        backgroundColor:
                          estadoFacturacionData.estado === 'VENCIDO'
                            ? '#fef2f2'
                            : estadoFacturacionData.estado === 'A_FACTURAR'
                              ? '#fff7ed'
                              : '#f0fdf4',
                      }}
                    >
                      <Text
                        className="text-xs font-semibold"
                        style={{
                          color:
                            estadoFacturacionData.estado === 'VENCIDO'
                              ? '#b91c1c'
                              : estadoFacturacionData.estado === 'A_FACTURAR'
                                ? '#f59e0b'
                                : '#22c55e',
                        }}
                      >
                        {etiquetaFacturacionDetalle}
                      </Text>
                    </View>
                  </View>

                  <View className="bg-white border border-border rounded-xl overflow-hidden mb-4">
                    {cuotas.map((cuota, idx) => {
                      const isLast = idx === cuotas.length - 1
                      const deshabilitado = cuota.estado === 'PAGADO'
                      const incluida = cuotaIncluida(cuota)
                      const movimientoId = cuota.movimiento != null ? Number(cuota.movimiento) : NaN
                      const totalCuotasMovimiento =
                        cuota.movimiento != null ? totalCuotasPorMovimiento.get(cuota.movimiento) : undefined
                      const lineaMov = lineaCategoriaComentarioCuota(cuota, detallePorMovimientoId)
                      const det = Number.isFinite(movimientoId) ? detallePorMovimientoId.get(movimientoId) : undefined
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
                            disabled={deshabilitado}
                            className={`w-5 h-5 rounded border mr-3 mt-0.5 items-center justify-center ${
                              incluida ? 'bg-dark border-dark' : 'border-border'
                            }`}
                          >
                            {incluida ? (
                              <Text className="text-white text-xs font-bold">✓</Text>
                            ) : null}
                          </TouchableOpacity>

                          <TouchableOpacity
                            disabled={!Number.isFinite(movimientoId)}
                            onPress={() => {
                              if (!Number.isFinite(movimientoId)) return
                              irEditarMovimiento(movimientoId)
                            }}
                            className="flex-1 min-w-0 mr-2"
                          >
                            <Text className="text-dark font-medium text-sm" numberOfLines={1}>
                              Cuota {cuota.numero}/{totalCuotasMovimiento ?? cuota.numero}
                            </Text>
                            <Text className="text-muted text-xs mt-0.5">
                              {det?.fecha ? fechaCorta(det.fecha) : cuota.mes_facturacion}
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
                          </TouchableOpacity>

                          <View className="items-end gap-1 shrink-0">
                            <Text className="text-dark font-semibold text-sm">{formatMonto(montoNum(cuota.monto))}</Text>
                            <Text className="text-muted text-[10px]">{cuota.estado}</Text>
                          </View>
                        </View>
                      )
                    })}
                  </View>

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
                          placeholder="Descripcion (ej: Interes marzo)"
                          placeholderTextColor="#888884"
                          className="border border-border rounded-lg px-3 py-2.5 text-dark bg-surface text-sm mb-2"
                        />
                        <TextInput
                          value={cargoMonto}
                          onChangeText={(v) => setCargoMonto(v.replace(/\D/g, '').slice(0, 12))}
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
                      onPress={() => {
                        setModalConfirmarPagoFinal(false)
                        setModalConfirmarPago(true)
                      }}
                      className={`rounded-xl py-3.5 items-center ${
                        guardandoPago || total === 0 || cuotasIncluidasCount === 0 ? 'bg-white/20' : 'bg-accent'
                      }`}
                    >
                      <Text className="text-dark font-bold text-sm">
                        {guardandoPago ? 'Registrando...' : 'Registrar pago'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View className="bg-white border border-border rounded-xl p-4 mb-4">
                    <Text className="text-dark font-semibold text-sm mb-2">Nuevo movimiento en esta tarjeta</Text>
                    <Text className="text-muted text-xs mb-3">
                      Registra un gasto con método crédito asociado a {tarjetaSeleccionada.nombre}.
                    </Text>
                    <TouchableOpacity
                      onPress={abrirFormMovimientoConTarjeta}
                      className="bg-accent rounded-xl px-4 py-3 items-center"
                    >
                      <Text className="text-dark font-bold text-sm">+ Nuevo movimiento con esta tarjeta</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </>
          )}

          <Modal
            visible={modalConfirmarPago}
            transparent
            animationType="fade"
            onRequestClose={() => {
              if (guardandoPago) return
              if (modalConfirmarPagoFinal) setModalConfirmarPagoFinal(false)
              else setModalConfirmarPago(false)
            }}
          >
            <View className="flex-1 bg-black/50 justify-center px-6">
              <View className="bg-white rounded-2xl p-5">
                {!modalConfirmarPagoFinal ? (
                  <>
                    <Text className="text-lg font-bold text-dark mb-2">Registrar pago</Text>
                    <Text className="text-muted text-sm mb-3">
                      {tarjetaSeleccionada.nombre} — {MESES[mes]} {anio}
                    </Text>
                    <Text className="text-dark text-sm mb-2">
                      {cuotasIncluidasCount} cuota{cuotasIncluidasCount !== 1 ? 's' : ''} incluidas
                    </Text>
                    {cuotasExcluidasCount > 0 && (
                      <Text className="text-muted text-sm mb-3">
                        {cuotasExcluidasCount} cuota{cuotasExcluidasCount !== 1 ? 's' : ''} se movera(n) al mes siguiente al registrar el pago
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
                        onPress={() => setModalConfirmarPagoFinal(true)}
                        className="flex-1 bg-dark rounded-xl py-3 items-center"
                      >
                        <Text className="text-white font-semibold text-sm">Continuar</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <Text className="text-lg font-bold text-dark mb-2">Confirmacion final</Text>
                    <Text className="text-muted text-sm mb-4">
                      Al aceptar, las cuotas incluidas se registraran como pagadas y se generara un movimiento en efectivo por cada cuota pagada.
                    </Text>
                    <View className="flex-row gap-3">
                      <TouchableOpacity
                        onPress={() => setModalConfirmarPagoFinal(false)}
                        className="flex-1 border border-border rounded-xl py-3 items-center"
                      >
                        <Text className="text-dark font-semibold text-sm">Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => void registrarPago()}
                        disabled={guardandoPago}
                        className="flex-1 bg-dark rounded-xl py-3 items-center"
                      >
                        <Text className="text-white font-semibold text-sm">
                          {guardandoPago ? 'Registrando...' : 'Aceptar y registrar'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </View>
          </Modal>
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
