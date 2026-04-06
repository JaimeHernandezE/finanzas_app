# Despliegue en producción

Guía para publicar Finanzas App en internet para uso personal, tanto la versión web como la móvil. Si solo quieres correr el proyecto en local con Docker, usa **[DEPLOYMENT-LOCAL.md](DEPLOYMENT-LOCAL.md)**.

Esta documentación se ampliará paso a paso para que alguien con poca experiencia en despliegues pueda seguir checklists concretos (consolas, nombres de campos y variables).

**Índice general:** [DEPLOYMENT.md](DEPLOYMENT.md).

## Qué vas a necesitar (visión general)

| Pieza | Para qué sirve |
|-------|----------------|
| **Base de datos PostgreSQL** | Donde Django guarda usuarios, movimientos, tarjetas, etc. (p. ej. Render PostgreSQL, Supabase, u otro proveedor). |
| **Backend Django** | API REST; suele ejecutarse con **Gunicorn** detrás del proveedor (p. ej. Render Web Service). |
| **Frontend web** | Build estático de Vite (`npm run build`); suele publicarse como *static site* o detrás de CDN. |
| **Firebase** | Autenticación; el backend valida el token y emite JWT. Requiere proyecto Firebase y, en servidor, credenciales de cuenta de servicio. |
| **Dominios y HTTPS** | Tu proveedor suele darte una URL `*.onrender.com` o configuras un dominio propio más adelante. |

Localmente sigues usando [DEPLOYMENT-LOCAL.md](DEPLOYMENT-LOCAL.md); en producción las mismas ideas se traducen en **variables de entorno** en el panel del proveedor (nunca subas secretos al repositorio).

---

## Guía actual: Render (plan gratuito)

### Requisitos previos

- Cuenta en [render.com](https://render.com) conectada a GitHub
- Firebase Service Account JSON (de Firebase Console)

### Monorepo: Root Directory en Render (importante)

En la **raíz del repositorio** (lo que Render clona) **no** existe una carpeta llamada solo `backend/`. El proyecto Django está dentro de **`finanzas_app/backend/`** (Dockerfile, `requirements.txt`, `build.sh`, `manage.py`). El frontend web está en **`finanzas_app/frontend/`**.

| Campo en Render | Valor correcto | Si lo omites o es incorrecto |
|-----------------|----------------|------------------------------|
| Web Service → **Root Directory** | `finanzas_app/backend` | Error: `Root directory "backend" does not exist` si pones solo `backend`; Docker sin contexto correcto. |
| Static Site → **Root Directory** | `finanzas_app/frontend` (**obligatorio**) | Sin esta ruta, no hay `package.json` del Vite en el directorio de build → fallo de `npm install` / build. No basta con `frontend` en la raíz (no existe). |

El Root Directory del **Web Service** es también el **contexto de build de Docker**: ahí deben estar `requirements.txt` y el `Dockerfile`. Si apunta mal, verás errores como `Dockerfile: no such file` o `COPY requirements.txt: not found`.

En la **raíz del repositorio** (al mismo nivel que la carpeta `finanzas_app/`) suele estar `render.yaml`; ahí verás `rootDir: finanzas_app/backend`, alineado con lo anterior.

> **Excepción:** si alguien publicó una copia del repo donde `backend/` está en la raíz (sin carpeta `finanzas_app/`), entonces Root Directory sería `backend`. Ese no es el layout de este monorepo.

### Python nativo vs Docker en Render

| Modo | Cómo se construye | Cómo arranca |
|------|-------------------|--------------|
| **Python** (`env: python` en `render.yaml`) | `./build.sh` (dependencias, `collectstatic`, `migrate`, seeds, etc.) | `startCommand` con Gunicorn en el YAML o en el panel |
| **Docker** (build desde `Dockerfile`) | Solo lo definido en el Dockerfile (por defecto **no** corre `build.sh`) | Hace falta un **CMD** en la imagen **o** un **Start Command** en Render |

Si usas imagen Docker **sin** proceso en primer plano y **sin** Start Command en el panel, el contenedor termina al instante y Render muestra **`Application exited early`**. El `Dockerfile` del backend define ya un **CMD** con Gunicorn usando `PORT` y `WEB_CONCURRENCY` (Render las inyecta).

**Migraciones en Docker:** el `ENTRYPOINT` (`docker-entrypoint.sh`) ejecuta antes de Gunicorn: **`migrate`**, **`seed_categorias`**, **`crear_admin`** y **`ensure_demo_seed`**. Este último, solo si **`DEMO`** está activo, llama a **`seed_demo`** cuando aún no existe el usuario demo Jaime (primer arranque o BD vacía); en reinicios no vuelve a sembrar todo el dataset. Variables para saltar pasos: **`SKIP_MIGRATE_ON_START=1`**, **`SKIP_POST_MIGRATE_SETUP=1`**. Sigue siendo válido **Release Command** `./release.sh` en cada deploy (p. ej. refrescar demo completo al publicar). El endpoint **`GET /api/usuarios/config/` no usa la base de datos**: puede dar **200** sin tablas; **`demo-login` 404** con mensaje de seed suele indicar usuarios demo aún no creados.

#### `dj_database_url.ParseError` / `DATABASE_URL` inválida

Si Gunicorn cae al arrancar con error de parseo de URL:

1. En **Environment** del backend (p. ej. Render), revisa que `DATABASE_URL` sea la cadena **completa** que te da tu proveedor, **sin** comillas `"..."` alrededor del valor.
2. Sin espacios ni saltos de línea al inicio o al final.
3. Si armaste la URL a mano y la contraseña lleva caracteres especiales (`@`, `:`, `/`, `#`, etc.), deben ir **URL-encoded**. Lo más seguro es usar siempre el botón **copiar** del panel (Render **Internal/External Database URL**, Supabase **URI**, etc.).
4. Con **PostgreSQL en Render** enlazado al servicio web: usa Internal o External según corresponda.

##### PostgreSQL en **Supabase** (backend en Render u otro host)

Supabase es totalmente válido como `DATABASE_URL`; no hace falta crear otra BD en Render.

###### Render y «Network is unreachable» (IPv6)

Si en los logs aparece algo como:

`connection to server at "db.<ref>.supabase.co" (2600:…), port 5432 failed: **Network is unreachable**`

significa que el host **directo** `db.*.supabase.co` se resolvió a una dirección **IPv6** y el entorno de **Render** (build y runtime) **no puede enrutar IPv6** hasta ese destino. No es un fallo de Django ni de la contraseña.

**Qué hacer (elige una):**

1. **Recomendado:** en Supabase → **Project Settings → Database → Connect**, copia la URI del **Connection Pooling** en modo **Session** (a veces etiquetado “Session pooler” / puerto **5432** hacia el host del pooler, no `db.<ref>.supabase.co`). Esa ruta suele exponer **IPv4** compatible con Render. Pega esa cadena completa en **`DATABASE_URL`** y vuelve a desplegar.
2. Alternativa de Supabase: activar el add-on **IPv4** para la conexión directa (de pago en muchos planes), si quieres seguir usando `db.<ref>.supabase.co:5432`.
3. Revisa **Database → Network restrictions** en Supabase: no debe bloquear el tráfico desde internet si Render se conecta desde IPs públicas variables.

El **pooler en modo transacción** (puerto **6543**) a veces molesta con migraciones o sentencias preparadas en Django; por eso, desde Render, suele ir mejor **Session pooler** antes que Transaction; si algo falla solo en `migrate`, consulta la doc actual de Supabase para tu tipo de pooler.

---

1. En [Supabase](https://supabase.com) → tu proyecto → **Project Settings** (engranaje) → **Database** → **Connect** (arriba).
2. En **Connection string**, elige el modo **URI** (a veces bajo “PostgreSQL” / “ORMs”). **Desde Render, prioriza la sección de pooler (Session)** como arriba, no solo “Direct connection”.
3. Sustituye `[YOUR-PASSWORD]` solo si el asistente lo indica; el botón **Copy** suele dejar la URL lista.
4. Pega el valor en Render como **`DATABASE_URL`**, sin comillas. Mantén **`?sslmode=require`** si viene en la plantilla.

**Ejemplo de forma de la URI (conexión directa — solo si tu cliente tiene IPv6 o add-on IPv4)**

| Dónde | Qué poner |
|-------|-----------|
| **Nombre** (Render, etc.) | `DATABASE_URL` |
| **Valor** | Una sola línea, **sin** comillas. La contraseña va **entre** el segundo `:` y la `@` (ver abajo). |

Formato típico **directo** (host `db.<ref>.supabase.co`):

```text
postgresql://postgres:<CONTRASEÑA>@db.<ref>.supabase.co:5432/postgres?sslmode=require
```

- **`postgres`** (tras `//`): usuario por defecto (en pooler a veces es `postgres.<ref>`; usa exactamente lo que muestre Supabase).
- **`<CONTRASEÑA>`**: **Database password** del proyecto (**Settings → Database**).
- **`db.<ref>.supabase.co`**: host de conexión directa (cópialo del panel).
- **`?sslmode=require`**: déjalo si viene en la URI.

Ejemplo ilustrativo (datos ficticios):

```text
postgresql://postgres:miClaveSecreta123@db.abcdefghijklmnop.supabase.co:5432/postgres?sslmode=require
```

Si la contraseña tiene caracteres reservados en URLs (`@`, `:`, `/`, `#`, `%`, etc.), deben ir **codificados**, o pega la URI generada por Supabase con **Copy**.

5. Si el backend **no conecta** pese a URL válida: además de lo IPv6 anterior, revisa **Network restrictions** en Supabase.

### Generar SECRET_KEY

Puedes generar una `SECRET_KEY` nueva de varias formas:

**1. Con Django (recomendado si ya tienes Django instalado)**

```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

En Docker, desde la carpeta del backend:

```bash
docker-compose exec web python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

**2. Solo con la biblioteca estándar de Python**

```bash
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

**3. Con OpenSSL**

```bash
openssl rand -base64 48
```

**4. PowerShell (Windows)**

```powershell
[Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

> En producción, guarda el valor solo en variables de entorno o en un gestor de secretos; no lo subas al repositorio.

### Convertir Firebase JSON a una línea (para variable de entorno)

```powershell
Get-Content .\firebase-service-account.json -Raw | ConvertFrom-Json | ConvertTo-Json -Compress
```

### Orden de creación en Render

#### 1. Base de datos PostgreSQL

- **New → PostgreSQL**
- Name: `finanzas-db` | Region: Oregon | Plan: **Free**
- Copiar la **Internal Database URL** para el paso siguiente

#### 2. Web Service (backend)

- **New → Web Service** → conectar repositorio
- Root Directory: `finanzas_app/backend`
- Build Command: `./build.sh`
- **Release Command** (recomendado si no puedes usar Shell / quieres asegurar BD al desplegar): `./release.sh`  
  Ejecuta `migrate`, `seed_categorias`, `crear_admin` y, si `DEMO` es truthy, `seed_demo` — la misma secuencia que el final de `build.sh`, pero **contra la `DATABASE_URL` del despliegue** justo antes de levantar la nueva versión. Útil cuando el build no alcanzó a migrar o la BD se creó/vacía después del primer build.
- Start Command: `gunicorn core.wsgi:application --bind 0.0.0.0:$PORT --workers 2 --timeout 60`
- Plan: **Free**

Variables de entorno a configurar:

```
DEBUG                         = False
SECRET_KEY                    = <generada arriba>
DATABASE_URL                  = <Internal Database URL del paso 1>
ALLOWED_HOSTS                 = <nombre>.onrender.com
CORS_ALLOWED_ORIGINS          = https://<frontend>.onrender.com
FIREBASE_SERVICE_ACCOUNT_JSON = <JSON en una línea>
```

**Solo instancia demo (API + `demo-login`):** añade **`DEMO`** con cualquiera de estos valores (equivalentes entre sí): **`true`**, **`True`**, **`1`**, **`yes`**, **`on`**. No hace falta que sea exactamente la cadena `True` con T mayúscula: Django y `build.sh` usan la misma regla «truthy». Con `DEMO` activo, `FIREBASE_SERVICE_ACCOUNT_JSON` puede omitirse si no usas Firebase Admin en ese servicio. En el build, si `DEMO` está activo, `build.sh` ejecuta también **`seed_demo`**.

#### 3. Static Site (frontend)

En Render hay **dos rutas distintas**; no mezcles el monorepo con la carpeta de publicación:

| Campo en el formulario | Qué poner | Comentario |
|------------------------|-----------|------------|
| **Root Directory** (opcional en el formulario, pero **obligatorio** para nosotros) | `finanzas_app/frontend` | Desde aquí Render ejecuta `npm install` / `build`. Ahí vive el `package.json` de Vite. |
| **Publish Directory** | `dist` | Ruta **relativa al Root Directory**, no al repo. Tras `npm run build`, Vite deja los archivos en `finanzas_app/frontend/dist/`; en este campo solo escribes **`dist`** (o `./dist`). |

**Error frecuente:** poner `finanzas_app/frontend` en **Publish Directory**. Ese campo no es la raíz del proyecto: si ya definiste **Root Directory** = `finanzas_app/frontend`, el directorio a publicar es la subcarpeta **`dist`**, no repetir toda la ruta del monorepo.

Pasos:

- **New → Static Site** → mismo repositorio
- **Root Directory:** `finanzas_app/frontend`
- **Build Command:** `npm install && npm run build`
- **Publish Directory:** `dist`

Variables de entorno (definir **antes** del build: Vite las incrusta en el JS en tiempo de compilación):

**Producción real (login Firebase en el cliente):**

```
VITE_API_URL                          = https://<backend>.onrender.com
VITE_FIREBASE_API_KEY                 = <Firebase Console → Config del proyecto>
VITE_FIREBASE_AUTH_DOMAIN             = <ej. tu-proyecto.firebaseapp.com>
VITE_FIREBASE_PROJECT_ID              = <project id>
VITE_FIREBASE_STORAGE_BUCKET          = <opcional; suele venir en el snippet>
VITE_FIREBASE_MESSAGING_SENDER_ID     = <opcional>
VITE_FIREBASE_APP_ID                  = <opcional>
```

Sin comillas en los valores. Si falta o está mal **`VITE_FIREBASE_API_KEY`**, el navegador muestra **`auth/invalid-api-key`**.

**Solo entorno demo (backend con **`DEMO`** activo — `true` / `1` / `yes` / `on`, etc. —, login por `/api/usuarios/demo-login/`):** el cliente **no** inicializa Firebase si:

- defines **`VITE_ES_DEMO`** como `true`, `1`, `yes` o `on` (mayúsculas/minúsculas), **o**
- **no** defines `VITE_FIREBASE_API_KEY` (vacío): el front omite Firebase y evita `auth/invalid-api-key`.

Recomendado para dejar claro el intento:

```
VITE_ES_DEMO = true
VITE_API_URL = https://<backend-demo>.onrender.com
```

Tras añadir o cambiar variables, haz **Clear build cache & deploy** o un deploy nuevo: Vite solo inyecta `VITE_*` en tiempo de **build**, no en runtime.

#### 4. Firebase — dominios autorizados

En Firebase Console → Authentication → Settings → Dominios autorizados:

- Agregar el dominio del Static Site de Render

#### Demo (backend + frontend en URLs distintas)

- En el **Static Site** demo usa **`VITE_ES_DEMO=true`** + **`VITE_API_URL`** hacia el backend demo; así no hace falta configurar claves Firebase en el front (ver tabla de variables arriba).
- **Si aún no desplegaste el frontend en Render**, no tendrás la app web en ninguna URL pública: solo existe la **API** en el Web Service. Es normal que en `https://<backend>.onrender.com/` veas JSON (o antes un 404) y **no** la interfaz React. La UI aparece cuando crees el **Static Site** del paso **«3. Static Site (frontend)»** más arriba (Root Directory `finanzas_app/frontend`, `VITE_API_URL` apuntando a tu backend demo).
- Mientras tanto puedes probar el API con **Django Admin** (`/admin/`) si tienes superusuario, con **Postman/curl**, o correr el front **en local**: `cd finanzas_app/frontend && npm run dev` y en `.env` o `.env.local` poner `VITE_API_URL=https://<tu-backend-demo>.onrender.com`.
- **`ALLOWED_HOSTS`** en el Web Service debe incluir el host del API (p. ej. `finanzas-app-demo.onrender.com`). Si no está, Django responde **400** a `GET /` (cabecera `Host` rechazada).
- La ruta **`/`** del backend devuelve un **JSON** con enlaces a `/admin/` y prefijos `/api/…`; **no** es la aplicación React. En el Static Site define `VITE_API_URL=https://<tu-backend-demo>.onrender.com` (sin barra final, salvo que tu front lo exija).
- Si ves “Not Found” en `/` en un despliegue antiguo sin la vista raíz, actualiza el backend; **para usar la app como en producción** abre la URL del **frontend** desplegado, no solo la del API.

### Evitar el sleep del plan gratuito (UptimeRobot)

El plan gratuito duerme el servidor tras 15 min sin tráfico.

1. Crear cuenta gratuita en [uptimerobot.com](https://uptimerobot.com)
2. **Add New Monitor** → HTTP(s)
3. URL: `https://<backend>.onrender.com/api/usuarios/config/`
4. Monitoring Interval: **5 minutes**

### CI/CD automático

Render despliega automáticamente en cada push a `main`.
El workflow `.github/workflows/tests.yml` corre los tests antes del deploy.

### Fallo del build: «Exited with status 1 while building your code»

Ese mensaje solo indica que **algo falló durante el Build Command** (p. ej. `./build.sh`), no durante el arranque de Gunicorn.

1. Abre el deploy en Render y **baja hasta la última línea en rojo** del log; ahí está el comando que falló (traceback de Django, pip, etc.).
2. El script `build.sh` imprime líneas `==> build.sh: …` para cada paso. **La última línea `==>` que aparezca antes del error** te dice el paso concreto:
   - **`pip install`** — conflicto de dependencias o error de red.
   - **`collectstatic`** — a veces falla `CompressedManifestStaticFilesStorage` si falta un estático referenciado; el log suele mencionar `Missing staticfiles` o `ValueError`.
   - **`migrate`** — `DATABASE_URL` incorrecta, BD inalcanzable, migración inconsistente. Con **Supabase + Render**, un error `Network is unreachable` con una IP `2600:…` (IPv6) en el log indica que debes usar la URI del **pooler (Session)**, no la conexión directa `db.*.supabase.co` (ver sección Supabase más arriba).
   - **`seed_demo`** — solo si la variable de entorno **`DEMO`** es truthy (`true`, `1`, `yes`, …); revisa el traceback (datos previos, métodos de pago, etc.).

**Nota sobre el commit del Dockerfile:** si el servicio está en **entorno Python** (Build Command `./build.sh`), los cambios del **Dockerfile no forman parte de ese build**. Un rollback del Dockerfile **no arregla** un fallo de `build.sh`; hace falta el log del paso que rompió.

### Limitaciones del plan gratuito

| Servicio | Límite |
|----------|--------|
| Web Service | 512 MB RAM — duerme tras 15 min de inactividad |
| PostgreSQL | 256 MB almacenamiento — expira a los 90 días |
| Static Site | Sin límite de ancho de banda |
| Build minutes | 500 min/mes |

---

## Documentación ampliada (próximamente)

Se añadirán apartados detallados (capturas, pasos numerados y tablas de variables) para:

| Tema | Contenido previsto |
|------|---------------------|
| **Google Cloud** | Proyecto, APIs (Drive, Sheets), cuenta de servicio, JSON y variables para backup/export u otras integraciones. |
| **Firebase** | Crear proyecto, Authentication, descarga de claves, configuración web (`VITE_*`), dominios autorizados y relación con el backend. |
| **Supabase** | PostgreSQL gestionado, cadena de conexión, SSL y uso como `DATABASE_URL` en Render u otro host. |
| **Render** | Ampliar esta guía con resolución de errores comunes, dominios personalizados y planes de pago. |
| **Expo / EAS** | Builds móviles, variables de entorno y enlaces con [docs/frontend/GUIA-EAS-EXPO-REPLICABLE.md](frontend/GUIA-EAS-EXPO-REPLICABLE.md). |

Si algo de la tabla anterior ya está cubierto en otro documento, este archivo enlazará a esa guía para evitar duplicar contenido.

---

## Documentación relacionada

- [Despliegue local](DEPLOYMENT-LOCAL.md) — Docker Compose en tu máquina.
- [README del backend](../backend/README.md) — Estructura Django y apps.
- [Plan de arquitectura](../plan%20de%20arquitectura.md) — Visión general del sistema.
- [Frontend — Expo / EAS](frontend/GUIA-EAS-EXPO-REPLICABLE.md) — Builds reproducibles móviles.
