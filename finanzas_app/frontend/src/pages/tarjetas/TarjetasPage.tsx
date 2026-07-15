import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTarjetas } from '@/hooks/useCatalogos'
import { useApi } from '@/hooks/useApi'
import { movimientosApi } from '@/api'
import { catalogosApi } from '@/api/catalogos'
import { Button, Input, Cargando, ErrorCarga } from '@/components/ui'
import { useConfig } from '@/context/ConfigContext'
import styles from './TarjetasPage.module.scss'

interface TarjetaRow {
  id: number
  nombre: string
  banco: string
  tipo?: 'DEBITO' | 'CREDITO'
  ultimos_4_digitos?: string
  es_por_defecto?: boolean
  dia_facturacion: number | null
  dia_vencimiento: number | null
}

interface CuotaResumen {
  id: number
  movimiento?: number
  monto: number
  estado: 'PENDIENTE' | 'FACTURADO' | 'PAGADO'
}

interface MovimientoCreditoResumen {
  id: number
  tarjeta: number | null
}

export default function TarjetasPage() {
  const { formatMonto } = useConfig()
  const { data, loading, error, refetch } = useTarjetas()
  const tarjetas = (data ?? []) as TarjetaRow[]
  const tarjetasCredito = useMemo(
    () => tarjetas.filter(t => (t.tipo ?? 'CREDITO') === 'CREDITO'),
    [tarjetas],
  )
  const tarjetasDebito = useMemo(
    () => tarjetas.filter(t => t.tipo === 'DEBITO'),
    [tarjetas],
  )
  const pagarTarjetaPath = tarjetasCredito[0]
    ? `/tarjetas/pagar?tarjeta=${tarjetasCredito[0].id}`
    : '/tarjetas/pagar'
  const {
    data: cuotasData,
    loading: loadingCuotas,
    error: errorCuotas,
  } = useApi<CuotaResumen[]>(
    () => movimientosApi.getCuotas({}) as Promise<{ data: CuotaResumen[] }>,
    [],
  )
  const {
    data: movimientosCreditoData,
    loading: loadingMovimientosCredito,
    error: errorMovimientosCredito,
  } = useApi<MovimientoCreditoResumen[]>(
    () =>
      movimientosApi.getMovimientos({
        tipo: 'EGRESO',
        metodo: 'CREDITO',
      }) as Promise<{ data: MovimientoCreditoResumen[] }>,
    [],
  )

  const [nombre, setNombre] = useState('')
  const [banco, setBanco] = useState('')
  const [tipoNueva, setTipoNueva] = useState<'DEBITO' | 'CREDITO'>('CREDITO')
  const [ultimos4, setUltimos4] = useState('')
  const [esPorDefecto, setEsPorDefecto] = useState(false)
  const [diaFacturacion, setDiaFacturacion] = useState('')
  const [diaVencimiento, setDiaVencimiento] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editBanco, setEditBanco] = useState('')
  const [editTipo, setEditTipo] = useState<'DEBITO' | 'CREDITO'>('CREDITO')
  const [editUltimos4, setEditUltimos4] = useState('')
  const [editEsPorDefecto, setEditEsPorDefecto] = useState(false)
  const [editDiaFacturacion, setEditDiaFacturacion] = useState('')
  const [editDiaVencimiento, setEditDiaVencimiento] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const deudaPorTarjeta = useMemo(() => {
    const movToTarjeta = new Map<number, number>()
    for (const mov of (movimientosCreditoData ?? []) as MovimientoCreditoResumen[]) {
      if (mov.tarjeta == null) continue
      movToTarjeta.set(mov.id, mov.tarjeta)
    }
    const deuda = new Map<number, number>()
    for (const cuota of (cuotasData ?? []) as CuotaResumen[]) {
      if (cuota.estado === 'PAGADO') continue
      const movId = Number(cuota.movimiento)
      const tarjetaId = movToTarjeta.get(movId)
      if (!tarjetaId) continue
      const previo = deuda.get(tarjetaId) ?? 0
      deuda.set(tarjetaId, previo + Number(cuota.monto || 0))
    }
    return deuda
  }, [cuotasData, movimientosCreditoData])
  const totalUtilizado = useMemo(
    () => Array.from(deudaPorTarjeta.values()).reduce((acc, x) => acc + x, 0),
    [deudaPorTarjeta],
  )

  const handleCrear = async () => {
    const n = nombre.trim()
    const b = banco.trim()
    const u4 = ultimos4.trim()
    if (!n || !b) {
      setFormError('Nombre y banco son obligatorios.')
      return
    }
    if (u4 && (u4.length !== 4 || !/^\d{4}$/.test(u4))) {
      setFormError('Últimos 4 dígitos: exactamente 4 números, o vacío.')
      return
    }
    setFormError(null)
    setSaving(true)
    try {
      await catalogosApi.createTarjeta({
        nombre: n,
        banco: b,
        tipo: tipoNueva,
        ultimos_4_digitos: u4,
        es_por_defecto: esPorDefecto,
        dia_facturacion: tipoNueva === 'CREDITO' && diaFacturacion ? Number(diaFacturacion) : null,
        dia_vencimiento: tipoNueva === 'CREDITO' && diaVencimiento ? Number(diaVencimiento) : null,
      })
      setNombre('')
      setBanco('')
      setTipoNueva('CREDITO')
      setUltimos4('')
      setEsPorDefecto(false)
      setDiaFacturacion('')
      setDiaVencimiento('')
      await refetch()
    } catch (e: unknown) {
      const ax = e as { response?: { data?: Record<string, string[] | string> } }
      const d = ax.response?.data
      if (d && typeof d === 'object') {
        const msgs = Object.values(d).flatMap(v =>
          Array.isArray(v) ? v : [String(v)],
        )
        setFormError(msgs.join(' ') || 'No se pudo crear la tarjeta.')
      } else {
        setFormError('No se pudo crear la tarjeta.')
      }
    } finally {
      setSaving(false)
    }
  }

  const abrirEdicion = (tarjeta: TarjetaRow) => {
    setEditandoId(tarjeta.id)
    setEditNombre(tarjeta.nombre)
    setEditBanco(tarjeta.banco ?? '')
    setEditTipo(tarjeta.tipo === 'DEBITO' ? 'DEBITO' : 'CREDITO')
    setEditUltimos4(tarjeta.ultimos_4_digitos ?? '')
    setEditEsPorDefecto(Boolean(tarjeta.es_por_defecto))
    setEditDiaFacturacion(tarjeta.dia_facturacion != null ? String(tarjeta.dia_facturacion) : '')
    setEditDiaVencimiento(tarjeta.dia_vencimiento != null ? String(tarjeta.dia_vencimiento) : '')
    setEditError(null)
  }

  const cancelarEdicion = () => {
    setEditandoId(null)
    setEditNombre('')
    setEditBanco('')
    setEditTipo('CREDITO')
    setEditUltimos4('')
    setEditEsPorDefecto(false)
    setEditDiaFacturacion('')
    setEditDiaVencimiento('')
    setEditError(null)
  }

  const handleGuardarEdicion = async () => {
    if (editandoId == null) return
    const n = editNombre.trim()
    const b = editBanco.trim()
    const u4 = editUltimos4.trim()
    if (!n || !b) {
      setEditError('Nombre y banco son obligatorios.')
      return
    }
    if (u4 && (u4.length !== 4 || !/^\d{4}$/.test(u4))) {
      setEditError('Últimos 4 dígitos: exactamente 4 números, o vacío.')
      return
    }
    setEditError(null)
    setEditSaving(true)
    try {
      await catalogosApi.updateTarjeta(editandoId, {
        nombre: n,
        banco: b,
        tipo: editTipo,
        ultimos_4_digitos: u4,
        es_por_defecto: editEsPorDefecto,
        dia_facturacion: editTipo === 'CREDITO' && editDiaFacturacion ? Number(editDiaFacturacion) : null,
        dia_vencimiento: editTipo === 'CREDITO' && editDiaVencimiento ? Number(editDiaVencimiento) : null,
      })
      await refetch()
      cancelarEdicion()
    } catch (e: unknown) {
      const ax = e as { response?: { data?: Record<string, string[] | string> } }
      const d = ax.response?.data
      if (d && typeof d === 'object') {
        const msgs = Object.values(d).flatMap(v =>
          Array.isArray(v) ? v : [String(v)],
        )
        setEditError(msgs.join(' ') || 'No se pudo actualizar la tarjeta.')
      } else {
        setEditError('No se pudo actualizar la tarjeta.')
      }
    } finally {
      setEditSaving(false)
    }
  }

  if (loading || loadingCuotas || loadingMovimientosCredito) return <Cargando />
  if (error || errorCuotas || errorMovimientosCredito) {
    return <ErrorCarga mensaje={error || errorCuotas || errorMovimientosCredito || 'Error al cargar tarjetas.'} />
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.titulo}>Tarjetas</h1>
      <p className={styles.subtitulo}>
        Débito y crédito en el mismo menú. Solo las de crédito usan ciclo de facturación/vencimiento
        y estado de cuenta.
      </p>

      <div className={styles.actionsTop}>
        {tarjetasCredito.length > 0 ? (
          <Link to={pagarTarjetaPath} className={styles.linkPagar}>
            Ir a pagar tarjeta →
          </Link>
        ) : null}
      </div>

      {tarjetasCredito.length > 0 ? (
        <div className={styles.resumenUtilizado}>
          <span className={styles.resumenUtilizadoLabel}>Utilizado total (crédito)</span>
          <strong className={styles.resumenUtilizadoMonto}>{formatMonto(totalUtilizado)}</strong>
        </div>
      ) : null}

      <h2 className={styles.sectionTitle}>Mis tarjetas</h2>
      {tarjetas.length === 0 ? (
        <p className={styles.vacio}>
          Aún no registras tarjetas. Agrega débito o crédito abajo.
        </p>
      ) : (
        <>
          {(
            [
              { titulo: 'Crédito', items: tarjetasCredito },
              { titulo: 'Débito', items: tarjetasDebito },
            ] as const
          ).map(grupo =>
            grupo.items.length === 0 ? null : (
              <section key={grupo.titulo} className={styles.grupoTipo}>
                <h3 className={styles.grupoTipoTitle}>{grupo.titulo}</h3>
                <div className={styles.lista}>
                  {grupo.items.map(t => (
                    <div key={t.id} className={styles.tarjetaCard}>
                      {editandoId === t.id ? (
                        <div className={styles.tarjetaEdit}>
                          <div className={styles.formRow}>
                            <Input
                              label="Nombre"
                              placeholder="Ej: Visa Gold"
                              value={editNombre}
                              onChange={e => setEditNombre(e.target.value)}
                            />
                            <Input
                              label="Banco"
                              placeholder="Ej: Banco de Chile"
                              value={editBanco}
                              onChange={e => setEditBanco(e.target.value)}
                            />
                          </div>
                          <div className={styles.formRow}>
                            <label className={styles.selectLabel}>
                              Tipo
                              <select
                                className={styles.selectField}
                                value={editTipo}
                                onChange={e => {
                                  const next = e.target.value as 'DEBITO' | 'CREDITO'
                                  setEditTipo(next)
                                  if (next === 'DEBITO') {
                                    setEditDiaFacturacion('')
                                    setEditDiaVencimiento('')
                                  }
                                }}
                              >
                                <option value="CREDITO">Crédito</option>
                                <option value="DEBITO">Débito</option>
                              </select>
                            </label>
                            <Input
                              label="Últimos 4 dígitos"
                              placeholder="1234"
                              maxLength={4}
                              value={editUltimos4}
                              onChange={e =>
                                setEditUltimos4(e.target.value.replace(/\D/g, '').slice(0, 4))
                              }
                            />
                          </div>
                          {editTipo === 'CREDITO' ? (
                            <div className={styles.formRow}>
                              <Input
                                label="Día de facturación (opcional)"
                                type="number"
                                min={1}
                                max={31}
                                placeholder="Ej: 15"
                                value={editDiaFacturacion}
                                onChange={e => setEditDiaFacturacion(e.target.value)}
                              />
                              <Input
                                label="Día de vencimiento (opcional)"
                                type="number"
                                min={1}
                                max={31}
                                placeholder="Ej: 5"
                                value={editDiaVencimiento}
                                onChange={e => setEditDiaVencimiento(e.target.value)}
                              />
                            </div>
                          ) : null}
                          <label className={styles.checkLabel}>
                            <input
                              type="checkbox"
                              checked={editEsPorDefecto}
                              onChange={e => setEditEsPorDefecto(e.target.checked)}
                            />
                            Usar por defecto al pagar con{' '}
                            {editTipo === 'DEBITO' ? 'débito' : 'crédito'}
                          </label>
                          {editError && <p className={styles.errorMsg}>{editError}</p>}
                          <div className={styles.formActions}>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={cancelarEdicion}
                              disabled={editSaving}
                            >
                              Cancelar
                            </Button>
                            <Button
                              type="button"
                              onClick={handleGuardarEdicion}
                              loading={editSaving}
                            >
                              Guardar cambios
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className={styles.tarjetaInfo}>
                            <span className={styles.tarjetaNombre}>
                              {t.nombre}
                              {t.ultimos_4_digitos ? ` ···${t.ultimos_4_digitos}` : ''}
                            </span>
                            <span className={styles.tarjetaBanco}>
                              {t.banco}
                              {t.es_por_defecto ? ' · Por defecto' : ''}
                            </span>
                            {t.tipo !== 'DEBITO' && t.dia_facturacion && (
                              <span className={styles.tarjetaCiclo}>
                                Cierre: día {t.dia_facturacion}
                                {t.dia_vencimiento
                                  ? ` · Vence: día ${t.dia_vencimiento}`
                                  : ''}
                              </span>
                            )}
                          </div>
                          <div className={styles.tarjetaActions}>
                            {(t.tipo ?? 'CREDITO') === 'CREDITO' ? (
                              <div className={styles.tarjetaUtilizado}>
                                <span className={styles.tarjetaUtilizadoLabel}>Utilizado</span>
                                <strong className={styles.tarjetaUtilizadoMonto}>
                                  {formatMonto(deudaPorTarjeta.get(t.id) ?? 0)}
                                </strong>
                              </div>
                            ) : (
                              <div />
                            )}
                            <div className={styles.tarjetaActionButtons}>
                              {(t.tipo ?? 'CREDITO') === 'CREDITO' ? (
                                <Link
                                  to={`/tarjetas/pagar?tarjeta=${t.id}`}
                                  className={`${styles.linkPagar} ${styles.linkPagarCard}`}
                                >
                                  Estado de cuenta
                                </Link>
                              ) : null}
                              <button
                                type="button"
                                className={styles.btnEditarTarjeta}
                                onClick={() => abrirEdicion(t)}
                              >
                                Editar
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ),
          )}
        </>
      )}

      <div className={styles.formCard}>
        <h3 className={styles.formTitle}>Nueva tarjeta</h3>
        <div className={styles.formRow}>
          <Input
            label="Nombre"
            placeholder="Ej: Visa Gold / Cuenta RUT"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
          />
          <Input
            label="Banco"
            placeholder="Ej: Banco de Chile"
            value={banco}
            onChange={e => setBanco(e.target.value)}
          />
        </div>
        <div className={styles.formRow}>
          <label className={styles.selectLabel}>
            Tipo
            <select
              className={styles.selectField}
              value={tipoNueva}
              onChange={e => {
                const next = e.target.value as 'DEBITO' | 'CREDITO'
                setTipoNueva(next)
                if (next === 'DEBITO') {
                  setDiaFacturacion('')
                  setDiaVencimiento('')
                }
              }}
            >
              <option value="CREDITO">Crédito</option>
              <option value="DEBITO">Débito</option>
            </select>
          </label>
          <Input
            label="Últimos 4 dígitos"
            placeholder="1234"
            maxLength={4}
            value={ultimos4}
            onChange={e => setUltimos4(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </div>
        {tipoNueva === 'CREDITO' ? (
          <div className={styles.formRow}>
            <Input
              label="Día de facturación (opcional)"
              type="number"
              min={1}
              max={31}
              placeholder="Ej: 15"
              value={diaFacturacion}
              onChange={e => setDiaFacturacion(e.target.value)}
            />
            <Input
              label="Día de vencimiento (opcional)"
              type="number"
              min={1}
              max={31}
              placeholder="Ej: 5"
              value={diaVencimiento}
              onChange={e => setDiaVencimiento(e.target.value)}
            />
          </div>
        ) : null}
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={esPorDefecto}
            onChange={e => setEsPorDefecto(e.target.checked)}
          />
          Usar por defecto al pagar con {tipoNueva === 'DEBITO' ? 'débito' : 'crédito'}
        </label>
        {formError && <p className={styles.errorMsg}>{formError}</p>}
        <div className={styles.formActions}>
          <Button type="button" onClick={handleCrear} loading={saving}>
            Registrar tarjeta
          </Button>
        </div>
      </div>
    </div>
  )
}
