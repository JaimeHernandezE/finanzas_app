# Despliegue y Docker — Backend

Este documento describe cómo desplegar y operar el backend (Django + PostgreSQL) con Docker Compose. Es la referencia para entornos locales y, con las variaciones indicadas, para un servidor.

## Requisitos

- [Docker](https://docs.docker.com/get-docker/) y [Docker Compose](https://docs.docker.com/compose/install/) (o Docker con Compose V2).
- Ningún otro proceso usando el puerto **5432** (PostgreSQL) ni **8000** (Django) en local.

## Servicios

| Servicio | Imagen / build | Puerto | Descripción |
|----------|----------------|--------|-------------|
| **db** | `postgres:15-alpine` | 5432 | Base de datos PostgreSQL. Volumen persistente `postgres_data`. |
| **web** | Build desde `backend/Dockerfile` | 8000 | Django + DRF. Origen: `backend/`. |

Variables de entorno del servicio **web** (por defecto en `docker-compose.yml`):

- `DB_HOST=db`
- `DB_NAME=finanzas_db`
- `DB_USER=admin`
- `DB_PASSWORD=password123`

Para entornos no locales, usar variables de entorno o un archivo `.env` (no versionado) y no dejar credenciales por defecto en el repositorio.

## Comandos rápidos — Docker Compose

Ejecutar **siempre desde la carpeta `backend/`** (donde está el `docker-compose.yml`):

```bash
cd backend
```

### Levantar y construir

```bash
# Construir imágenes y levantar en segundo plano
docker-compose up -d --build

# Levantar y ver logs en la misma terminal
docker-compose up --build
```

### Parar y bajar

```bash
# Parar contenedores
docker-compose stop

# Parar y eliminar contenedores (los volúmenes, p. ej. postgres_data, se mantienen)
docker-compose down

# Parar, eliminar contenedores y volúmenes (¡borra la base de datos!)
docker-compose down -v
```

### Logs

```bash
# Logs de todos los servicios
docker-compose logs -f

# Solo el servicio web (Django)
docker-compose logs -f web

# Solo el servicio db
docker-compose logs -f db
```

### Ejecutar comandos dentro del contenedor Django

```bash
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

### Reconstruir solo el servicio web (tras cambiar código o Dockerfile)

```bash
docker-compose up -d --build web
```

### Ver estado de los servicios

```bash
docker-compose ps
```

## Flujo de despliegue local típico

1. **Primera vez** (desde `finanzas_app/backend/`):

   ```bash
   docker-compose up -d --build
   docker-compose exec web python manage.py makemigrations
   docker-compose exec web python manage.py migrate
   ```

2. **Día a día**: `docker-compose up -d` (o `docker-compose up` si quieres ver logs).
3. **Tras cambiar modelos**: ejecutar tú mismo `makemigrations` y `migrate` (ver regla en `.cursor/rules/django-migrations.mdc`).
4. **Tras cambiar `requirements.txt` o Dockerfile**: `docker-compose up -d --build web`.

## URLs útiles (local)

- API base: **http://localhost:8000**
- Admin Django: **http://localhost:8000/admin/**
- Login con Firebase (POST): **http://localhost:8000/api/usuarios/auth/firebase/**

## Documentación relacionada

- [README del backend](../backend/README.md) — Estructura del proyecto Django y apps.
- [Plan de arquitectura](../plan%20de%20arquitectura.md) — Visión general del sistema.
