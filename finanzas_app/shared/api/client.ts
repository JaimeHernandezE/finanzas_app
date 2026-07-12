import axios from 'axios'
import { getApiBaseUrl, getApiTimeoutMs } from './baseUrl'

// Token en memoria: evita múltiples lecturas async de SecureStore que pueden dar valores
// inconsistentes cuando varias requests se inician en paralelo durante la restauración de sesión.
// undefined = no inicializado todavía (fallback a SecureStore)
// null      = sin sesión (logged out)
// string    = token activo
let _memToken: string | null | undefined = undefined

export function setMemToken(token: string | null): void {
  _memToken = token
}

let _espacioId: number | null = null

export function setEspacioId(id: number | null): void {
  _espacioId = id
}

// Callback registrado por AuthContext para refrescar el token Firebase al recibir 401.
// Retorna el nuevo token, o null si la sesión expiró definitivamente.
type RefreshFn = () => Promise<string | null>
let _refreshFn: RefreshFn | null = null

export function setRefreshTokenFn(fn: RefreshFn | null): void {
  _refreshFn = fn
}

/**
 * Lee el JWT: primero memoria, luego SecureStore (Expo / RN), luego localStorage (Vite).
 */
async function getToken(): Promise<string | null> {
  if (_memToken !== undefined) return _memToken
  try {
    const SecureStore = await import('expo-secure-store')
    const fromSecure = await SecureStore.getItemAsync('auth_token')
    if (fromSecure != null && fromSecure !== '') return fromSecure
  } catch {
    // Sin Expo (p. ej. solo frontend Vite): el import falla o no aplica.
  }
  if (typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem('auth_token')
    } catch {
      return null
    }
  }
  return null
}

async function removeToken(): Promise<void> {
  _memToken = null
  try {
    const SecureStore = await import('expo-secure-store')
    await SecureStore.deleteItemAsync('auth_token')
  } catch {
    /* sin expo-secure-store */
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem('auth_token')
    } catch {
      /* */
    }
  }
}

const client = axios.create({
  headers: { 'Content-Type': 'application/json' },
  timeout: getApiTimeoutMs(),
})

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetriableStatus(status?: number): boolean {
  return status === 502 || status === 503 || status === 504
}

function normalizeApiPath(baseURL: string | undefined, url: string | undefined): string | undefined {
  if (!baseURL || !url) return url
  const normalizedBase = baseURL.replace(/\/+$/, '')
  // Si la base ya termina en /api (config habitual en móvil), evitamos /api/api/...
  if (!/\/api$/i.test(normalizedBase)) return url
  if (url === '/api') return '/'
  if (url.startsWith('/api/')) return url.slice(4)
  return url
}

client.interceptors.request.use(async (config) => {
  config.baseURL = getApiBaseUrl()
  config.url = normalizeApiPath(config.baseURL, config.url)
  config.timeout = getApiTimeoutMs()
  const token = await getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (_espacioId != null) {
    config.headers['X-Espacio-Id'] = String(_espacioId)
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const cfg = error?.config as
      | (Record<string, unknown> & { method?: string; __retryCount?: number; __tokenRetried?: boolean })
      | undefined
    const method = String(cfg?.method ?? '').toLowerCase()
    const safeMethod = method === 'get' || method === 'head' || method === 'options'
    const status = error?.response?.status as number | undefined

    // Reintento corto para errores transitorios del servidor/proxy.
    if (cfg && safeMethod && isRetriableStatus(status)) {
      const retries = Number(cfg.__retryCount ?? 0)
      if (retries < 2) {
        cfg.__retryCount = retries + 1
        const waitMs = retries === 0 ? 800 : 1800
        await sleep(waitMs)
        return client.request(cfg as any)
      }
    }

    if (status === 401) {
      const reqUrl = String(error.config?.url ?? '')
      if (reqUrl.includes('/api/export/sincronizar')) {
        return Promise.reject(error)
      }

      // Intentar refrescar el token Firebase antes de cerrar sesión.
      // Esto cubre el caso más común: app en background >1h, token expirado.
      if (_refreshFn && cfg && !cfg.__tokenRetried) {
        cfg.__tokenRetried = true
        try {
          const freshToken = await _refreshFn()
          if (freshToken) {
            cfg.headers = { ...(cfg.headers ?? {}), Authorization: `Bearer ${freshToken}` }
            return client.request(cfg as any)
          }
        } catch {
          // Si el refresh falla, continuar con logout normal.
        }
      }

      await removeToken()
      if (
        typeof window !== 'undefined' &&
        typeof window.location !== 'undefined' &&
        typeof window.location.href === 'string'
      ) {
        const onLogin = /\/login\/?$/.test(window.location.pathname)
        if (!onLogin) window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default client
