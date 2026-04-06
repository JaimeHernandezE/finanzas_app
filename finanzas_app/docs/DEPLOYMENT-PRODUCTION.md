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

| Campo en Render | Valor correcto | Si pones solo `backend` o `frontend` |
|-----------------|----------------|--------------------------------------|
| Web Service → **Root Directory** | `finanzas_app/backend` | Error: `Root directory "backend" does not exist` |
| Static Site → **Root Directory** | `finanzas_app/frontend` | Equivalente: la carpeta no existe en la raíz del repo |

Ese directorio es también el **contexto de build de Docker**: ahí es donde deben estar `requirements.txt` y el `Dockerfile`. Si el Root Directory apunta mal, verás errores como `Dockerfile: no such file` o `COPY requirements.txt: not found`.

En la **raíz del repositorio** (al mismo nivel que la carpeta `finanzas_app/`) suele estar `render.yaml`; ahí verás `rootDir: finanzas_app/backend`, alineado con lo anterior.

> **Excepción:** si alguien publicó una copia del repo donde `backend/` está en la raíz (sin carpeta `finanzas_app/`), entonces Root Directory sería `backend`. Ese no es el layout de este monorepo.

### Python nativo vs Docker en Render

| Modo | Cómo se construye | Cómo arranca |
|------|-------------------|--------------|
| **Python** (`env: python` en `render.yaml`) | `./build.sh` (dependencias, `collectstatic`, `migrate`, seeds, etc.) | `startCommand` con Gunicorn en el YAML o en el panel |
| **Docker** (build desde `Dockerfile`) | Solo lo definido en el Dockerfile (por defecto **no** corre `build.sh`) | Hace falta un **CMD** en la imagen **o** un **Start Command** en Render |

Si usas imagen Docker **sin** proceso en primer plano y **sin** Start Command en el panel, el contenedor termina al instante y Render muestra **`Application exited early`**. El `Dockerfile` del backend define ya un **CMD** con Gunicorn usando `PORT` y `WEB_CONCURRENCY` (Render las inyecta).

**Migraciones en Docker:** al no ejecutarse `build.sh` dentro de la imagen, aplica migraciones con un **Release Command** en Render (`python manage.py migrate`), un job manual, o incorpora ese paso al flujo que uses. El servicio **Python** del blueprint sí corre migraciones en cada deploy vía `build.sh`.

#### `dj_database_url.ParseError` / `DATABASE_URL` inválida

Si Gunicorn cae al arrancar con error de parseo de URL:

1. En **Environment** del backend (p. ej. Render), revisa que `DATABASE_URL` sea la cadena **completa** que te da tu proveedor, **sin** comillas `"..."` alrededor del valor.
2. Sin espacios ni saltos de línea al inicio o al final.
3. Si armaste la URL a mano y la contraseña lleva caracteres especiales (`@`, `:`, `/`, `#`, etc.), deben ir **URL-encoded**. Lo más seguro es usar siempre el botón **copiar** del panel (Render **Internal/External Database URL**, Supabase **URI**, etc.).
4. Con **PostgreSQL en Render** enlazado al servicio web: usa Internal o External según corresponda.

##### PostgreSQL en **Supabase** (backend en Render u otro host)

Supabase es totalmente válido como `DATABASE_URL`; no hace falta crear otra BD en Render.

1. En [Supabase](https://supabase.com) → tu proyecto → **Project Settings** (engranaje) → **Database** → **Connect** (arriba).
2. En **Connection string**, elige el modo **URI** (a veces aparece bajo “PostgreSQL” / “ORMs”). Sustituye `[YOUR-PASSWORD]` por la contraseña real del proyecto **solo si el asistente lo pide**; muchas veces el botón de copiar ya deja la URL lista.
3. Pega ese valor en Render (u otro host) como variable **`DATABASE_URL`**, sin comillas. La plantilla de Supabase suele incluir **`?sslmode=require`** al final; **déjalo**: Django/psycopg2 lo usan para TLS.

**Ejemplo de variable de entorno (conexión directa, puerto 5432)**

| Dónde | Qué poner |
|-------|-----------|
| **Nombre** (Render, etc.) | `DATABASE_URL` |
| **Valor** | Una sola línea, **sin** comillas. La contraseña va **entre** el segundo `:` y la `@` (ver abajo). |

Formato típico (el host `db.<ref>.supabase.co` lo copias de tu proyecto; el `<ref>` es distinto en cada uno):

```text
postgresql://postgres:<CONTRASEÑA>@db.<ref>.supabase.co:5432/postgres?sslmode=require
```

- **`postgres`** (después del primer `//`): usuario por defecto de la base.
- **`<CONTRASEÑA>`**: aquí va la **contraseña de la base de datos** del proyecto Supabase (**Project Settings → Database**; es la que elegiste al crear el proyecto o la que reseteaste con “Reset database password”). Sustituye **solo** ese fragmento; no pongas espacios ni comillas alrededor de la URL completa.
- **`db.<ref>.supabase.co`**: host de **conexión directa** que muestra Supabase en la misma pantalla (no lo inventes: cópialo del panel).
- **`?sslmode=require`**: conviene dejarlo; si tu plantilla de Supabase no lo trae, añádelo al final.

Ejemplo **no válido** (solo ilustrativo; no uses estos datos reales):

```text
postgresql://postgres:miClaveSecreta123@db.abcdefghijklmnop.supabase.co:5432/postgres?sslmode=require
```

Si la contraseña contiene caracteres reservados en URLs (`@`, `:`, `/`, `#`, `%`, etc.), deben ir **codificados** en ese segmento, o usa la URI que Supabase genera al **copiar** desde el asistente (así evitas errores y `ParseError`).
4. **Conexión directa vs pooler:** para una app Django con Gunicorn (proceso largo) suele ir bien la conexión **directa** (`db.<ref>.supabase.co`, puerto **5432**). El **pooler en modo transacción** (puerto **6543**) a veces da problemas con migraciones o sentencias preparadas; si notas errores raros al migrar, prueba la URI de **sesión** o la directa según la documentación actual de Supabase.
5. Si el backend **no llega a conectar** (timeout / refused) pero la URL es válida: revisa en Supabase **Database → Network restrictions** (si restringiste IPs) y, en planes que solo exponían IPv6 en el host directo, el **pooler** o el add-on **IPv4** que ofrece Supabase para clientes solo IPv4 (p. ej. algunos PaaS).

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

#### 3. Static Site (frontend)

- **New → Static Site** → mismo repositorio
- Root Directory: `finanzas_app/frontend`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`

Variables de entorno:

```
VITE_API_URL               = https://<backend>.onrender.com
VITE_FIREBASE_API_KEY      = <de Firebase Console>
VITE_FIREBASE_AUTH_DOMAIN  = <de Firebase Console>
VITE_FIREBASE_PROJECT_ID   = <de Firebase Console>
```

#### 4. Firebase — dominios autorizados

En Firebase Console → Authentication → Settings → Dominios autorizados:

- Agregar el dominio del Static Site de Render

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
   - **`migrate`** — `DATABASE_URL` incorrecta, BD inalcanzable, permisos en Supabase, migración inconsistente.
   - **`seed_demo`** — solo si `DEMO=True`; revisa el traceback (datos previos, métodos de pago, etc.).

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
