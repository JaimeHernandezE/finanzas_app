import {
  useState,
  useMemo,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
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
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCategorias, useMetodosPago, useTarjetas } from '@finanzas/shared/hooks/useCatalogos'
import { movimientosApi } from '@finanzas/shared/api/movimientos'
import { finanzasApi, type CuentaPersonalApi } from '@finanzas/shared/api/finanzas'
import { useApi } from '@finanzas/shared/hooks/useApi'

export type MovimientoFormularioRef = {
  abrirNuevoComun: () => void
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

const FORM_INICIAL = {
  comentario: '',
  monto: '',
  categoria: 0,
  tarjeta: 0,
  num_cuotas: '',
  monto_cuota: '',
  fecha: new Date().toISOString().slice(0, 10),
  ambito: 'COMUN' as 'COMUN' | 'PERSONAL',
  cuenta: 0,
}

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
  /** Margen inferior del sheet (tab bar + safe area) */
  sheetMarginBottom?: number
  refetchMovimientosComun?: () => void
  /** En standalone: id de cuenta personal fija */
  cuentaPersonalFija?: number
}

export const MovimientoFormulario = forwardRef<MovimientoFormularioRef, MovimientoFormularioProps>(
  function MovimientoFormulario(
    { variant, sheetMarginBottom = 0, refetchMovimientosComun, cuentaPersonalFija },
    ref,
  ) {
    const router = useRouter()
    const esStandalone = variant === 'standalone'
    const cuentaFija =
      esStandalone && cuentaPersonalFija != null && Number.isFinite(cuentaPersonalFija)
        ? cuentaPersonalFija
        : null

    const { nuevo, ambito, cuenta, editar } = useLocalSearchParams<{
      nuevo?: string
      ambito?: string
      cuenta?: string
      editar?: string
    }>()

    const { data: catData } = useCategorias()
    const { data: metData } = useMetodosPago()
    const { data: tarjetasData } = useTarjetas()
    const categorias = (catData as Categoria[] | null) ?? []
    const metodos = (metData as MetodoPago[] | null) ?? []
    const tarjetas = (tarjetasData as Tarjeta[] | null) ?? []

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

    const cerrarForm = useCallback(() => {
      if (esStandalone && cuentaFija != null) {
        router.replace(`/cuenta/${cuentaFija}` as never)
        return
      }
      setShowForm(false)
      setEditingId(null)
      setVinculoIngresoComun(false)
      setLoadingDetalle(false)
      setErrorGeneral(null)
    }, [esStandalone, cuentaFija, router])

    function setField<K extends keyof typeof FORM_INICIAL>(key: K, val: (typeof FORM_INICIAL)[K]) {
      setForm((f) => ({ ...f, [key]: val }))
    }

    function abrirNuevoComun() {
      setLoadingDetalle(false)
      setEditingId(null)
      setVinculoIngresoComun(false)
      setForm(FORM_INICIAL)
      setTipo('EGRESO')
      setMetodoTipo('DEBITO')
      setErrorGeneral(null)
      setShowForm(true)
    }

    const iniciarEdicion = useCallback(
      async (id: number) => {
        setErrorGeneral(null)
        setEditingId(null)
        setVinculoIngresoComun(false)
        setShowForm(true)
        setLoadingDetalle(true)
        try {
          const res = await movimientosApi.getMovimiento(id)
          const data = res.data as MovimientoApiDetalle
          const metodo = metodos.find((x) => x.id === data.metodo_pago)
          const mt = (metodo?.tipo as MetodoTipo | undefined) ?? 'DEBITO'
          const fechaStr =
            typeof data.fecha === 'string' ? data.fecha.slice(0, 10) : String(data.fecha)
          setMetodoTipo(mt)
          setTipo(data.tipo as TipoMovimiento)
          setVinculoIngresoComun(Boolean(data.ingreso_comun))
          setForm({
            comentario: data.comentario ?? '',
            monto: String(Number(data.monto)),
            categoria: Number(data.categoria),
            tarjeta: data.tarjeta != null ? Number(data.tarjeta) : 0,
            num_cuotas: data.num_cuotas != null ? String(data.num_cuotas) : '',
            monto_cuota:
              data.monto_cuota != null && data.monto_cuota !== ''
                ? String(Number(data.monto_cuota))
                : '',
            fecha: fechaStr,
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

    useImperativeHandle(ref, () => ({
      abrirNuevoComun,
      iniciarEdicion,
    }))

    useEffect(() => {
      if (esStandalone && cuentaFija != null) {
        setEditingId(null)
        setVinculoIngresoComun(false)
        setForm({
          ...FORM_INICIAL,
          ambito: 'PERSONAL',
          cuenta: cuentaFija,
        })
        setTipo('EGRESO')
        setMetodoTipo('DEBITO')
        setErrorGeneral(null)
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
        setForm({
          ...FORM_INICIAL,
          ambito: ambitoForm,
          cuenta: ambitoForm === 'PERSONAL' ? cuentaId : 0,
        })
        setTipo('EGRESO')
        setMetodoTipo('DEBITO')
        setErrorGeneral(null)
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
      void iniciarEdicion(idNum)
      router.replace('/(tabs)/gastos')
    }, [esStandalone, editar, router, iniciarEdicion])

    const categoriasFiltradas = useMemo(
      () => categorias.filter((c) => c.tipo === tipo),
      [categorias, tipo],
    )

    const metodoPagoId = useMemo(() => {
      const m = metodos.find((x) => x.tipo === metodoTipo)
      return m?.id ?? null
    }, [metodos, metodoTipo])

    async function guardar() {
      setErrorGeneral(null)
      const monto = parseFloat(form.monto)
      if (!monto || monto <= 0) {
        Alert.alert('Monto inválido', 'Ingresa un monto mayor a 0.')
        return
      }

      if (vinculoIngresoComun && editingId != null) {
        setSaving(true)
        try {
          await movimientosApi.patchMovimiento(editingId, {
            fecha: form.fecha,
            monto,
            comentario: form.comentario.trim(),
          })
          const idCuentaTrasGuardar = form.ambito === 'PERSONAL' ? form.cuenta : 0
          if (esStandalone && cuentaFija != null) {
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
        }
        return
      }

      if (!form.categoria) {
        Alert.alert('Falta categoría', 'Selecciona una categoría.')
        return
      }
      if (!metodoPagoId) {
        Alert.alert('Falta método de pago', `No hay método ${metodoTipo} configurado.`)
        return
      }
      if (form.ambito === 'PERSONAL' && !form.cuenta) {
        Alert.alert('Falta cuenta', 'Selecciona una cuenta personal para registrar el movimiento.')
        return
      }
      if (tipo === 'EGRESO' && metodoTipo === 'CREDITO' && !form.tarjeta) {
        Alert.alert('Falta tarjeta', 'Selecciona una tarjeta para pago en crédito.')
        return
      }
      if (tipo === 'EGRESO' && metodoTipo === 'CREDITO' && !form.num_cuotas) {
        Alert.alert('Faltan cuotas', 'Ingresa el número de cuotas.')
        return
      }

      const cuotas = form.num_cuotas ? parseInt(form.num_cuotas, 10) : null
      const montoCuotaManual = form.monto_cuota ? parseFloat(form.monto_cuota) : null
      const montoCuotaCalculado = cuotas && cuotas > 0 ? Math.ceil(monto / cuotas) : null

      const payload = {
        tipo,
        ambito: form.ambito,
        fecha: form.fecha,
        comentario: form.comentario.trim(),
        monto,
        categoria: form.categoria,
        metodo_pago: metodoPagoId,
        cuenta: form.ambito === 'PERSONAL' ? form.cuenta : null,
        tarjeta:
          tipo === 'EGRESO' && metodoTipo === 'CREDITO' && form.tarjeta ? form.tarjeta : null,
        num_cuotas:
          tipo === 'EGRESO' && metodoTipo === 'CREDITO' && cuotas ? cuotas : null,
        monto_cuota:
          tipo === 'EGRESO' && metodoTipo === 'CREDITO'
            ? (montoCuotaManual ?? montoCuotaCalculado)
            : null,
      }

      setSaving(true)
      try {
        if (editingId != null) {
          await movimientosApi.patchMovimiento(editingId, payload)
        } else {
          await movimientosApi.createMovimiento(payload)
        }
        const cuentaDestino =
          payload.ambito === 'PERSONAL' && payload.cuenta ? Number(payload.cuenta) : 0
        if (esStandalone && cuentaFija != null) {
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
      }
    }

    const visible = esStandalone || showForm
    if (!visible) return null

    const tituloPrincipal =
      loadingDetalle ? 'Cargando…' : editingId != null ? 'Editar movimiento' : 'Nuevo movimiento'

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

        <Text className="text-xs text-muted font-semibold mb-1">Tipo</Text>
        {vinculoIngresoComun ? (
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

        <Text className="text-xs text-muted font-semibold mb-1">Ámbito</Text>
        <View className="border border-border rounded-lg py-2.5 px-3 mb-4 bg-surface">
          <Text className="text-dark font-semibold">
            {form.ambito === 'PERSONAL' ? 'Personal' : 'Común'}
          </Text>
        </View>

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

        <Text className="text-xs text-muted font-semibold mb-2">Categoría *</Text>
        {vinculoIngresoComun ? (
          <View className="border border-border rounded-lg py-2.5 px-3 mb-4 bg-surface">
            <Text className="text-dark font-semibold">
              {categorias.find((c) => c.id === form.categoria)?.nombre ?? '—'}
            </Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-2 mb-4">
            {categoriasFiltradas.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setField('categoria', cat.id)}
                className={`px-3 py-1.5 rounded-lg border ${
                  form.categoria === cat.id ? 'bg-dark border-dark' : 'bg-white border-border'
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    form.categoria === cat.id ? 'text-white' : 'text-dark'
                  }`}
                >
                  {cat.nombre}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text className="text-xs text-muted font-semibold mb-1">Fecha</Text>
        <TextInput
          value={form.fecha}
          onChangeText={(v) => setField('fecha', v)}
          placeholder="YYYY-MM-DD"
          className="border border-border rounded-lg px-3 py-2.5 text-dark mb-4"
        />

        <Text className="text-xs text-muted font-semibold mb-1">Monto (CLP) *</Text>
        <TextInput
          value={form.monto}
          onChangeText={(v) => setField('monto', v)}
          placeholder="Ej: 25000"
          keyboardType="numeric"
          className="border border-border rounded-lg px-3 py-2.5 text-dark mb-1"
        />
        <Text className="text-[11px] text-muted mb-4">Pesos chilenos (CLP).</Text>

        {tipo === 'EGRESO' && !vinculoIngresoComun && (
          <>
            <Text className="text-xs text-muted font-semibold mb-1">Método de pago</Text>
            <View className="flex-row gap-2 mb-4">
              {(['DEBITO', 'EFECTIVO', 'CREDITO'] as MetodoTipo[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setMetodoTipo(m)}
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
        {tipo === 'EGRESO' && vinculoIngresoComun && (
          <View className="border border-border rounded-lg py-2.5 px-3 mb-4 bg-surface">
            <Text className="text-dark font-semibold">
              Método:{' '}
              {metodoTipo === 'EFECTIVO' ? 'Efectivo' : metodoTipo === 'DEBITO' ? 'Débito' : 'Crédito'}
            </Text>
          </View>
        )}

        {tipo === 'EGRESO' && metodoTipo === 'CREDITO' && !vinculoIngresoComun && (
          <View className="bg-surface border border-border rounded-xl p-3 mb-4">
            <Text className="text-xs text-muted font-semibold mb-2">Tarjeta *</Text>
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

            <Text className="text-xs text-muted font-semibold mb-1">N° cuotas *</Text>
            <TextInput
              value={form.num_cuotas}
              onChangeText={(v) => setField('num_cuotas', v)}
              keyboardType="numeric"
              placeholder="Ej: 6"
              className="border border-border rounded-lg px-3 py-2.5 text-dark mb-3 bg-white"
            />

            <Text className="text-xs text-muted font-semibold mb-1">Valor cuota (opcional)</Text>
            <TextInput
              value={form.monto_cuota}
              onChangeText={(v) => setField('monto_cuota', v)}
              keyboardType="numeric"
              placeholder="Se calcula automáticamente"
              className="border border-border rounded-lg px-3 py-2.5 text-dark bg-white"
            />
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

        <Text className="text-xs text-muted font-semibold mb-1">
          {vinculoIngresoComun ? 'Comentario / origen (opcional)' : 'Comentario (opcional)'}
        </Text>
        <TextInput
          value={form.comentario}
          onChangeText={(v) => setField('comentario', v)}
          placeholder="Ej: Supermercado (puedes dejarlo vacío)"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          maxLength={255}
          className="border border-border rounded-lg px-3 py-2.5 text-dark mb-6 min-h-[88px]"
        />
      </>
    )

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

    const buttonsRow = (
      <View className="flex-row gap-3 px-6 pt-4 pb-4 border-t border-border">
        <TouchableOpacity
          onPress={cerrarForm}
          className="flex-1 border border-border rounded-xl py-3 items-center"
        >
          <Text className="text-dark font-semibold">Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={guardar}
          disabled={saving || loadingDetalle}
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

    if (esStandalone) {
      return (
        <View className="flex-1 bg-white">
          {headerBlock}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
          >
            <ScrollView className="flex-1 px-6 pt-4" keyboardShouldPersistTaps="handled">
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

    return (
      <View className="absolute inset-0 bg-black/50 justify-end">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View className="bg-white rounded-t-2xl" style={{ marginBottom: sheetMarginBottom }}>
            {headerBlock}
            <ScrollView className="px-6 pt-4" style={{ maxHeight: 560 }}>
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
        </KeyboardAvoidingView>
      </View>
    )
  },
)
