import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useCategorias } from '@/hooks/useCatalogos'
import { useApi } from '@/hooks/useApi'
import { familiaApi, finanzasApi } from '@/api'
import styles from './ConfiguracionPage.module.scss'

// -----------------------------------------------------------------------------
// Índice (resúmenes desde API)
// -----------------------------------------------------------------------------

const GRUPOS = [
  {
    grupo: 'CUENTA',
    items: [{ icon: '◉', label: 'Perfil', to: '/configuracion/perfil' as const }],
  },
  {
    grupo: 'FINANZAS',
    items: [
      { icon: '▤', label: 'Categorías', to: '/configuracion/categorias' as const },
      { icon: '◫', label: 'Cuentas personales', to: '/configuracion/cuentas' as const },
    ],
  },
  {
    grupo: 'FAMILIA',
    items: [{ icon: '◎', label: 'Miembros', to: '/configuracion/miembros' as const }],
  },
] as const

function textoCategorias(loading: boolean, error: string | null, n: number | undefined) {
  if (loading && n === undefined) return '…'
  if (error) return '—'
  const c = n ?? 0
  return c === 1 ? '1 categoría' : `${c} categorías`
}

function textoMiembros(loading: boolean, error: string | null, n: number | undefined) {
  if (loading && n === undefined) return '…'
  if (error) return '—'
  const c = n ?? 0
  return c === 1 ? '1 miembro' : `${c} miembros`
}

function textoCuentas(loading: boolean, error: string | null, n: number | undefined) {
  if (loading && n === undefined) return '…'
  if (error) return '—'
  const c = n ?? 0
  return c === 1 ? '1 cuenta personal' : `${c} cuentas personales`
}

// -----------------------------------------------------------------------------
// Página
// -----------------------------------------------------------------------------

export default function ConfiguracionPage() {
  const { user } = useAuth()
  const perfilResumen = user?.nombre ?? ''

  const {
    data: categoriasRaw,
    loading: loadCats,
    error: errCats,
  } = useCategorias()
  const nCats = categoriasRaw !== null && categoriasRaw !== undefined ? categoriasRaw.length : undefined

  const {
    data: miembrosRaw,
    loading: loadM,
    error: errM,
  } = useApi(() => familiaApi.getMiembros(), [])
  const nM =
    miembrosRaw !== null && miembrosRaw !== undefined ? miembrosRaw.length : undefined

  const {
    data: cuentasRaw,
    loading: loadC,
    error: errC,
  } = useApi(() => finanzasApi.getCuentasPersonales(), [])
  const nC =
    cuentasRaw !== null && cuentasRaw !== undefined ? cuentasRaw.length : undefined

  const resumenPorRuta = useMemo(
    () => ({
      '/configuracion/categorias': textoCategorias(loadCats, errCats, nCats),
      '/configuracion/miembros': textoMiembros(loadM, errM, nM),
      '/configuracion/cuentas': textoCuentas(loadC, errC, nC),
    }),
    [loadCats, errCats, nCats, loadM, errM, nM, loadC, errC, nC]
  )

  return (
    <div className={`${styles.page} ${styles.fadeUp}`}>
      <h1 className={styles.titulo}>Configuración</h1>

      {GRUPOS.map((g) => (
        <section key={g.grupo} className={styles.section}>
          <h2 className={styles.groupHeader}>{g.grupo}</h2>
          <ul className={styles.list}>
            {g.items.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className={styles.itemLink}>
                  <span className={styles.itemIcon} aria-hidden>
                    {item.icon}
                  </span>
                  <span className={styles.itemLabel}>{item.label}</span>
                  <span className={styles.itemResumen}>
                    {item.to === '/configuracion/perfil'
                      ? perfilResumen
                      : resumenPorRuta[item.to]}
                  </span>
                  <span className={styles.itemChevron} aria-hidden>
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
