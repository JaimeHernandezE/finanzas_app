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

**Registro (`POST /api/usuarios/registro/`):** todo correo nuevo debe tener una **`InvitacionAcceso`** creada en **Django Admin** (`/admin/` → Usuarios → Invitaciones de acceso). Sin ella, el registro devuelve `403`. Al consumirse la invitación se crea el usuario y su espacio personal; **no** se une automáticamente a ninguna familia. Si la instancia aún no tiene ninguna `Familia`, el primer usuario invitado queda como **ADMIN** con espacio familiar bootstrap.

**Invitaciones familiares** (`InvitacionPendiente`): gestionadas desde la app (Configuración → Miembros) por un **ADMIN** del espacio familiar. El invitado, ya registrado, las acepta en **Invitaciones recibidas**; son independientes del acceso a la instancia.

**Modelos:** `InvitacionAcceso` (email autorizado para registrarse) · `InvitacionPendiente` (email invitado a un espacio familiar). Las categorías **globales** solo admiten cambio de `nombre` en `PUT /api/finanzas/categorias/<id>/`.

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

## App `espacios` (multitenant, Fases 1–3)

Base del plan multitenant (`docs/PLAN-MULTITENANT-Y-ENTORNO-A-B.md`). Estado: esquema en transición — los modelos tenant (`Categoria`, `Movimiento`, `Presupuesto`, `IngresoComun`, snapshots, `Fondo`, `Viaje`) tienen FK `espacio` **nullable** junto a `familia`; las vistas siguen filtrando por familia hasta el cutover.

**Cutover por app (Fase 3→4):**

- `viajes` e `inversiones` operan por espacio activo: lecturas con `Model.tenant.en_espacio(espacio)`, escrituras con dual-write (`espacio` + `familia`). Escrituras bloqueadas en espacios PERSONAL (hasta habilitar la operación personal) y en espacios archivados (solo lectura).
- `finanzas` opera por espacio vía `_contexto_espacio(request)` (en `finanzas/views.py`): resuelve el espacio activo y deriva la familia legacy **desde el espacio** con un override en memoria de `usuario.familia`, de modo que los ~140 filtros `familia=` del módulo quedan scoped al tenant sin reescribirlos uno a uno. En espacio PERSONAL las lecturas se comportan como usuario sin familia (listas vacías / catálogo global) y las escrituras responden 400; espacios archivados → 403 en escrituras. El shim exige que ninguna vista del módulo persista `usuario` (verificado; mantener esa invariante).
- **Resolución sin header `X-Espacio-Id`**: espacio FAMILIAR activo del usuario si tiene membresía, sino el personal. Esto mantiene compatibles los clientes móviles/web ya desplegados que no envían el header. Header inválido o ajeno → 403, nunca fallback.
- **Dual-write** (`pre_save`): toda fila tenant nueva con `familia` recibe su espacio espejo automáticamente, sin importar qué vista o servicio la cree.

**Transición Fase 3 (convivencia de esquemas):**

- `Espacio.familia_origen` vincula cada espacio FAMILIAR con su `Familia` legacy.
- Señales espejan en caliente: crear `Familia` → espacio espejo; `Usuario.familia/rol/activo` → `PertenenciaEspacio` (salir de familia desactiva la pertenencia; el espacio persiste como registro histórico).
- `python manage.py backfill_espacios` — idempotente: espacios personales para usuarios existentes, espejos por familia, pertenencias y llenado de FK `espacio` donde esté NULL (nunca pisa un espacio asignado). `seed_demo` lo invoca al final.
- `python manage.py validar_espacios` — conteos por tenant; exit code ≠ 0 si hay filas sin espacio o desalineadas. **Correr backfill + validar antes del cutover.**

| Pieza | Responsabilidad |
|---|---|
| `Espacio` | Tenant: `tipo PERSONAL\|FAMILIAR`, `modo_reparto` (`PROPORCIONAL`/`PARTES_IGUALES`/`SIN_REPARTO`, solo FAMILIAR), `activo`, `archivado` (familias disueltas quedan como registro histórico de solo lectura). |
| `PertenenciaEspacio` | Membresía usuario↔espacio con `rol` (`ADMIN`/`MIEMBRO`) y `activo`. Única por `(usuario, espacio)`. |
| `ConfiguracionRespaldoUsuario` | Destinos de respaldo por usuario (`drive_folder_id`, `sheet_id`). OAuth Drive por usuario: refresh token cifrado, email y `drive_connected`. |
| `TenantModel` (abstracto) | Base para modelos con datos de tenant: FK `espacio` (PROTECT) y manager que **lanza `TenantScopeError`** ante cualquier acceso sin `.en_espacio(espacio)`; `.sin_aislamiento()` solo para commands de operación. |
| `services.crear_espacio_personal(usuario)` | Idempotente; garantiza el espacio personal (usuario como ADMIN). La señal `post_save` de `Usuario` lo invoca para todo usuario nuevo. |
| `contexto.resolver_espacio_activo(request, usuario)` | Resuelve `X-Espacio-Id`: sin header → espacio personal; header inválido → 400; sin membresía activa → 403 (nunca fallback silencioso). |
| `contexto.usuario_y_espacio(request)` | Punto de entrada único para vistas multitenant: autentica + resuelve espacio en un paso → `(usuario, espacio, err)`. |

Endpoints (`/api/espacios/`, Bearer Firebase o JWT demo):

| Método y ruta | Qué hace |
|---|---|
| `GET /api/espacios/mios/` | Espacios del usuario (para el selector): id, nombre, tipo, `modo_reparto`, rol. |
| `GET /api/espacios/activo/` | Espacio activo resuelto para el request (header `X-Espacio-Id` o personal). |
| `PATCH /api/espacios/<id>/` | Actualiza `nombre` y/o `modo_reparto` (solo ADMIN del espacio; `modo_reparto` solo FAMILIAR no archivado; bloqueado en demo). |
| `GET /api/espacios/drive/status/` | Estado de conexión Drive (`connected`, `email`, `folder_id`, `sheet_id`). |
| `POST /api/espacios/drive/connect/` | Inicia OAuth (`auth_url` → `https://accounts.google.com/o/oauth2/v2/auth`). Requiere `GOOGLE_DRIVE_OAUTH_CLIENT_ID` y `…_CLIENT_SECRET` en el backend. |
| `GET /api/espacios/drive/callback/` | Callback OAuth (registrar esta URI en Google Cloud). |
| `POST /api/espacios/drive/disconnect/` | Revoca token y desconecta Drive. |
| `PATCH /api/espacios/drive/config/` | Actualiza `folder_id` / `sheet_id` del usuario (solo con Drive conectado). |
| `POST /api/espacios/<id>/backup-drive/` | Exporta solo el espacio del usuario a su Drive (no toda la BD). |

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
| `Presupuesto` | Meta mensual por categoría (familiar/personal). | `post_save` evalúa umbrales y crea `NotificacionUsuario` (`services_presupuesto_alertas.py`). | Cálculo de avance en `services/presupuesto_mes.py`; alertas en `services_presupuesto_alertas.py`. | `rollover_presupuestos_mensuales`, `seed_demo`. |
| `NotificacionUsuario` | Notificaciones in-app (`CAMBIO_COMPENSACION`, `PRESUPUESTO_UMBRAL`). | Creadas por compensación y alertas de presupuesto. | `services_compensacion_cambios.py`, `services_presupuesto_alertas.py`. | — |
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
- `recalculo_mensual_admin_tz [--admin-id <id>]` — tareas de inicio de mes: rollover de presupuestos; recálculo acotado al **mes anterior y mes actual** (liquidación + saldos); actualiza solo el snapshot de resumen del **último mes cerrado**; repara cuotas crédito. Para reparar **toda** la historia usar el endpoint `POST` de recálculo histórico o `backfill_resumen_historico`.
- `seed_demo`, `seed_demo_minimal`, `ensure_demo_seed`, `seed_demo_if_empty`

## Alertas de presupuesto (notificaciones in-app)

Cuando un egreso (o una cuota de crédito del mes) hace que el gasto de una categoría con presupuesto alcance el umbral del usuario, se crea una `NotificacionUsuario` de tipo `PRESUPUESTO_UMBRAL`.

**Preferencias por usuario** (`Usuario`):

| Campo | Default | Descripción |
|-------|---------|-------------|
| `notif_presupuesto_activa` | `True` | Activa/desactiva alertas de presupuesto. |
| `notif_presupuesto_umbral_pct` | `80` | Porcentaje 50–100; también se notifica al **100%** si el umbral es menor. |

Expuestas en `GET/PATCH /api/usuarios/me/` junto al resto de preferencias de UI.

**Destinatarios:**

- Presupuesto **familiar** (`usuario` null en `Presupuesto`): todos los miembros activos del espacio con alertas activadas.
- Presupuesto **personal**: solo el dueño del presupuesto.

**Disparadores:** `post_save` / `post_delete` en `Movimiento` (egresos), `Cuota` y `post_save` en `Presupuesto`. Respeta `RecalculoContext.suprimir_notificaciones` en importaciones masivas.

**Tests:** `tests/test_presupuesto_alertas.py`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/finanzas/notificaciones/` | Lista notificaciones del usuario (filtro por espacio activo). |
| GET | `/api/finanzas/notificaciones/no-leidas/` | Contador de no leídas. |
| POST | `/api/finanzas/notificaciones/<id>/leida/` | Marcar una como leída. |
| POST | `/api/finanzas/notificaciones/marcar-todas-leidas/` | Marcar todas como leídas. |

## Asistente financiero (fase 2 — planificado)

Chat con consultas en lenguaje natural sobre los datos del usuario. **No implementado aún.** Diseño previsto:

1. **Capa analytics** — funciones reutilizables (`comparar_gasto_anual`, `gasto_categoria_por_mes`, `sugerir_presupuestos`) sobre los mismos querysets que `presupuesto_mes` y `resumen_historico`.
2. **Endpoint chat** — `POST /api/finanzas/asistente/consulta/` con function-calling; el LLM **nunca** ejecuta SQL directo (multitenancy y seguridad).
3. **LLM gratuito** — Ollama local en desarrollo; Groq o Gemini free tier en producción.
4. **UI** — panel de chat en web/móvil, separado de las alertas de presupuesto.

Las alertas de presupuesto de la fase 1 comparten `NotificacionUsuario` y podrían referenciarse en respuestas del asistente (“ya te avisamos el 12 jul…”).

## Sincronización automática de movimientos (fase 3 — planificado)

Registro automático de ingresos y egresos desde fuentes externas (banco, correo, archivos). **No implementado aún.** Hoy el flujo manual más cercano es `importar_movimientos_csv` y la carga desde la UI.

### Contexto: cómo lo hacen otras apps

No se configura cada banco a mano en el código de la app. En la práctica se combinan enfoques según país y madurez del producto:

| Enfoque | Descripción | Viabilidad para este proyecto |
|---------|-------------|-------------------------------|
| **Import CSV/Excel** | El usuario exporta desde el home banking y sube el archivo. | **Alta** — ya existe `importar_movimientos_csv`; falta UX (preview, mapeo por banco, dedup). |
| **Parsing de correo** | Lectura de alertas del banco (“abono”, “compra en…”) vía Gmail API o reenvío a una dirección de ingesta. Parsers por plantilla (`BCI`, `Santander`, etc.). | **Media** — pragmático en Chile/LATAM donde open finance aún no cubre todo; frágil si cambian plantillas. |
| **SMS / notificaciones** | Similar al correo: reenvío o lectura de alertas móviles. | **Media** — útil en móvil; mismas limitaciones que el correo. |
| **Agregador bancario** | Tercero (p. ej. Fintoc, Belvo, Plaid) conecta vía open banking u otros conectores; la app recibe movimientos normalizados. | **Media-alta** a largo plazo — coste de licencia, compliance y dependencia de terceros. |
| **Scraping de home banking** | Login automatizado al sitio del banco. | **No recomendado** — frágil, bloqueado por bancos, riesgo legal. |

Para **ingresos** (sueldo, transferencias) el correo suele ser más fiable que para gastos diarios con tarjeta, porque no todos los movimientos generan alerta por mail.

### Diseño previsto por etapas

1. **Corto plazo — import mejorado**
   - Endpoint/UI de subida con preview antes de persistir.
   - Mapeo de columnas por banco conocido.
   - Dedup por `(fecha, monto, comentario_normalizado, origen_ingesta)`.
   - Reutilizar `RecalculoContext.suprimir_notificaciones` en importaciones masivas.

2. **Medio plazo — ingesta por correo**
   - Conexión OAuth a Gmail/Outlook con permisos mínimos (solo lectura de remitentes/plantillas acordadas) o reenvío a `ingest@…`.
   - Cola de **movimientos sugeridos** (`MovimientoPendiente` o similar): el usuario confirma, edita categoría y aprueba antes de crear `Movimiento`.
   - Parsers por plantilla; registro de `origen_ingesta` y hash del mensaje para no duplicar.

3. **Largo plazo — agregador open finance**
   - Integración con proveedor externo si el producto escala.
   - Misma cola de confirmación al inicio; automatización total solo cuando la confianza y dedup sean altas.

### Principios de producto

- **Confirmación humana** al principio: nada escribe en `Movimiento` sin revisión explícita (evita datos fantasma y errores de parser).
- **Trazabilidad**: cada movimiento importado lleva `origen_ingesta` (csv, email, agregador) y referencia externa.
- **Multitenancy**: la ingesta siempre se asocia al `espacio` activo del usuario; sin cruces entre familias.
- **Privacidad**: no persistir cuerpos completos de correo si no hace falta; retención acotada de payloads crudos.
- **Separación de dominios**: la ingesta crea o sugiere movimientos; no altera lógica de efectivo, liquidación ni compensación sin pasar por el flujo normal de `Movimiento`.

### Relación con otras fases

- **Fase 1 (alertas):** un movimiento confirmado desde ingesta dispara las mismas señales que uno manual.
- **Fase 2 (asistente):** podría responder “¿de dónde salió este abono?” consultando `origen_ingesta` y el mensaje parseado.
