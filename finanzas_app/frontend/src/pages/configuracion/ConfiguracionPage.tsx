import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import styles from './ConfiguracionPage.module.scss'

// -----------------------------------------------------------------------------
// Datos del índice
// -----------------------------------------------------------------------------

const ITEMS = [
  {
    grupo: 'CUENTA',
    items: [
      { icon: '◉', label: 'Perfil', resumen: '', to: '/configuracion/perfil' },
    ],
  },
  {
    grupo: 'FINANZAS',
    items: [
      { icon: '▤', label: 'Categorías', resumen: '12 categorías', to: '/configuracion/categorias' },
      { icon: '◫', label: 'Cuentas personales', resumen: 'Organizar gastos', to: '/configuracion/cuentas' },
    ],
  },
  {
    grupo: 'FAMILIA',
    items: [
      { icon: '◎', label: 'Miembros', resumen: '2 miembros', to: '/configuracion/miembros' },
    ],
  },
]

// -----------------------------------------------------------------------------
// Página
// -----------------------------------------------------------------------------

export default function ConfiguracionPage() {
  const { user } = useAuth()
  const perfilResumen = user?.nombre ?? ''

  return (
    <div className={`${styles.page} ${styles.fadeUp}`}>
      <h1 className={styles.titulo}>Configuración</h1>

      {ITEMS.map((g) => (
        <section key={g.grupo} className={styles.section}>
          <h2 className={styles.groupHeader}>{g.grupo}</h2>
          <ul className={styles.list}>
            {g.items.map((item, i) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={styles.itemLink}
                >
                  <span className={styles.itemIcon} aria-hidden>{item.icon}</span>
                  <span className={styles.itemLabel}>{item.label}</span>
                  <span className={styles.itemResumen}>
                    {item.to === '/configuracion/perfil' ? perfilResumen : item.resumen}
                  </span>
                  <span className={styles.itemChevron} aria-hidden>›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
