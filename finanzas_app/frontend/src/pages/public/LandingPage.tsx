import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { PantallaCarga } from '@/components/ui/PantallaCarga'
import { esViteDemo } from '@/firebase'
import styles from './LandingPage.module.scss'

const ES_DEMO = esViteDemo()

const FEATURES = [
  {
    icono: '↕',
    titulo: 'Gastos y movimientos',
    desc: 'Registra ingresos y egresos por cuenta, con soporte para pagos en cuotas.',
  },
  {
    icono: '▭',
    titulo: 'Control de tarjetas',
    desc: 'Ve cuanto debes por tarjeta y decide que cuotas incluir en el pago del mes.',
  },
  {
    icono: '⇄',
    titulo: 'Liquidacion familiar',
    desc: 'Prorrateo automatico de gastos comunes segun los ingresos de cada miembro.',
  },
  {
    icono: '△',
    titulo: 'Inversiones',
    desc: 'Seguimiento de fondos mutuos con calculo de rentabilidad en tiempo real.',
  },
  {
    icono: '◎',
    titulo: 'Viajes',
    desc: 'Presupuesta tus viajes por categoria y compara con el gasto real en ruta.',
  },
  {
    icono: '▤',
    titulo: 'Presupuesto mensual',
    desc: 'Asigna montos por categoria y controla el avance con indicadores visuales.',
  },
]

export default function LandingPage() {
  const { usuario, loading, loginDemo, clearError } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && usuario) {
      navigate('/dashboard', { replace: true })
    }
  }, [usuario, loading, navigate])

  if (loading) return <PantallaCarga />

  return (
    <div className={styles.root}>
      <nav className={styles.nav}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>F</span>
          <span className={styles.brandName}>Finanzas Familiares</span>
          {ES_DEMO && (
            <span className={styles.demoRibbon} title="Entorno de demostración">
              DEMO
            </span>
          )}
        </div>
        {!ES_DEMO && (
          <Link to="/login" className={styles.navLogin}>
            Iniciar sesion →
          </Link>
        )}
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.badge}>
            {ES_DEMO ? 'Versión de demostración · datos ficticios' : 'App familiar · Uso privado'}
          </span>
          <h1 className={styles.titulo}>
            Tus finanzas,
            <br />
            <span className={styles.tituloAccent}>en orden.</span>
          </h1>
          <p className={styles.subtitulo}>
            Registra gastos, controla tarjetas, liquida deudas entre miembros y lleva el seguimiento de tus
            inversiones. Todo en un solo lugar.
          </p>
          {ES_DEMO ? (
            <div className={styles.demoCta}>
              <p className={styles.demoCtaHint}>Elige un perfil para entrar (sin Google ni correo).</p>
              <div className={styles.demoCtaBtns}>
                <button
                  type="button"
                  className={styles.demoCtaBtn}
                  onClick={() => {
                    clearError()
                    void loginDemo('jaime')
                  }}
                >
                  Entrar como Jaime
                </button>
                <button
                  type="button"
                  className={styles.demoCtaBtn}
                  onClick={() => {
                    clearError()
                    void loginDemo('glori')
                  }}
                >
                  Entrar como Glori
                </button>
              </div>
              <p className={styles.demoCtaMeta}>Historial de ejemplo · algunas acciones están limitadas</p>
            </div>
          ) : (
            <Link to="/login" className={styles.ctaBtn}>
              Comenzar con Google
            </Link>
          )}
        </div>

        <div className={styles.features}>
          {FEATURES.map((f) => (
            <div key={f.titulo} className={styles.featureCard}>
              <span className={styles.featureIcon}>{f.icono}</span>
              <h3 className={styles.featureTitulo}>{f.titulo}</h3>
              <p className={styles.featureDesc}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <p>Uso privado · Familia Hernandez Valle</p>
        {ES_DEMO && (
          <p className={styles.footerDemo}>Indicador de versión: build demo — no usar para datos reales.</p>
        )}
      </footer>
    </div>
  )
}
