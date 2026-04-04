# Finanzas App
![1775301595542](image/README/1775301595542.png)

> Gestión financiera personal y familiar — web + mobile, offline-first, con liquidación proporcional por sueldo.

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](https://python.org)
[![Django](https://img.shields.io/badge/Django-4.2_LTS-092E20?logo=django&logoColor=white)](https://djangoproject.com)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![React Native](https://img.shields.io/badge/React_Native-0.81-61DAFB?logo=react&logoColor=black)](https://reactnative.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?logo=postgresql&logoColor=white)](https://postgresql.org)
[![Firebase](https://img.shields.io/badge/Firebase-Auth-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com)

---

## El problema que resuelve

Llevar las finanzas personales y familiares es realmente una empresa, necesita gestión de pagos, presupuestos y llevar la caja, además, disponer algún sistema de reparto de gastos si es que son compartidos. Esta app entiende que:

- Un gasto en tarjeta de crédito en 12 cuotas **no es 1 solo gasto en el mes x**; es un compromiso que aparece en el estado de cuenta mes a mes y según el **ciclo de facturación de cada tarjeta**.
- Cada gasto puede estar acotado a un presupuesto, por lo que fácilmente puedes guiar tus finanzas.

Sistema de reparto de gastos
Con mi esposa tenemos el siguiente sistema: Cada uno coloca sus sueldos en un pozo común, se saca el porcentaje de aporte de cada uno en el mes, luego el gasto común será proporcional a los ingresos. Así:

Integrante 1: Sueldo: $4.500 - Porcentaje: 64%
Integrante 2: Sueldo: $2.000 - Porcentaje: 36%

Gasto común registrado en la app por ambos usuarios $3.500

Integrante 1 debe aportar: $2.240 al gasto común
Integrante 2 debe aportar: $1.260 al gasto común

- Los gastos comunes (supermercado, arriendo, colegio) se reparten **proporcionalmente al sueldo de cada integrante**. Dentro de la app hay una ventana específica para ingresar Gastos Comunes.
- Al principio del mes siguiente sabrás **quién le debe cuánto a quién** para cerrar las cuentas. En el ejemplo anterior, Integrante 1 debe aportar $2.240 al gasto común, pero en el registro personal del gasto común tiene $2.800. Por lo tanto, el Integrante 2 le debe $560.

Finanzas App resuelve lo anterior y algunas cosas más, con una API propia, una app web para escritorio y una app móvil offline-first.

---

## Sobre el desarrollo

Este proyecto fue construido con **Vibe Coding**: yo actué como CTO y director de producto — definí la arquitectura, tomé las decisiones técnicas, diseñé los modelos de datos y dirigí cada feature — mientras [Claude Code](https://claude.ai/code) (Anthropic) y [Cursor](https://cursor.sh) ejecutaron la implementación bajo mi supervisión continua.

No es un proyecto generado automáticamente. Cada decisión de diseño — el modelo de cuotas, el algoritmo de prorrateo, la arquitectura offline-first con outbox — fue pensada, revisada y ajustada iterativamente. El Vibe Coding es una forma de desarrollo, no una sustitución del criterio técnico.

---

## Arquitectura del sistema

```
finanzas_app/                   ← monorepo
├── backend/                    ← Django REST API
│   └── applications/
│       ├── usuarios/           ← Auth, Familia, multitenancy
│       ├── finanzas/           ← Motor financiero principal
│       ├── inversiones/        ← Fondos de inversión
│       ├── viajes/             ← Presupuesto de viajes
│       ├── export/             ← Exportación a Google Sheets
│       └── backup_bd/          ← Respaldo PostgreSQL a Google Drive
├── frontend/                   ← React + Vite (web desktop)
├── mobile/                     ← React Native + Expo (Android)
└── shared/                     ← API clients y utils compartidos
```

### Capa de datos

```
Familia (tenant raíz)
  └─ Usuario (AbstractUser + firebase_uid + rol)
       └─ CuentaPersonal (agrupador de movimientos)
            └─ Movimiento ──→ Personales por cuenta (Un usuario puede tener varias cuentas)
                          ──→ Cuota × N   (crédito en cuotas)
                          ──→ IngresoComun (ingreso al fondo común)
  └─ Categoria (árbol 2 niveles, global o de familia)
  └─ MetodoPago / Efectivo, Débito, Tarjeta (catálogo, con ciclo de facturación)
  └─ Presupuesto (meta mensual por categoría)
  └─ Snapshots (caché de cálculos costosos)
       ├─ SaldoMensualSnapshot
       ├─ LiquidacionComunMensualSnapshot
       └─ ResumenHistoricoMesSnapshot
```

---

## Stack tecnológico

### Backend
| Capa | Tecnología |
|---|---|
| Framework | Django 4.2 LTS + Django REST Framework 3.14 |
| Base de datos | PostgreSQL 15 |
| Autenticación | Firebase Admin SDK + SimpleJWT |
| Servidor | Gunicorn + Whitenoise |
| Cloud integrations | Google Sheets API, Google Drive API |
| Contenerización | Docker + Docker Compose |
| Lenguaje | Python 3.11 |

### Frontend web
| Capa | Tecnología |
|---|---|
| Framework | React 18.3 + React Router 7 |
| Build | Vite 5.4 |
| Estilos | SASS (módulos) |
| HTTP | Axios 1.13 |
| Auth | Firebase SDK 11 |

### Mobile
| Capa | Tecnología |
|---|---|
| Framework | React Native 0.81 + Expo 54 |
| Routing | Expo Router (file-based) |
| Estilos | NativeWind (Tailwind para RN) |
| Cache / estado | TanStack React Query 5 + AsyncStorage persister |
| Auth | Firebase SDK 12 + Expo SecureStore |
| Offline | Custom outbox pattern + MMKV / AsyncStorage |
| Conectividad | @react-native-community/netinfo |

---

## Funcionalidades principales

### Gastos personales y comunes
Cada movimiento es `PERSONAL` o `COMUN`. Los comunes entran al fondo familiar y se prorratean; los personales solo afectan el saldo individual. Un usuario puede tener más de una cuenta personal. La cuenta **Personal** viene por defecto pero puedes agregar adicionales, por ejemplo tengo una para honorarios como arquitecto.

### Dashboard personal
El Dashboard lleva 3 cards principales: la cuenta de tu efectivo disponible, lo que deberás pagar en tarjetas personales este mes, del saldo proyectado a fin de mes que incluye los gastos comunes prorrateados. Luego muestra los últimos 10 movimientos de tus cuentas personales y el estado de lo gastado versus tu presupuesto estimado por categoría.
![1775301465868](image/README/1775301465868.png)

### Tarjeta de crédito con cuotas reales

Cuando registras un gasto con tarjeta en N cuotas, el sistema genera automáticamente N registros `Cuota`, cada uno con su `mes_facturacion` calculado según el **ciclo de cierre de la tarjeta**:

```
fecha_compra.day <= dia_facturacion  →  cuota 1 en este mes
fecha_compra.day  > dia_facturacion  →  cuota 1 en el mes siguiente
cuotas 2..N                          →  cada una +1 mes
```

El redondeo (ej: $100 en 3 cuotas = $33,33...) se absorbe entero en la cuota 1 para nunca superar el monto total.

La vista **Pagar tarjeta** muestra exactamente qué cuotas vencen este mes según el ciclo. Puedes diferir cualquier cuota individualmente (`incluir = False`) y el sistema la mueve automáticamente al mes siguiente.

### Liquidación mensual con prorrateo proporcional

El algoritmo de liquidación calcula **quién le debe cuánto a quién** dentro de la familia:

```
Para cada integrante:
  % de prorrateo = ingreso_declarado / total_ingresos_familia
  gasto_esperado = total_gastos_comunes × %
  diferencia     = gasto_pagado_efectivo - gasto_esperado

  diferencia > 0  →  la familia le debe
  diferencia < 0  →  le debe a la familia
```

El sistema luego empareja deudores con acreedores para minimizar el número de transferencias.

### Compensación proyectada

Antes de que llegue fin de mes puedes ver un estimado: si declaras cuánto va a ser tu sueldo este mes (o el del otro integrante), el sistema calcula la compensación proyectada usando esos valores en lugar del ingreso real.

### Presupuesto vs. real

Define un monto mensual por categoría. La comparación es **on-the-fly** contra los movimientos reales del mes, sin duplicar datos. Soporte para jerarquía de categorías (padre → hijos con subtotales agregados).

### Inversiones

Registra fondos de inversión o APV: cada `Aporte` (capital nuevo) y cada `RegistroValor` (valor cuota de fecha X) permiten calcular rentabilidad histórica y valor actual del portafolio.

### Viajes

Modo vacaciones: activa un viaje y todos los gastos del período se pueden asociar a él, con presupuesto propio por categoría. El frontend activa un tema de color distinto mientras hay un viaje activo.

### Respaldo diario automático

Un workflow de GitHub Actions ejecuta diariamente un backup del PostgreSQL a Google Drive, y exporta los movimientos a Google Sheets para tener una copia legible fuera de la app.

---

## Arquitectura offline-first (mobile)

El principal desafío de UX del mobile era que la app fuera rápida aunque no haya señal.

### Capa de caché (React Query + AsyncStorage)

```typescript
// Datos nunca se marcan stale automáticamente
defaultOptions: {
  queries: {
    staleTime: Infinity,        // cache vive hasta que una mutación lo invalide
    gcTime: 24h,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,   // sí refresca al recuperar señal
  }
}
// Persisted a disco con AsyncStorage, sobrevive reinicios de app
```

Al abrir la app, el dashboard y la lista de movimientos aparecen **instantáneamente** desde el disco local. En segundo plano, un `SyncStatusBanner` muestra si hay sincronización en curso.

### Outbox pattern para mutaciones offline

Cuando creas o editas un movimiento sin conexión:

```
1. Movimiento guardado localmente en AsyncStorage (outbox)
2. UI actualizada optimistamente (aparece de inmediato en la lista)
3. Al recuperar señal → outbox procesado en orden FIFO
4. Si el servidor responde → cache invalidado → datos reales sincronizados
5. Si sigue sin señal → el item queda en outbox para el próximo intento
```

### Cascada de invalidación

Al guardar un movimiento (online u offline), se invalidan automáticamente todas las queries del dashboard que dependen de ese dato:

```typescript
invalidateQueries(['movimientos'])
invalidateQueries(['efectivoDisponible'])
invalidateQueries(['deudaPendiente'])
invalidateQueries(['liquidacion'])
invalidateQueries(['presupuestoMes'])
invalidateQueries(['compensacion'])
```

---

## Decisiones técnicas relevantes

### Snapshots para cálculos costosos
La liquidación mensual requiere agregar ingresos y gastos de múltiples usuarios. En lugar de calcular en cada request, el sistema mantiene snapshots cacheados que se invalidan asincrónicamente cuando cambian los datos, con recalculación síncrona solo para el mes actual y el anterior.

### Señales de Django para consistencia de datos
La generación de cuotas y la creación del `Movimiento` espejo de `IngresoComun` se manejan con signals `post_save`, manteniendo consistencia sin que el view necesite conocer esa lógica.

### Multitenancy simple con FK a Familia
Cada modelo de datos tiene una FK a `Familia`. No hay schemas separados ni row-level security en PostgreSQL. Simple, suficiente para el volumen de datos de una familia.

### Doble frontend (web + mobile) con shared API client
El código de llamadas a la API vive en `/shared` y es consumido por ambos frontends, evitando duplicación de URLs, tipos y lógica de error.

### Firebase Auth como proveedor de identidad externo
El backend nunca almacena contraseñas. Firebase entrega un ID token → el backend lo verifica y emite un JWT propio. Esto permite agregar Google/Apple sign-in sin cambiar el backend.

---

## Despliegue propio

### Requisitos previos

1. **Firebase**: Crear proyecto, habilitar Authentication (Email/Password), descargar `serviceAccountKey.json`
2. **PostgreSQL**: Render, Supabase, o instancia propia
3. **Google Cloud** (opcional, para backup/export): Crear Service Account con acceso a Drive y Sheets

### Backend en Render

```bash
# Variables de entorno en Render:
DJANGO_SECRET_KEY=<secret-largo-aleatorio>
DEBUG=False
DATABASE_URL=postgresql://user:pass@host:5432/dbname
FIREBASE_CREDENTIALS=<contenido JSON del serviceAccountKey, en una línea>
ALLOWED_HOSTS=tu-app.onrender.com
CORS_ALLOWED_ORIGINS=https://tu-frontend.com
```

```bash
# Build command
pip install -r requirements.txt && python manage.py collectstatic --no-input && python manage.py migrate

# Start command
gunicorn core.wsgi:application --bind 0.0.0.0:$PORT
```

### Frontend web en Render (Static Site)

```bash
# Build command
npm install && npm run build

# Publish directory
dist

# Variables de entorno:
VITE_API_BASE_URL=https://tu-backend.onrender.com
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
```

### Mobile (APK local con EAS Build)

```bash
cd mobile
npm install
eas build --platform android --profile preview
# Genera un APK descargable desde expo.dev
```

### Base de datos con Supabase

Supabase ofrece PostgreSQL 15 en su tier gratuito. Toma la `DATABASE_URL` del panel y úsala directamente en las variables de Render.

### Backup diario a Google Drive (GitHub Actions)

```yaml
# .github/workflows/backup-postgres-drive.yml
# Se ejecuta diariamente a las 3am UTC
# Requiere secrets: DATABASE_URL, GOOGLE_SERVICE_ACCOUNT_JSON, DRIVE_FOLDER_ID
```

---

## Desarrollo local

```bash
# Clonar
git clone https://github.com/tu-usuario/finanzas_app.git
cd finanzas_app/backend

# Levantar backend + PostgreSQL
docker-compose up -d --build

# Crear superusuario
docker-compose exec web python manage.py createsuperuser

# API disponible en:
# http://localhost:8000/api/
# http://localhost:8000/admin/

# Frontend web
cd ../frontend && npm install && npm run dev

# Mobile
cd ../mobile && npm install && npx expo start
```

> **Migraciones**: nunca se ejecutan automáticamente. Siempre correr manualmente:
> ```bash
> docker-compose exec web python manage.py makemigrations
> docker-compose exec web python manage.py migrate
> ```

---

## Estructura de la API

| Prefijo | App | Descripción |
|---|---|---|
| `/api/usuarios/` | usuarios | Auth Firebase, perfil, familia, invitaciones |
| `/api/finanzas/` | finanzas | Movimientos, cuotas, presupuesto, liquidación, pagar tarjeta |
| `/api/inversiones/` | inversiones | Fondos, aportes, valores |
| `/api/viajes/` | viajes | Viajes, presupuestos de viaje |
| `/api/export/` | export | Exportación a Google Sheets |
| `/api/backup/` | backup_bd | Respaldo PostgreSQL a Google Drive |

---

## Licencia

Uso personal y de portafolio. No se permite redistribución comercial sin autorización.
