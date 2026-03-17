# Documentación — Finanzas App

Índice de la documentación del proyecto y convención de dónde documentar cada cosa.

## Convención: documentar por capa

| Dónde | Qué documentar |
|-------|-----------------|
| **`docs/`** (raíz) | Despliegue, variables de entorno globales, arquitectura compartida, comandos Docker que afectan a todo el monorepo. |
| **`docs/backend/`** | API Django/DRF, modelos, apps, configuración del backend, comandos `manage.py`, migraciones, pruebas del backend. |
| **`docs/frontend/`** | App React Native/Expo, pantallas, servicios API, build, emulador, pruebas del frontend. |

Regla práctica:

- Si solo afecta al **backend** (Django, DB, Docker del backend) → `docs/backend/`.
- Si solo afecta al **frontend** (pantallas, estado, llamadas al API) → `docs/frontend/`.
- Si afecta a **cómo se levanta/despliega el sistema** o a **ambos** (env, URLs, auth) → `docs/`.

## Índice de documentos

| Documento | Descripción |
|-----------|-------------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Despliegue del backend con Docker y comandos rápidos de docker-compose. |
| [backend/README.md](backend/README.md) | Resumen del backend, estructura de apps y enlaces al resto de docs del backend. |
| [backend/TESTING.md](backend/TESTING.md) | Pruebas del backend (pytest): fixtures, tests de catálogos, comandos y cobertura. |

*(Se irán añadiendo aquí `docs/frontend/README.md` y más archivos según avance el proyecto.)*
