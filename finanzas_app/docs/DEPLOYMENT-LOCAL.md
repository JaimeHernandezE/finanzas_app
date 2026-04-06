# Despliegue local — Docker Compose

Esta guía explica cómo levantar en tu máquina el backend (Django + PostgreSQL) y el frontend web (Vite + React) usando Docker Compose. No cubre servidores ni la nube; para eso usa **[DEPLOYMENT-PRODUCTION.md](DEPLOYMENT-PRODUCTION.md)**.

**Antes de empezar:** instala [Docker](https://docs.docker.com/get-docker/) y [Docker Compose](https://docs.docker.com/compose/install/) (o Docker con Compose V2). Índice general de despliegues: [DEPLOYMENT.md](DEPLOYMENT.md).

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

En local conviene copiar [backend/.env.example](../backend/.env.example) a `backend/.env` y ajustar valores; no subas `.env` al repositorio.

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

## Documentación relacionada

- [Despliegue en producción](DEPLOYMENT-PRODUCTION.md) — Render, variables de entorno en la nube, próximas guías detalladas.
- [Índice de despliegue](DEPLOYMENT.md) — Enlace entre local y producción.
- [README del backend](../backend/README.md) — Estructura del proyecto Django y apps.
- [Plan de arquitectura](../plan%20de%20arquitectura.md) — Visión general del sistema.
