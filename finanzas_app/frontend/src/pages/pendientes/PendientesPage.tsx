import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { pendientesApi, type MovimientoPendienteApi } from '@/api/pendientes'
import { useCategorias, useMetodosPago } from '@/hooks/useCatalogos'
import { useConfig } from '@/context/ConfigContext'
import { Cargando, ErrorCarga } from '@/components/ui'
import { apiErrorMessage } from '@/utils/apiErrorMessage'
import styles from './PendientesPage.module.scss'

export default function PendientesPage() {
  const { formatMonto } = useConfig()
  const { data: categorias } = useCategorias()
  const { data: metodos } = useMetodosPago()
  const [items, setItems] = useState<MovimientoPendienteApi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [edits, setEdits] = useState<Record<number, {
    ambito: 'PERSONAL' | 'COMUN'
    categoria: number | ''
    metodo_pago: number | ''
  }>>({})

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await pendientesApi.listar()
      setItems(data)
      const next: typeof edits = {}
      for (const p of data) {
        next[p.id] = {
          ambito: p.ambito_sugerido === 'COMUN' ? 'COMUN' : 'PERSONAL',
          categoria: p.categoria_sugerida ?? '',
          metodo_pago: p.metodo_pago_sugerido ?? '',
        }
      }
      setEdits(next)
    } catch (e) {
      setError(apiErrorMessage(e, 'No se pudieron cargar los pendientes.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const confirmar = async (p: MovimientoPendienteApi) => {
    const e = edits[p.id]
    if (!e?.ambito || !e.categoria || !e.metodo_pago) {
      setError('Elige ámbito, categoría y método de pago antes de confirmar.')
      return
    }
    setBusyId(p.id)
    setError(null)
    try {
      await pendientesApi.confirmar(p.id, {
        ambito: e.ambito,
        categoria: Number(e.categoria),
        metodo_pago: Number(e.metodo_pago),
        comentario: p.comercio || undefined,
      })
      await cargar()
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo confirmar.'))
    } finally {
      setBusyId(null)
    }
  }

  const descartar = async (id: number) => {
    setBusyId(id)
    setError(null)
    try {
      await pendientesApi.descartar(id)
      await cargar()
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo descartar.'))
    } finally {
      setBusyId(null)
    }
  }

  const catsEgreso = (categorias ?? []).filter((c) => c.tipo === 'EGRESO' && !c.es_padre)

  if (loading) return <Cargando />

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Pendientes</h1>
          <p className={styles.sub}>
            Borradores capturados por bot o correo. Confirma para crear el movimiento.
          </p>
        </div>
        <Link to="/configuracion/captura" className={styles.linkCaptura}>
          Vincular WhatsApp / Telegram
        </Link>
      </header>

      {error ? <ErrorCarga mensaje={error} /> : null}

      {items.length === 0 ? (
        <p className={styles.empty}>No hay movimientos pendientes.</p>
      ) : (
        <ul className={styles.list}>
          {items.map((p) => {
            const e = edits[p.id]
            return (
              <li key={p.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <strong className={styles.monto}>{formatMonto(Number(p.monto))}</strong>
                  <span className={styles.origen}>{p.origen}</span>
                </div>
                <div className={styles.meta}>
                  {p.fecha} · {p.comercio || 'Sin comercio'}
                </div>

                <div className={styles.fields}>
                  <label>
                    Ámbito
                    <select
                      value={e?.ambito ?? 'PERSONAL'}
                      onChange={(ev) =>
                        setEdits((prev) => ({
                          ...prev,
                          [p.id]: {
                            ...prev[p.id],
                            ambito: ev.target.value as 'PERSONAL' | 'COMUN',
                          },
                        }))
                      }
                    >
                      <option value="PERSONAL">Personal</option>
                      <option value="COMUN">Común</option>
                    </select>
                  </label>
                  <label>
                    Categoría
                    <select
                      value={e?.categoria ?? ''}
                      onChange={(ev) =>
                        setEdits((prev) => ({
                          ...prev,
                          [p.id]: {
                            ...prev[p.id],
                            categoria: ev.target.value ? Number(ev.target.value) : '',
                          },
                        }))
                      }
                    >
                      <option value="">Elegir…</option>
                      {catsEgreso.map((c) => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Método
                    <select
                      value={e?.metodo_pago ?? ''}
                      onChange={(ev) =>
                        setEdits((prev) => ({
                          ...prev,
                          [p.id]: {
                            ...prev[p.id],
                            metodo_pago: ev.target.value ? Number(ev.target.value) : '',
                          },
                        }))
                      }
                    >
                      <option value="">Elegir…</option>
                      {(metodos ?? []).map((m) => (
                        <option key={m.id} value={m.id}>{m.nombre}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    disabled={busyId === p.id}
                    onClick={() => void confirmar(p)}
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    disabled={busyId === p.id}
                    onClick={() => void descartar(p.id)}
                  >
                    Descartar
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
