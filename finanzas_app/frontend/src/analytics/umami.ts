import { esViteDemo } from '@/firebase'

const UMAMI_SCRIPT_SRC = 'https://cloud.umami.is/script.js'
/** Umami Cloud — solo se usa en build demo; sobreescribible con VITE_UMAMI_WEBSITE_ID. */
const UMAMI_WEBSITE_ID_DEFAULT = 'e4b32568-3882-449f-af39-919d1b92671c'

/**
 * Carga el tracker de Umami únicamente cuando VITE_ES_DEMO está activo.
 */
export function initUmamiIfDemo(): void {
  if (!esViteDemo()) return

  const id =
    String(import.meta.env.VITE_UMAMI_WEBSITE_ID ?? '').trim() ||
    UMAMI_WEBSITE_ID_DEFAULT
  if (!id) return
  if (document.querySelector(`script[data-website-id="${CSS.escape(id)}"]`)) return

  const script = document.createElement('script')
  script.defer = true
  script.src = UMAMI_SCRIPT_SRC
  script.setAttribute('data-website-id', id)
  document.head.appendChild(script)
}
