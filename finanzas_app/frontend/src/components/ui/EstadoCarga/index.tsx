export function Cargando() {
  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
        <div
          style={{
            width: 24,
            height: 24,
            margin: '0 auto 12px',
            border: '2px solid #e8e8e4',
            borderTopColor: '#0f0f0f',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }}
        />
        Cargando...
      </div>
    </>
  )
}

export function ErrorCarga({ mensaje }: { mensaje: string }) {
  return (
    <div
      style={{
        padding: '16px',
        margin: '16px 0',
        background: '#fff0f0',
        borderRadius: '8px',
        color: '#ff4d4d',
        fontSize: '13px',
      }}
    >
      ⚠ {mensaje}
    </div>
  )
}
