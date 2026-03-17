import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui'

export default function MovimientosPage() {
  const navigate = useNavigate()
  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Gastos</h1>
        <Button onClick={() => navigate('/gastos/nuevo')}>+ Nuevo movimiento</Button>
      </div>
      <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Listado de movimientos — próximamente.</p>
    </div>
  )
}
