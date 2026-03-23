import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useViaje } from '@/context/ViajeContext'
import { useMemo } from 'react'
import { useCuentasPersonales } from '@/hooks/useCuentasPersonales'
import { MOCK_PRESUPUESTOS } from '@/pages/viajes/mockViajes'
import styles from './MainLayout.module.scss'

const clp = (n: number) =>
  n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })

interface CuentaNav {
  id:         string
  nombre:     string
  path:       string
  esPropia:   boolean
  esTutelada: boolean
  duenio?:    string
}

const FAMILIA_FIJOS = [
  { icon: '₪', label: 'Sueldos', to: '/sueldos' },
] as const

const ANALISIS_ITEMS = [
  { icon: '◈', label: 'Dashboard',   to: '/dashboard'   },
  { icon: '▤', label: 'Presupuesto', to: '/presupuesto' },
] as const

const MAS_ITEMS = [
  { icon: '▭', label: 'Tarjetas',      to: '/tarjetas'      },
  { icon: '△', label: 'Inversiones',   to: '/inversiones'   },
  { icon: '◎', label: 'Viajes',        to: '/viajes'        },
  { icon: '⚙', label: 'Configuración', to: '/configuracion' },
] as const

const BOTTOM_NAV = [
  { icon: '◈', label: 'Dashboard',      to: '/dashboard',      end: false },
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
  const { user, loading, logout } = useAuth()
  const { viajeActivo } = useViaje()
  const { data: cuentasApi } = useCuentasPersonales()

  const { propias, tuteladas } = useMemo(() => {
    const list = (cuentasApi ?? []).map(
      (c): CuentaNav => ({
        id: String(c.id),
        nombre: c.nombre,
        path: `/gastos/cuenta/${c.id}`,
        esPropia: c.es_propia,
        esTutelada: !c.es_propia,
        duenio: c.duenio_nombre ?? undefined,
      }),
    )
    return {
      propias: list.filter(c => c.esPropia),
      tuteladas: list.filter(c => !c.esPropia),
    }
  }, [cuentasApi])

  const viajeBannerTotales = (() => {
    if (!viajeActivo) return null
    const presupuestado = MOCK_PRESUPUESTOS.reduce((s, p) => s + p.montoPresupuestado, 0)
    const gastado = MOCK_PRESUPUESTOS.reduce((s, p) => s + p.montoGastado, 0)
    return { presupuestado, gastado }
  })()

  return (
    <div className={styles.shell}>

      {/* ── Sidebar ── */}
      <nav className={styles.sidebar}>
        <button className={styles.brand} onClick={() => navigate('/dashboard')}>
          <span className={styles.brandMark}>◈</span>
          <span className={styles.brandName}>Finanzas</span>
        </button>

        {!loading && !user && (
          <Link to="/login" className={styles.loginLink}>
            Iniciar sesión
          </Link>
        )}

        {!loading && user && (
          <div className={styles.userBlock}>
            <div className={styles.userInfo}>
              {user.foto ? (
                <img src={user.foto} alt="" className={styles.userAvatar} />
              ) : (
                <span className={styles.userInicial}>
                  {user.nombre.trim().charAt(0).toUpperCase() || '?'}
                </span>
              )}
              <span className={styles.userName} title={user.email}>
                {user.nombre}
              </span>
            </div>
            <button type="button" className={styles.logoutBtn} onClick={() => logout()}>
              Cerrar sesión
            </button>
          </div>
        )}

        <ul className={styles.nav}>

          {/* Personal */}
          <GroupLabel label="Personal" />
          {user && propias.length === 0 && (
            <li className={styles.navHint}>
              <Link to="/configuracion/cuentas" className={styles.navHintLink}>
                + Crear cuenta personal
              </Link>
            </li>
          )}
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
            <NavItem key={item.to} icon={item.icon} label={item.label} to={item.to} />
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
        {viajeActivo && viajeBannerTotales && (
          <div
            className={styles.viajeBanner}
            style={{ backgroundColor: viajeActivo.colorTema }}
          >
            <span className={styles.viajeBannerDot} aria-hidden>●</span>
            <span className={styles.viajeBannerNombre}>{viajeActivo.nombre}</span>
            <span className={styles.viajeBannerTotales}>
              {clp(viajeBannerTotales.gastado)} / {clp(viajeBannerTotales.presupuestado)}
            </span>
            <Link to={`/viajes/${viajeActivo.id}`} className={styles.viajeBannerLink}>
              Ver viaje
            </Link>
          </div>
        )}
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
