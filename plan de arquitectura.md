Documento de Arquitectura y Plan de Desarrollo: App Finanzas Pro
1. Visión General del Proyecto
Desarrollo de una aplicación móvil a la medida para la gestión de finanzas personales y familiares. El objetivo principal es reemplazar una solución actual basada en AppSheet y Google Sheets, superando sus limitaciones relacionales frente al manejo de tarjetas de crédito (cuotas) y centralizando el cálculo de liquidaciones mensuales basadas en un reparto proporcional según los ingresos de cada usuario.

El proyecto servirá adicionalmente como campo de pruebas técnico (arquitectura móvil + backend) para futuros desarrollos del ecosistema AEC Tech (Proyecto MDA).

2. Stack Tecnológico
Backend: Python + Django + Django REST Framework (DRF).

Frontend Móvil: React Native (con Expo o CLI nativo).

Base de Datos: PostgreSQL (Local para desarrollo, opciones gratuitas como Supabase o Neon para producción).

Autenticación: Firebase Authentication (Integrado con Django vía tokens).

Infraestructura Local: Docker Compose (Exclusivamente para el Backend).

3. Estructura del Proyecto (Monorepo)
El proyecto utilizará una arquitectura de monorepo para facilitar el contexto en editores asistidos por IA (Cursor).

Plaintext
finanzas_app/
│
├── backend/                 # Proyecto Django dockerizado
│   ├── docker-compose.yml
│   ├── manage.py
│   ├── requeriments.txt
│   ├── core/                # Configuración principal
│   ├── usuarios/            # App: Autenticación
│   ├── finanzas/            # App: Registro diario (movimientos, cuotas)
│   ├── liquidaciones/       # App: Motor matemático de reparto
│   ├── inversiones/         # App: Fondos mutuos y rentabilidad
│   └── viajes/              # App: Modo vacaciones y presupuestos
│
├── frontend/                # Proyecto React Native (Nativo, sin Docker)
│   ├── package.json
│   ├── App.tsx
│   ├── /src
│   │   ├── /components
│   │   ├── /screens
│   │   └── /services        # Conexión con DRF
│
└── plan_arquitectura.md     # Este documento
4. Modelado de Datos (Backend - Django)
La base de datos relacional abandona el formato "planilla" y separa el acto de compra del acto de pago.

App usuarios
Usuario: Extiende AbstractUser de Django. Maneja la identidad vinculada al token de Google/Firebase.

App finanzas (Transaccional)
Categoria: nombre, tipo (Ingreso/Egreso), es_inversion (Booleano). Ej: Supermercado, Gastos Beltri, Bencina.

MetodoPago: nombre, tipo (Crédito, Débito, Efectivo), dia_facturacion, usuario_propietario (FK a Usuario).

Movimiento: El evento de compra.

Campos: usuario, monto_total, fecha, categoria (FK), metodo_pago (FK), tipo_movimiento (COMUN, PERSONAL), es_oculto (Bool), foto_boleta, viaje_asociado (FK opcional a modelo Viaje).

Cuota: Generada automáticamente si el Método de Pago es Crédito.

Campos: movimiento_origen (FK), monto_cuota, mes_asignado (MM/YYYY), numero_cuota.

App liquidaciones (Motor de Negocio)
IngresoMensual: Captura la foto de ingresos para el cálculo proporcional.

Campos: usuario, mes_anio, monto_declarado.

No hay modelos de resúmenes: Los saldos se calculan al vuelo mediante Views y QuerySets en Django.

App inversiones (Gestión Patrimonial)
Fondo: nombre, tipo_propiedad (Común, Personal).

Aporte: fondo (FK), fecha, monto, movimiento_origen (FK opcional a la app finanzas para trazar el origen).

RegistroValor: fondo (FK), fecha, saldo_total_informado.

Lógica: Rentabilidad calculada al vuelo = (Último RegistroValor - Suma de Aportes).

App viajes (Agrupador Dinámico)
Viaje: nombre (Ej: Llanquihue 2026), fecha_inicio, fecha_fin, es_activo (Bool), color_tema.

PresupuestoViaje: viaje (FK), categoria (FK), monto_estimado.

5. Lógica de Liquidación (Próximos Pasos en Python)
El endpoint de cálculo de cierre de mes deberá ejecutar las siguientes validaciones:

Sumar todos los movimientos COMUNES pagados en Débito/Efectivo del mes actual.

Sumar todas las Cuotas asignadas al mes actual (de compras a crédito pasadas o presentes).

Excluir movimientos cuya categoría tenga es_inversion = True (para no distorsionar el gasto real, aunque sí entran en el cálculo de compensación).

Tomar los IngresosMensuales del mes, calcular el porcentaje de cada usuario y cruzarlo con sus aportes reales (cuotas + pagos en efectivo) para emitir la orden de "quién transfiere a quién".

6. Frontend (React Native)
UX/UI Principal
Navegación basada en Bottom Tabs (React Navigation):

Gasto Común: Formulario ágil (Fecha, Categoría, Monto, Pago). Inyecta automáticamente el flag COMUN.

Gasto Personal: Mismo componente, inyecta PERSONAL.

Inversiones: Tarjetas mostrando Capital Invertido, Valor Actual y Rentabilidad en verde/rojo.

Viajes: Monitoreo de presupuesto vs. gasto real agrupado por viaje.

"Modo Vacaciones" (Context API / Zustand)
Al abrir la app, React Native consulta el endpoint de viajes activos.

Si un Viaje tiene es_activo=True, la UI cambia globalmente (colores, fondos).

El formulario de creación de gastos pre-selecciona automáticamente el viaje activo para evitar fricción en la carga de datos durante la ruta.

7. Flujo de Trabajo Local (Instrucciones de Desarrollo)
El ecosistema asume un desarrollo híbrido:

Terminal 1 (Backend): Navegar a /backend -> Ejecutar docker-compose up. Esto levanta PostgreSQL y el servidor de desarrollo de Django (DRF) aislando las dependencias de Python.

Terminal 2 (Frontend): Navegar a /frontend -> Ejecutar npm start (o npx expo start). Esto inicia el Metro Bundler de forma nativa para conectarse fluidamente al Emulador de Android o dispositivo físico vía USB/WiFi.

Nota para Cursor: Al implementar nuevas funcionalidades, priorizar la creación atómica de commits. Si se modifica un modelo en Django (backend), modificar en la misma sesión la interfaz correspondiente en React Native (frontend) para mantener la cohesión del Monorepo.