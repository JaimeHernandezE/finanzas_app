import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useFondoDetalle } from '@/hooks/useInversiones'
import { inversionesApi } from '@/api'
import { Cargando, ErrorCarga, InputMontoClp } from '@/components/ui'
import { montoClpANumero } from '@/utils/montoClp'
import { useConfig } from '@/context/ConfigContext'
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

const hoy = () => new Date().toISOString().slice(0, 10)

function formatFecha(fecha: string) {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
  })
}

function labelEvento(tipo: EventoFondo['tipo']): string {
  if (tipo === 'VALOR') return 'Valor actualizado'
  if (tipo === 'RETIRO') return 'Retiro'
  return 'Aporte'
}

function iconoEvento(tipo: EventoFondo['tipo']): string {
  if (tipo === 'VALOR') return '▲'
  if (tipo === 'RETIRO') return '↓'
  return '💰'
}

function classIconoEvento(tipo: EventoFondo['tipo']): string {
  if (tipo === 'VALOR') return styles.iconoValor
  if (tipo === 'RETIRO') return styles.iconoRetiro
  return styles.iconoAporte
}

function classMontoEvento(tipo: EventoFondo['tipo']): string {
  if (tipo === 'APORTE') return styles.historialMontoAporte
  if (tipo === 'RETIRO') return styles.historialMontoRetiro
  return ''
}

function normalizarTipoEvento(tipo: string): EventoFondo['tipo'] {
  if (tipo === 'VALOR') return 'VALOR'
  if (tipo === 'RETIRO') return 'RETIRO'
  return 'APORTE'
}

export default function FondoDetallePage() {
  const { formatMonto } = useConfig()
  const { id } = useParams<{ id: string }>()
  const { data: fondoData, loading, error, refetch } = useFondoDetalle(Number(id))
  const fondo = fondoData as FondoDetalleApi | null | undefined

  const [openForm, setOpenForm] = useState<'valor' | 'movimiento' | null>(null)
  const [formValorFecha, setFormValorFecha] = useState(hoy())
  const [formValorMonto, setFormValorMonto] = useState('')
  const [formMovFecha, setFormMovFecha] = useState(hoy())
  const [formMovMonto, setFormMovMonto] = useState('')
  const [formMovNota, setFormMovNota] = useState('')
  const [formMovTipo, setFormMovTipo] = useState<'APORTE' | 'RETIRO'>('APORTE')

  const eventos: EventoFondo[] = useMemo(() => {
    const h = fondo?.historial ?? []
    return h.map((e) => ({
      id: e.id,
      tipo: normalizarTipoEvento(e.tipo),
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

  const handleConfirmMovimiento = async () => {
    const n = montoClpANumero(formMovMonto)
    if (n <= 0) return
    const montoFirmado = formMovTipo === 'RETIRO' ? -n : n
    await inversionesApi.agregarAporte(Number(id), {
      fecha: formMovFecha,
      monto: String(montoFirmado),
      nota: formMovNota.trim() || undefined,
    })
    setFormMovMonto('')
    setFormMovNota('')
    setFormMovFecha(hoy())
    setFormMovTipo('APORTE')
    setOpenForm(null)
    refetch()
  }

  const handleEliminar = async (evento: EventoFondo) => {
    if (evento.tipo === 'VALOR') await inversionesApi.eliminarValor(evento.id)
    else await inversionesApi.eliminarAporte(evento.id)
    refetch()
  }

  const openRegistrarValor = () => {
    setOpenForm('valor')
    setFormValorFecha(hoy())
    setFormValorMonto('')
  }

  const openAgregarMovimiento = () => {
    setOpenForm('movimiento')
    setFormMovFecha(hoy())
    setFormMovMonto('')
    setFormMovNota('')
    setFormMovTipo('APORTE')
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
        <span>Capital {formatMonto(capitalTotal)}</span>
        <span>Valor actual {formatMonto(valorActual)}</span>
        <span
          className={
            esGananciaPositiva ? styles.metricaGananciaPos : styles.metricaGananciaNeg
          }
        >
          Ganancia {esGananciaPositiva ? '+' : ''}
          {rentabilidad.toFixed(1)}% ({formatMonto(ganancia)})
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
          onClick={openAgregarMovimiento}
        >
          + Agregar movimiento
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
              type="text"
              inputMode="decimal"
              className={styles.formInlineInputNum}
              value={formValorMonto}
              onChange={(e) => setFormValorMonto(e.target.value.replace(',', '.'))}
              placeholder="Ej: 1250,5"
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

      {openForm === 'movimiento' && (
        <div className={styles.formInline}>
          <div>
            <label className={styles.formInlineLabel}>Tipo</label>
            <div className={styles.segmentedTipo} role="group" aria-label="Tipo de movimiento">
              <button
                type="button"
                className={`${styles.segmentTipo} ${
                  formMovTipo === 'APORTE' ? styles.segmentTipoActive : ''
                }`}
                onClick={() => setFormMovTipo('APORTE')}
              >
                Aporte
              </button>
              <button
                type="button"
                className={`${styles.segmentTipo} ${
                  formMovTipo === 'RETIRO' ? styles.segmentTipoActive : ''
                }`}
                onClick={() => setFormMovTipo('RETIRO')}
              >
                Retiro
              </button>
            </div>
          </div>
          <div>
            <label className={styles.formInlineLabel} htmlFor="mov-fecha">
              Fecha
            </label>
            <input
              id="mov-fecha"
              type="date"
              className={styles.formInlineInput}
              value={formMovFecha}
              onChange={(e) => setFormMovFecha(e.target.value)}
            />
          </div>
          <div>
            <label className={styles.formInlineLabel} htmlFor="mov-monto">
              {formMovTipo === 'RETIRO' ? 'Monto del retiro' : 'Monto del aporte'}
            </label>
            <InputMontoClp
              soloInput
              id="mov-monto"
              inputClassName={styles.formInlineInputNum}
              value={formMovMonto}
              onChange={setFormMovMonto}
              aria-label={formMovTipo === 'RETIRO' ? 'Monto del retiro' : 'Monto del aporte'}
            />
          </div>
          <div>
            <label className={styles.formInlineLabel} htmlFor="mov-nota">
              Nota (opcional)
            </label>
            <input
              id="mov-nota"
              type="text"
              className={styles.formInlineInput}
              value={formMovNota}
              onChange={(e) => setFormMovNota(e.target.value)}
              placeholder="Nota"
            />
          </div>
          <button
            type="button"
            className={styles.btnFormConfirm}
            onClick={handleConfirmMovimiento}
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
              onClick={openAgregarMovimiento}
            >
              Agrega el primer valor o movimiento →
            </button>
          </div>
        ) : (
          <div className={styles.historialList}>
            {eventosOrdenados.map((ev) => (
              <div key={`${ev.tipo}-${ev.id}`} className={styles.historialItem}>
                <div className={`${styles.iconoWrap} ${classIconoEvento(ev.tipo)}`}>
                  {iconoEvento(ev.tipo)}
                </div>
                <div className={styles.historialContent}>
                  <div className={styles.historialFecha}>
                    {formatFecha(ev.fecha)}
                  </div>
                  <div className={styles.historialLabel}>
                    {labelEvento(ev.tipo)}
                  </div>
                  {(ev.tipo === 'APORTE' || ev.tipo === 'RETIRO') && ev.nota && (
                    <div className={styles.historialNota}>{ev.nota}</div>
                  )}
                </div>
                <div className={styles.historialRight}>
                  <span
                    className={`${styles.historialMonto} ${classMontoEvento(ev.tipo)}`}
                  >
                    {formatMonto(ev.monto)}
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
