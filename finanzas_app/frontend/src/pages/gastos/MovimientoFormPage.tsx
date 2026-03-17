import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Select, Textarea } from '@/components/ui'
import type { SelectOption } from '@/components/ui'
import styles from './MovimientoFormPage.module.scss'

type Tipo   = 'EGRESO' | 'INGRESO'
type Ambito = 'PERSONAL' | 'COMUN'
type Metodo = 'EFECTIVO' | 'DEBITO' | 'CREDITO'

interface FormErrors {
  monto?:     string
  categoria?: string
  tarjeta?:   string
  numCuotas?: string
}

const CATEGORIAS_EGRESO: SelectOption[] = [
  { value: 'alimentacion',    label: 'Alimentación' },
  { value: 'transporte',      label: 'Transporte' },
  { value: 'vivienda',        label: 'Vivienda' },
  { value: 'salud',           label: 'Salud' },
  { value: 'entretenimiento', label: 'Entretenimiento' },
  { value: 'ropa',            label: 'Ropa' },
  { value: 'educacion',       label: 'Educación' },
  { value: 'otros',           label: 'Otros' },
]

const CATEGORIAS_INGRESO: SelectOption[] = [
  { value: 'sueldo',      label: 'Sueldo' },
  { value: 'honorarios',  label: 'Honorarios' },
  { value: 'arriendo',    label: 'Arriendo recibido' },
  { value: 'otros',       label: 'Otros' },
]

// Placeholder — en producción vendrán de la API
const CUENTAS: SelectOption[] = [
  { value: '1', label: 'Personal' },
  { value: '2', label: 'Arquitecto' },
]

const TARJETAS: SelectOption[] = [
  { value: '1', label: 'Visa BCI' },
  { value: '2', label: 'Mastercard Santander' },
]

interface SubmitData {
  monto:     string
  numCuotas: string
  tipo:      Tipo
}

export default function MovimientoFormPage() {
  const navigate = useNavigate()

  const [tipo,      setTipo]      = useState<Tipo>('EGRESO')
  const [ambito,    setAmbito]    = useState<Ambito>('PERSONAL')
  const [metodo,    setMetodo]    = useState<Metodo>('EFECTIVO')
  const [monto,     setMonto]     = useState('')
  const [numCuotas, setNumCuotas] = useState('')
  const [loading,   setLoading]   = useState(false)
  const [errors,    setErrors]    = useState<FormErrors>({})
  const [result,    setResult]    = useState<SubmitData | null>(null)

  const montoCuota =
    numCuotas && monto
      ? Math.ceil(parseFloat(monto) / parseInt(numCuotas))
      : null

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const next: FormErrors = {}

    if (!monto)               next.monto     = 'El monto es obligatorio.'
    if (!data.get('categoria')) next.categoria = 'Selecciona una categoría.'
    if (metodo === 'CREDITO') {
      if (!data.get('tarjeta'))  next.tarjeta   = 'Selecciona una tarjeta.'
      if (!numCuotas)            next.numCuotas = 'Ingresa el número de cuotas.'
    }

    setErrors(next)
    if (Object.keys(next).length > 0) return

    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      setResult({ monto, numCuotas, tipo })
    }, 1500)
  }

  // ── Pantalla de éxito ──────────────────────────────────────────────────────
  if (result) {
    const cuotaValor = result.numCuotas
      ? Math.ceil(parseFloat(result.monto) / parseInt(result.numCuotas))
      : null

    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p className={styles.successMsg}>✓ Movimiento registrado correctamente.</p>
          {cuotaValor && (
            <p className={styles.cuotaResumen}>
              Se generaron {result.numCuotas} cuotas de ${cuotaValor.toLocaleString('es-CL')} c/u
            </p>
          )}
          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => navigate('/gastos')}>
              Ver gastos
            </Button>
            <Button variant="outline" fullWidth onClick={() => setResult(null)}>
              Registrar otro
            </Button>
          </div>
        </div>
      </div>
    )
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
          {ambito === 'PERSONAL' && (
            <Select
              name="cuenta"
              label="Cuenta"
              options={CUENTAS}
              placeholder="Selecciona cuenta…"
            />
          )}

          {/* Categoría + Fecha */}
          <div className={styles.row}>
            <Select
              name="categoria"
              label="Categoría"
              options={tipo === 'EGRESO' ? CATEGORIAS_EGRESO : CATEGORIAS_INGRESO}
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

          {/* Monto */}
          <Input
            name="monto"
            label="Monto"
            type="number"
            min="1"
            step="1"
            placeholder="0"
            value={monto}
            onChange={e => setMonto(e.target.value)}
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
                  options={TARJETAS}
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
