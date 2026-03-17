# Pruebas del backend (pytest)

Las pruebas automatizadas del backend usan **pytest** y **pytest-django**. Los tests viven en `backend/tests/` y no realizan llamadas reales a Firebase: la autenticación se mockea en los fixtures para poder ejecutar los tests sin credenciales ni red.

## Requisitos

Dependencias en `backend/requirements.txt`:

- `pytest`
- `pytest-django`
- `pytest-cov`
- `factory-boy`

Instalación (si hace falta):

```bash
docker-compose exec web pip install -r requirements.txt
```

## Configuración

En la raíz del backend, `pytest.ini`:

```ini
[pytest]
DJANGO_SETTINGS_MODULE = core.settings
python_files = tests/*.py tests/**/*.py
python_classes = Test*
python_functions = test_*
```

Así pytest usa la configuración Django del proyecto y descubre tests en `tests/` con la convención de nombres indicada.

## Estructura de tests

### `tests/conftest.py`

Fixtures compartidos:

- **Base de datos**: `familia`, `usuario`, `usuario_2`, `otra_familia`, `usuario_otra_familia` — crean familias y usuarios de prueba para aislar datos y probar permisos entre familias.
- **Autenticación**: `auth_header`, `auth_header_2`, `auth_header_otra_familia` — devuelven el header `HTTP_AUTHORIZATION` y activan un mock de `applications.utils.get_usuario_autenticado` para que la vista reciba el usuario del fixture sin llamar a Firebase.
- **Catálogos**: `categoria_global`, `categoria_familiar`, `categoria_personal`, `metodos_pago`, `tarjeta` — datos de ejemplo para los endpoints de categorías, métodos de pago y tarjetas.
- **Movimientos**: `metodo_efectivo`, `metodo_debito`, `metodo_credito`, `categoria_egreso`, `categoria_ingreso`, `movimiento_efectivo`, `movimiento_credito`, `movimiento_comun` — métodos de pago y categorías aislados para tests de movimientos; movimientos de efectivo, con crédito (el signal genera cuotas) y de ámbito común.

### Archivos de tests

| Archivo | Qué cubre |
|---------|-----------|
| `tests/test_categorias.py` | Listado (globales, familia, personales, otra familia, 401 sin token), creación (familiar, personal, validación sin nombre), edición (familiar, global, 403 otra familia), eliminación (familiar, 403 global, 403 otra familia). |
| `tests/test_metodos_pago.py` | Listado de métodos de pago, seed automático si la tabla está vacía, 401 sin token. |
| `tests/test_tarjetas.py` | Listado (propias, no ajenas, 401), creación (ok, sin nombre), edición y eliminación (propias, 404 ajenas). |
| `tests/test_signal_cuotas.py` | Signal de generación de cuotas: N cuotas al crear movimiento con crédito, numeración, suma = monto total, diferencia de centavos en primera cuota, meses consecutivos, estado PENDIENTE e incluir=True, no cuotas para efectivo, no duplicados en edición, monto_cuota manual. |
| `tests/test_movimientos.py` | Listado (familia, otra familia, filtros ambito/tipo/mes/búsqueda, 401), creación (efectivo, crédito con cuotas, validación tarjeta/num_cuotas), edición y eliminación (solo autor, cascada de cuotas), endpoints de cuotas (listado, filtros, incluir=False mueve mes, aislamiento por familia). |
| `tests/test_sueldos_liquidacion.py` | Ingresos comunes: listado (familia, filtro mes/año, otra familia, 401), creación (ok, múltiples mismo mes), edición y eliminación (solo autor, 403 ajeno). Liquidación: estructura (periodo, ingresos, gastos_comunes), ingresos y gastos agrupados por usuario, suma múltiples ingresos, sin gastos personales, mes vacío, 400 sin params, otra familia, 401. |

## Cómo ejecutar los tests

Desde el directorio `backend/` (o desde la raíz del repo ajustando la ruta del comando):

```bash
# Todos los tests
docker-compose exec web pytest tests/ -v

# Un solo archivo
docker-compose exec web pytest tests/test_categorias.py -v

# Una clase de tests
docker-compose exec web pytest tests/test_categorias.py::TestCategoriasCreacion -v

# Con reporte de cobertura
docker-compose exec web pytest tests/ --cov=applications --cov-report=term-missing

# Solo tests de catálogos (categorías, métodos de pago, tarjetas)
docker-compose exec web pytest tests/test_categorias.py tests/test_metodos_pago.py tests/test_tarjetas.py -v

# Tests de movimientos y cuotas (signal + endpoints)
docker-compose exec web pytest tests/test_signal_cuotas.py tests/test_movimientos.py -v

# Tests de ingresos comunes y liquidación
docker-compose exec web pytest tests/test_sueldos_liquidacion.py -v

# Cobertura del módulo finanzas
docker-compose exec web pytest tests/ --cov=applications.finanzas --cov-report=term-missing
```

## Resumen de cobertura

| Área | Tests | Qué validan |
|------|-------|-------------|
| **Categorías — listado** | 5 | Ve globales, de familia y personales; no ve categorías de otra familia; 401 sin token. |
| **Categorías — creación** | 3 | Crea categoría familiar y personal; 400 sin nombre. |
| **Categorías — edición** | 3 | Edita familiar y global; 403 para otra familia. |
| **Categorías — eliminación** | 3 | Elimina familiar; 403 global y 403 otra familia. |
| **Métodos de pago** | 3 | Lista los 3 estándar; seed si vacío; 401 sin token. |
| **Tarjetas — listado** | 3 | Ve propias; no ve ajenas; 401 sin token. |
| **Tarjetas — creación** | 2 | Crea correctamente; 400 sin nombre. |
| **Tarjetas — edición/eliminación** | 4 | Edita/elimina propias; 404 para ajenas. |
| **Signal cuotas** | 10 | Genera N cuotas con crédito; numeración y suma; diferencia centavos en cuota 1; meses consecutivos; PENDIENTE e incluir=True; no cuotas con efectivo; no duplicados en edición; monto_cuota manual. |
| **Movimientos — listado** | 8 | Lista por familia; no ve otra familia; filtros ambito/tipo/mes/q; 401 sin token. |
| **Movimientos — creación** | 4 | Crea efectivo y crédito (genera cuotas); 400 sin tarjeta o sin num_cuotas. |
| **Movimientos — edición/eliminación** | 5 | Edita/elimina solo autor; eliminación en cascada de cuotas; 403 ajeno. |
| **Cuotas — endpoint** | 5 | Lista por familia; filtros tarjeta/mes/estado; incluir=False mueve mes; no ve otra familia. |
| **Ingresos comunes** | 10 | Lista por familia; filtro mes/año; no ve otra familia; crea ok y múltiples mismo mes; edita/elimina solo autor; 403 ajeno; 401 sin token. |
| **Liquidación** | 9 | Estructura periodo/ingresos/gastos_comunes; ingresos y gastos agrupados por usuario; suma múltiples ingresos; no incluye gastos personales; mes sin datos; 400 sin mes/anio; no ve otra familia; 401 sin token. |

**Total: 77 tests** (26 catálogos + 32 movimientos y cuotas + 19 sueldos y liquidación).

## Nota técnica

Las vistas de finanzas usan `@permission_classes([AllowAny])` y obtienen el usuario con `get_usuario_autenticado(request)` (desde `applications.utils`). Así DRF no aplica JWT por defecto y no devuelve 401 antes de ejecutar la vista; la autenticación la hace nuestro helper (o el mock en tests). Eso permite que en los tests el fixture de auth inyecte el usuario sin tocar Firebase.
