# Documentación — Backend

Backend de Finanzas App: Django 4.x, Django REST Framework, PostgreSQL. Se ejecuta en Docker (ver despliegue en la raíz de docs).

## Estructura

```
backend/
├── core/                 # Configuración Django (settings, urls, wsgi)
├── applications/         # Apps del dominio
│   └── finanzas/
│       ├── services/     # Cálculos por pantalla (p. ej. dashboard); ver `services_recalculo.py` para snapshots
│       └── …
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
| **Despliegue local (Docker)** | [docs/DEPLOYMENT-LOCAL.md](../DEPLOYMENT-LOCAL.md) |
| **Despliegue producción** | [docs/DEPLOYMENT-PRODUCTION.md](../DEPLOYMENT-PRODUCTION.md) |
| **Índice despliegue** | [docs/DEPLOYMENT.md](../DEPLOYMENT.md) |
| **Migraciones** | El usuario ejecuta siempre `makemigrations` y `migrate` manualmente (regla en `.cursor/rules/django-migrations.mdc`). |
| **Apps y modelos** | Ver [plan de arquitectura](../../plan%20de%20arquitectura.md) y código en `applications/*/models.py`. |
| **Pruebas (pytest)** | [TESTING.md](TESTING.md) |

## Comandos útiles (dentro del contenedor)

Desde `backend/`:

```bash
docker-compose exec web python manage.py <comando>
```

Ejemplos: `check`, `makemigrations`, `migrate`, `createsuperuser`, `runserver` (ya usado por defecto en el `command` del servicio).

Más comandos y contexto: [docs/DEPLOYMENT-LOCAL.md — Comandos rápidos](../DEPLOYMENT-LOCAL.md#comandos-rápidos--docker-compose).

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

### Dashboard — resumen agregado

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/finanzas/dashboard-resumen/?mes=<1-12>&anio=<aaaa>` | Resumen para la pantalla dashboard: bloque `efectivo` (mismo contenido que `efectivo-disponible`, siempre mes calendario **actual** del servidor), `compensacion` (mismo shape que `compensacion-proyectada` para el **mes/anio** pedido o `null`), `sueldos_prorrateo_montos`, `prorrateo`, `ingresos_mes_actual`, `sueldo_proyectado`, `presupuesto` (total común comprometido + personales), `efectivo_hasta_mes_anterior`, `presupuesto_comun_prorrateado`, `total_presupuestos_personales`, `saldo_proyectado`, `desglose_saldo`, `es_mes_calendario_actual`. Implementación: `applications/finanzas/services/dashboard.py`. |

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

## Mapa técnico de modelos `finanzas`

Relación de cada modelo con su responsabilidad y su integración con:

- `applications/finanzas/signals.py`
- `applications/finanzas/services_recalculo.py`
- `applications/finanzas/management/commands/*`

| Modelo | Responsabilidad | Signals | Services | Commands |
|---|---|---|---|---|
| `Categoria` | Clasificación de movimientos; define si un egreso es inversión (`es_inversion`) para excluirlo de gasto corriente/prorrateo. | Se usa para crear/obtener la categoría global **Ingreso declarado (fondo común)** al sincronizar `IngresoComun` ↔ `Movimiento`. | Se usa indirectamente por filtros `categoria__es_inversion` en cálculos de netos y liquidación. | `seed_categorias`, `seed_demo`, `importar_movimientos_csv`. |
| `MetodoPago` | Catálogo de tipo de pago (`EFECTIVO`, `DEBITO`, `CREDITO`). | Determina disparo de creación de cuotas (`generar_cuotas` cuando es crédito). | Excluye crédito de cálculos de efectivo/liquidación donde corresponde. | `seed_demo`/`seed_demo_minimal`, `importar_movimientos_csv`. |
| `Tarjeta` | Tarjeta de crédito con ciclo (`dia_facturacion`, `dia_vencimiento`). | `generar_cuotas` usa `dia_facturacion` para calcular `mes_facturacion` de la primera cuota. | `reparar_cuotas_credito_familia` recalcula plan esperado por ciclo. | `seed_demo`, `importar_movimientos_csv`. |
| `CuentaPersonal` | Agrupador lógico de finanzas personales por usuario. | Creación automática de cuenta `Personal` al crear usuario; aseguramiento de cuenta para espejo de `IngresoComun`. | Base del desglose de snapshots por cuenta y resumenes mensuales por cuenta. | `seed_demo`, `importar_movimientos_csv`. |
| `TutorCuenta` | Tutorías entre usuarios y cuentas personales. | Sin signal propio en `finanzas/signals.py`. | Sin uso directo en `services_recalculo.py`. | `seed_demo` (limpieza en reset demo). |
| `Movimiento` | Transacción central del sistema (ingreso/egreso, personal/común, método de pago, viaje). | Invalida resumen histórico, genera cuotas en crédito y dispara recálculos de snapshots al guardar/borrar. | Fuente principal para saldos, liquidación, resumen histórico y efectivo disponible. | `importar_movimientos_csv`, `seed_demo`, `seed_demo_if_empty`, `recalculo_mensual_admin_tz`. |
| `Cuota` | Cuota individual de movimiento en crédito (`mes_facturacion`, `estado`, `incluir`). | Creación automática por `post_save` de `Movimiento`. | Reparación y reconciliación de cuotas (`reparar_cuotas_credito_familia`) preservando pagadas. | `recalculo_mensual_admin_tz` (vía service), `seed_demo` (limpieza). |
| `Presupuesto` | Meta mensual por categoría (familiar/personal). | Sin signal propio. | No participa directo en snapshots de `services_recalculo.py` actuales. | `rollover_presupuestos_mensuales`, `seed_demo`. |
| `IngresoComun` | Ingreso declarado al fondo común (base del prorrateo). | Sincroniza y mantiene `Movimiento` espejo; invalida resumen y dispara recálculo; borra movimiento vinculado al eliminarse. | Base de liquidación común, resumen histórico y efectivo disponible. | `seed_demo`, `recalculo_mensual_admin_tz`. |
| `SaldoMensualSnapshot` | Cache mensual por usuario/cuenta con ingresos, egresos y efectivo neto (sin crédito). | Se actualiza por dispatch de recálculo tras cambios en `Movimiento`/`IngresoComun`. | `recalcular_mes_saldos_personales_*`, `saldo_efectivo_cuentas_desde_snapshot`. | `recalculo_mensual_admin_tz`, `seed_demo`. |
| `LiquidacionComunMensualSnapshot` | Cache agregado mensual para liquidación común por usuario/tipo de línea. | Se actualiza por dispatch de recálculo. | `recalcular_mes_liquidacion_comun`, `liquidacion_datos_desde_snapshot_o_query`. | `recalculo_mensual_admin_tz`, `seed_demo`. |
| `ResumenHistoricoMesSnapshot` | Payload persistido del resumen familiar mensual (prorrateo, compensación y transferencias). | Invalidación puntual ante cambios en `Movimiento` común e `IngresoComun`. | `calcular_resumen_mes`, `resumen_historico_familia`, `backfill_resumen_historico_snapshots`. | `backfill_resumen_historico`, `recalculo_mensual_admin_tz`, `seed_demo`. |
| `SueldoEstimadoProrrateoMensual` | Base editable de sueldos para compensación proyectada por mes. | Sin signal propio. | Consumido por vistas de proyección (no por snapshots de recálculo actuales). | `seed_demo` (limpieza al reset demo). |

## Commands operativos (finanzas)

Ejecutar dentro de `backend/`:

```bash
docker-compose exec web python manage.py <comando>
```

- `importar_movimientos_csv <archivo> --usuario-id=<id> [--familia-id=<id>] [--dry-run]`
- `rollover_presupuestos_mensuales [--mes YYYY-MM-01] [--familia-id=<id>] [--dry-run]`
- `backfill_resumen_historico [--familia-id <id>]`
- `recalculo_mensual_admin_tz [--admin-id <id>] [--force]` — tareas de inicio de mes (día 1, hora local admin entre 02:00 y 03:59): rollover de presupuestos, recálculo de snapshots y reparación de cuotas crédito.
- `seed_demo`, `seed_demo_minimal`, `ensure_demo_seed`, `seed_demo_if_empty`
