import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useViaje } from '@/context/ViajeContext'
import { useConfig } from '@/context/ConfigContext'
import { useEffect, useMemo } from 'react'
import { useCuentasPersonales } from '@/hooks/useCuentasPersonales'
import { MOCK_PRESUPUESTOS } from '@/pages/viajes/mockViajes'
import { esViteDemo } from '@/firebase'
import styles from './MainLayout.module.scss'

interface CuentaNav {
  id:         string
  nombre:     string
  path:       string
  esPropia:   boolean
  esTutelada: boolean
  duenio?:    string
}

const FAMILIA_FIJOS = [
  { icon: '⊞', label: 'Resumen', to: '/familia/resumen' },
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

const EVENTO_CUENTAS_ACTUALIZADAS = 'cuentas:actualizadas'
const cuentaPersonalPrimero = (a: CuentaNav, b: CuentaNav) => {
  const aEsPersonal = a.nombre.trim().toLowerCase() === 'personal'
  const bEsPersonal = b.nombre.trim().toLowerCase() === 'personal'
  if (aEsPersonal && !bEsPersonal) return -1
  if (!aEsPersonal && bEsPersonal) return 1
  return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
}

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
  const location = useLocation()
  const { user, loading, logout, cambiarUsuarioDemo } = useAuth()
  const esDemoUi = esViteDemo() || Boolean(user?.esDemo)
  const { viajeActivo } = useViaje()
  const { formatMonto } = useConfig()
  const { data: cuentasApi, refetch: refetchCuentas } = useCuentasPersonales()
  const masItems = useMemo(
    () => (esDemoUi ? MAS_ITEMS.filter((item) => item.to !== '/inversiones' && item.to !== '/viajes') : MAS_ITEMS),
    [esDemoUi],
  )

  useEffect(() => {
    const onCuentasActualizadas = () => {
      void refetchCuentas()
    }
    window.addEventListener(EVENTO_CUENTAS_ACTUALIZADAS, onCuentasActualizadas)
    return () => window.removeEventListener(EVENTO_CUENTAS_ACTUALIZADAS, onCuentasActualizadas)
  }, [refetchCuentas])

  useEffect(() => {
    if (loading || !user || user.familia) return
    if (esDemoUi) return
    if (location.pathname.startsWith('/configuracion')) return
    navigate('/configuracion/invitaciones', { replace: true })
  }, [loading, user, location.pathname, navigate, esDemoUi])

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
      propias: list.filter(c => c.esPropia).sort(cuentaPersonalPrimero),
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
          {user && propias.length === 0 && !esDemoUi && (
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
          {masItems.map(item => (
            <NavItem key={item.to} icon={item.icon} label={item.label} to={item.to} />
          ))}

          {esDemoUi && user && (
            <li className={styles.demoBar}>
              <span className={styles.demoBadge}>DEMO</span>
              <button
                type="button"
                className={styles.demoSwitch}
                onClick={() => {
                  const esJaime = user.email.toLowerCase().includes('jaime')
                  void cambiarUsuarioDemo(esJaime ? 'glori' : 'jaime')
                }}
              >
                Ver como {user.email.toLowerCase().includes('jaime') ? 'Glori' : 'Jaime'} →
              </button>
            </li>
          )}

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
              {formatMonto(viajeBannerTotales.gastado)} / {formatMonto(viajeBannerTotales.presupuestado)}
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
