import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { useFondos } from '@/hooks/useInversiones'
import { Cargando, ErrorCarga } from '@/components/ui'
import styles from './InversionesPage.module.scss'

interface FondoApi {
  id: number
  nombre: string
  descripcion: string
  capital_total: number
  valor_actual: number
  es_compartido?: boolean
}

const clp = (n: number) =>
  n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })

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
  const esPositivo = gananciaTotal >= 0
  const labelGanancia = gananciaTotal >= 0 ? 'Ganancia' : 'Pérdida'
  return (
    <section className={styles.resumenSection}>
      <h2 className={styles.resumenTitle}>Resumen total</h2>
      <div className={styles.resumenGrid}>
        <div className={styles.resumenCard}>
          <span className={styles.resumenLabel}>Capital total</span>
          <span className={styles.resumenValor}>{clp(capitalTotal)}</span>
        </div>
        <div className={styles.resumenCard}>
          <span className={styles.resumenLabel}>Valor actual</span>
          <span className={styles.resumenValor}>{clp(valorTotal)}</span>
        </div>
        <div className={styles.resumenCard}>
          <span className={styles.resumenLabel}>{labelGanancia}</span>
          <span
            className={
              esPositivo ? styles.resumenValorGanancia : styles.resumenValorPerdida
            }
          >
            {clp(Math.abs(gananciaTotal))}
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
            {clp(capitalTotal)}
          </span>
        </div>
        <div className={styles.fondoCardFila}>
          <span className={styles.fondoCardLabel}>Valor actual</span>
          <span className={styles.fondoCardMonto}>
            {clp(valorActual)}
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
              {clp(ganancia)}
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
  const { data: fondosData, loading, error } = useFondos()
  const fondos = (fondosData ?? []) as FondoApi[]

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
      <h1 className={styles.titulo}>Inversiones</h1>
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
