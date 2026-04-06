import axios from 'axios'
import { getApiBaseUrl } from './apiBaseUrl'

const client = axios.create({
  baseURL: getApiBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const reqUrl = String(error.config?.url ?? '')
      // No cerrar sesión ni redirigir: el usuario debe ver el mensaje en pantalla.
      if (
        reqUrl.includes('/api/export/sincronizar') ||
        reqUrl.includes('/api/backup-bd/')
      ) {
        return Promise.reject(error)
      }
      localStorage.removeItem('auth_token')
      const onLogin = /\/login\/?$/.test(window.location.pathname)
      if (!onLogin) window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default client
