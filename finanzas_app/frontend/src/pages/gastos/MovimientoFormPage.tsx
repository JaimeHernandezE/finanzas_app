import { useState, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Input, InputMontoClp, Select, Textarea } from '@/components/ui'
import { montoClpANumero } from '@/utils/montoClp'
import type { SelectOption } from '@/components/ui'
import { useCategorias, useTarjetas, useMetodosPago } from '@/hooks/useCatalogos'
import { useCuentasPersonales } from '@/hooks/useCuentasPersonales'
import { movimientosApi } from '@/api'
import styles from './MovimientoFormPage.module.scss'

type Tipo   = 'EGRESO' | 'INGRESO'
type Ambito = 'PERSONAL' | 'COMUN'
type Metodo = 'EFECTIVO' | 'DEBITO' | 'CREDITO'

interface FormErrors {
  monto?:     string
  categoria?: string
  cuenta?:    string
  tarjeta?:   string
  numCuotas?: string
  general?:   string
}

export default function MovimientoFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data: categoriasData } = useCategorias()
  const { data: tarjetasData } = useTarjetas()
  const { data: metodosData } = useMetodosPago()
  const { data: cuentasData } = useCuentasPersonales()

  const cuentasOpciones: SelectOption[] = useMemo(
    () =>
      (cuentasData ?? [])
        .filter(c => c.es_propia)
        .map(c => ({ value: String(c.id), label: c.nombre })),
    [cuentasData],
  )

  const categorias = (categoriasData ?? []) as { id: number; nombre: string; tipo: string }[]
  const tarjetas   = (tarjetasData ?? []) as { id: number; nombre: string }[]
  const metodos    = (metodosData ?? []) as { id: number; nombre: string; tipo: string }[]

  const [tipo,      setTipo]      = useState<Tipo>('EGRESO')
  const [ambito,    setAmbito]    = useState<Ambito>(() =>
    searchParams.get('ambito') === 'COMUN' ? 'COMUN' : 'PERSONAL',
  )
  const [metodo,    setMetodo]    = useState<Metodo>('EFECTIVO')
  const [monto,     setMonto]     = useState('')
  const [numCuotas, setNumCuotas] = useState('')
  const [loading,   setLoading]   = useState(false)
  const [errors,    setErrors]    = useState<FormErrors>({})
  const categoriaOpciones: SelectOption[] = useMemo(() => {
    const filtradas = categorias.filter(c => c.tipo === tipo)
    return filtradas.map(c => ({ value: String(c.id), label: c.nombre }))
  }, [categorias, tipo])

  const tarjetaOpciones: SelectOption[] = useMemo(() =>
    tarjetas.map(t => ({ value: String(t.id), label: t.nombre })),
  [tarjetas])

  const metodoPagoId = useMemo(() => {
    const m = metodos.find(x => x.tipo === metodo)
    return m?.id ?? null
  }, [metodos, metodo])

  const montoNum = montoClpANumero(monto)
  const montoCuota =
    numCuotas && montoNum > 0
      ? Math.ceil(montoNum / parseInt(numCuotas, 10))
      : null

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const next: FormErrors = {}

    if (!monto || montoNum <= 0) next.monto = 'El monto es obligatorio.'
    if (!data.get('categoria')) next.categoria = 'Selecciona una categoría.'
    if (metodo === 'CREDITO') {
      if (!data.get('tarjeta'))  next.tarjeta   = 'Selecciona una tarjeta.'
      if (!numCuotas)            next.numCuotas = 'Ingresa el número de cuotas.'
    }
    if (ambito === 'PERSONAL' && cuentasOpciones.length > 0 && !data.get('cuenta')) {
      next.cuenta = 'Selecciona una cuenta personal.'
    }

    setErrors(next)
    if (Object.keys(next).length > 0) return

    if (!metodoPagoId) {
      setErrors({ general: 'No hay método de pago configurado para ' + metodo + '. Crea uno en Configuración.' })
      return
    }

    setLoading(true)
    setErrors({})
    try {
      const categoriaId = data.get('categoria')
      const payload: Record<string, unknown> = {
        fecha: (data.get('fecha') as string) || new Date().toISOString().split('T')[0],
        tipo,
        ambito,
        categoria: Number(categoriaId),
        cuenta:
          ambito === 'PERSONAL' && data.get('cuenta')
            ? Number(data.get('cuenta'))
            : null,
        monto: String(montoNum),
        comentario: (data.get('comentario') as string) || '',
        metodo_pago: metodoPagoId,
        tarjeta: metodo === 'CREDITO' && data.get('tarjeta') ? Number(data.get('tarjeta')) : null,
        num_cuotas: metodo === 'CREDITO' && numCuotas ? parseInt(numCuotas, 10) : null,
        monto_cuota: metodo === 'CREDITO' && montoCuota ? montoCuota : null,
      }
      await movimientosApi.createMovimiento(payload)
      const cuentaQ = searchParams.get('cuenta')
      const primeraPropia = cuentasData?.find(c => c.es_propia)
      let dest = '/configuracion/cuentas'
      if (ambito === 'COMUN') dest = '/gastos/comunes'
      else if (cuentaQ) dest = `/gastos/cuenta/${encodeURIComponent(cuentaQ)}`
      else if (primeraPropia) dest = `/gastos/cuenta/${primeraPropia.id}`
      navigate(dest, { replace: true })
    } catch (err: unknown) {
      const ax = err as { response?: { data?: Record<string, string[] | string> } }
      const data = ax.response?.data
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const msgs = Object.entries(data).map(([k, v]) =>
          Array.isArray(v) ? v.join(' ') : String(v)
        )
        setErrors({ general: msgs.join(' ') || 'Error al guardar.' })
      } else {
        setErrors({ general: 'Error al guardar.' })
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Formulario ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <header className={styles.header}>
          <h1 className={styles.title}>Nuevo movimiento</h1>
          <p className={styles.subtitle}>Registra un ingreso o egreso.</p>
        </header>

        <form onSubmit={handleSubmit} noValidate className={styles.form}>
          {errors.general && (
            <div className={styles.errorGeneral} style={{ marginBottom: 16, padding: 12, background: '#fff0f0', borderRadius: 8, color: '#c00', fontSize: 14 }}>
              {errors.general}
            </div>
          )}

          {/* Tipo / Ámbito */}
          <div className={styles.row}>
            <div className={styles.field}>
              <span className={styles.label}>Tipo</span>
              <div className={styles.segmented}>
                <button
                  type="button"
                  className={`${styles.segment} ${tipo === 'EGRESO' ? styles.segmentDanger : ''}`}
                  onClick={() => setTipo('EGRESO')}
                >
                  Egreso
                </button>
                <button
                  type="button"
                  className={`${styles.segment} ${tipo === 'INGRESO' ? styles.segmentSuccess : ''}`}
                  onClick={() => setTipo('INGRESO')}
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
                >
                  Personal
                </button>
                <button
                  type="button"
                  className={`${styles.segment} ${ambito === 'COMUN' ? styles.segmentActive : ''}`}
                  onClick={() => setAmbito('COMUN')}
                >
                  Común
                </button>
              </div>
            </div>
          </div>

          {/* Cuenta — solo si Personal */}
          {ambito === 'PERSONAL' && cuentasOpciones.length > 0 && (
            <Select
              name="cuenta"
              label="Cuenta"
              options={cuentasOpciones}
              placeholder="Selecciona cuenta…"
              error={errors.cuenta}
              defaultValue={searchParams.get('cuenta') ?? cuentasOpciones[0]?.value}
              required
            />
          )}
          {ambito === 'PERSONAL' && cuentasOpciones.length === 0 && (
            <p className={styles.avisoCuenta}>
              Crea al menos una cuenta personal en{' '}
              <Link to="/configuracion/cuentas">Configuración → Cuentas</Link> para registrar gastos
              personales con contexto.
            </p>
          )}

          {/* Categoría + Fecha */}
          <div className={styles.row}>
            <Select
              name="categoria"
              label="Categoría"
              options={categoriaOpciones}
              placeholder="Selecciona…"
              error={errors.categoria}
              required
            />
            <Input
              name="fecha"
              label="Fecha"
              type="date"
              defaultValue={new Date().toISOString().split('T')[0]}
            />
          </div>

          <InputMontoClp
            name="monto"
            label="Monto"
            value={monto}
            onChange={setMonto}
            error={errors.monto}
            helperText="Pesos chilenos (CLP)"
            required
          />

          {/* Método de pago */}
          <div className={styles.field}>
            <span className={styles.label}>Método de pago</span>
            <div className={styles.metodoBtns}>
              {(['EFECTIVO', 'DEBITO', 'CREDITO'] as Metodo[]).map(m => (
                <button
                  key={m}
                  type="button"
                  className={`${styles.metodoBtn} ${metodo === m ? styles.metodoBtnActive : ''}`}
                  onClick={() => setMetodo(m)}
                >
                  {m === 'EFECTIVO' ? 'Efectivo' : m === 'DEBITO' ? 'Débito' : 'Crédito'}
                </button>
              ))}
            </div>
          </div>

          {/* Panel crédito */}
          {metodo === 'CREDITO' && (
            <div className={styles.creditoPanel}>
              <div className={styles.row}>
                <Select
                  name="tarjeta"
                  label="Tarjeta"
                  options={tarjetaOpciones}
                  placeholder="Selecciona…"
                  error={errors.tarjeta}
                  required
                />
                <Input
                  name="numCuotas"
                  label="N° cuotas"
                  type="number"
                  min="1"
                  max="48"
                  placeholder="Ej: 12"
                  value={numCuotas}
                  onChange={e => setNumCuotas(e.target.value)}
                  error={errors.numCuotas}
                  required
                />
              </div>
              <Input
                name="montoCuota"
                label="Valor cuota (opcional)"
                type="number"
                min="1"
                placeholder={
                  montoCuota
                    ? `$${montoCuota.toLocaleString('es-CL')} (calculado)`
                    : 'Se calcula automático'
                }
                helperText="Si no ingresas, se divide monto ÷ cuotas. La diferencia de centavos va a la primera."
              />
              {montoCuota && numCuotas && (
                <p className={styles.cuotaPreview}>
                  {numCuotas} cuotas de ${montoCuota.toLocaleString('es-CL')}
                </p>
              )}
            </div>
          )}

          {/* Comentario */}
          <Textarea
            name="comentario"
            label="Comentario"
            placeholder="Descripción opcional del movimiento…"
            helperText="Máximo 255 caracteres."
            maxLength={255}
            rows={2}
          />

          <div className={styles.actions}>
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
              onClick={() => navigate('/gastos')}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={loading} fullWidth>
              Guardar movimiento
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
