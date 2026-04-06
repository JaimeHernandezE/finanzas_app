# CLAUDE.md — Finanzas App

This file guides AI assistants working in this repository. Read it fully before making any changes.

---

## Project Overview

**Finanzas App** is a personal and family finance management application. It is in early development with a working Django REST API backend and a planned React Native (Expo) frontend.

**Core stack:**
- Backend: Python 3.11, Django 4.2 (LTS), Django REST Framework 3.14+
- Authentication: Firebase Admin SDK + SimpleJWT
- Database: PostgreSQL 15 (Docker-managed locally)
- Frontend: React Native with Expo (planned, not yet implemented)
- Containerization: Docker + Docker Compose

**Domain language is Spanish.** Model names, field names, URL paths, and comments are in Spanish (e.g., `Usuario`, `Movimiento`, `firebase_uid`).

---

## Repository Structure

```
finanzas_app/
├── backend/                    # Django project root
│   ├── core/                   # Project-level Django configuration
│   │   ├── settings.py         # All settings — reads from environment variables
│   │   └── urls.py             # Root URL configuration
│   ├── applications/           # Django apps (one per domain area)
│   │   ├── usuarios/           # Auth & multitenancy
│   │   │   ├── models.py       # Familia, Usuario (AbstractUser + firebase_uid + rol)
│   │   │   ├── views.py        # Firebase login → JWT response
│   │   │   ├── urls.py         # /api/usuarios/auth/firebase/
│   │   │   ├── admin.py
│   │   │   └── migrations/
│   │   ├── finanzas/           # Core transactional & financial engine
│   │   │   ├── models.py       # Categoria, MetodoPago, Tarjeta, CuentaPersonal,
│   │   │   │                   # Movimiento, Cuota, Presupuesto, IngresoComun
│   │   │   ├── admin.py
│   │   │   ├── urls.py         # /api/finanzas/
│   │   │   └── migrations/
│   │   ├── inversiones/        # Investment tracking
│   │   │   ├── models.py       # Fondo, Aporte, RegistroValor
│   │   │   ├── admin.py
│   │   │   ├── urls.py         # /api/inversiones/
│   │   │   └── migrations/
│   │   └── viajes/             # Trip budgeting
│   │       ├── models.py       # Viaje, PresupuestoViaje
│   │       ├── admin.py
│   │       ├── urls.py         # /api/viajes/
│   │       └── migrations/
│   ├── requirements.txt
│   ├── Dockerfile
│   └── docker-compose.yml
├── frontend/                   # React Native / Expo (placeholder only)
│   └── .gitkeep
├── docs/                       # Project documentation
│   ├── README.md
│   ├── DEPLOYMENT.md            # Índice despliegue
│   ├── DEPLOYMENT-LOCAL.md     # Docker local
│   ├── DEPLOYMENT-PRODUCTION.md
│   └── backend/README.md
├── .cursor/rules/              # Cursor IDE rules (see Migration rules section)
└── README.md
```

---

## Django App Architecture

New Django apps go inside `backend/applications/`. Each app follows standard Django layout:

```
applications/<app_name>/
├── __init__.py
├── apps.py
├── models.py
├── views.py
├── urls.py
├── admin.py
└── migrations/
```

**Active apps and their models:**

| App | Models | URL prefix |
|---|---|---|
| `usuarios` | `Familia`, `Usuario` | `/api/usuarios/` |
| `finanzas` | `Categoria`, `MetodoPago`, `Tarjeta`, `CuentaPersonal`, `Movimiento`, `Cuota`, `Presupuesto`, `IngresoComun` | `/api/finanzas/` |
| `inversiones` | `Fondo`, `Aporte`, `RegistroValor` | `/api/inversiones/` |
| `viajes` | `Viaje`, `PresupuestoViaje` | `/api/viajes/` |

**Cross-app references:** Use `'app_name.ModelName'` string notation for ForeignKeys that cross app boundaries (e.g., `'usuarios.Familia'`, `'viajes.Viaje'`, `'finanzas.Categoria'`). Use `settings.AUTH_USER_MODEL` instead of a direct string for User FKs.

After creating a new app, register it in `INSTALLED_APPS` in `core/settings.py` and include its URLs in `core/urls.py`.

---

## Running the Backend

All backend development uses Docker Compose. From the `backend/` directory:

```bash
# Build and start
docker-compose up -d --build

# Stop (keeps volumes)
docker-compose stop

# Remove containers (keeps volumes)
docker-compose down

# Remove containers AND database volume (destructive)
docker-compose down -v

# View logs
docker-compose logs -f web
docker-compose logs -f db

# Django management commands
docker-compose exec web python manage.py check
docker-compose exec web python manage.py createsuperuser

# Open a shell inside the container
docker-compose exec web bash
```

**URLs when running:**
- API: `http://localhost:8000`
- Django Admin: `http://localhost:8000/admin/`

---

## Database Migrations — CRITICAL RULE

> **Never run `makemigrations` or `migrate` automatically.**
> The user must execute all migration commands manually.

This rule is enforced via `.cursor/rules/django-migrations.mdc`. When you modify models, always:
1. Tell the user what migration command to run
2. Never run it yourself

```bash
# Commands the USER runs manually:
docker-compose exec web python manage.py makemigrations
docker-compose exec web python manage.py migrate
```

---

## Authentication Flow

1. Client obtains a Firebase ID token from the Firebase SDK.
2. Client POSTs `{"firebase_token": "<id_token>"}` to `/api/usuarios/auth/firebase/`.
3. The view verifies the token with Firebase Admin, fetches or creates the local `Usuario`.
4. Response returns `{"access": "...", "refresh": "...", "usuario": {...}, "nuevo_registro": bool}`.

**Development shortcut:** Firebase verification is currently mocked in `applications/usuarios/views.py` — look for `# TODO: reemplazar con firebase_admin` comments. Do not remove the mock until Firebase credentials are provided.

---

## Settings & Environment Variables

Settings are in `core/settings.py` and read from environment at runtime:

| Variable | Default | Description |
|---|---|---|
| `DJANGO_SECRET_KEY` | `"dev-secret-key"` | Django secret key |
| `DEBUG` | `True` | Enable debug mode |
| `DB_NAME` | `"finanzas_db"` | PostgreSQL database name |
| `DB_USER` | `"finanzas_user"` | PostgreSQL user |
| `DB_PASSWORD` | `"password123"` | PostgreSQL password |
| `DB_HOST` | `"db"` | PostgreSQL host (Docker service name) |
| `DB_PORT` | `"5432"` | PostgreSQL port |

In development these are set inside `docker-compose.yml`. Never hardcode secrets in application code.

**Locale/Timezone:**
- `LANGUAGE_CODE = "es-cl"` (Chilean Spanish)
- `TIME_ZONE = "America/Santiago"`

---

## API Conventions

- All endpoints are prefixed with `/api/`.
- Use `APIView` from DRF for class-based views.
- Return standard HTTP status codes (`status.HTTP_200_OK`, `status.HTTP_400_BAD_REQUEST`, etc.) from `rest_framework`.
- Authentication: JWT tokens sent as `Authorization: Bearer <access_token>`.
- Response payloads use camelCase keys only if already established; otherwise keep snake_case to match Django/Python conventions.

---

## Naming Conventions

| Context | Convention | Examples |
|---|---|---|
| Python classes | PascalCase | `Usuario`, `Movimiento`, `MetodoPago` |
| Python variables/functions | snake_case | `firebase_uid`, `get_or_create` |
| URL paths | kebab-case or snake_case | `/api/usuarios/auth/firebase/` |
| Django app names | lowercase | `usuarios`, `finanzas`, `viajes` |
| Language | Spanish | All domain terms, comments, model/field names |

---

## Testing

No tests are implemented yet. When adding tests:
- Place them in `tests/` inside each Django app.
- Use Django's `TestCase` or DRF's `APITestCase`.
- Run with: `docker-compose exec web python manage.py test`

---

## Frontend (Planned)

The `frontend/` directory is a placeholder. When implemented:
- Framework: React Native with Expo
- Language: TypeScript
- State: Context API or Zustand
- Navigation: React Navigation

Do not create any frontend files until the user explicitly requests it.

---

## Documentation

Project docs live in `docs/`:
- `docs/README.md` — Documentation index
- `docs/DEPLOYMENT.md` — Deployment index (links local + production)
- `docs/DEPLOYMENT-LOCAL.md` — Docker Compose local development
- `docs/DEPLOYMENT-PRODUCTION.md` — Production deployment (e.g. Render)
- `docs/backend/README.md` — Backend structure and commands

Keep documentation in sync with code changes. Document new apps, endpoints, and models in `docs/backend/README.md`.

---

## Git Workflow

- Active development branch: `claude/add-claude-documentation-ak7fa`
- Main branch: `main` (remote) / `master` (local)
- Write clear, descriptive commit messages in English.
- Do not push to `main` or `master` directly.
