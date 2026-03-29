import axios from 'axios'
import { getApiBaseUrl } from './baseUrl'

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
})

client.interceptors.request.use(async (config) => {
  config.baseURL = getApiBaseUrl()
  const token = await getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
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
