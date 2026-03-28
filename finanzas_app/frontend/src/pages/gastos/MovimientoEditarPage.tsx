import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, Input, Select, Textarea } from '@/components/ui'
import type { SelectOption } from '@/components/ui'
import { useCategorias, useTarjetas, useMetodosPago } from '@/hooks/useCatalogos'
import { useCuentasPersonales } from '@/hooks/useCuentasPersonales'
import { movimientosApi } from '@/api'
import { Cargando } from '@/components/ui'
import styles from './MovimientoFormPage.module.scss'

type Tipo = 'EGRESO' | 'INGRESO'
type Ambito = 'PERSONAL' | 'COMUN'
type Metodo = 'EFECTIVO' | 'DEBITO' | 'CREDITO'

interface MovimientoApi {
  id: number
  fecha: string
  tipo: Tipo
  ambito: Ambito
  categoria: number
  cuenta: number | null
  monto: string
  comentario: string
  metodo_pago: number
  tarjeta: number | null
  num_cuotas: number | null
  monto_cuota: string | null
  ingreso_comun: number | null
  cuotas?: { id: number }[]
}

interface FormErrors {
  monto?: string
  categoria?: string
  cuenta?: string
  tarjeta?: string
  numCuotas?: string
  general?: string
}

function destinoTrasGuardar(m: MovimientoApi) {
  if (m.ambito === 'COMUN') return '/gastos/comunes'
  if (m.cuenta) return `/gastos/cuenta/${m.cuenta}`
  return '/gastos/comunes'
}

export default function MovimientoEditarPage() {
  const { id: idParam } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const id = Number(idParam)
  const { data: categoriasData } = useCategorias()
  const { data: tarjetasData } = useTarjetas()
  const { data: metodosData } = useMetodosPago()
  const { data: cuentasData } = useCuentasPersonales()

  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [base, setBase] = useState<MovimientoApi | null>(null)

  const [tipo, setTipo] = useState<Tipo>('EGRESO')
  const [ambito, setAmbito] = useState<Ambito>('PERSONAL')
  const [metodo, setMetodo] = useState<Metodo>('DEBITO')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState('')
  const [comentario, setComentario] = useState('')
  const [categoriaId, setCategoriaId] = useState<string>('')
  const [cuentaId, setCuentaId] = useState<string>('')
  const [tarjetaId, setTarjetaId] = useState<string>('')
  const [numCuotas, setNumCuotas] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const returnToParam = searchParams.get('returnTo')
  const returnTo = returnToParam && returnToParam.startsWith('/') ? returnToParam : null

  const categorias = (categoriasData ?? []) as { id: number; nombre: string; tipo: string }[]
  const tarjetas = (tarjetasData ?? []) as { id: number; nombre: string }[]
  const metodos = (metodosData ?? []) as { id: number; nombre: string; tipo: string }[]

  const cuentasOpciones: SelectOption[] = useMemo(
    () =>
      (cuentasData ?? [])
        .filter(c => c.es_propia)
        .map(c => ({ value: String(c.id), label: c.nombre })),
    [cuentasData],
  )

  const categoriaOpciones: SelectOption[] = useMemo(() => {
    const filtradas = categorias.filter(c => c.tipo === tipo)
    return filtradas.map(c => ({ value: String(c.id), label: c.nombre }))
  }, [categorias, tipo])

  const tarjetaOpciones: SelectOption[] = useMemo(
    () => tarjetas.map(t => ({ value: String(t.id), label: t.nombre })),
    [tarjetas],
  )

  const metodoPagoId = useMemo(() => {
    const m = metodos.find(x => x.tipo === metodo)
    return m?.id ?? null
  }, [metodos, metodo])

  useEffect(() => {
    if (!id || Number.isNaN(id)) {
      setErrorCarga('ID inválido.')
      setCargando(false)
      return
    }
    let cancel = false
    ;(async () => {
      setCargando(true)
      setErrorCarga(null)
      try {
        const res = await movimientosApi.getMovimiento(id)
        const d = res.data as MovimientoApi
        if (cancel) return
        setBase(d)
        setTipo(d.tipo)
        setAmbito(d.ambito)
        setMonto(String(d.monto))
        setFecha(d.fecha?.slice(0, 10) ?? '')
        setComentario(d.comentario ?? '')
        setCategoriaId(String(d.categoria))
        setCuentaId(d.cuenta != null ? String(d.cuenta) : '')
        setTarjetaId(d.tarjeta != null ? String(d.tarjeta) : '')
        setNumCuotas(d.num_cuotas != null ? String(d.num_cuotas) : '')
      } catch (err: unknown) {
        const ax = err as { response?: { status?: number; data?: { error?: string } } }
        if (ax.response?.status === 404) {
          setErrorCarga('Movimiento no encontrado.')
        } else if (ax.response?.status === 403) {
          setErrorCarga('No tienes permiso para ver este movimiento.')
        } else {
          setErrorCarga(ax.response?.data?.error ?? 'No se pudo cargar el movimiento.')
        }
      } finally {
        if (!cancel) setCargando(false)
      }
    })()
    return () => {
      cancel = true
    }
  }, [id])

  useEffect(() => {
    if (!base || !metodos.length) return
    const mp = metodos.find(m => m.id === base.metodo_pago)
    if (mp?.tipo === 'EFECTIVO' || mp?.tipo === 'DEBITO' || mp?.tipo === 'CREDITO') {
      setMetodo(mp.tipo as Metodo)
    }
  }, [base?.id, base?.metodo_pago, metodos])

  const vinculadoIngresoComun = base != null && base.ingreso_comun != null
  const tieneCuotasTc = (base?.cuotas?.length ?? 0) > 0

  const montoCuota =
    numCuotas && monto
      ? Math.ceil(parseFloat(monto) / parseInt(numCuotas, 10))
      : null

  const handleSubmitVinculado = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!base) return
    const next: FormErrors = {}
    if (!monto) next.monto = 'El monto es obligatorio.'
    setErrors(next)
    if (Object.keys(next).length) return
    setLoading(true)
    setErrors({})
    try {
      await movimientosApi.patchMovimiento(base.id, {
        fecha,
        monto: String(monto),
        comentario: comentario.trim(),
      })
      navigate(returnTo ?? destinoTrasGuardar(base), { replace: true })
    } catch (err: unknown) {
      const ax = err as {
        response?: { status?: number; data?: Record<string, string | string[]> & { error?: string } }
      }
      if (ax.response?.status === 403) {
        setErrors({ general: ax.response.data?.error ?? 'No tienes permiso para editar este movimiento.' })
      } else {
        const d = ax.response?.data
        if (d && typeof d === 'object') {
          const msgs = Object.entries(d).map(([k, v]) =>
            typeof v === 'string' ? v : Array.isArray(v) ? `${k}: ${v.join(' ')}` : String(v),
          )
          setErrors({ general: msgs.join(' ') || 'Error al guardar.' })
        } else {
          setErrors({ general: 'Error al guardar.' })
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitCompleto = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!base) return
    const next: FormErrors = {}
    if (!monto) next.monto = 'El monto es obligatorio.'
    if (!categoriaId) next.categoria = 'Selecciona una categoría.'
    if (metodo === 'CREDITO') {
      if (!tarjetaId) next.tarjeta = 'Selecciona una tarjeta.'
      if (!numCuotas) next.numCuotas = 'Ingresa el número de cuotas.'
    }
    if (ambito === 'PERSONAL' && cuentasOpciones.length > 0 && !cuentaId) {
      next.cuenta = 'Selecciona una cuenta personal.'
    }
    setErrors(next)
    if (Object.keys(next).length) return
    if (!metodoPagoId) {
      setErrors({ general: 'No hay método de pago configurado.' })
      return
    }
    setLoading(true)
    setErrors({})
    try {
      const payload: Record<string, unknown> = {
        fecha,
        tipo,
        ambito,
        categoria: Number(categoriaId),
        cuenta: ambito === 'PERSONAL' && cuentaId ? Number(cuentaId) : null,
        monto: String(monto),
        comentario: comentario.trim(),
        metodo_pago: metodoPagoId,
        tarjeta: metodo === 'CREDITO' && tarjetaId ? Number(tarjetaId) : null,
        num_cuotas: metodo === 'CREDITO' && numCuotas ? parseInt(numCuotas, 10) : null,
        monto_cuota:
          metodo === 'CREDITO' && montoCuota ? montoCuota : null,
      }
      await movimientosApi.patchMovimiento(base.id, payload)
      const actualizado = { ...base, ...payload, cuenta: payload.cuenta as number | null, ambito }
      navigate(returnTo ?? destinoTrasGuardar(actualizado as MovimientoApi), { replace: true })
    } catch (err: unknown) {
      const ax = err as {
        response?: { status?: number; data?: Record<string, string | string[]> & { error?: string } }
      }
      if (ax.response?.status === 403) {
        setErrors({ general: ax.response.data?.error ?? 'No tienes permiso para editar este movimiento.' })
      } else {
        const d = ax.response?.data
        if (d && typeof d === 'object') {
          const msgs = Object.entries(d).map(([k, v]) =>
            typeof v === 'string' ? v : Array.isArray(v) ? `${k}: ${v.join(' ')}` : String(v),
          )
          setErrors({ general: msgs.join(' ') || 'Error al guardar.' })
        } else {
          setErrors({ general: 'Error al guardar.' })
        }
      }
    } finally {
      setLoading(false)
    }
  }

  if (cargando) {
    return (
      <div className={styles.page}>
        <Cargando />
      </div>
    )
  }

  if (errorCarga || !base) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p style={{ color: '#b91c1c', marginBottom: 16 }}>{errorCarga ?? 'Error'}</p>
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Volver
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <header className={styles.header}>
          <h1 className={styles.title}>Editar movimiento</h1>
          <p className={styles.subtitle}>
            {vinculadoIngresoComun
              ? 'Vinculado a un ingreso común: los cambios se reflejan en Sueldos.'
              : 'Actualiza los datos del movimiento.'}
          </p>
        </header>

        {errors.general && (
          <div
            className={styles.errorGeneral}
            style={{
              marginBottom: 16,
              padding: 12,
              background: '#fff0f0',
              borderRadius: 8,
              color: '#c00',
              fontSize: 14,
            }}
          >
            {errors.general}
          </div>
        )}

        {vinculadoIngresoComun ? (
          <form onSubmit={handleSubmitVinculado} className={styles.form}>
            <div
              style={{
                padding: 12,
                background: '#eff6ff',
                borderRadius: 8,
                fontSize: 14,
                color: '#1e40af',
                marginBottom: 8,
              }}
            >
              Este ingreso está ligado a tu declaración en{' '}
              <Link to="/sueldos" style={{ fontWeight: 600 }}>
                Sueldos
              </Link>
              . Solo puedes cambiar fecha, monto y descripción (origen, opcional).
            </div>
            <Input
              name="fecha"
              label="Fecha"
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
            />
            <Input
              name="monto"
              label="Monto (CLP)"
              type="number"
              min="1"
              step="1"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              error={errors.monto}
              required
            />
            <Textarea
              name="comentario"
              label="Descripción / origen (opcional)"
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              placeholder="Puedes dejarlo vacío"
              maxLength={255}
              rows={2}
            />
            <div className={styles.actions}>
              <Button
                type="button"
                variant="ghost"
                disabled={loading}
                onClick={() => {
                  if (returnTo) {
                    navigate(returnTo)
                    return
                  }
                  navigate(-1)
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" loading={loading} fullWidth>
                Guardar cambios
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmitCompleto} className={styles.form}>
            <div className={styles.row}>
              <div className={styles.field}>
                <span className={styles.label}>Tipo</span>
                <div className={styles.segmented}>
                  <button
                    type="button"
                    className={`${styles.segment} ${tipo === 'EGRESO' ? styles.segmentDanger : ''}`}
                    onClick={() => setTipo('EGRESO')}
                    disabled={tieneCuotasTc}
                  >
                    Egreso
                  </button>
                  <button
                    type="button"
                    className={`${styles.segment} ${tipo === 'INGRESO' ? styles.segmentSuccess : ''}`}
                    onClick={() => setTipo('INGRESO')}
                    disabled={tieneCuotasTc}
                  >
                    Ingreso
                  </button>
                </div>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Ámbito</span>
                <div className={styles.segmented}>
                  <button
                    type="button"
                    className={`${styles.segment} ${ambito === 'PERSONAL' ? styles.segmentActive : ''}`}
                    onClick={() => setAmbito('PERSONAL')}
                    disabled={tieneCuotasTc}
                  >
                    Personal
                  </button>
                  <button
                    type="button"
                    className={`${styles.segment} ${ambito === 'COMUN' ? styles.segmentActive : ''}`}
                    onClick={() => setAmbito('COMUN')}
                    disabled={tieneCuotasTc}
                  >
                    Común
                  </button>
                </div>
              </div>
            </div>
            {tieneCuotasTc && (
              <p style={{ fontSize: 13, color: '#6b7280' }}>
                Movimiento con cuotas de tarjeta: tipo, ámbito, método y cuotas no se pueden cambiar
                desde aquí.
              </p>
            )}

            {ambito === 'PERSONAL' && cuentasOpciones.length > 0 && (
              <Select
                name="cuenta"
                label="Cuenta"
                options={cuentasOpciones}
                value={cuentaId}
                onChange={e => setCuentaId(e.target.value)}
                placeholder="Selecciona cuenta…"
                error={errors.cuenta}
              />
            )}

            <div className={styles.row}>
              <Select
                name="categoria"
                label="Categoría"
                options={categoriaOpciones}
                value={categoriaId}
                onChange={e => setCategoriaId(e.target.value)}
                placeholder="Selecciona…"
                error={errors.categoria}
              />
              <Input
                name="fecha"
                label="Fecha"
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
              />
            </div>

            <Input
              name="monto"
              label="Monto"
              type="number"
              min="1"
              step="1"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              error={errors.monto}
              helperText="Pesos chilenos (CLP)"
              required
            />

            <div className={styles.field}>
              <span className={styles.label}>Método de pago</span>
              <div className={styles.metodoBtns}>
                {(['DEBITO', 'EFECTIVO', 'CREDITO'] as Metodo[]).map(m => (
                  <button
                    key={m}
                    type="button"
                    className={`${styles.metodoBtn} ${metodo === m ? styles.metodoBtnActive : ''}`}
                    onClick={() => setMetodo(m)}
                    disabled={tieneCuotasTc}
                  >
                    {m === 'EFECTIVO' ? 'Efectivo' : m === 'DEBITO' ? 'Débito' : 'Crédito'}
                  </button>
                ))}
              </div>
            </div>

            {metodo === 'CREDITO' && (
              <div className={styles.creditoPanel}>
                <div className={styles.row}>
                  <Select
                    name="tarjeta"
                    label="Tarjeta"
                    options={tarjetaOpciones}
                    value={tarjetaId}
                    onChange={e => setTarjetaId(e.target.value)}
                    placeholder="Selecciona…"
                    error={errors.tarjeta}
                    disabled={tieneCuotasTc}
                  />
                  <Input
                    name="numCuotas"
                    label="N° cuotas"
                    type="number"
                    min="1"
                    max="48"
                    value={numCuotas}
                    onChange={e => setNumCuotas(e.target.value)}
                    error={errors.numCuotas}
                    disabled={tieneCuotasTc}
                  />
                </div>
              </div>
            )}

            <Textarea
              name="comentario"
              label="Comentario (opcional)"
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              placeholder="Ej: Supermercado (puedes dejarlo vacío)"
              maxLength={255}
              rows={2}
            />

            <div className={styles.actions}>
              <Button
                type="button"
                variant="ghost"
                disabled={loading}
                onClick={() => {
                  if (returnTo) {
                    navigate(returnTo)
                    return
                  }
                  navigate(-1)
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" loading={loading} fullWidth>
                Guardar cambios
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
