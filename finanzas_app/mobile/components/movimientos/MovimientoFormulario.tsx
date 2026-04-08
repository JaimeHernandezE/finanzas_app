import {
  useState,
  useMemo,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useRef,
} from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView as RNScrollView,
  Keyboard,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useCategorias, useMetodosPago, useTarjetas } from '@finanzas/shared/hooks/useCatalogos'
import { movimientosApi } from '@finanzas/shared/api/movimientos'
import { finanzasApi, type CuentaPersonalApi } from '@finanzas/shared/api/finanzas'
import { useApi } from '@finanzas/shared/hooks/useApi'
import { queryClient } from '../../lib/queryClient'
import {
  createMovimientoOptimistic,
  patchMovimientoOptimistic,
} from '../../lib/movimientosOffline'

export type MovimientoFormularioRef = {
  abrirNuevoComun: () => void
  /** Nuevo egreso a crédito con tarjeta fija (p. ej. desde pantalla Tarjetas). */
  abrirNuevoConTarjetaCredito: (tarjetaId: number) => void
  iniciarEdicion: (id: number) => void
}

interface MovimientoApiDetalle {
  id: number
  fecha: string
  tipo: 'INGRESO' | 'EGRESO'
  ambito: 'PERSONAL' | 'COMUN'
  categoria: number
  cuenta: number | null
  monto: string | number
  comentario: string
  metodo_pago: number
  tarjeta: number | null
  num_cuotas: number | null
  monto_cuota: string | number | null
  ingreso_comun: number | null
}

interface Categoria {
  id: number
  nombre: string
  tipo: string
  categoria_padre: number | null
  es_padre: boolean
}
interface MetodoPago {
  id: number
  nombre: string
  tipo: string
}
interface Tarjeta {
  id: number
  nombre: string
}
type TipoMovimiento = 'EGRESO' | 'INGRESO'
type MetodoTipo = 'EFECTIVO' | 'DEBITO' | 'CREDITO'

/** Igual que la web: el API acepta monto como string decimal (MovimientoFormPage). */
function montoPayloadDesdeForm(montoEntero: number): string {
  return String(montoEntero)
}

function normalizarTipoMetodo(raw: string | undefined | null): MetodoTipo | null {
  const s = String(raw ?? '').trim().toUpperCase()
  if (s === 'EFECTIVO' || s === 'DEBITO' || s === 'CREDITO') return s
  return null
}

/**
 * Resuelve el id de MetodoPago como la web (`metodos.find(x => x.tipo === metodo)`),
 * con respaldo por nombre del catálogo sembrado en el backend (p. ej. «Débito»).
 */
function resolverMetodoPagoId(metodos: MetodoPago[], metodoTipo: MetodoTipo): number | null {
  const porTipo = metodos.find((x) => normalizarTipoMetodo(x.tipo) === metodoTipo)
  if (porTipo) return porTipo.id

  const nombresPorTipo: Record<MetodoTipo, string[]> = {
    EFECTIVO: ['Efectivo'],
    DEBITO: ['Débito', 'Debito'],
    CREDITO: ['Crédito', 'Credito'],
  }
  const candidatos = nombresPorTipo[metodoTipo]
  const porNombre = metodos.find((x) =>
    candidatos.some((n) => x.nombre?.trim().localeCompare(n, 'es', { sensitivity: 'base' }) === 0),
  )
  return porNombre?.id ?? null
}

/** Igual que inputs web: N° cuotas entre 1 y 48 (MovimientoFormPage). */
const NUM_CUOTAS_MIN = 1
const NUM_CUOTAS_MAX = 48

/** Texto del método para el usuario (alertas); mismo criterio para Débito, Crédito y Efectivo. */
function etiquetaMetodoPagoUsuario(metodoTipo: MetodoTipo): string {
  switch (metodoTipo) {
    case 'EFECTIVO':
      return 'Efectivo'
    case 'DEBITO':
      return 'Débito'
    case 'CREDITO':
      return 'Crédito'
    default:
      return metodoTipo
  }
}

// ── Helpers de formato ────────────────────────────────────────────────────────

/** "25000" → "$ 25.000"  (vacío → "") */
function formatearMiles(raw: string): string {
  const s = raw.trim().replace(',', '.')
  if (!s) return ''
  const [intRaw, decRaw] = s.split('.')
  const intDigits = (intRaw ?? '').replace(/\D/g, '')
  if (!intDigits) return ''
  const intFormatted = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const decDigits = (decRaw ?? '').replace(/\D/g, '').slice(0, 2)
  return decDigits ? `$ ${intFormatted}.${decDigits}` : `$ ${intFormatted}`
}

/** "$ 25.000" → "25000" */
function parsearDigitos(display: string): string {
  return display.replace(/\D/g, '')
}

/** "30000.50" -> "30000.50" (max 2 decimales). Devuelve '' si inválido/vacío. */
function parsearMontoDecimal(raw: string): string {
  // En UI el valor de cuota se maneja como entero (sin decimales).
  // API suele devolver string tipo "30000.00", así que descartamos todo desde el separador decimal.
  const normalized = raw.trim().replace(/,/g, '.')
  const firstSegment = normalized.split('.')[0] ?? ''
  const digits = firstSegment.replace(/\D/g, '')
  return digits || ''
}

/** "2025-03-15" → "15/03/2025" */
function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

/** "15/03/2025" → "2025-03-15"  (retorna '' si inválida) */
function displayToIso(display: string): string {
  const parts = display.split('/')
  if (parts.length !== 3) return ''
  const [d, m, y] = parts
  if (!d || !m || !y || y.length !== 4) return ''
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function todayDisplay(): string {
  return isoToDisplay(new Date().toISOString().slice(0, 10))
}

/** Mientras el usuario escribe dd/mm/aaaa, auto-inserta barras */
function autoFormatFecha(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

// ─────────────────────────────────────────────────────────────────────────────

function formInicial() {
  return {
    comentario: '',
    monto: '',
    categoria: 0,
    tarjeta: 0,
    num_cuotas: '',
    monto_cuota: '',
    fecha: todayDisplay(),
    ambito: 'COMUN' as 'COMUN' | 'PERSONAL',
    cuenta: 0,
  }
}
const FORM_INICIAL = formInicial()

function cuentaPersonalPrimero(a: CuentaPersonalApi, b: CuentaPersonalApi) {
  const ap = a.nombre.trim().toLowerCase() === 'personal'
  const bp = b.nombre.trim().toLowerCase() === 'personal'
  if (ap && !bp) return -1
  if (!ap && bp) return 1
  return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
}

export type MovimientoFormularioProps = {
  /** Modal sobre Gastos comunes vs pantalla completa desde una cuenta */
  variant: 'overlay' | 'standalone'
  /** @deprecated — ya no es necesario, el overlay usa Modal nativo */
  sheetMarginBottom?: number
  refetchMovimientosComun?: () => void
  /** Tras crear movimiento desde `abrirNuevoConTarjetaCredito` (sin navegar a cuenta). */
  onPostMovimientoGuardado?: () => void
  /** En standalone: id de cuenta personal fija */
  cuentaPersonalFija?: number
}

export const MovimientoFormulario = forwardRef<MovimientoFormularioRef, MovimientoFormularioProps>(
  function MovimientoFormulario(
    { variant, refetchMovimientosComun, onPostMovimientoGuardado, cuentaPersonalFija },
    ref,
  ) {
    const router = useRouter()
    const insets = useSafeAreaInsets()
    const esStandalone = variant === 'standalone'
    const cuentaFija =
      esStandalone && cuentaPersonalFija != null && Number.isFinite(cuentaPersonalFija)
        ? cuentaPersonalFija
        : null

    const { nuevo, ambito, cuenta, editar, returnTo } = useLocalSearchParams<{
      nuevo?: string
      ambito?: string
      cuenta?: string
      editar?: string
      returnTo?: string
    }>()
    const returnToSafe =
      returnTo && String(returnTo).startsWith('/') ? String(returnTo) : null

    const { data: metData, loading: loadingMetodos } = useMetodosPago()
    const { data: tarjetasData } = useTarjetas()

    const { data: cuentasRes } = useApi<CuentaPersonalApi[]>(() => finanzasApi.getCuentasPersonales(), [])
    const cuentasPropias = useMemo(() => {
      const list = ((cuentasRes ?? []) as CuentaPersonalApi[]).filter((c) => c.es_propia)
      return [...list].sort(cuentaPersonalPrimero)
    }, [cuentasRes])

    const nombreCuentaFija = useMemo(() => {
      if (cuentaFija == null) return ''
      const all = (cuentasRes ?? []) as CuentaPersonalApi[]
      return all.find((c) => c.id === cuentaFija)?.nombre ?? `Cuenta #${cuentaFija}`
    }, [cuentaFija, cuentasRes])

    const [showForm, setShowForm] = useState(false)
    const [saving, setSaving] = useState(false)
    const [tipo, setTipo] = useState<TipoMovimiento>('EGRESO')
    const [metodoTipo, setMetodoTipo] = useState<MetodoTipo>('DEBITO')
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
    const [form, setForm] = useState(FORM_INICIAL)
    const [editingId, setEditingId] = useState<number | null>(null)
    const [vinculoIngresoComun, setVinculoIngresoComun] = useState(false)
    const [loadingDetalle, setLoadingDetalle] = useState(false)
    const [showCategoriaPicker, setShowCategoriaPicker] = useState(false)
    const [busquedaCategoria, setBusquedaCategoria] = useState('')
    /** PK de metodo_pago del GET (edición); se sincroniza con `metodos` cuando el catálogo carga — igual que MovimientoEditarPage en web. */
    const [baseMetodoPagoId, setBaseMetodoPagoId] = useState<number | null>(null)
    /** Modo «nuevo gasto con esta tarjeta»: crédito + tarjeta fijos; ámbito y cuenta editables. */
    const [creditoTarjetaFijaId, setCreditoTarjetaFijaId] = useState<number | null>(null)
    const submitLockRef = useRef(false)
    const formScrollRef = useRef<RNScrollView | null>(null)
    const [keyboardHeight, setKeyboardHeight] = useState(0)
    const { data: catData } = useCategorias({
      ambito: form.ambito === 'COMUN' ? 'FAMILIAR' : 'PERSONAL',
      tipo,
      cuenta: form.ambito === 'PERSONAL' && form.cuenta > 0 ? form.cuenta : undefined,
    })
    const categorias = (catData as Categoria[] | null) ?? []
    const metodos = (metData as MetodoPago[] | null) ?? []
    const tarjetas = (tarjetasData as Tarjeta[] | null) ?? []

    const modoTarjetaCreditoFija = creditoTarjetaFijaId != null

    const cerrarForm = useCallback(() => {
      if (esStandalone && returnToSafe) {
        router.replace(returnToSafe as never)
        return
      }
      if (esStandalone && cuentaFija != null) {
        router.replace(`/cuenta/${cuentaFija}` as never)
        return
      }
      setShowForm(false)
      setEditingId(null)
      setVinculoIngresoComun(false)
      setLoadingDetalle(false)
      setErrorGeneral(null)
      setBaseMetodoPagoId(null)
      setCreditoTarjetaFijaId(null)
    }, [esStandalone, cuentaFija, returnToSafe, router])

    function setField<K extends keyof typeof FORM_INICIAL>(key: K, val: (typeof FORM_INICIAL)[K]) {
      setForm((f) => ({ ...f, [key]: val }))
    }

    function abrirNuevoComun() {
      setLoadingDetalle(false)
      setEditingId(null)
      setVinculoIngresoComun(false)
      setCreditoTarjetaFijaId(null)
      setForm(formInicial())
      setTipo('EGRESO')
      setMetodoTipo('DEBITO')
      setErrorGeneral(null)
      setBaseMetodoPagoId(null)
      setShowForm(true)
    }

    function abrirNuevoConTarjetaCredito(tarjetaId: number) {
      setLoadingDetalle(false)
      setEditingId(null)
      setVinculoIngresoComun(false)
      setCreditoTarjetaFijaId(tarjetaId)
      const inicial = formInicial()
      inicial.ambito = 'PERSONAL'
      inicial.cuenta = cuentasPropias[0]?.id ?? 0
      inicial.tarjeta = tarjetaId
      inicial.num_cuotas = '1'
      setForm(inicial)
      setTipo('EGRESO')
      setMetodoTipo('CREDITO')
      setErrorGeneral(null)
      setBaseMetodoPagoId(null)
      setShowForm(true)
    }

    const iniciarEdicion = useCallback(
      async (id: number) => {
        setErrorGeneral(null)
        setEditingId(null)
        setVinculoIngresoComun(false)
        setCreditoTarjetaFijaId(null)
        setShowForm(true)
        setLoadingDetalle(true)
        try {
          const res = await movimientosApi.getMovimiento(id)
          const data = res.data as MovimientoApiDetalle
          setBaseMetodoPagoId(data.metodo_pago)
          const metodoInmediato = metodos.find((x) => x.id === data.metodo_pago)
          const mtInmediato = normalizarTipoMetodo(metodoInmediato?.tipo)
          const fechaIso =
            typeof data.fecha === 'string' ? data.fecha.slice(0, 10) : String(data.fecha)
          setMetodoTipo(mtInmediato ?? 'DEBITO')
          setTipo(data.tipo as TipoMovimiento)
          setVinculoIngresoComun(Boolean(data.ingreso_comun))
          setForm({
            comentario: data.comentario ?? '',
            monto: String(Math.round(Number(data.monto))),
            categoria: Number(data.categoria),
            tarjeta: data.tarjeta != null ? Number(data.tarjeta) : 0,
            num_cuotas: data.num_cuotas != null ? String(data.num_cuotas) : '',
            monto_cuota:
              data.monto_cuota != null && data.monto_cuota !== ''
                ? parsearMontoDecimal(String(data.monto_cuota))
                : '',
            fecha: isoToDisplay(fechaIso),
            ambito: data.ambito as 'COMUN' | 'PERSONAL',
            cuenta: data.cuenta != null ? Number(data.cuenta) : 0,
          })
          setEditingId(id)
        } catch {
          cerrarForm()
          Alert.alert('Error', 'No se pudo cargar el movimiento para editar.')
        } finally {
          setLoadingDetalle(false)
        }
      },
      [metodos, cerrarForm],
    )

    useEffect(() => {
      if (baseMetodoPagoId == null || !metodos.length) return
      const mp = metodos.find((m) => m.id === baseMetodoPagoId)
      const t = normalizarTipoMetodo(mp?.tipo)
      if (t) setMetodoTipo(t)
    }, [baseMetodoPagoId, metodos])

    useEffect(() => {
      const onShow = Keyboard.addListener('keyboardDidShow', (e) => {
        setKeyboardHeight(e.endCoordinates?.height ?? 0)
      })
      const onHide = Keyboard.addListener('keyboardDidHide', () => {
        setKeyboardHeight(0)
      })
      return () => {
        onShow.remove()
        onHide.remove()
      }
    }, [])

    useEffect(() => {
      if (!modoTarjetaCreditoFija || !showForm) return
      if (form.ambito !== 'PERSONAL') return
      if (form.cuenta !== 0) return
      const first = cuentasPropias[0]?.id
      if (first) setForm((f) => ({ ...f, cuenta: first }))
    }, [modoTarjetaCreditoFija, showForm, form.ambito, form.cuenta, cuentasPropias])

    useImperativeHandle(ref, () => ({
      abrirNuevoComun,
      abrirNuevoConTarjetaCredito,
      iniciarEdicion,
    }))

    useEffect(() => {
      if (esStandalone && cuentaFija != null) {
        setEditingId(null)
        setVinculoIngresoComun(false)
        setForm({
          ...formInicial(),
          ambito: 'PERSONAL',
          cuenta: cuentaFija,
        })
        setTipo('EGRESO')
        setMetodoTipo('DEBITO')
        setErrorGeneral(null)
        setBaseMetodoPagoId(null)
        setShowForm(true)
      }
    }, [esStandalone, cuentaFija])

    useEffect(() => {
      if (esStandalone) return
      if (nuevo === '1') {
        const ambitoForm = ambito === 'PERSONAL' ? 'PERSONAL' : 'COMUN'
        const cuentaIdRaw = Number(cuenta ?? '0')
        const cuentaId = Number.isFinite(cuentaIdRaw) ? cuentaIdRaw : 0
        setEditingId(null)
        setVinculoIngresoComun(false)
        setCreditoTarjetaFijaId(null)
        setForm({
          ...formInicial(),
          ambito: ambitoForm,
          cuenta: ambitoForm === 'PERSONAL' ? cuentaId : 0,
        })
        setTipo('EGRESO')
        setMetodoTipo('DEBITO')
        setErrorGeneral(null)
        setBaseMetodoPagoId(null)
        setShowForm(true)
        router.replace('/(tabs)/gastos')
      }
    }, [esStandalone, nuevo, ambito, cuenta, router])

    useEffect(() => {
      if (esStandalone) return
      if (!editar) return
      const idNum = parseInt(String(editar), 10)
      if (!Number.isFinite(idNum)) {
        router.replace('/(tabs)/gastos')
        return
      }
      if (idNum < 0) {
        Alert.alert(
          'Espera',
          'Este movimiento aún se está sincronizando. No se puede editar hasta tener el ID del servidor.',
        )
        router.replace('/(tabs)/gastos')
        return
      }
      void iniciarEdicion(idNum)
      router.replace('/(tabs)/gastos')
    }, [esStandalone, editar, router, iniciarEdicion])

    // ── Edición en modo standalone ──
    // En el modo overlay (gastos) la edición se dispara desde el ref, pero en la pantalla completa
    // `nuevo-movimiento?editar=...` debemos iniciar la edición desde el query param.
    useEffect(() => {
      if (!esStandalone) return
      if (!editar) return
      const idNum = parseInt(String(editar), 10)
      if (!Number.isFinite(idNum)) {
        router.replace((returnToSafe ?? '/(tabs)') as never)
        return
      }
      if (idNum < 0) {
        Alert.alert(
          'Espera',
          'Este movimiento aún se está sincronizando. No se puede editar hasta tener el ID del servidor.',
        )
        router.replace((returnToSafe ?? '/(tabs)') as never)
        return
      }
      void iniciarEdicion(idNum)
    }, [esStandalone, editar, returnToSafe, router, iniciarEdicion])

    // Categorías filtradas por tipo (las del picker usan busquedaCategoria adicionalmente)
    const categoriasPorTipo = useMemo(
      () =>
        categorias
          .filter((c) => c.tipo === tipo)
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })),
      [categorias, tipo],
    )

    /**
     * Categorías visibles en el picker según búsqueda y jerarquía:
     * - Si hay texto de búsqueda: muestra todas las que coincidan (padre o hija)
     * - Si no hay búsqueda: primero las padres (con sus hijas debajo), luego las sin padre
     */
    const categoriasFiltradas = useMemo(() => {
      const query = busquedaCategoria.trim().toLowerCase()
      if (query) {
        return categoriasPorTipo.filter((c) =>
          c.nombre.toLowerCase().includes(query),
        )
      }
      // Sin búsqueda: agrupar por padre
      const padres = categoriasPorTipo.filter((c) => c.es_padre)
      const hijas = categoriasPorTipo.filter((c) => !c.es_padre && c.categoria_padre != null)
      const sueltas = categoriasPorTipo.filter((c) => !c.es_padre && c.categoria_padre == null)
      const resultado: (Categoria & { _esHija?: boolean })[] = []
      for (const padre of padres) {
        resultado.push(padre)
        for (const hija of hijas.filter((h) => h.categoria_padre === padre.id)) {
          resultado.push({ ...hija, _esHija: true })
        }
      }
      resultado.push(...sueltas)
      return resultado
    }, [categoriasPorTipo, busquedaCategoria])

    const categoriaNombre = useMemo(() => {
      return categorias.find((c) => c.id === form.categoria)?.nombre ?? null
    }, [categorias, form.categoria])

    const metodoPagoId = useMemo(
      () => resolverMetodoPagoId(metodos, metodoTipo),
      [metodos, metodoTipo],
    )

    const montoEnteroForm = useMemo(
      () => parseInt(parsearDigitos(form.monto), 10) || 0,
      [form.monto],
    )

    /** Vista previa de la cuota (prioriza la cuota manual si se ingresa). */
    const previewMontoCuotaCredito = useMemo(() => {
      if (metodoTipo !== 'CREDITO' || !form.num_cuotas.trim()) return null
      const n = parseInt(form.num_cuotas, 10)
      if (!Number.isFinite(n) || n < NUM_CUOTAS_MIN || montoEnteroForm <= 0) return null

      const manualRaw = form.monto_cuota.trim()
      if (manualRaw) {
        const manual = parsearMontoDecimal(manualRaw)
        const manualNum = manual ? Number(manual) : NaN
        if (!manual || !Number.isFinite(manualNum) || manualNum <= 0) return null
        return manual
      }

      return String(Math.ceil(montoEnteroForm / n))
    }, [metodoTipo, form.num_cuotas, form.monto_cuota, montoEnteroForm])

    function onElegirMetodoPago(m: MetodoTipo) {
      if (modoTarjetaCreditoFija) return
      if (metodoTipo === 'CREDITO' && m !== 'CREDITO') {
        setField('tarjeta', 0)
        setField('num_cuotas', '')
        setField('monto_cuota', '')
      }
      setMetodoTipo(m)
    }

    function onFocusComentario() {
      // Asegura visibilidad del campo descripción por encima del teclado.
      setTimeout(() => {
        formScrollRef.current?.scrollToEnd({ animated: true })
      }, 80)
      setTimeout(() => {
        formScrollRef.current?.scrollToEnd({ animated: true })
      }, 220)
    }

    // Ámbito en overlay: solo lectura salvo modo tarjeta fija (desde Tarjetas).
    const mostrarAmbitoSoloLectura =
      !esStandalone && !vinculoIngresoComun && !cuentaFija && !modoTarjetaCreditoFija
    const mostrarAmbitoEditable =
      !esStandalone && !vinculoIngresoComun && !cuentaFija && modoTarjetaCreditoFija

    async function guardar() {
      setErrorGeneral(null)
      const monto = parseInt(parsearDigitos(form.monto), 10)
      if (!monto || monto <= 0) {
        Alert.alert('Monto inválido', 'Ingresa un monto mayor a 0.')
        return
      }
      const fechaIso = displayToIso(form.fecha)
      if (!fechaIso) {
        Alert.alert('Fecha inválida', 'Ingresa la fecha en formato DD/MM/AAAA.')
        return
      }

      if (vinculoIngresoComun && editingId != null) {
        if (editingId < 0) {
          Alert.alert(
            'Espera',
            'Este movimiento aún se está sincronizando con el servidor.',
          )
          return
        }
        if (submitLockRef.current) return
        submitLockRef.current = true
        setSaving(true)
        try {
          patchMovimientoOptimistic(
            queryClient,
            editingId,
            {
              fecha: fechaIso,
              monto: montoPayloadDesdeForm(monto),
              comentario: form.comentario.trim(),
            },
            {
              fecha: fechaIso,
              monto,
              comentario: form.comentario.trim(),
            },
          )
          const idCuentaTrasGuardar = form.ambito === 'PERSONAL' ? form.cuenta : 0
          if (esStandalone && returnToSafe) {
            router.replace(returnToSafe as never)
          } else if (esStandalone && cuentaFija != null) {
            router.replace(`/cuenta/${idCuentaTrasGuardar || cuentaFija}` as never)
          } else {
            cerrarForm()
            if (idCuentaTrasGuardar > 0) {
              router.replace(`/cuenta/${idCuentaTrasGuardar}` as never)
            } else {
              refetchMovimientosComun?.()
            }
          }
        } catch (err: unknown) {
          const ax = err as { response?: { data?: Record<string, string[] | string> } }
          const data = ax.response?.data
          if (data && typeof data === 'object' && !Array.isArray(data)) {
            const msg = Object.values(data)
              .map((v) => (Array.isArray(v) ? v.join(' ') : String(v)))
              .join(' ')
            setErrorGeneral(msg || 'No se pudo guardar el movimiento.')
          } else {
            setErrorGeneral('No se pudo guardar el movimiento. Verifica la conexión.')
          }
        } finally {
          setSaving(false)
          submitLockRef.current = false
        }
        return
      }

      if (!form.categoria) {
        Alert.alert('Falta categoría', 'Selecciona una categoría.')
        return
      }
      if (loadingMetodos) {
        Alert.alert('Cargando', 'Espera un momento mientras se cargan los métodos de pago.')
        return
      }

      // Crédito: misma validación que la web (MovimientoFormPage / MovimientoEditarPage)
      if (tipo === 'EGRESO' && metodoTipo === 'CREDITO') {
        if (tarjetas.length === 0) {
          Alert.alert(
            'Sin tarjetas',
            'Crea al menos una tarjeta en Configuración para registrar gastos con crédito.',
          )
          return
        }
        if (!form.tarjeta) {
          Alert.alert('Falta tarjeta', 'Selecciona una tarjeta.')
          return
        }
        if (!form.num_cuotas.trim()) {
          Alert.alert('Faltan cuotas', 'Ingresa el número de cuotas.')
          return
        }
        const nc = parseInt(form.num_cuotas, 10)
        if (
          !Number.isFinite(nc) ||
          nc < NUM_CUOTAS_MIN ||
          nc > NUM_CUOTAS_MAX
        ) {
          Alert.alert(
            'N° cuotas',
            `Ingresa un número entre ${NUM_CUOTAS_MIN} y ${NUM_CUOTAS_MAX}.`,
          )
          return
        }

        if (form.monto_cuota.trim()) {
          const manual = parsearMontoDecimal(form.monto_cuota)
          const manualNum = manual ? Number(manual) : NaN
          if (!manual || !Number.isFinite(manualNum) || manualNum <= 0) {
            Alert.alert('Valor cuota', 'Ingresa un valor de cuota manual mayor a 0.')
            return
          }
        }
      }

      // Cuenta personal: la web solo exige cuenta si hay cuentas propias disponibles
      if (form.ambito === 'PERSONAL' && cuentasPropias.length > 0 && !form.cuenta) {
        Alert.alert('Falta cuenta', 'Selecciona una cuenta personal para registrar el movimiento.')
        return
      }

      if (!metodoPagoId) {
        const etiqueta = etiquetaMetodoPagoUsuario(metodoTipo)
        Alert.alert('Falta método de pago', `No hay método «${etiqueta}» configurado.`)
        return
      }

      const cuotas =
        tipo === 'EGRESO' && metodoTipo === 'CREDITO' && form.num_cuotas.trim()
          ? parseInt(form.num_cuotas, 10)
          : null
      const montoCuotaCalculado =
        cuotas && cuotas > 0 && monto > 0 ? Math.ceil(monto / cuotas) : null
      const montoCuotaManual =
        tipo === 'EGRESO' && metodoTipo === 'CREDITO' && form.monto_cuota.trim()
          ? parsearMontoDecimal(form.monto_cuota) || null
          : null

      const payload = {
        tipo,
        ambito: form.ambito,
        fecha: fechaIso,
        comentario: form.comentario.trim(),
        monto: montoPayloadDesdeForm(monto),
        categoria: form.categoria,
        metodo_pago: metodoPagoId,
        cuenta:
          form.ambito === 'PERSONAL' && form.cuenta > 0 ? form.cuenta : null,
        tarjeta:
          tipo === 'EGRESO' && metodoTipo === 'CREDITO' && form.tarjeta ? form.tarjeta : null,
        num_cuotas:
          tipo === 'EGRESO' && metodoTipo === 'CREDITO' && cuotas ? cuotas : null,
        monto_cuota:
          tipo === 'EGRESO' && metodoTipo === 'CREDITO' ? montoCuotaManual ?? montoCuotaCalculado : null,
      }

      const cuentaDestino =
        payload.ambito === 'PERSONAL' && payload.cuenta ? Number(payload.cuenta) : 0

      if (editingId != null) {
        if (editingId < 0) {
          Alert.alert(
            'Espera',
            'Este movimiento aún se está sincronizando con el servidor.',
          )
          return
        }
        if (submitLockRef.current) return
        submitLockRef.current = true
        setSaving(true)
        try {
          const optimisticRowPatch: Record<string, unknown> = {
            fecha: fechaIso,
            tipo: payload.tipo,
            ambito: payload.ambito,
            monto,
            comentario: form.comentario.trim(),
            categoria: form.categoria,
            categoria_nombre: categoriaNombre ?? '—',
            metodo_pago_tipo: metodoTipo,
            cuenta: payload.cuenta,
          }
          patchMovimientoOptimistic(queryClient, editingId, payload, optimisticRowPatch)
          if (esStandalone && returnToSafe) {
            router.replace(returnToSafe as never)
          } else if (esStandalone && cuentaFija != null) {
            router.replace(`/cuenta/${cuentaDestino || cuentaFija}` as never)
          } else {
            cerrarForm()
            if (payload.ambito === 'PERSONAL' && cuentaDestino > 0) {
              router.replace(`/cuenta/${cuentaDestino}` as never)
            } else {
              refetchMovimientosComun?.()
            }
          }
        } catch (err: unknown) {
          const ax = err as { response?: { data?: Record<string, string[] | string> } }
          const data = ax.response?.data
          if (data && typeof data === 'object' && !Array.isArray(data)) {
            const msg = Object.values(data)
              .map((v) => (Array.isArray(v) ? v.join(' ') : String(v)))
              .join(' ')
            setErrorGeneral(msg || 'No se pudo guardar el movimiento.')
          } else {
            setErrorGeneral('No se pudo guardar el movimiento. Verifica la conexión.')
          }
        } finally {
          setSaving(false)
          submitLockRef.current = false
        }
        return
      }

      if (submitLockRef.current) return
      submitLockRef.current = true
      setSaving(true)
      const eraModoTarjetaFija = creditoTarjetaFijaId != null
      try {
        createMovimientoOptimistic(queryClient, payload, {
          categoria_nombre: categoriaNombre ?? '—',
          metodo_pago_tipo: metodoTipo,
        })
        if (eraModoTarjetaFija) {
          onPostMovimientoGuardado?.()
          cerrarForm()
          return
        }
        if (esStandalone && returnToSafe) {
          router.replace(returnToSafe as never)
        } else if (esStandalone && cuentaFija != null) {
          router.replace(`/cuenta/${cuentaDestino || cuentaFija}` as never)
        } else {
          cerrarForm()
          if (payload.ambito === 'PERSONAL' && cuentaDestino > 0) {
            router.replace(`/cuenta/${cuentaDestino}` as never)
          } else {
            refetchMovimientosComun?.()
          }
        }
      } finally {
        setSaving(false)
        submitLockRef.current = false
      }
    }

    const tituloPrincipal =
      loadingDetalle ? 'Cargando…' : editingId != null ? 'Editar movimiento' : 'Nuevo movimiento'

    // ── Picker de categorías (Modal con buscador) ────────────────────────────
    const categoriaPicker = (
      <Modal
        visible={showCategoriaPicker}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowCategoriaPicker(false)
          setBusquedaCategoria('')
        }}
        statusBarTranslucent
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-2xl" style={{ maxHeight: '75%' }}>
            {/* Header */}
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-border">
              <Text className="text-dark font-bold text-base">Seleccionar categoría</Text>
              <TouchableOpacity onPress={() => {
                setShowCategoriaPicker(false)
                setBusquedaCategoria('')
              }}>
                <Text className="text-muted text-2xl leading-none">×</Text>
              </TouchableOpacity>
            </View>
            {/* Buscador */}
            <View className="px-4 py-2 border-b border-border">
              <TextInput
                value={busquedaCategoria}
                onChangeText={setBusquedaCategoria}
                placeholder="Buscar categoría…"
                autoCorrect={false}
                clearButtonMode="while-editing"
                className="bg-surface border border-border rounded-lg px-3 py-2 text-dark text-sm"
              />
            </View>
            {/* Lista */}
            <ScrollView keyboardShouldPersistTaps="handled">
              {categoriasFiltradas.length === 0 ? (
                <View className="px-5 py-8 items-center">
                  <Text className="text-muted text-sm">Sin resultados para «{busquedaCategoria}»</Text>
                </View>
              ) : (
                categoriasFiltradas.map((cat, i) => {
                  const esHija = '_esHija' in cat && cat._esHija === true
                  const esPadre = cat.es_padre && !('_esHija' in cat)
                  const esUltima = i === categoriasFiltradas.length - 1
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      onPress={esPadre ? undefined : () => {
                        setField('categoria', cat.id)
                        setShowCategoriaPicker(false)
                        setBusquedaCategoria('')
                      }}
                      activeOpacity={esPadre ? 1 : 0.7}
                      className={`flex-row items-center justify-between ${
                        esUltima ? '' : 'border-b border-border'
                      } ${esHija ? 'pl-10 pr-5 py-3' : 'px-5 py-4'} ${
                        esPadre ? 'bg-surface' : 'bg-white'
                      }`}
                    >
                      <Text
                        className={`text-sm flex-1 ${
                          esPadre
                            ? 'font-semibold text-muted'
                            : form.categoria === cat.id
                            ? 'font-bold text-dark'
                            : 'text-dark'
                        }`}
                      >
                        {esPadre ? cat.nombre.toUpperCase() : cat.nombre}
                      </Text>
                      {form.categoria === cat.id && !esPadre && (
                        <Text className="text-accent font-bold ml-2">✓</Text>
                      )}
                    </TouchableOpacity>
                  )
                })
              )}
            </ScrollView>
            <View style={{ height: Math.max(insets.bottom, 12) }} />
          </View>
        </View>
      </Modal>
    )

    // ── Contenido del formulario ──────────────────────────────────────────────
    const formInner = (
      <>
        {errorGeneral && (
          <View className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 mb-4">
            <Text className="text-danger text-sm">{errorGeneral}</Text>
          </View>
        )}

        {vinculoIngresoComun && (
          <View className="bg-surface border border-border rounded-xl px-4 py-3 mb-4">
            <Text className="text-dark text-sm">
              Los demás campos están fijados por el ingreso común asociado.
            </Text>
          </View>
        )}

        {/* Tipo */}
        <Text className="text-xs text-muted font-semibold mb-1">Tipo</Text>
        {vinculoIngresoComun || modoTarjetaCreditoFija ? (
          <View className="border border-border rounded-lg py-2.5 px-3 mb-4 bg-surface">
            <Text className="text-dark font-semibold">{tipo === 'EGRESO' ? 'Egreso' : 'Ingreso'}</Text>
          </View>
        ) : (
          <View className="flex-row border border-border rounded-lg overflow-hidden mb-4">
            <TouchableOpacity
              onPress={() => setTipo('EGRESO')}
              className={`flex-1 py-2.5 items-center ${tipo === 'EGRESO' ? 'bg-danger' : 'bg-white'}`}
            >
              <Text className={`font-semibold ${tipo === 'EGRESO' ? 'text-white' : 'text-muted'}`}>
                Egreso
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setTipo('INGRESO')}
              className={`flex-1 py-2.5 items-center border-l border-border ${
                tipo === 'INGRESO' ? 'bg-success' : 'bg-white'
              }`}
            >
              <Text className={`font-semibold ${tipo === 'INGRESO' ? 'text-white' : 'text-muted'}`}>
                Ingreso
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {mostrarAmbitoEditable && (
          <>
            <Text className="text-xs text-muted font-semibold mb-1">Ámbito</Text>
            <View className="flex-row border border-border rounded-lg overflow-hidden mb-4">
              <TouchableOpacity
                onPress={() => {
                  setForm((f) => ({
                    ...f,
                    ambito: 'PERSONAL',
                    cuenta: f.cuenta || cuentasPropias[0]?.id || 0,
                  }))
                }}
                className={`flex-1 py-2.5 items-center ${form.ambito === 'PERSONAL' ? 'bg-dark' : 'bg-white'}`}
              >
                <Text
                  className={`font-semibold ${form.ambito === 'PERSONAL' ? 'text-white' : 'text-muted'}`}
                >
                  Personal
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setForm((f) => ({ ...f, ambito: 'COMUN', cuenta: 0 }))
                }}
                className={`flex-1 py-2.5 items-center border-l border-border ${
                  form.ambito === 'COMUN' ? 'bg-dark' : 'bg-white'
                }`}
              >
                <Text
                  className={`font-semibold ${form.ambito === 'COMUN' ? 'text-white' : 'text-muted'}`}
                >
                  Común
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        {mostrarAmbitoSoloLectura && (
          <>
            <Text className="text-xs text-muted font-semibold mb-1">Ámbito</Text>
            <View className="border border-border rounded-lg py-2.5 px-3 mb-4 bg-surface">
              <Text className="text-dark font-semibold">
                {form.ambito === 'PERSONAL' ? 'Personal' : 'Común'}
              </Text>
            </View>
          </>
        )}

        {/* Cuenta — solo si PERSONAL y no hay cuenta fija */}
        {form.ambito === 'PERSONAL' && !vinculoIngresoComun && cuentaFija != null && (
          <>
            <Text className="text-xs text-muted font-semibold mb-2">Cuenta</Text>
            <View className="border border-border rounded-lg py-2.5 px-3 mb-4 bg-surface">
              <Text className="text-dark font-semibold">{nombreCuentaFija || '—'}</Text>
            </View>
          </>
        )}

        {form.ambito === 'PERSONAL' && !vinculoIngresoComun && cuentaFija == null && (
          <>
            <Text className="text-xs text-muted font-semibold mb-2">Cuenta personal *</Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {cuentasPropias.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setField('cuenta', c.id)}
                  className={`px-3 py-1.5 rounded-lg border ${
                    form.cuenta === c.id ? 'bg-dark border-dark' : 'bg-white border-border'
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${form.cuenta === c.id ? 'text-white' : 'text-dark'}`}
                  >
                    {c.nombre}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Categoría — dropdown alfabético */}
        <Text className="text-xs text-muted font-semibold mb-2">Categoría *</Text>
        {vinculoIngresoComun ? (
          <View className="border border-border rounded-lg py-2.5 px-3 mb-4 bg-surface">
            <Text className="text-dark font-semibold">
              {categorias.find((c) => c.id === form.categoria)?.nombre ?? '—'}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => { setShowCategoriaPicker(true); setBusquedaCategoria('') }}
            className="border border-border rounded-lg px-3 py-2.5 mb-4 bg-white flex-row items-center justify-between"
          >
            <Text className={categoriaNombre ? 'text-dark font-medium' : 'text-muted'}>
              {categoriaNombre ?? 'Seleccionar categoría…'}
            </Text>
            <Text className="text-muted text-sm">▾</Text>
          </TouchableOpacity>
        )}

        {/* Fecha */}
        <Text className="text-xs text-muted font-semibold mb-1">Fecha</Text>
        <TextInput
          value={form.fecha}
          onChangeText={(v) => setField('fecha', autoFormatFecha(v))}
          placeholder="DD/MM/AAAA"
          keyboardType="numeric"
          maxLength={10}
          className="border border-border rounded-lg px-3 py-2.5 text-dark mb-4"
        />

        {/* Monto */}
        <Text className="text-xs text-muted font-semibold mb-1">Monto (CLP) *</Text>
        <TextInput
          value={formatearMiles(form.monto)}
          onChangeText={(v) => setField('monto', parsearDigitos(v))}
          placeholder="$ 0"
          keyboardType="numeric"
          className="border border-border rounded-lg px-3 py-2.5 text-dark mb-4"
        />

        {/* Método de pago */}
        {tipo === 'EGRESO' && !vinculoIngresoComun && !modoTarjetaCreditoFija && (
          <>
            <Text className="text-xs text-muted font-semibold mb-1">Método de pago</Text>
            <View className="flex-row gap-2 mb-4">
              {(['DEBITO', 'EFECTIVO', 'CREDITO'] as MetodoTipo[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => onElegirMetodoPago(m)}
                  className={`flex-1 py-2.5 rounded-lg border items-center ${
                    metodoTipo === m ? 'bg-accent border-accent' : 'bg-white border-border'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${metodoTipo === m ? 'text-dark' : 'text-muted'}`}
                  >
                    {m === 'EFECTIVO' ? 'Efectivo' : m === 'DEBITO' ? 'Débito' : 'Crédito'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
        {tipo === 'EGRESO' && modoTarjetaCreditoFija && !vinculoIngresoComun && (
          <View className="border border-border rounded-lg py-2.5 px-3 mb-4 bg-surface">
            <Text className="text-dark font-semibold">Método: Crédito</Text>
          </View>
        )}
        {tipo === 'EGRESO' && vinculoIngresoComun && (
          <View className="border border-border rounded-lg py-2.5 px-3 mb-4 bg-surface">
            <Text className="text-dark font-semibold">
              Método:{' '}
              {metodoTipo === 'EFECTIVO' ? 'Efectivo' : metodoTipo === 'DEBITO' ? 'Débito' : 'Crédito'}
            </Text>
          </View>
        )}

        {/* Tarjeta + cuotas */}
        {tipo === 'EGRESO' && metodoTipo === 'CREDITO' && !vinculoIngresoComun && (
          <View className="bg-surface border border-border rounded-xl p-3 mb-4">
            <Text className="text-xs text-muted font-semibold mb-2">Tarjeta *</Text>
            {tarjetas.length === 0 ? (
              <Text className="text-sm text-muted mb-3">
                No tienes tarjetas registradas. Añádelas desde la sección «Tarjetas» en la app (misma idea
                que Configuración → Tarjetas en la web) y vuelve aquí.
              </Text>
            ) : modoTarjetaCreditoFija ? (
              <View className="border border-border rounded-lg py-2.5 px-3 mb-3 bg-white">
                <Text className="text-dark font-semibold">
                  {tarjetas.find((t) => t.id === form.tarjeta)?.nombre ?? '—'}
                </Text>
              </View>
            ) : (
              <View className="flex-row flex-wrap gap-2 mb-3">
                {tarjetas.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => setField('tarjeta', t.id)}
                    className={`px-3 py-1.5 rounded-lg border ${
                      form.tarjeta === t.id ? 'bg-dark border-dark' : 'bg-white border-border'
                    }`}
                  >
                    <Text
                      className={`text-xs font-medium ${form.tarjeta === t.id ? 'text-white' : 'text-dark'}`}
                    >
                      {t.nombre}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text className="text-xs text-muted font-semibold mb-1">N° cuotas *</Text>
            <TextInput
              value={form.num_cuotas}
              onChangeText={(v) => setField('num_cuotas', v.replace(/\D/g, '').slice(0, 2))}
              keyboardType="numeric"
              placeholder={`Ej: 12 (${NUM_CUOTAS_MIN}–${NUM_CUOTAS_MAX})`}
              className="border border-border rounded-lg px-3 py-2.5 text-dark mb-2 bg-white"
            />
            <Text className="text-xs text-muted font-semibold mb-1">Valor cuota (opcional)</Text>
            <TextInput
              value={form.monto_cuota}
              onChangeText={(v) => setField('monto_cuota', parsearMontoDecimal(v))}
              keyboardType="numeric"
              placeholder="Se calcula automático"
              className="border border-border rounded-lg px-3 py-2.5 text-dark mb-2 bg-white"
            />
            <Text className="text-xs text-muted mb-2">
              Si indicas un valor de cuota manual, se usa ese monto. Si lo dejas vacío, se divide monto ÷
              cuotas (redondeo arriba); la diferencia de centavos va a la primera cuota.
            </Text>
            {previewMontoCuotaCredito != null && form.num_cuotas.trim() !== '' && (
              <Text className="text-sm text-dark font-medium">
                {form.num_cuotas.trim()} cuota
                {parseInt(form.num_cuotas, 10) !== 1 ? 's' : ''} de{' '}
                {formatearMiles(String(previewMontoCuotaCredito))}
                {form.monto_cuota.trim() ? ' (manual)' : ' (calculado)'}
              </Text>
            )}
          </View>
        )}
        {tipo === 'EGRESO' && metodoTipo === 'CREDITO' && vinculoIngresoComun && (
          <View className="bg-surface border border-border rounded-xl p-3 mb-4">
            <Text className="text-dark text-sm">
              Tarjeta: {tarjetas.find((t) => t.id === form.tarjeta)?.nombre ?? '—'} ·{' '}
              {form.num_cuotas || '—'} cuota
              {(parseInt(form.num_cuotas, 10) || 0) !== 1 ? 's' : ''}
            </Text>
          </View>
        )}

        {/* Comentario */}
        <Text className="text-xs text-muted font-semibold mb-1">
          {vinculoIngresoComun ? 'Comentario / origen (opcional)' : 'Comentario (opcional)'}
        </Text>
        <TextInput
          value={form.comentario}
          onChangeText={(v) => setField('comentario', v)}
          onFocus={onFocusComentario}
          placeholder="Ej: Supermercado (puedes dejarlo vacío)"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          maxLength={255}
          className="border border-border rounded-lg px-3 py-2.5 text-dark mb-6 min-h-[88px]"
        />
      </>
    )

    // ── Header ────────────────────────────────────────────────────────────────
    const headerBlock = esStandalone ? (
      <View className="px-6 pt-4 pb-3 border-b border-border">
        <Text className="text-sm text-muted">
          {vinculoIngresoComun
            ? 'Ingreso común: solo puedes cambiar fecha, monto y comentario (origen).'
            : editingId != null
              ? 'Actualiza los datos del movimiento.'
              : 'Registra un ingreso o egreso en esta cuenta.'}
        </Text>
      </View>
    ) : (
      <View className="px-6 pt-5 pb-3 border-b border-border">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-2">
            <Text className="text-lg font-bold text-dark">{tituloPrincipal}</Text>
            <Text className="text-sm text-muted mt-0.5">
              {vinculoIngresoComun
                ? 'Ingreso común: solo puedes cambiar fecha, monto y comentario (origen).'
                : editingId != null
                  ? 'Actualiza los datos del movimiento.'
                  : `Registra un ingreso o egreso ${form.ambito === 'PERSONAL' ? 'personal' : 'común'}.`}
            </Text>
          </View>
          <TouchableOpacity onPress={cerrarForm}>
            <Text className="text-muted text-2xl leading-none">×</Text>
          </TouchableOpacity>
        </View>
      </View>
    )

    // ── Botones ───────────────────────────────────────────────────────────────
    const buttonsRow = (
      <View
        className="flex-row gap-3 px-6 pt-4 border-t border-border"
        style={{ paddingBottom: esStandalone ? 16 : Math.max(insets.bottom + 8, 20) }}
      >
        <TouchableOpacity
          onPress={cerrarForm}
          className="flex-1 border border-border rounded-xl py-3 items-center"
        >
          <Text className="text-dark font-semibold">Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={guardar}
          disabled={saving || loadingDetalle || loadingMetodos}
          className="flex-1 bg-dark rounded-xl py-3 items-center"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold">
              {editingId != null ? 'Guardar cambios' : 'Guardar movimiento'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    )

    // ── Variante standalone (pantalla completa) ───────────────────────────────
    if (esStandalone) {
      if (!showForm) return null
      return (
        <View className="flex-1 bg-white">
          {categoriaPicker}
          {headerBlock}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
            className="flex-1"
          >
            <ScrollView
              ref={formScrollRef}
              className="flex-1 px-6 pt-4"
              contentContainerStyle={{
                paddingBottom: Math.max(keyboardHeight + 10, 80),
              }}
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
            >
              {loadingDetalle ? (
                <View className="py-16 items-center">
                  <ActivityIndicator color="#0f0f0f" />
                </View>
              ) : (
                formInner
              )}
            </ScrollView>
            {buttonsRow}
          </KeyboardAvoidingView>
        </View>
      )
    }

    // ── Variante overlay — Modal nativo para posicionarse sobre el tab bar ────
    return (
      <>
        {categoriaPicker}
        <Modal
          visible={showForm}
          transparent
          animationType="slide"
          onRequestClose={cerrarForm}
          statusBarTranslucent
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
            className="flex-1 justify-end"
          >
            <View className="bg-black/50">
              <View className="bg-white rounded-t-2xl">
                {headerBlock}
                <ScrollView
                  ref={formScrollRef}
                  className="px-6 pt-4"
                  style={{ maxHeight: 560 }}
                  contentContainerStyle={{
                    paddingBottom: Math.max(insets.bottom + keyboardHeight + 120, 180),
                  }}
                  keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                  keyboardShouldPersistTaps="handled"
                >
                  {loadingDetalle ? (
                    <View className="py-16 items-center">
                      <ActivityIndicator color="#0f0f0f" />
                    </View>
                  ) : (
                    formInner
                  )}
                </ScrollView>
                {buttonsRow}
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </>
    )
  },
)
