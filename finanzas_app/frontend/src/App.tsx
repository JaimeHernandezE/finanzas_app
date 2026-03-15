import { useState } from 'react'
import { Button, Input, Select, Textarea } from '@/components/ui'
import type { SelectOption } from '@/components/ui'
import styles from './App.module.scss'

const TIPOS: SelectOption[] = [
  { value: 'EGRESO', label: 'Egreso' },
  { value: 'INGRESO', label: 'Ingreso' },
]

const AMBITOS: SelectOption[] = [
  { value: 'PERSONAL', label: 'Personal' },
  { value: 'COMUN', label: 'Común (familia)' },
]

const METODOS: SelectOption[] = [
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'DEBITO', label: 'Débito' },
  { value: 'CREDITO', label: 'Crédito' },
]

interface FormErrors {
  monto?: string
  categoria?: string
  tipo?: string
  metodo?: string
}

export default function App() {
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const next: FormErrors = {}

    if (!data.get('monto')) next.monto = 'El monto es obligatorio.'
    if (!data.get('categoria')) next.categoria = 'Ingresa una categoría.'
    if (!data.get('tipo')) next.tipo = 'Selecciona un tipo.'
    if (!data.get('metodo')) next.metodo = 'Selecciona un método de pago.'

    setErrors(next)
    if (Object.keys(next).length > 0) return

    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      setSubmitted(true)
    }, 1500)
  }

  if (submitted) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p className={styles.success}>✓ Movimiento registrado correctamente.</p>
          <Button variant="outline" onClick={() => setSubmitted(false)} fullWidth>
            Registrar otro
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <header className={styles.header}>
          <h1 className={styles.title}>Nuevo movimiento</h1>
          <p className={styles.subtitle}>Registra un ingreso o egreso de tu cuenta.</p>
        </header>

        <form onSubmit={handleSubmit} noValidate className={styles.form}>
          <div className={styles.row}>
            <Select
              name="tipo"
              label="Tipo"
              options={TIPOS}
              placeholder="Selecciona…"
              error={errors.tipo}
              required
            />
            <Select
              name="ambito"
              label="Ámbito"
              options={AMBITOS}
              defaultValue="PERSONAL"
            />
          </div>

          <Input
            name="monto"
            label="Monto"
            type="number"
            min="1"
            step="1"
            placeholder="0"
            error={errors.monto}
            helperText="Ingresa el monto en pesos chilenos (CLP)."
            required
          />

          <Input
            name="categoria"
            label="Categoría"
            type="text"
            placeholder="Ej: Alimentación, Sueldo…"
            error={errors.categoria}
            required
          />

          <div className={styles.row}>
            <Select
              name="metodo"
              label="Método de pago"
              options={METODOS}
              placeholder="Selecciona…"
              error={errors.metodo}
              required
            />
            <Input
              name="fecha"
              label="Fecha"
              type="date"
              defaultValue={new Date().toISOString().split('T')[0]}
            />
          </div>

          <Textarea
            name="comentario"
            label="Comentario"
            placeholder="Descripción opcional del movimiento…"
            helperText="Máximo 255 caracteres."
            maxLength={255}
            rows={2}
          />

          <div className={styles.actions}>
            <Button type="button" variant="ghost" disabled={loading}>
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
