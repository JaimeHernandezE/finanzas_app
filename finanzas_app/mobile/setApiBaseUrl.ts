/**
 * Efecto de arranque: inyecta la URL del API en `shared` antes del resto de imports del layout.
 */
import { setApiBaseUrl } from '@finanzas/shared/api/baseUrl'
import { API_BASE_URL } from './lib/apiConfig'

setApiBaseUrl(API_BASE_URL)
