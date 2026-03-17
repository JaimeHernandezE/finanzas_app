import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import styles from './InversionesPage.module.scss'
import { MOCK_FONDOS } from './data'

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
  fondo: (typeof MOCK_FONDOS)[0]
  index: number
}) {
  const ganancia = fondo.valorActual - fondo.capitalTotal
  const rentabilidad =
    fondo.capitalTotal > 0 ? (ganancia / fondo.capitalTotal) * 100 : 0
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
          {fondo.esCompartido ? 'Familiar' : 'Personal'}
        </span>
      </div>
      <p className={styles.fondoCardDescripcion}>{fondo.descripcion}</p>
      <div className={styles.fondoCardSeparador} />
      <div className={styles.fondoCardMetricas}>
        <div className={styles.fondoCardFila}>
          <span className={styles.fondoCardLabel}>Capital</span>
          <span className={styles.fondoCardMonto}>
            {clp(fondo.capitalTotal)}
          </span>
        </div>
        <div className={styles.fondoCardFila}>
          <span className={styles.fondoCardLabel}>Valor actual</span>
          <span className={styles.fondoCardMonto}>
            {clp(fondo.valorActual)}
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
  const { capitalTotal, valorTotal, gananciaTotal, rentabilidadTotal } =
    useMemo(() => {
      const cap = MOCK_FONDOS.reduce((s, f) => s + f.capitalTotal, 0)
      const val = MOCK_FONDOS.reduce((s, f) => s + f.valorActual, 0)
      const gan = val - cap
      const rent = cap > 0 ? (gan / cap) * 100 : 0
      return {
        capitalTotal: cap,
        valorTotal: val,
        gananciaTotal: gan,
        rentabilidadTotal: rent,
      }
    }, [])

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
        {MOCK_FONDOS.map((fondo, index) => (
          <FondoCard key={fondo.id} fondo={fondo} index={index} />
        ))}
      </div>
    </div>
  )
}
