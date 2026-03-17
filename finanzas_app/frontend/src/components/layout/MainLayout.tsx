import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import styles from './MainLayout.module.scss'

const NAV_ITEMS = [
  { to: '/',             label: 'Inicio',        icon: '◈', end: true },
  { to: '/gastos',       label: 'Gastos',         icon: '↕' },
  { to: '/tarjetas',     label: 'Tarjetas',       icon: '▭' },
  { to: '/liquidacion',  label: 'Liquidación',    icon: '⇄' },
  { to: '/presupuesto',  label: 'Presupuesto',    icon: '▤' },
  { to: '/inversiones',  label: 'Inversiones',    icon: '△' },
  { to: '/viajes',       label: 'Viajes',         icon: '◎' },
]

export default function MainLayout() {
  const navigate = useNavigate()

  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar}>
        <button className={styles.brand} onClick={() => navigate('/')}>
          <span className={styles.brandMark}>◈</span>
          <span className={styles.brandName}>Finanzas</span>
        </button>

        <ul className={styles.nav}>
          {NAV_ITEMS.map(({ to, label, icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
                }
              >
                <span className={styles.navIcon}>{icon}</span>
                <span className={styles.navLabel}>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <ul className={styles.navBottom}>
          <li>
            <NavLink
              to="/configuracion"
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
            >
              <span className={styles.navIcon}>⚙</span>
              <span className={styles.navLabel}>Configuración</span>
            </NavLink>
          </li>
        </ul>
      </nav>

      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  )
}
