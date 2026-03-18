import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTarjetas } from '@/hooks/useCatalogos'
import { catalogosApi } from '@/api/catalogos'
import { Button, Input, Cargando, ErrorCarga } from '@/components/ui'
import styles from './TarjetasPage.module.scss'

interface TarjetaRow {
  id: number
  nombre: string
  banco: string
}

export default function TarjetasPage() {
  const { data, loading, error, refetch } = useTarjetas()
  const tarjetas = (data ?? []) as TarjetaRow[]

  const [nombre, setNombre] = useState('')
  const [banco, setBanco] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

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
      await catalogosApi.createTarjeta({ nombre: n, banco: b })
      setNombre('')
      setBanco('')
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

  if (loading) return <Cargando />
  if (error) return <ErrorCarga mensaje={error} />

  return (
    <div className={styles.page}>
      <h1 className={styles.titulo}>Tarjetas</h1>
      <p className={styles.subtitulo}>
        Tarjetas de crédito asociadas a tu usuario para cuotas y pagos.
      </p>

      <div className={styles.actionsTop}>
        <Link to="/tarjetas/pagar" className={styles.linkPagar}>
          Ir a pagar tarjeta →
        </Link>
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
              <div className={styles.tarjetaInfo}>
                <span className={styles.tarjetaNombre}>{t.nombre}</span>
                <span className={styles.tarjetaBanco}>{t.banco}</span>
              </div>
              <Link to="/tarjetas/pagar" className={styles.linkPagar}>
                Estado de cuenta
              </Link>
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
