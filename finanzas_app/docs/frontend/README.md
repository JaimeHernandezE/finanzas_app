# App móvil (Expo / React Native)

Para **decisiones de arquitectura, checklist completo y tabla de fallos frecuentes** (replicable en otras apps), ver **[GUIA-EAS-EXPO-REPLICABLE.md](./GUIA-EAS-EXPO-REPLICABLE.md)**.

## Variables de entorno

Los nombres oficiales están en `mobile/.env.example`. En desarrollo local se usa **`mobile/.env`** (no se sube a Git).

Los builds en la nube (**EAS Build**) **no** reciben tu `.env` local: hay que definir las mismas variables en el proyecto de Expo (**Environment variables** en [expo.dev](https://expo.dev)) o con la CLI.

### Crear variables en `preview` y `production`

Desde la carpeta `finanzas_app/mobile`:

```powershell
npx eas-cli env:create --name EXPO_PUBLIC_NOMBRE --value "valor" --type string --environment preview --environment production --visibility <tipo> --non-interactive
```

- **`--visibility`** es obligatoria con `--non-interactive`. Valores: `plaintext`, `sensitive`, `secret`.
  - URLs públicas del API → suele usarse **`plaintext`**.
  - Claves Firebase / Google → **`sensitive`** o **`secret`** (solo afecta a cómo se muestran en el panel de Expo; los `EXPO_PUBLIC_*` igual se incrustan en el bundle de la app).

### Variables a replicar desde `.env`

Alineadas con `mobile/.env.example`:

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (y opcionalmente Android / iOS)

Si una variable ya existe, añade **`--force`** para sobrescribirla.

### Builds

- Perfil **`preview`** (APK en `eas.json`) → usa el entorno **preview** en EAS.
- Perfil **`production`** (AAB típico) → usa **production**.

Tras cambiar variables:

```powershell
eas build --platform android --profile preview
# o
eas build --platform android --profile production
```

## Referencias

- [Variables de entorno en EAS Build](https://docs.expo.dev/build-reference/variables/)
- [eas env:create](https://docs.expo.dev/eas/environment-variables/) (sustituye a `eas secret:create` deprecado)
