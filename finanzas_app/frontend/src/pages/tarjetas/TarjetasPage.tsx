import { Link } from 'react-router-dom'

export default function TarjetasPage() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Tarjetas</h1>
      <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Resumen de tarjetas — próximamente.
      </p>
      <Link
        to="/tarjetas/pagar"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0.5rem 1rem',
          background: '#0f0f0f',
          color: '#fff',
          borderRadius: '8px',
          fontSize: '0.875rem',
          fontWeight: 500,
          textDecoration: 'none',
        }}
      >
        Pagar tarjeta
      </Link>
    </div>
  )
}
