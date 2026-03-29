import AsyncStorage from '@react-native-async-storage/async-storage'
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
  type Auth,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
}

/**
 * Indica si el bundle incluye la config mínima de Firebase.
 * En builds EAS, las EXPO_PUBLIC_* deben definirse como secretos del proyecto
 * (no se sube `.env` al servidor de build).
 */
export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      firebaseConfig.appId
  )
}

let appInstance: FirebaseApp | null = null
let authInstance: Auth | null = null

function getAppInstance(): FirebaseApp {
  if (appInstance) return appInstance
  if (!isFirebaseConfigured()) {
    throw new Error(
      'Firebase no está configurado. Añade las variables EXPO_PUBLIC_FIREBASE_* en EAS (Project → Secrets) y vuelve a generar el APK.'
    )
  }
  appInstance = getApps().length ? getApp() : initializeApp(firebaseConfig)
  return appInstance
}

/** Auth con persistencia en AsyncStorage (sesión sobrevive cierres de app). */
export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance
  const app = getAppInstance()
  try {
    authInstance = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    })
  } catch {
    authInstance = getAuth(app)
  }
  return authInstance
}
