import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth'

/**
 * Build demo (Static + backend DEMO): login por JWT (/demo-login/), sin Firebase en el cliente.
 * Así no hace falta configurar VITE_FIREBASE_* en Render para el static demo.
 */
const ES_DEMO_BUILD = import.meta.env.VITE_ES_DEMO === 'true'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID as string,
}

let app: FirebaseApp | undefined
let _auth: Auth | undefined
let _provider: GoogleAuthProvider | undefined

if (!ES_DEMO_BUILD) {
  app = initializeApp(firebaseConfig)
  _auth = getAuth(app)
  _provider = new GoogleAuthProvider()
}

/** null solo en build demo (VITE_ES_DEMO=true). */
export const auth: Auth | null = _auth ?? null
/** null solo en build demo. */
export const provider: GoogleAuthProvider | null = _provider ?? null
