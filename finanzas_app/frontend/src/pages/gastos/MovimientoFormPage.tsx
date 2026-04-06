import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Input, InputMontoClp, Select, Textarea, CategoriaSelect } from '@/components/ui'
import { montoClpANumero } from '@/utils/montoClp'
import type { SelectOption } from '@/components/ui'
import { useCategorias, useTarjetas, useMetodosPago } from '@/hooks/useCatalogos'
import { useCuentasPersonales } from '@/hooks/useCuentasPersonales'
import { movimientosApi } from '@/api'
import { useConfig } from '@/context/ConfigContext'
import { esViteDemo } from '@/firebase'
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
  montoCuota?: string
  general?:   string
}

export default function MovimientoFormPage() {
  const { formatMonto } = useConfig()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
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

  const [tipo,      setTipo]      = useState<Tipo>('EGRESO')
  const ambito: Ambito = searchParams.get('ambito') === 'COMUN' ? 'COMUN' : 'PERSONAL'
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState<string>(
    searchParams.get('cuenta') ?? '',
  )
  const { data: categoriasData } = useCategorias({
    ambito: ambito === 'COMUN' ? 'FAMILIAR' : 'PERSONAL',
    tipo,
    cuenta:
      ambito === 'PERSONAL' && cuentaSeleccionada
        ? Number(cuentaSeleccionada)
        : undefined,
  })
  const categorias = (categoriasData ?? []) as { id: number; nombre: string; tipo: string; categoria_padre: number | null; es_padre: boolean }[]
  const tarjetas   = (tarjetasData ?? []) as { id: number; nombre: string }[]
  const metodos    = (metodosData ?? []) as { id: number; nombre: string; tipo: string }[]
  const [categoriaId, setCategoriaId] = useState<string>('')
  const [metodo,    setMetodo]    = useState<Metodo>('DEBITO')
  const [monto,     setMonto]     = useState('')
  const [numCuotas, setNumCuotas] = useState('')
  const [montoCuotaManual, setMontoCuotaManual] = useState('')
  const [loading,   setLoading]   = useState(false)
  const [errors,    setErrors]    = useState<FormErrors>({})
  const returnToParam = searchParams.get('returnTo')
  const returnTo = returnToParam && returnToParam.startsWith('/') ? returnToParam : null
  useEffect(() => {
    if (ambito !== 'PERSONAL') return
    if (!cuentasOpciones.length) return
    if (!cuentaSeleccionada || !cuentasOpciones.some(c => c.value === cuentaSeleccionada)) {
      const cuentaDefault = searchParams.get('cuenta') ?? cuentasOpciones[0]?.value
      setCuentaSeleccionada(cuentaDefault != null ? String(cuentaDefault) : '')
    }
  }, [ambito, cuentasOpciones, cuentaSeleccionada, searchParams])

  // Reset categoría cuando cambia tipo o cuenta (puede que la seleccionada ya no esté disponible)
  useEffect(() => { setCategoriaId('') }, [tipo, cuentaSeleccionada])

  const tarjetaOpciones: SelectOption[] = useMemo(() =>
    tarjetas.map(t => ({ value: String(t.id), label: t.nombre })),
  [tarjetas])

  const metodoPagoId = useMemo(() => {
    const m = metodos.find(x => x.tipo === metodo)
    return m?.id ?? null
  }, [metodos, metodo])

  const montoNum = montoClpANumero(monto)
  const montoCuotaCalculado =
    numCuotas && montoNum > 0
      ? Math.ceil(montoNum / parseInt(numCuotas, 10))
      : null
  const montoCuotaManualDigits = montoCuotaManual.replace(/\D/g, '')
  const montoCuotaManualNum = montoCuotaManualDigits
    ? parseInt(montoCuotaManualDigits, 10)
    : null
  const montoCuotaEfectivo =
    montoCuotaManualNum != null && !Number.isNaN(montoCuotaManualNum) && montoCuotaManualNum > 0
      ? montoCuotaManualNum
      : montoCuotaCalculado

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const next: FormErrors = {}

    if (!monto || montoNum <= 0) next.monto = 'El monto es obligatorio.'
    if (!categoriaId) next.categoria = 'Selecciona una categoría.'
    if (metodo === 'CREDITO') {
      if (!data.get('tarjeta'))  next.tarjeta   = 'Selecciona una tarjeta.'
      if (!numCuotas)            next.numCuotas = 'Ingresa el número de cuotas.'
      if (montoCuotaManual.trim() && (!montoCuotaManualNum || montoCuotaManualNum <= 0)) {
        next.montoCuota = 'Valor de cuota inválido o déjalo vacío.'
      }
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
        comentario: ((data.get('comentario') as string) ?? '').trim(),
        metodo_pago: metodoPagoId,
        tarjeta: metodo === 'CREDITO' && data.get('tarjeta') ? Number(data.get('tarjeta')) : null,
        num_cuotas: metodo === 'CREDITO' && numCuotas ? parseInt(numCuotas, 10) : null,
        monto_cuota: metodo === 'CREDITO' && montoCuotaEfectivo ? montoCuotaEfectivo : null,
      }
      await movimientosApi.createMovimiento(payload)
      const cuentaQ = searchParams.get('cuenta')
      const primeraPropia = cuentasData?.find(c => c.es_propia)
      // En build demo /configuracion/cuentas redirige a categorías (App.tsx); evita sensación de «no guardó».
      let dest = esViteDemo() ? '/dashboard' : '/configuracion/cuentas'
      if (returnTo) dest = returnTo
      else if (ambito === 'COMUN') dest = '/gastos/comunes'
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

          {/* Tipo */}
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
          </div>

          {/* Cuenta — solo si Personal */}
          {ambito === 'PERSONAL' && cuentasOpciones.length > 0 && (
            <Select
              name="cuenta"
              label="Cuenta"
              options={cuentasOpciones}
              placeholder="Selecciona cuenta…"
              error={errors.cuenta}
              value={cuentaSeleccionada}
              onChange={e => setCuentaSeleccionada(e.target.value)}
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
            <CategoriaSelect
              categorias={categorias}
              tipo={tipo}
              value={categoriaId}
              onChange={setCategoriaId}
              label="Categoría"
              error={errors.categoria}
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

          {/* Método de pago (solo egreso) */}
          {tipo === 'EGRESO' && (
            <div className={styles.field}>
              <span className={styles.label}>Método de pago</span>
              <div className={styles.metodoBtns}>
                {(['DEBITO', 'EFECTIVO', 'CREDITO'] as Metodo[]).map(m => (
                  <button
                    key={m}
                    type="button"
                    className={`${styles.metodoBtn} ${metodo === m ? styles.metodoBtnActive : ''}`}
                    onClick={() => {
                      setMetodo(m)
                      if (m !== 'CREDITO') setMontoCuotaManual('')
                    }}
                  >
                    {m === 'EFECTIVO' ? 'Efectivo' : m === 'DEBITO' ? 'Débito' : 'Crédito'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Panel crédito (solo egreso) */}
          {tipo === 'EGRESO' && metodo === 'CREDITO' && (
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
                type="text"
                inputMode="numeric"
                value={montoCuotaManual}
                onChange={e => setMontoCuotaManual(e.target.value)}
                placeholder={
                  montoCuotaCalculado
                    ? `${formatMonto(montoCuotaCalculado)} (calculado)`
                    : 'Se calcula automático'
                }
                error={errors.montoCuota}
                helperText="Si no ingresas, se divide monto ÷ cuotas. La diferencia de centavos va a la primera."
              />
              {montoCuotaEfectivo != null && numCuotas && (
                <p className={styles.cuotaPreview}>
                  {numCuotas} cuotas de {formatMonto(montoCuotaEfectivo)}
                  {montoCuotaManualNum ? ' (manual)' : ' (calculado)'}
                </p>
              )}
            </div>
          )}

          {/* Comentario */}
          <Textarea
            name="comentario"
            label="Comentario (opcional)"
            placeholder="Ej: Supermercado (puedes dejarlo vacío)"
            helperText="Máximo 255 caracteres."
            maxLength={255}
            rows={2}
          />

          <div className={styles.actions}>
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
              onClick={() => navigate(returnTo ?? '/gastos/comunes')}
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
