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

## Inicio rápido (backend)

Desde la raíz del repo:

```bash
cd backend
docker-compose up -d --build
```

API en **http://localhost:8000**. Comandos útiles: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#comandos-rápidos-docker-compose).

## Referencias

- [Plan de arquitectura](plan%20de%20arquitectura.md)
- [Despliegue y Docker](docs/DEPLOYMENT.md)
