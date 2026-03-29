# Guía reproducible: Expo + EAS Build (Android) + API + Firebase

Documento para **replicar el mismo enfoque en otras apps**: decisiones, orden de pasos y errores que ya aparecieron aquí. No sustituye la documentación oficial de Expo; enlaces al final.

---

## 1. Objetivo del flujo

- **Desarrollo local:** `expo start` + `.env` en la máquina → iteración rápida.
- **Distribución:** **EAS Build** genera APK/AAB; el JavaScript y las `EXPO_PUBLIC_*` van **congelados** en el artefacto.
- **Backend** en URL pública (HTTPS); **Firebase Auth** en el cliente; **API propia** con JWT.

---

## 2. Decisiones que conviene repetir

| Decisión | Motivo |
|----------|--------|
| **`.env` en `.gitignore`** | Las claves no deben vivir en el repositorio ni en el historial de Git. |
| **Variables `EXPO_PUBLIC_*` en EAS** | El servidor de build **no** recibe tu `.env` local (suele estar ignorado). Sin ellas, el bundle lleva `undefined` o fallbacks como `localhost`. |
| **Mismo nombre de variable en local y en EAS** | Copiar de `mobile/.env` a [expo.dev](https://expo.dev) (o `eas env:create`) para no divergir. |
| **Entornos `preview` y `production` en EAS** | Alineados con perfiles de `eas.json` (`preview` → APK de prueba, `production` → tienda / AAB). |
| **Firebase: no inicializar con config vacía** | En release, `initializeApp` sin `apiKey`/`projectId` puede tumbar la app al arrancar. Usar comprobación previa y/o init perezoso. |
| **Cliente HTTP: token desde SecureStore primero** | `navigator.product === 'ReactNative'` **ya no es fiable** en RN/Hermes reciente; si el cliente cree que es “web”, lee `localStorage` y las peticiones van **sin** `Authorization` aunque el login haya guardado el token en SecureStore. |
| **`__DEV__` en bloqueo biométrico** | En `expo start` + emulador evita quedar bloqueado por huella simulada; en **release** `__DEV__` es `false`. |
| **Monorepo: URL del API definida en `mobile/`, inyectada en `shared/`** | En paquetes fuera de `mobile/`, `process.env.EXPO_PUBLIC_API_URL` a veces **no se sustituye** en el bundle de EAS → el cliente sigue usando `localhost` y aparece *Network Error* en release. Solución: `mobile/lib/apiConfig.ts` + `setApiBaseUrl()` al arranque (`mobile/setApiBaseUrl.ts` importado primero en `app/_layout.tsx`). |

---

## 3. Checklist al crear o clonar un proyecto similar

1. **Expo / EAS**
   - `eas login`, proyecto en expo.dev, `projectId` en `app.json` (`extra.eas.projectId`).
   - `eas.json`: perfiles `preview` (p. ej. `buildType: apk` en Android) y `production` (p. ej. `app-bundle`).

2. **Variables en el panel o CLI**
   - Listar todas las `EXPO_PUBLIC_*` que use el código (API, Firebase, OAuth).
   - Crearlas para **`preview` y `production`** si quieres los mismos valores en ambos entornos.

3. **Comando CLI (PowerShell / bash)**

   ```text
   npx eas-cli env:create --name EXPO_PUBLIC_NOMBRE --value "valor" --type string
     --environment preview --environment production
     --visibility plaintext|sensitive|secret --non-interactive
   ```

   - Con `--non-interactive`, **`--visibility` es obligatoria** (`plaintext` para URLs públicas; `sensitive`/`secret` para claves en el panel).
   - Si la variable ya existe: añadir **`--force`**.

4. **Después de cambiar variables o código JS compartido**
   - **Nuevo** `eas build` e instalar **ese** APK/AAB. Los cambios en expo.dev **no** actualizan builds ya generados.

5. **Comprobación rápida en el teléfono**
   - Abrir en el navegador del móvil: `https://TU_HOST/api/.../config/` (o un endpoint GET público). Si carga, red y TLS están bien; si la app falla, el problema suele ser **URL embebida** o **lógica del cliente**.

---

## 4. Implementación técnica (referencias en este repo)

| Tema | Dónde mirar en el código |
|------|-------------------------|
| Firebase lazy + `isFirebaseConfigured()` | `mobile/lib/firebase.ts`, `mobile/app/_layout.tsx`, `mobile/components/ConfiguracionFaltante.tsx` |
| Cliente axios: SecureStore → luego localStorage | `shared/api/client.ts` |
| URL API en monorepo (EAS inyecta en `mobile/`) | `mobile/lib/apiConfig.ts`, `mobile/setApiBaseUrl.ts`, `shared/api/baseUrl.ts` (primer import en `app/_layout.tsx`) |
| Biometría solo en release | `mobile/components/AppLock.tsx` |
| API URL en `AuthContext` | `mobile/context/AuthContext.tsx` (`API_BASE_URL` desde `apiConfig`) |
| Lista de env de ejemplo | `mobile/.env.example` |
| Doc corta de env + build | `docs/frontend/README.md` |

En **otra app**, copia los **patrones** (no hace falta copiar nombres de pantallas): init seguro de Firebase, lectura de token en el cliente HTTP, y variables en EAS.

---

## 5. Síntomas y causas (tabla de diagnóstico)

| Síntoma | Causa probable |
|---------|----------------|
| La app **se cierra** al abrir (release) | `EXPO_PUBLIC_FIREBASE_*` no estaban en el build; init de Firebase con config vacía. |
| **Network Error** tras login o al cargar | `EXPO_PUBLIC_API_URL` ausente en EAS → fallback `localhost`; o, en **monorepo**, `process.env` no sustituido dentro de `shared/` → mismo efecto; usar `apiConfig` + `setApiBaseUrl`. |
| **Login OK**, listados / datos **vacíos o error** | Cliente HTTP leyendo `localStorage` en lugar de SecureStore (detección “nativo” incorrecta). Corregido leyendo **primero** SecureStore. |
| En emulador, no pasas la **huella** | Usar `__DEV__` en el lock, o panel del emulador → Fingerprint → “Touch the sensor”. |

---

## 6. Qué no hace falta para reproducir

- Commitear `.env`.
- Asumir que un build antiguo “hereda” variables nuevas de Expo (no es así).
- Confiar en `navigator.product === 'ReactNative'` para lógica crítica.

---

## 7. Referencias oficiales

- [Variables de entorno en EAS Build](https://docs.expo.dev/build-reference/variables/)
- [EAS Environment variables / `eas env:create`](https://docs.expo.dev/eas/environment-variables/)
- [Expo `EXPO_PUBLIC_` variables](https://docs.expo.dev/guides/environment-variables/)

---

*Última actualización alineada con el flujo probado en Finanzas App (Expo SDK ~54, EAS Build Android).*
