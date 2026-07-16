import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { pendientesApi, type MovimientoPendienteApi } from '@/api/pendientes'
import { useCategorias, useMetodosPago, useTarjetas } from '@/hooks/useCatalogos'
import { useCuentasPersonales } from '@/hooks/useCuentasPersonales'
import { useConfig } from '@/context/ConfigContext'
import { Cargando, ErrorCarga } from '@/components/ui'
import { apiErrorMessage } from '@/utils/apiErrorMessage'
import styles from './PendientesPage.module.scss'

type EditState = {
  ambito: 'PERSONAL' | 'COMUN'
  cuenta: number | ''
  categoria: number | ''
  metodo_pago: number | ''
  tarjeta: number | ''
  comercio: string
  num_cuotas: string
}

type CategoriaOpt = {
  id: number
  nombre: string
  tipo: string
  es_padre?: boolean
  cuenta_personal?: number | null
}

function formatFechaHora(fecha: string, hora: string | null | undefined): string {
  const fechaTxt = fecha || 'Sin fecha'
  if (!hora) return fechaTxt
  // hora puede ser HH:MM o HH:MM:SS
  const hhmm = hora.slice(0, 5)
  return `${fechaTxt} · ${hhmm}`
}

function etiquetaOrigen(origen: string): string {
  if (origen === 'EMAIL_BANCO') return 'Correo'
  if (origen === 'MANUAL') return 'Manual'
  if (origen === 'WHATSAPP' || origen === 'TELEGRAM') return 'Otro'
  return origen
}

function etiquetaBanco(banco: string | null | undefined): string {
  const raw = (banco || '').trim()
  if (!raw) return ''
  const map: Record<string, string> = {
    BCI: 'BCI',
    SANTANDER: 'Santander',
    BANCOESTADO: 'BancoEstado',
    GENERICO: '',
  }
  const upper = raw.toUpperCase()
  if (upper in map) return map[upper]
  return raw
}

function metaTarjetaBanco(p: {
  ultimos_4?: string | null
  tarjeta_sugerida_ultimos_4?: string | null
  banco?: string | null
  tarjeta_sugerida_banco?: string | null
  es_transferencia?: boolean
}): string {
  const ultimos4 = p.ultimos_4 || p.tarjeta_sugerida_ultimos_4 || ''
  const banco = etiquetaBanco(p.banco || p.tarjeta_sugerida_banco)
  const partes: string[] = []
  if (p.es_transferencia) partes.push('Transferencia')
  if (ultimos4) partes.push(`Tarjeta ···${ultimos4}`)
  if (banco) partes.push(banco)
  return partes.length ? ` · ${partes.join(' · ')}` : ''
}

function comentarioDesdeEdit(e: EditState, hora: string | null | undefined): string {
  const partes = [e.comercio.trim()]
  if (hora) partes.push(hora.slice(0, 5))
  return partes.filter(Boolean).join(' · ')
}

export default function PendientesPage() {
  const { formatMonto } = useConfig()
  const { data: catsPersonal } = useCategorias({ ambito: 'PERSONAL', tipo: 'EGRESO' })
  const { data: catsFamiliar } = useCategorias({ ambito: 'FAMILIAR', tipo: 'EGRESO' })
  const { data: metodos } = useMetodosPago()
  const { data: tarjetas } = useTarjetas()
  const { data: cuentasData } = useCuentasPersonales()
  const [items, setItems] = useState<MovimientoPendienteApi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [edits, setEdits] = useState<Record<number, EditState>>({})

  const cuentas = cuentasData ?? []
  const cuentaDefaultId = useMemo(() => {
    const propia = cuentas.find((c) => c.es_propia)
    return propia?.id ?? cuentas[0]?.id ?? ''
  }, [cuentas])

  const destinoValue = (ambito: 'PERSONAL' | 'COMUN', cuenta: number | '') => {
    if (ambito === 'COMUN') return 'comun'
    return cuenta ? `cuenta:${cuenta}` : ''
  }

  const onDestinoChange = (id: number, value: string) => {
    const ambito: 'PERSONAL' | 'COMUN' = value === 'comun' ? 'COMUN' : 'PERSONAL'
    const cuenta =
      ambito === 'COMUN'
        ? ''
        : value.startsWith('cuenta:')
          ? Number(value.slice('cuenta:'.length))
          : (cuentaDefaultId || '')
    const cats = catsPara(ambito, cuenta)
    const actual = edits[id]?.categoria
    const sigue = actual && cats.some((c) => c.id === actual)
    patchEdit(id, {
      ambito,
      cuenta,
      categoria: sigue ? actual : '',
    })
  }

  const metodoPorId = useMemo(() => {
    const map = new Map<number, { id: number; nombre: string; tipo: string }>()
    for (const m of metodos ?? []) {
      map.set(m.id, m)
    }
    return map
  }, [metodos])

  const catsPara = (ambito: 'PERSONAL' | 'COMUN', cuentaId: number | '') => {
    if (ambito === 'COMUN') {
      return ((catsFamiliar ?? []) as CategoriaOpt[]).filter(
        (c) => c.tipo === 'EGRESO' && !c.es_padre,
      )
    }
    const list = ((catsPersonal ?? []) as CategoriaOpt[]).filter(
      (c) => c.tipo === 'EGRESO' && !c.es_padre,
    )
    if (!cuentaId) return list
    return list.filter((c) => c.cuenta_personal === cuentaId)
  }

  const tarjetasParaMetodo = (metodoId: number | '') => {
    if (!metodoId) return tarjetas ?? []
    const tipo = metodoPorId.get(metodoId)?.tipo
    if (tipo === 'CREDITO') {
      return (tarjetas ?? []).filter((t) => (t.tipo ?? 'CREDITO') === 'CREDITO')
    }
    if (tipo === 'DEBITO') {
      return (tarjetas ?? []).filter((t) => t.tipo === 'DEBITO')
    }
    return tarjetas ?? []
  }

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await pendientesApi.listar()
      setItems(data)
      setEdits((prev) => {
        const next: Record<number, EditState> = {}
        for (const p of data) {
          const ambito = p.ambito_sugerido === 'COMUN' ? 'COMUN' : 'PERSONAL'
          const prevEdit = prev[p.id]
          next[p.id] = {
            ambito,
            cuenta:
              p.cuenta_sugerida
              ?? (ambito === 'PERSONAL'
                ? (prevEdit?.cuenta || cuentaDefaultId || '')
                : ''),
            categoria: p.categoria_sugerida ?? '',
            metodo_pago: p.metodo_pago_sugerido ?? '',
            tarjeta: p.tarjeta_sugerida ?? '',
            comercio: p.comercio || '',
            num_cuotas: prevEdit?.num_cuotas || '1',
          }
        }
        return next
      })
    } catch (e) {
      setError(apiErrorMessage(e, 'No se pudieron cargar los pendientes.'))
    } finally {
      setLoading(false)
    }
  }, [cuentaDefaultId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    if (!cuentaDefaultId) return
    setEdits((prev) => {
      let changed = false
      const next: Record<number, EditState> = { ...prev }
      for (const [key, e] of Object.entries(next)) {
        if (e.ambito === 'PERSONAL' && !e.cuenta) {
          next[Number(key)] = { ...e, cuenta: Number(cuentaDefaultId) }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [cuentaDefaultId])

  const patchEdit = (id: number, patch: Partial<EditState>) => {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }))
  }

  const onMetodoChange = (id: number, metodo_pago: number | '') => {
    const disponibles = tarjetasParaMetodo(metodo_pago)
    const actual = edits[id]?.tarjeta
    const sigue = actual && disponibles.some((t) => t.id === actual)
    const sugerida = items.find((p) => p.id === id)?.tarjeta_sugerida
    const fallback =
      (sugerida && disponibles.some((t) => t.id === sugerida) ? sugerida : undefined)
      ?? disponibles.find((t) => t.es_por_defecto)?.id
      ?? disponibles[0]?.id
      ?? ''
    patchEdit(id, {
      metodo_pago,
      tarjeta: sigue ? actual : fallback,
    })
  }

  const refrescarCorreo = async () => {
    setSyncing(true)
    setError(null)
    setInfo(null)
    try {
      const { data } = await pendientesApi.sincronizarCorreo()
      setInfo(data.mensaje)
      await cargar()
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo sincronizar el correo.'))
    } finally {
      setSyncing(false)
    }
  }

  const confirmar = async (p: MovimientoPendienteApi) => {
    const e = edits[p.id]
    if (!e?.categoria || !e.metodo_pago) {
      setError('Elige cuenta/ámbito, categoría y método de pago antes de confirmar.')
      return
    }
    if (e.ambito === 'PERSONAL' && cuentas.length > 0 && !e.cuenta) {
      setError('Elige una cuenta personal.')
      return
    }
    if (e.ambito !== 'PERSONAL' && e.ambito !== 'COMUN') {
      setError('Elige una cuenta o gastos comunes.')
      return
    }
    const tipoMetodo = metodoPorId.get(Number(e.metodo_pago))?.tipo
    const necesitaTarjeta = tipoMetodo === 'CREDITO' || tipoMetodo === 'DEBITO'
    const tarjetasDisp = tarjetasParaMetodo(e.metodo_pago)
    if (necesitaTarjeta && tarjetasDisp.length > 0 && !e.tarjeta) {
      setError('Elige una tarjeta de crédito o débito.')
      return
    }
    if (tipoMetodo === 'CREDITO') {
      const n = parseInt(e.num_cuotas || '1', 10)
      if (!n || n < 1) {
        setError('Indica el número de cuotas (mínimo 1).')
        return
      }
    }
    setBusyId(p.id)
    setError(null)
    setInfo(null)
    try {
      const body: Parameters<typeof pendientesApi.confirmar>[1] = {
        ambito: e.ambito,
        categoria: Number(e.categoria),
        metodo_pago: Number(e.metodo_pago),
        comentario: comentarioDesdeEdit(e, p.hora) || undefined,
      }
      if (e.ambito === 'PERSONAL' && e.cuenta) {
        body.cuenta = Number(e.cuenta)
      } else if (e.ambito === 'COMUN') {
        body.cuenta = null
      }
      if (e.tarjeta) body.tarjeta = Number(e.tarjeta)
      if (tipoMetodo === 'CREDITO') {
        body.num_cuotas = parseInt(e.num_cuotas || '1', 10)
      }
      await pendientesApi.confirmar(p.id, body)
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
    setInfo(null)
    try {
      await pendientesApi.descartar(id)
      await cargar()
    } catch (err) {
      setError(apiErrorMessage(err, 'No se pudo descartar.'))
    } finally {
      setBusyId(null)
    }
  }

  if (loading && items.length === 0) return <Cargando />

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Pendientes</h1>
          <p className={styles.sub}>
            Borradores capturados por correo. Confirma para crear el movimiento.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.btnSync}
            disabled={syncing || busyId !== null}
            onClick={() => void refrescarCorreo()}
          >
            {syncing ? 'Buscando…' : 'Buscar en correo'}
          </button>
          <Link to="/configuracion/captura" className={styles.linkCaptura}>
            Configurar correo
          </Link>
        </div>
      </header>

      {error ? <ErrorCarga mensaje={error} /> : null}
      {info ? <p className={styles.info}>{info}</p> : null}

      {items.length === 0 ? (
        <p className={styles.empty}>No hay movimientos pendientes.</p>
      ) : (
        <ul className={styles.list}>
          {items.map((p) => {
            const e = edits[p.id]
            const ambito = e?.ambito ?? 'PERSONAL'
            const cuenta = e?.cuenta ?? ''
            const cats = catsPara(ambito, cuenta)
            const tipoMetodo = e?.metodo_pago
              ? metodoPorId.get(Number(e.metodo_pago))?.tipo
              : undefined
            const tarjetasOpts = tarjetasParaMetodo(e?.metodo_pago ?? '')

            return (
              <li key={p.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <strong className={styles.monto}>{formatMonto(Number(p.monto))}</strong>
                  <span className={styles.origen}>{etiquetaOrigen(p.origen)}</span>
                </div>
                <div className={styles.meta}>
                  {formatFechaHora(p.fecha, p.hora)}
                  {metaTarjetaBanco(p)}
                </div>

                <div className={styles.fields}>
                  <label className={styles.fieldWide}>
                    Comercio
                    <input
                      type="text"
                      value={e?.comercio ?? ''}
                      onChange={(ev) => patchEdit(p.id, { comercio: ev.target.value })}
                      placeholder="Nombre del comercio"
                    />
                  </label>
                  <label>
                    Cuenta
                    <select
                      value={destinoValue(ambito, cuenta)}
                      onChange={(ev) => onDestinoChange(p.id, ev.target.value)}
                    >
                      <option value="">Elegir…</option>
                      {cuentas.length > 0 ? (
                        <optgroup label="Personal">
                          {cuentas.map((c) => (
                            <option key={c.id} value={`cuenta:${c.id}`}>{c.nombre}</option>
                          ))}
                        </optgroup>
                      ) : null}
                      <optgroup label="Común">
                        <option value="comun">Gastos comunes</option>
                      </optgroup>
                    </select>
                  </label>
                  <label>
                    Categoría
                    <select
                      value={e?.categoria ?? ''}
                      onChange={(ev) =>
                        patchEdit(p.id, {
                          categoria: ev.target.value ? Number(ev.target.value) : '',
                        })
                      }
                    >
                      <option value="">Elegir…</option>
                      {cats.map((c) => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Método
                    <select
                      value={e?.metodo_pago ?? ''}
                      onChange={(ev) =>
                        onMetodoChange(
                          p.id,
                          ev.target.value ? Number(ev.target.value) : '',
                        )
                      }
                    >
                      <option value="">Elegir…</option>
                      {(metodos ?? []).map((m) => (
                        <option key={m.id} value={m.id}>{m.nombre}</option>
                      ))}
                    </select>
                  </label>
                  {(tipoMetodo === 'CREDITO' || tipoMetodo === 'DEBITO') && (
                    <label>
                      Tarjeta
                      <select
                        value={e?.tarjeta ?? ''}
                        onChange={(ev) =>
                          patchEdit(p.id, {
                            tarjeta: ev.target.value ? Number(ev.target.value) : '',
                          })
                        }
                      >
                        <option value="">
                          {tarjetasOpts.length ? 'Elegir…' : 'Sin tarjetas registradas'}
                        </option>
                        {tarjetasOpts.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.ultimos_4_digitos
                              ? `${t.nombre} ···${t.ultimos_4_digitos}`
                              : t.nombre}
                            {t.es_por_defecto ? ' (defecto)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {tipoMetodo === 'CREDITO' && (
                    <label>
                      Cuotas
                      <input
                        type="number"
                        min={1}
                        value={e?.num_cuotas ?? '1'}
                        onChange={(ev) => patchEdit(p.id, { num_cuotas: ev.target.value })}
                      />
                    </label>
                  )}
                </div>

                {tarjetasOpts.length === 0
                  && (tipoMetodo === 'CREDITO' || tipoMetodo === 'DEBITO') && (
                  <p className={styles.hint}>
                    No hay tarjetas de {tipoMetodo === 'DEBITO' ? 'débito' : 'crédito'}.{' '}
                    <Link to="/tarjetas">Regístralas en Tarjetas</Link>
                    {(p.ultimos_4 || p.tarjeta_sugerida_ultimos_4)
                      ? ` (el correo indica ···${p.ultimos_4 || p.tarjeta_sugerida_ultimos_4}).`
                      : '.'}
                  </p>
                )}

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    disabled={busyId === p.id || syncing}
                    onClick={() => void confirmar(p)}
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    disabled={busyId === p.id || syncing}
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
