import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth'

/**
 * VITE_ES_DEMO en Render a veces llega como "true", "True", "1", etc.
 */
function envTruthy(v: string | undefined): boolean {
  if (v == null) return false
  const s = String(v).trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'yes' || s === 'on'
}

/** Build demo (VITE_ES_DEMO): acepta true, True, 1, on, etc. */
export function esViteDemo(): boolean {
  return envTruthy(import.meta.env.VITE_ES_DEMO)
}

const apiKey = String(import.meta.env.VITE_FIREBASE_API_KEY ?? '').trim()

/**
 * - Demo explícito (VITE_ES_DEMO), o
 * - Sin API key: no llamar a initializeApp (evita auth/invalid-api-key en static demo sin Firebase).
 * En producción real debes definir VITE_FIREBASE_API_KEY en el build.
 */
const omitirFirebase = esViteDemo() || apiKey.length === 0

const firebaseConfig = {
  apiKey,
  authDomain:        String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '').trim(),
  projectId:         String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '').trim(),
  storageBucket:     String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '').trim(),
  messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '').trim(),
  appId:             String(import.meta.env.VITE_FIREBASE_APP_ID ?? '').trim(),
}

let app: FirebaseApp | undefined
let _auth: Auth | undefined
let _provider: GoogleAuthProvider | undefined

if (!omitirFirebase) {
  try {
    app = initializeApp(firebaseConfig)
    _auth = getAuth(app)
    _provider = new GoogleAuthProvider()
  } catch (e) {
    console.warn(
      '[Firebase] No se pudo inicializar (revisa VITE_FIREBASE_* en el build).',
      e
    )
  }
} else if (import.meta.env.DEV && apiKey.length === 0 && !esViteDemo()) {
  console.info(
    '[Firebase] Omitido: sin VITE_FIREBASE_API_KEY. Añade claves o VITE_ES_DEMO=true para demo.'
  )
}

/** null si demo, sin API key, o falló initializeApp. */
export const auth: Auth | null = _auth ?? null
export const provider: GoogleAuthProvider | null = _provider ?? null
