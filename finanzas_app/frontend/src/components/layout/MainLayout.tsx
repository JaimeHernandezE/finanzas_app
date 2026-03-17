import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import styles from './MainLayout.module.scss'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos y datos mock  // TODO: reemplazar por fetch al backend (endpoint cuentas_visibles)
// ─────────────────────────────────────────────────────────────────────────────

interface CuentaNav {
  id:         string
  nombre:     string
  path:       string
  esPropia:   boolean
  esTutelada: boolean
  duenio?:    string
}

const CUENTAS_NAV: CuentaNav[] = [
  { id: '1', nombre: 'Mis gastos',   path: '/gastos/cuenta/1', esPropia: true,  esTutelada: false },
  { id: '2', nombre: 'Honorarios',   path: '/gastos/cuenta/2', esPropia: true,  esTutelada: false },
  { id: '3', nombre: 'Gastos Sofía', path: '/gastos/cuenta/3', esPropia: false, esTutelada: true, duenio: 'Sofía' },
]

const FAMILIA_FIJOS = [
  { icon: '₪', label: 'Sueldos', to: '/sueldos' },
] as const

const ANALISIS_ITEMS = [
  { icon: '◈', label: 'Dashboard',   to: '/'            },
  { icon: '▤', label: 'Presupuesto', to: '/presupuesto' },
] as const

const MAS_ITEMS = [
  { icon: '▭', label: 'Tarjetas',      to: '/tarjetas'      },
  { icon: '△', label: 'Inversiones',   to: '/inversiones'   },
  { icon: '◎', label: 'Viajes',        to: '/viajes'        },
  { icon: '⚙', label: 'Configuración', to: '/configuracion' },
] as const

const BOTTOM_NAV = [
  { icon: '◈', label: 'Dashboard',      to: '/',               end: true  },
  { icon: '⊕', label: 'Gastos comunes', to: '/gastos/comunes', end: false },
  { icon: '⇄', label: 'Resumen común',  to: '/liquidacion',    end: false },
] as const

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes internos
// ─────────────────────────────────────────────────────────────────────────────

function GroupLabel({ label }: { label: string }) {
  return <li className={styles.groupLabel}>{label}</li>
}

function NavItem({ icon, label, to, end }: {
  icon:   string
  label:  string
  to:     string
  end?:   boolean
}) {
  return (
    <li>
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
  )
}

function CuentaItem({ cuenta }: { cuenta: CuentaNav }) {
  return (
    <li>
      <NavLink
        to={cuenta.path}
        className={({ isActive }) =>
          `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
        }
      >
        <span className={styles.navIcon}>◉</span>
        <span className={styles.navLabel}>
          <span className={styles.cuentaNombre}>{cuenta.nombre}</span>
          {cuenta.esTutelada && cuenta.duenio && (
            <span className={styles.tuteladaBadge}>{cuenta.duenio}</span>
          )}
        </span>
      </NavLink>
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout principal
// ─────────────────────────────────────────────────────────────────────────────

export default function MainLayout() {
  const navigate = useNavigate()

  const propias   = CUENTAS_NAV.filter(c => c.esPropia)
  const tuteladas = CUENTAS_NAV.filter(c => !c.esPropia)

  return (
    <div className={styles.shell}>

      {/* ── Sidebar ── */}
      <nav className={styles.sidebar}>
        <button className={styles.brand} onClick={() => navigate('/')}>
          <span className={styles.brandMark}>◈</span>
          <span className={styles.brandName}>Finanzas</span>
        </button>

        <ul className={styles.nav}>

          {/* Personal */}
          <GroupLabel label="Personal" />
          {propias.map(c => <CuentaItem key={c.id} cuenta={c} />)}

          {/* Familia */}
          <GroupLabel label="Familia" />
          {tuteladas.map(c => <CuentaItem key={c.id} cuenta={c} />)}
          {FAMILIA_FIJOS.map(item => (
            <NavItem key={item.to} icon={item.icon} label={item.label} to={item.to} />
          ))}

          {/* Análisis */}
          <GroupLabel label="Análisis" />
          {ANALISIS_ITEMS.map(item => (
            <NavItem key={item.to} icon={item.icon} label={item.label} to={item.to} end={item.to === '/'} />
          ))}

          {/* Más */}
          <GroupLabel label="Más" />
          {MAS_ITEMS.map(item => (
            <NavItem key={item.to} icon={item.icon} label={item.label} to={item.to} />
          ))}

        </ul>
      </nav>

      {/* ── Contenido principal ── */}
      <main className={styles.content}>
        <Outlet />
      </main>

      {/* ── Barra inferior fija ── */}
      <nav className={styles.bottomBar}>
        {BOTTOM_NAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `${styles.bottomItem} ${isActive ? styles.bottomItemActive : ''}`
            }
          >
            <span className={`${styles.bottomIcon} ${item.label === 'Gastos comunes' ? styles.bottomIconMain : ''}`}>
              {item.icon}
            </span>
            <span className={styles.bottomLabel}>{item.label}</span>
          </NavLink>
        ))}
      </nav>

    </div>
  )
}
