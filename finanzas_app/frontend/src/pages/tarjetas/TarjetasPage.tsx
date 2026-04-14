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
  const pagarTarjetaPath = tarjetas[0] ? `/tarjetas/pagar?tarjeta=${tarjetas[0].id}` : '/tarjetas/pagar'
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
  const [diaFacturacion, setDiaFacturacion] = useState('')
  const [diaVencimiento, setDiaVencimiento] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editBanco, setEditBanco] = useState('')
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
    if (!n || !b) {
      setFormError('Nombre y banco son obligatorios.')
      return
    }
    setFormError(null)
    setSaving(true)
    try {
      await catalogosApi.createTarjeta({
        nombre: n,
        banco: b,
        dia_facturacion: diaFacturacion ? Number(diaFacturacion) : null,
        dia_vencimiento: diaVencimiento ? Number(diaVencimiento) : null,
      })
      setNombre('')
      setBanco('')
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
    setEditDiaFacturacion(tarjeta.dia_facturacion != null ? String(tarjeta.dia_facturacion) : '')
    setEditDiaVencimiento(tarjeta.dia_vencimiento != null ? String(tarjeta.dia_vencimiento) : '')
    setEditError(null)
  }

  const cancelarEdicion = () => {
    setEditandoId(null)
    setEditNombre('')
    setEditBanco('')
    setEditDiaFacturacion('')
    setEditDiaVencimiento('')
    setEditError(null)
  }

  const handleGuardarEdicion = async () => {
    if (editandoId == null) return
    const n = editNombre.trim()
    const b = editBanco.trim()
    if (!n || !b) {
      setEditError('Nombre y banco son obligatorios.')
      return
    }
    setEditError(null)
    setEditSaving(true)
    try {
      await catalogosApi.updateTarjeta(editandoId, {
        nombre: n,
        banco: b,
        dia_facturacion: editDiaFacturacion ? Number(editDiaFacturacion) : null,
        dia_vencimiento: editDiaVencimiento ? Number(editDiaVencimiento) : null,
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
        Tarjetas de crédito asociadas a tu usuario para cuotas y pagos.
      </p>

      <div className={styles.actionsTop}>
        <Link to={pagarTarjetaPath} className={styles.linkPagar}>
          Ir a pagar tarjeta →
        </Link>
      </div>

      <div className={styles.resumenUtilizado}>
        <span className={styles.resumenUtilizadoLabel}>Utilizado total</span>
        <strong className={styles.resumenUtilizadoMonto}>{formatMonto(totalUtilizado)}</strong>
      </div>

      <h2 className={styles.sectionTitle}>Mis tarjetas</h2>
      <div className={styles.lista}>
        {tarjetas.length === 0 ? (
          <p className={styles.vacio}>
            Aún no registras tarjetas. Agrega una abajo para usarla al cargar gastos con
            crédito.
          </p>
        ) : (
          tarjetas.map(t => (
            <div key={t.id} className={styles.tarjetaCard}>
              {editandoId === t.id ? (
                <div className={styles.tarjetaEdit}>
                  <div className={styles.formRow}>
                    <Input
                      label="Nombre en estado de cuenta"
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
                  {editError && <p className={styles.errorMsg}>{editError}</p>}
                  <div className={styles.formActions}>
                    <Button type="button" variant="ghost" onClick={cancelarEdicion} disabled={editSaving}>
                      Cancelar
                    </Button>
                    <Button type="button" onClick={handleGuardarEdicion} loading={editSaving}>
                      Guardar cambios
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.tarjetaInfo}>
                    <span className={styles.tarjetaNombre}>{t.nombre}</span>
                    <span className={styles.tarjetaBanco}>{t.banco}</span>
                    {t.dia_facturacion && (
                      <span className={styles.tarjetaCiclo}>
                        Cierre: día {t.dia_facturacion}
                        {t.dia_vencimiento ? ` · Vence: día ${t.dia_vencimiento}` : ''}
                      </span>
                    )}
                  </div>
                  <div className={styles.tarjetaActions}>
                    <div className={styles.tarjetaUtilizado}>
                      <span className={styles.tarjetaUtilizadoLabel}>Utilizado</span>
                      <strong className={styles.tarjetaUtilizadoMonto}>
                        {formatMonto(deudaPorTarjeta.get(t.id) ?? 0)}
                      </strong>
                    </div>
                    <div className={styles.tarjetaActionButtons}>
                      <Link
                        to={`/tarjetas/pagar?tarjeta=${t.id}`}
                        className={`${styles.linkPagar} ${styles.linkPagarCard}`}
                      >
                        Estado de cuenta
                      </Link>
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
          ))
        )}
      </div>

      <div className={styles.formCard}>
        <h3 className={styles.formTitle}>Nueva tarjeta</h3>
        <div className={styles.formRow}>
          <Input
            label="Nombre en estado de cuenta"
            placeholder="Ej: Visa Gold"
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
