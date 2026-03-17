import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useFondoDetalle } from '@/hooks/useInversiones'
import { inversionesApi } from '@/api'
import { Cargando, ErrorCarga } from '@/components/ui'
import styles from './FondoDetallePage.module.scss'
import type { EventoFondo } from './data'

interface FondoDetalleApi {
  id: number
  nombre: string
  descripcion: string
  capital_total: number
  valor_actual: number
  ganancia: number
  rentabilidad: number
  historial?: { id: number; tipo: string; fecha: string; monto: string; nota?: string | null }[]
}

const clp = (n: number) =>
  n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })

const hoy = () => new Date().toISOString().slice(0, 10)

function formatFecha(fecha: string) {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
  })
}

export default function FondoDetallePage() {
  const { id } = useParams<{ id: string }>()
  const { data: fondoData, loading, error, refetch } = useFondoDetalle(Number(id))
  const fondo = fondoData as FondoDetalleApi | null | undefined

  const [openForm, setOpenForm] = useState<'valor' | 'aporte' | null>(null)
  const [formValorFecha, setFormValorFecha] = useState(hoy())
  const [formValorMonto, setFormValorMonto] = useState('')
  const [formAporteFecha, setFormAporteFecha] = useState(hoy())
  const [formAporteMonto, setFormAporteMonto] = useState('')
  const [formAporteNota, setFormAporteNota] = useState('')

  const eventos: EventoFondo[] = useMemo(() => {
    const h = fondo?.historial ?? []
    return h.map((e) => ({
      id: e.id,
      tipo: e.tipo as EventoFondo['tipo'],
      fecha: e.fecha,
      monto: Number(e.monto) || 0,
      nota: e.nota ?? undefined,
    }))
  }, [fondo?.historial])

  const eventosOrdenados = useMemo(
    () => [...eventos].sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [eventos]
  )

  const capitalTotal = Number(fondo?.capital_total ?? 0)
  const valorActual = Number(fondo?.valor_actual ?? 0)
  const ganancia = Number(fondo?.ganancia ?? 0)
  const rentabilidad = Number(fondo?.rentabilidad ?? 0)

  const handleConfirmValor = async () => {
    const monto = formValorMonto
    if (!monto || Number(monto) < 0) return
    await inversionesApi.agregarValor(Number(id), { fecha: formValorFecha, valor_cuota: monto })
    setFormValorMonto('')
    setFormValorFecha(hoy())
    setOpenForm(null)
    refetch()
  }

  const handleConfirmAporte = async () => {
    const monto = formAporteMonto
    if (!monto || Number(monto) < 0) return
    await inversionesApi.agregarAporte(Number(id), {
      fecha: formAporteFecha,
      monto,
      nota: formAporteNota.trim() || undefined,
    })
    setFormAporteMonto('')
    setFormAporteNota('')
    setFormAporteFecha(hoy())
    setOpenForm(null)
    refetch()
  }

  const handleEliminar = async (evento: EventoFondo) => {
    if (evento.tipo === 'APORTE') await inversionesApi.eliminarAporte(evento.id)
    else await inversionesApi.eliminarValor(evento.id)
    refetch()
  }

  const openRegistrarValor = () => {
    setOpenForm('valor')
    setFormValorFecha(hoy())
    setFormValorMonto('')
  }

  const openAgregarAporte = () => {
    setOpenForm('aporte')
    setFormAporteFecha(hoy())
    setFormAporteMonto('')
    setFormAporteNota('')
  }

  if (loading) return <Cargando />
  if (error) return <ErrorCarga mensaje={error} />
  if (!fondo) {
    return (
      <div className={styles.page}>
        <p className={styles.notFound}>Fondo no encontrado.</p>
        <Link to="/inversiones" className={styles.backLink}>
          ← Inversiones
        </Link>
      </div>
    )
  }

  const esGananciaPositiva = ganancia >= 0

  return (
    <div className={styles.page}>
      <Link to="/inversiones" className={styles.backLink}>
        ← Inversiones
      </Link>
      <h1 className={styles.titulo}>{fondo.nombre}</h1>
      <div className={styles.metricasFila}>
        <span>Capital {clp(capitalTotal)}</span>
        <span>Valor actual {clp(valorActual)}</span>
        <span
          className={
            esGananciaPositiva ? styles.metricaGananciaPos : styles.metricaGananciaNeg
          }
        >
          Ganancia {esGananciaPositiva ? '+' : ''}
          {rentabilidad.toFixed(1)}% ({clp(ganancia)})
        </span>
      </div>

      <div className={styles.accionesSection}>
        <button
          type="button"
          className={styles.btnAccion}
          onClick={openRegistrarValor}
        >
          + Registrar valor
        </button>
        <button
          type="button"
          className={styles.btnAccion}
          onClick={openAgregarAporte}
        >
          + Agregar aporte
        </button>
      </div>

      {openForm === 'valor' && (
        <div className={styles.formInline}>
          <div>
            <label className={styles.formInlineLabel} htmlFor="valor-fecha">
              Fecha
            </label>
            <input
              id="valor-fecha"
              type="date"
              className={styles.formInlineInput}
              value={formValorFecha}
              onChange={(e) => setFormValorFecha(e.target.value)}
            />
          </div>
          <div>
            <label className={styles.formInlineLabel} htmlFor="valor-monto">
              Valor actual del fondo
            </label>
            <input
              id="valor-monto"
              type="number"
              min={0}
              step={1000}
              className={styles.formInlineInputNum}
              value={formValorMonto}
              onChange={(e) => setFormValorMonto(e.target.value)}
              placeholder="0"
            />
          </div>
          <button
            type="button"
            className={styles.btnFormConfirm}
            onClick={handleConfirmValor}
            aria-label="Confirmar"
          >
            ✓
          </button>
          <button
            type="button"
            className={styles.btnFormCancel}
            onClick={() => setOpenForm(null)}
            aria-label="Cancelar"
          >
            ✕
          </button>
        </div>
      )}

      {openForm === 'aporte' && (
        <div className={styles.formInline}>
          <div>
            <label className={styles.formInlineLabel} htmlFor="aporte-fecha">
              Fecha
            </label>
            <input
              id="aporte-fecha"
              type="date"
              className={styles.formInlineInput}
              value={formAporteFecha}
              onChange={(e) => setFormAporteFecha(e.target.value)}
            />
          </div>
          <div>
            <label className={styles.formInlineLabel} htmlFor="aporte-monto">
              Monto del aporte
            </label>
            <input
              id="aporte-monto"
              type="number"
              min={0}
              step={1000}
              className={styles.formInlineInputNum}
              value={formAporteMonto}
              onChange={(e) => setFormAporteMonto(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className={styles.formInlineLabel} htmlFor="aporte-nota">
              Nota (opcional)
            </label>
            <input
              id="aporte-nota"
              type="text"
              className={styles.formInlineInput}
              value={formAporteNota}
              onChange={(e) => setFormAporteNota(e.target.value)}
              placeholder="Nota"
            />
          </div>
          <button
            type="button"
            className={styles.btnFormConfirm}
            onClick={handleConfirmAporte}
            aria-label="Confirmar"
          >
            ✓
          </button>
          <button
            type="button"
            className={styles.btnFormCancel}
            onClick={() => setOpenForm(null)}
            aria-label="Cancelar"
          >
            ✕
          </button>
        </div>
      )}

      <section className={styles.historialSection}>
        <h2 className={styles.historialTitle}>Historial</h2>

        {eventosOrdenados.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon} aria-hidden>
              ○
            </div>
            <p className={styles.emptyText}>Sin registros para este fondo</p>
            <button
              type="button"
              className={styles.emptyLink}
              onClick={openRegistrarValor}
            >
              Agrega el primer valor o aporte →
            </button>
          </div>
        ) : (
          <div className={styles.historialList}>
            {eventosOrdenados.map((ev) => (
              <div key={ev.id} className={styles.historialItem}>
                <div
                  className={`${styles.iconoWrap} ${
                    ev.tipo === 'VALOR' ? styles.iconoValor : styles.iconoAporte
                  }`}
                >
                  {ev.tipo === 'VALOR' ? '▲' : '💰'}
                </div>
                <div className={styles.historialContent}>
                  <div className={styles.historialFecha}>
                    {formatFecha(ev.fecha)}
                  </div>
                  <div className={styles.historialLabel}>
                    {ev.tipo === 'VALOR' ? 'Valor actualizado' : 'Aporte'}
                  </div>
                  {ev.tipo === 'APORTE' && ev.nota && (
                    <div className={styles.historialNota}>{ev.nota}</div>
                  )}
                </div>
                <div className={styles.historialRight}>
                  <span
                    className={`${styles.historialMonto} ${
                      ev.tipo === 'APORTE' ? styles.historialMontoAporte : ''
                    }`}
                  >
                    {clp(ev.monto)}
                  </span>
                  <button
                    type="button"
                    className={styles.btnEliminar}
                    onClick={() => handleEliminar(ev)}
                    aria-label="Eliminar"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
