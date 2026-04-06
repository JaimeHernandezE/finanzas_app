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
