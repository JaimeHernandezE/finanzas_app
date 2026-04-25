import axios from 'axios'
import { getApiBaseUrl, getApiTimeoutMs } from './baseUrl'

/**
 * Lee el JWT: primero SecureStore (Expo / RN), luego localStorage (Vite).
 * No usar `navigator.product === 'ReactNative'`: en RN moderno deja de cumplirse
 * y el cliente caía en localStorage → peticiones sin Authorization.
 */
async function getToken(): Promise<string | null> {
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
  return config
})

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const cfg = error?.config as
      | (Record<string, unknown> & { method?: string; __retryCount?: number })
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

    if (error.response?.status === 401) {
      const reqUrl = String(error.config?.url ?? '')
      if (reqUrl.includes('/api/export/sincronizar')) {
        return Promise.reject(error)
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
