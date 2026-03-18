import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useFondos } from '@/hooks/useInversiones'
import { inversionesApi } from '@/api/inversiones'
import { Button, Input, Textarea, Cargando, ErrorCarga } from '@/components/ui'
import { useConfig } from '@/context/ConfigContext'
import styles from './InversionesPage.module.scss'

interface FondoApi {
  id: number
  nombre: string
  descripcion: string
  capital_total: number
  valor_actual: number
  es_compartido?: boolean
}

function ResumenTotal({
  capitalTotal,
  valorTotal,
  gananciaTotal,
  rentabilidadTotal,
}: {
  capitalTotal: number
  valorTotal: number
  gananciaTotal: number
  rentabilidadTotal: number
}) {
  const { formatMonto } = useConfig()
  const esPositivo = gananciaTotal >= 0
  const labelGanancia = gananciaTotal >= 0 ? 'Ganancia' : 'Pérdida'
  return (
    <section className={styles.resumenSection}>
      <h2 className={styles.resumenTitle}>Resumen total</h2>
      <div className={styles.resumenGrid}>
        <div className={styles.resumenCard}>
          <span className={styles.resumenLabel}>Capital total</span>
          <span className={styles.resumenValor}>{formatMonto(capitalTotal)}</span>
        </div>
        <div className={styles.resumenCard}>
          <span className={styles.resumenLabel}>Valor actual</span>
          <span className={styles.resumenValor}>{formatMonto(valorTotal)}</span>
        </div>
        <div className={styles.resumenCard}>
          <span className={styles.resumenLabel}>{labelGanancia}</span>
          <span
            className={
              esPositivo ? styles.resumenValorGanancia : styles.resumenValorPerdida
            }
          >
            {formatMonto(Math.abs(gananciaTotal))}
          </span>
          <span
            className={`${styles.resumenPorcentaje} ${
              esPositivo
                ? styles.resumenPorcentajeGanancia
                : styles.resumenPorcentajePerdida
            }`}
          >
            {rentabilidadTotal >= 0 ? '+' : ''}
            {rentabilidadTotal.toFixed(1)}%
          </span>
        </div>
      </div>
    </section>
  )
}

function FondoCard({
  fondo,
  index,
}: {
  fondo: FondoApi
  index: number
}) {
  const { formatMonto } = useConfig()
  const capitalTotal = Number(fondo.capital_total)
  const valorActual = Number(fondo.valor_actual)
  const ganancia = valorActual - capitalTotal
  const rentabilidad =
    capitalTotal > 0 ? (ganancia / capitalTotal) * 100 : 0
  const esPositivo = ganancia >= 0

  return (
    <Link
      to={`/inversiones/${fondo.id}`}
      className={styles.fondoCard}
      style={{ animationDelay: `${index * 80}ms` } as React.CSSProperties}
    >
      <div className={styles.fondoCardHeader}>
        <span className={styles.fondoCardNombre}>{fondo.nombre}</span>
        <span className={styles.badgeAmbito}>
          {fondo.es_compartido ? 'Familiar' : 'Personal'}
        </span>
      </div>
      <p className={styles.fondoCardDescripcion}>{fondo.descripcion || '—'}</p>
      <div className={styles.fondoCardSeparador} />
      <div className={styles.fondoCardMetricas}>
        <div className={styles.fondoCardFila}>
          <span className={styles.fondoCardLabel}>Capital</span>
          <span className={styles.fondoCardMonto}>
            {formatMonto(capitalTotal)}
          </span>
        </div>
        <div className={styles.fondoCardFila}>
          <span className={styles.fondoCardLabel}>Valor actual</span>
          <span className={styles.fondoCardMonto}>
            {formatMonto(valorActual)}
          </span>
        </div>
        <div className={styles.fondoCardFila}>
          <span className={styles.fondoCardLabel}>Ganancia</span>
          <div className={styles.fondoCardGananciaRight}>
            <span
              className={
                esPositivo
                  ? styles.fondoCardMontoGanancia
                  : styles.fondoCardMontoPerdida
              }
            >
              {formatMonto(ganancia)}
            </span>
            <span
              className={
                esPositivo
                  ? styles.fondoCardPctGanancia
                  : styles.fondoCardPctPerdida
              }
            >
              {rentabilidad >= 0 ? '+' : ''}
              {rentabilidad.toFixed(1)}%
            </span>
            <span
              className={
                esPositivo
                  ? styles.fondoCardIndicadorGanancia
                  : styles.fondoCardIndicadorPerdida
              }
              aria-hidden
            >
              ●
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function InversionesPage() {
  const { data: fondosData, loading, error, refetch } = useFondos()
  const fondos = (fondosData ?? []) as FondoApi[]

  const [nombreFondo, setNombreFondo] = useState('')
  const [descFondo, setDescFondo] = useState('')
  const [compartido, setCompartido] = useState(false)
  const [savingFondo, setSavingFondo] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formAbierto, setFormAbierto] = useState(false)

  const crearFondo = async () => {
    const n = nombreFondo.trim()
    if (!n) {
      setFormError('El nombre es obligatorio.')
      return
    }
    setFormError(null)
    setSavingFondo(true)
    try {
      await inversionesApi.createFondo({
        nombre: n,
        descripcion: descFondo.trim(),
        es_compartido: compartido,
      })
      setNombreFondo('')
      setDescFondo('')
      setCompartido(false)
      setFormAbierto(false)
      await refetch()
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } } }
      setFormError(ax.response?.data?.error ?? 'No se pudo crear el fondo.')
    } finally {
      setSavingFondo(false)
    }
  }

  const { capitalTotal, valorTotal, gananciaTotal, rentabilidadTotal } =
    useMemo(() => {
      const cap = fondos.reduce((s, f) => s + Number(f.capital_total), 0)
      const val = fondos.reduce((s, f) => s + Number(f.valor_actual), 0)
      const gan = val - cap
      const rent = cap > 0 ? (gan / cap) * 100 : 0
      return {
        capitalTotal: cap,
        valorTotal: val,
        gananciaTotal: gan,
        rentabilidadTotal: rent,
      }
    }, [fondos])

  if (loading) return <Cargando />
  if (error) return <ErrorCarga mensaje={error} />

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.titulo}>Inversiones</h1>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setFormAbierto(a => !a)
            setFormError(null)
          }}
        >
          {formAbierto ? 'Cerrar' : '+ Nuevo fondo'}
        </Button>
      </div>

      {formAbierto && (
        <section className={styles.nuevoFondoCard}>
          <h2 className={styles.nuevoFondoTitle}>Nuevo fondo de inversión</h2>
          <Input
            label="Nombre"
            placeholder="Ej: Fondo mutuo conservador"
            value={nombreFondo}
            onChange={e => setNombreFondo(e.target.value)}
          />
          <Textarea
            label="Descripción (opcional)"
            placeholder="Notas o tipo de instrumento…"
            value={descFondo}
            onChange={e => setDescFondo(e.target.value)}
            rows={2}
          />
          <label className={styles.checkCompartido}>
            <input
              type="checkbox"
              checked={compartido}
              onChange={e => setCompartido(e.target.checked)}
            />
            <span>Compartir con la familia (visible para todos)</span>
          </label>
          {formError && <p className={styles.formError}>{formError}</p>}
          <div className={styles.nuevoFondoActions}>
            <Button type="button" onClick={crearFondo} loading={savingFondo}>
              Crear fondo
            </Button>
          </div>
        </section>
      )}

      <ResumenTotal
        capitalTotal={capitalTotal}
        valorTotal={valorTotal}
        gananciaTotal={gananciaTotal}
        rentabilidadTotal={rentabilidadTotal}
      />
      <div className={styles.fondosGrid}>
        {fondos.map((fondo, index) => (
          <FondoCard key={fondo.id} fondo={fondo} index={index} />
        ))}
      </div>
    </div>
  )
}
