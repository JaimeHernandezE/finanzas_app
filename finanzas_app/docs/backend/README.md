# Documentación — Backend

Backend de Finanzas App: Django 4.x, Django REST Framework, PostgreSQL. Se ejecuta en Docker (ver despliegue en la raíz de docs).

## Estructura

```
backend/
├── core/                 # Configuración Django (settings, urls, wsgi)
├── applications/         # Apps del dominio
│   └── usuarios/        # Autenticación (Usuario, Firebase → JWT)
├── tests/               # Tests pytest (conftest, test_categorias, test_metodos_pago, test_tarjetas)
├── pytest.ini            # Configuración pytest (DJANGO_SETTINGS_MODULE, patrones)
├── manage.py
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
└── .dockerignore, .gitignore
```

## Documentación del backend

| Tema | Dónde |
|------|--------|
| **Despliegue y Docker** | [docs/DEPLOYMENT.md](../DEPLOYMENT.md) |
| **Migraciones** | El usuario ejecuta siempre `makemigrations` y `migrate` manualmente (regla en `.cursor/rules/django-migrations.mdc`). |
| **Apps y modelos** | Ver [plan de arquitectura](../../plan%20de%20arquitectura.md) y código en `applications/*/models.py`. |
| **Pruebas (pytest)** | [TESTING.md](TESTING.md) |

## Comandos útiles (dentro del contenedor)

Desde `backend/`:

```bash
docker-compose exec web python manage.py <comando>
```

Ejemplos: `check`, `makemigrations`, `migrate`, `createsuperuser`, `runserver` (ya usado por defecto en el `command` del servicio).

Más comandos y contexto: [docs/DEPLOYMENT.md — Comandos rápidos](../DEPLOYMENT.md#comandos-rápidos--docker-compose).

## API — Cuentas personales

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/finanzas/cuentas-personales/` | Cuentas propias + tuteladas del usuario (Firebase Bearer). |
| POST | `/api/finanzas/cuentas-personales/` | Crea cuenta propia (`nombre`, `descripcion`, `visible_familia`). |
| GET/PATCH/DELETE | `/api/finanzas/cuentas-personales/<id>/` | Detalle; editar/eliminar solo si eres dueño. |
| GET | `/api/finanzas/cuotas/deuda-pendiente/` | Suma del gasto personal en TC del usuario autenticado para el mes actual, hasta el `dia_facturacion` de cada tarjeta → `{ total }`. |
| GET | `/api/finanzas/presupuesto-mes/` | Query: `mes`, `anio`, `ambito` = `FAMILIAR` o `PERSONAL`. |
| POST | `/api/finanzas/presupuestos/` | Body: `categoria`, `mes` (YYYY-MM-01), `monto`, `ambito`. |
| PATCH/DELETE | `/api/finanzas/presupuestos/<id>/` | Actualizar monto o borrar presupuesto. |

## API — Usuarios / familia (Bearer Firebase)

Todas las rutas bajo `/api/usuarios/…` con header `Authorization: Bearer <token Firebase>`.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/usuarios/familia/miembros/` | Lista miembros de la familia del usuario autenticado. |
| PATCH | `/api/usuarios/familia/miembros/<id>/rol/` | Body `{ "rol": "ADMIN" \| "MIEMBRO" \| "LECTURA" }`. Solo **ADMIN**; no puede dejar la familia sin administrador. |
| GET | `/api/usuarios/familia/invitaciones/` | Invitaciones pendientes (email registrado, aún no se ha unido). |
| POST | `/api/usuarios/familia/invitaciones/` | Body `{ "email": "..." }`. Solo **ADMIN**. |
| DELETE | `/api/usuarios/familia/invitaciones/<id>/` | Revocar invitación. Solo **ADMIN**. |

**Registro (`POST /api/usuarios/registro/`):** si ya existen usuarios en el sistema, un correo nuevo solo puede registrarse si hay una **invitación pendiente** para ese email (creada desde Miembros). El primer usuario de la base sigue creando la familia como ADMIN.

**Modelo:** `InvitacionPendiente` (familia + email + invitador). Las categorías **globales** solo admiten cambio de `nombre` en `PUT /api/finanzas/categorias/<id>/`.

## Ingresos comunes y cuenta «Personal»

- Al **crear un usuario** (registro o invitación), se crea automáticamente una `CuentaPersonal` con nombre **«Personal»** (efectivo / vista personal por defecto).
- Cada **`IngresoComun`** guardado genera o actualiza un **`Movimiento`** de tipo **INGRESO**, ámbito **PERSONAL**, método de pago **EFECTIVO**, en esa cuenta; `comentario` = `origen`; `fecha` = primer día del mes (`mes`). La categoría global del sistema **«Ingreso declarado (fondo común)»** se crea si no existe.
- Al **eliminar** un `IngresoComun`, se elimina el movimiento vinculado.

## API — Movimientos e ingreso común (vínculo)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/finanzas/movimientos/` | Lista incluye `ingreso_comun` (id o `null`) por fila. |
| GET | `/api/finanzas/movimientos/<id>/` | Detalle con `ingreso_comun` si aplica. |
| PUT/PATCH | `/api/finanzas/movimientos/<id>/` | Edición solo del **autor**. Si `ingreso_comun` ≠ null: solo **`fecha`**, **`monto`** y **`comentario`**; esos cambios actualizan el **`IngresoComun`** (`mes`, `monto`, `origen`). No se puede cambiar tipo, ámbito, categoría, método, cuenta, etc. |
| DELETE | `/api/finanzas/movimientos/<id>/` | No permitido si el movimiento está vinculado a un ingreso común (borrar/editar vía **Ingresos comunes**). |

**Ingresos comunes:** `GET/POST /api/finanzas/ingresos-comunes/`, `PUT/PATCH/DELETE /api/finanzas/ingresos-comunes/<id>/`. Las respuestas incluyen `movimiento` (id del movimiento generado). Editar el ingreso sigue sincronizando el movimiento.
