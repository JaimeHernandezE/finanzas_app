# Despliegue y Docker — Backend y Frontend

Este documento describe cómo desplegar y operar el backend (Django + PostgreSQL) y el frontend (Vite + React) con Docker Compose. Es la referencia para entornos locales y, con las variaciones indicadas, para un servidor.

## Requisitos

- [Docker](https://docs.docker.com/get-docker/) y [Docker Compose](https://docs.docker.com/compose/install/) (o Docker con Compose V2).
- Ningún otro proceso usando el puerto **5432** (PostgreSQL), **8000** (Django) ni **5173** (Vite) en local.

## Servicios

| Servicio | Imagen / build | Puerto | Descripción |
|----------|----------------|--------|-------------|
| **db** | `postgres:15-alpine` | 5432 | Base de datos PostgreSQL. Volumen persistente `postgres_data`. |
| **web** | Build desde `backend/Dockerfile` | 8000 | Django + DRF. Origen: `backend/`. |
| **frontend** | `node:20-alpine` | 5173 | Vite + React. Origen: `frontend/`. Hot reload activo (Vite con `usePolling` para volúmenes Docker). |

Variables de entorno del servicio **web** (por defecto en `docker-compose.yml`):

- `DB_HOST=db`
- `DB_NAME=finanzas_db`
- `DB_USER=admin`
- `DB_PASSWORD=password123`

Para entornos no locales, usar variables de entorno o un archivo `.env` (no versionado) y no dejar credenciales por defecto en el repositorio.

## Comandos rápidos — Docker Compose

Ejecutar **siempre desde la carpeta `backend/`** (donde está el `docker-compose.yml`):

```powershell
cd backend
```

### Levantar y construir

```powershell
# Construir imágenes y levantar en segundo plano
docker-compose up -d --build

# Levantar y ver logs en la misma terminal
docker-compose up --build
```

### Parar y bajar

```powershell
# Parar contenedores
docker-compose stop

# Parar y eliminar contenedores (los volúmenes, p. ej. postgres_data, se mantienen)
docker-compose down

# Parar, eliminar contenedores y volúmenes (¡borra la base de datos!)
docker-compose down -v
```

### Reiniciar contenedores

```powershell
# Reiniciar todos los servicios
docker-compose restart

# Reiniciar solo un servicio
docker-compose restart web
docker-compose restart frontend
docker-compose restart db

# Reiniciar varios servicios
docker-compose restart web frontend
```

Tras `restart`, los contenedores se levantan de nuevo sin reconstruir imágenes. Si cambiaste código del backend (Python) o del frontend (React/SCSS), el **backend** recarga solo gracias a `runserver`; el **frontend** recarga en el navegador con Vite (hot reload). Si cambiaste `requirements.txt`, Dockerfile o `package.json`, usa `docker-compose up -d --build <servicio>` en lugar de solo `restart`.

### Logs

```powershell
# Logs de todos los servicios
docker-compose logs -f

# Solo el servicio web (Django)
docker-compose logs -f web

# Solo el servicio db
docker-compose logs -f db

# Solo el servicio frontend (Vite)
docker-compose logs -f frontend
```

### Ejecutar comandos dentro del contenedor Django

```powershell
# Shell en el contenedor web
docker-compose exec web bash

# Comando único: migraciones (el usuario las ejecuta manualmente)
docker-compose exec web python manage.py makemigrations
docker-compose exec web python manage.py migrate

# Crear superusuario
docker-compose exec web python manage.py createsuperuser

# Comprobar que la app responde
docker-compose exec web python manage.py check
```

### Reconstruir un servicio (tras cambiar Dockerfile o dependencias)

```powershell
# Solo backend (p. ej. tras cambiar requirements.txt o Dockerfile)
docker-compose up -d --build web

# Solo frontend (p. ej. tras cambiar package.json)
docker-compose up -d --build frontend
```

### Ver estado de los servicios

```powershell
docker-compose ps
```

## Flujo de despliegue local típico

1. **Primera vez** (desde `finanzas_app/backend/`):

   ```powershell
   docker-compose up -d --build
   docker-compose exec web python manage.py makemigrations
   docker-compose exec web python manage.py migrate
   ```

2. **Día a día**: `docker-compose up -d` (o `docker-compose up` si quieres ver logs).
3. **Tras cambiar modelos**: ejecutar tú mismo `makemigrations` y `migrate` (ver regla en `.cursor/rules/django-migrations.mdc`).
4. **Tras cambiar `requirements.txt` o Dockerfile**: `docker-compose up -d --build web`.

## Hot reload (frontend)

El frontend en Docker ya tiene **hot reload** configurado:

- En `frontend/vite.config.ts` está `server.watch.usePolling: true`, necesario para que Vite detecte cambios en archivos montados por volumen dentro del contenedor.
- Al editar archivos en `frontend/src` (TS, TSX, SCSS, etc.), Vite recompila y el navegador se actualiza solo (HMR). No hace falta reiniciar el contenedor `frontend` para ver cambios.

Si en tu entorno los cambios no se reflejan, reinicia el servicio: `docker-compose restart frontend`.

## URLs útiles (local)

- **Frontend (React):** **http://localhost:5173**
- API base: **http://localhost:8000**
- Admin Django: **http://localhost:8000/admin/**
- Login con Firebase (POST): **http://localhost:8000/api/usuarios/auth/firebase/**

---

## Despliegue en Render (plan gratuito)

### Requisitos previos
- Cuenta en [render.com](https://render.com) conectada a GitHub
- Firebase Service Account JSON (de Firebase Console)

### Generar SECRET_KEY
```powershell
[Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

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
|---|---|
| Web Service | 512 MB RAM — duerme tras 15 min de inactividad |
| PostgreSQL | 256 MB almacenamiento — expira a los 90 días |
| Static Site | Sin límite de ancho de banda |
| Build minutes | 500 min/mes |

---

## Documentación relacionada

- [README del backend](../backend/README.md) — Estructura del proyecto Django y apps.
- [Plan de arquitectura](../plan%20de%20arquitectura.md) — Visión general del sistema.
