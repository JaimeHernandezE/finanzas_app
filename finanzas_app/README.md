# Finanzas App

Aplicación para gestión de finanzas personales y familiares. Backend Django/DRF, frontend React Native (previsto), PostgreSQL, autenticación Firebase + JWT.

## Estructura del proyecto

```
finanzas_app/
├── backend/          # Django + DRF (Docker)
├── frontend/          # React Native / Expo (previsto)
├── docs/              # Documentación del proyecto
├── .cursor/           # Reglas de Cursor
└── plan de arquitectura.md
```

- **Backend**: API REST, modelos de datos, lógica de liquidaciones e inversiones. Ver [docs/backend/](docs/backend/).
- **Frontend**: App móvil (Expo/React Native). Ver [docs/frontend/](docs/frontend/) cuando exista.

## Documentación

Seguimos una documentación separada por capa:

| Capa      | Ubicación        | Contenido |
|----------|------------------|-----------|
| General  | `docs/`          | Despliegue, convenciones, arquitectura compartida |
| Backend  | `docs/backend/`  | API, modelos, entorno Docker, comandos Django |
| Frontend | `docs/frontend/` | App, navegación, servicios, build |

- Cada capa tiene su propio `README.md` con resumen y enlaces al resto de docs.
- Los temas transversales (despliegue, variables de entorno, auth) viven en `docs/` y se referencian desde backend y frontend.

Índice completo: **[docs/README.md](docs/README.md)**.

### Despliegue (local vs producción)

| Documento | Cuándo usarlo |
|-----------|----------------|
| **[docs/DEPLOYMENT-LOCAL.md](docs/DEPLOYMENT-LOCAL.md)** | Levantar backend + PostgreSQL + frontend web con Docker en tu máquina: comandos, puertos, migraciones y URLs de desarrollo. |
| **[docs/DEPLOYMENT-PRODUCTION.md](docs/DEPLOYMENT-PRODUCTION.md)** | Publicar API y web en la nube (guía Render actual); variables de entorno, Firebase y roadmap de guías (Google Cloud, Supabase, Expo). |

Índice que enlaza ambos: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Inicio rápido (backend)

Desde la raíz del repo:

```bash
cd backend
docker-compose up -d --build
```

API en **http://localhost:8000**. Comandos útiles: [docs/DEPLOYMENT-LOCAL.md — Comandos rápidos](docs/DEPLOYMENT-LOCAL.md#comandos-rápidos--docker-compose).

## Referencias

- [Plan de arquitectura](plan%20de%20arquitectura.md)
- [Despliegue — índice](docs/DEPLOYMENT.md) · [Local (Docker)](docs/DEPLOYMENT-LOCAL.md) · [Producción](docs/DEPLOYMENT-PRODUCTION.md)
