import { useState, useMemo, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import styles from './FondoDetallePage.module.scss'
import { MOCK_FONDOS, type EventoFondo } from './data'

// TODO: reemplazar por fetch al backend
const MOCK_EVENTOS: EventoFondo[] = [
  { id: 1, tipo: 'VALOR', fecha: '2026-03-15', monto: 5980000 },
  { id: 2, tipo: 'APORTE', fecha: '2026-03-10', monto: 500000 },
  { id: 3, tipo: 'VALOR', fecha: '2026-03-01', monto: 5480000 },
  { id: 4, tipo: 'APORTE', fecha: '2026-02-15', monto: 1000000 },
  { id: 5, tipo: 'VALOR', fecha: '2026-02-01', monto: 4500000 },
  { id: 6, tipo: 'APORTE', fecha: '2026-01-10', monto: 2500000 },
  { id: 7, tipo: 'VALOR', fecha: '2026-01-01', monto: 3800000 },
]

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
  const fondo = MOCK_FONDOS.find((f) => f.id === id)

  const [eventos, setEventos] = useState<EventoFondo[]>(MOCK_EVENTOS)
  const [openForm, setOpenForm] = useState<'valor' | 'aporte' | null>(null)

  const [formValorFecha, setFormValorFecha] = useState(hoy())
  const [formValorMonto, setFormValorMonto] = useState('')
  const [formAporteFecha, setFormAporteFecha] = useState(hoy())
  const [formAporteMonto, setFormAporteMonto] = useState('')
  const [formAporteNota, setFormAporteNota] = useState('')

  useEffect(() => {
    setEventos(MOCK_EVENTOS)
    setOpenForm(null)
  }, [id])

  const eventosOrdenados = useMemo(
    () => [...eventos].sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [eventos]
  )

  const { capitalTotal, valorActual, ganancia, rentabilidad } = useMemo(() => {
    const aportes = eventos.filter((e) => e.tipo === 'APORTE')
    const valores = eventos.filter((e) => e.tipo === 'VALOR').sort((a, b) => b.fecha.localeCompare(a.fecha))
    const cap = aportes.reduce((s, e) => s + e.monto, 0)
    const val = valores[0]?.monto ?? 0
    const gan = val - cap
    const rent = cap > 0 ? (gan / cap) * 100 : 0
    return { capitalTotal: cap, valorActual: val, ganancia: gan, rentabilidad: rent }
  }, [eventos])

  const handleConfirmValor = () => {
    const monto = Number(formValorMonto)
    if (!Number.isFinite(monto) || monto < 0) return
    setEventos((prev) => [
      { id: Date.now(), tipo: 'VALOR' as const, fecha: formValorFecha, monto },
      ...prev,
    ])
    setFormValorMonto('')
    setFormValorFecha(hoy())
    setOpenForm(null)
  }

  const handleConfirmAporte = () => {
    const monto = Number(formAporteMonto)
    if (!Number.isFinite(monto) || monto < 0) return
    setEventos((prev) => [
      {
        id: Date.now(),
        tipo: 'APORTE' as const,
        fecha: formAporteFecha,
        monto,
        nota: formAporteNota.trim() || undefined,
      },
      ...prev,
    ])
    setFormAporteMonto('')
    setFormAporteNota('')
    setFormAporteFecha(hoy())
    setOpenForm(null)
  }

  const handleEliminar = (eventoId: number) => {
    setEventos((prev) => prev.filter((e) => e.id !== eventoId))
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
                    onClick={() => handleEliminar(ev.id)}
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
