import axios from 'axios'

// Detectar si estamos en React Native o web
const isNative =
  typeof navigator !== 'undefined' && navigator.product === 'ReactNative'

async function getToken(): Promise<string | null> {
  if (isNative) {
    // En React Native usar SecureStore (importación dinámica para no romper el web)
    const SecureStore = await import('expo-secure-store')
    return SecureStore.getItemAsync('auth_token')
  }
  return localStorage.getItem('auth_token')
}

async function removeToken(): Promise<void> {
  if (isNative) {
    const SecureStore = await import('expo-secure-store')
    await SecureStore.deleteItemAsync('auth_token')
  } else {
    localStorage.removeItem('auth_token')
  }
}

const client = axios.create({
  baseURL:
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ??
    (typeof import.meta !== 'undefined'
      ? (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL
      : undefined) ??
    'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use(async (config) => {
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
      if (!isNative) {
        const onLogin = /\/login\/?$/.test(window.location.pathname)
        if (!onLogin) window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default client
