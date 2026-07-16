# Captura de movimientos — WhatsApp/Telegram, correos bancarios y bandeja de pendientes

**Estado:** MVP etapas 1–3 + **correo OAuth por usuario (3a/3a.2)** implementadas.
**Próximo foco (decisión de producto):** correo → **push nativo de la app** (etapa **3b**), antes de pulir WhatsApp/Telegram proactivo.
**Objetivo:** reducir la fricción del registro manual, principal causa de abandono en apps de finanzas personales. Cambiar la tarea de «registrar» (crear desde cero) a «confirmar» (revisar un borrador ya armado) desde la app de mensajería o desde la app.

**No es el camino principal:** import CSV/Excel desde el home banking. Exportar, subir archivo y mapear columnas añade más fricción que resolver un pendiente con un toque. El comando admin `importar_movimientos_csv` puede seguir existiendo para carga masiva / demos; no forma parte de este producto.

---

## Problema

- El registro manual depende de la disciplina del usuario. En un espacio familiar, el fondo común y las devoluciones de fin de mes se calculan sobre lo registrado: si un miembro olvida movimientos, **pierde plata** en la compensación.
- Aunque haya incentivo económico para registrar, los olvidos ocurren igual.
- Todo movimiento capturado automáticamente necesita resolver datos que la fuente no trae de forma explícita: **ámbito** (común / personal), **categoría** y, a veces, **cuenta / método de pago**. Los correos bancarios ayudan con los últimos 4 dígitos de la tarjeta; el resto lo elige el usuario en la confirmación.

## Principio de diseño

Ninguna fuente automática crea un `Movimiento` definitivo directamente. Todas convergen en una **bandeja de pendientes**: borradores que el usuario confirma con un toque. El sistema propone (categoría, ámbito, método de pago) y el usuario solo corrige lo ambiguo.

**Superficies de confirmación (equivalentes sobre la misma fuente de verdad):**

1. **App** — vista «Pendientes» + notificación in-app (`NotificacionUsuario` / `MOVIMIENTO_PENDIENTE`). **Prioridad de producto para el aviso proactivo tras un correo:** push del sistema operativo (móvil), con acciones rápidas o deep link al pendiente.
2. **Mensajería — WhatsApp y Telegram** — captura + confirmación. Preferencia: el usuario **abre la conversación** (escribe un gasto, «pendientes», etc.); evita cargos por plantillas Meta en WhatsApp.

Confirmar en uno cierra el pendiente en el otro (`MovimientoPendiente`).

### Decisión: push de la app antes que mensajería proactiva

**Fecha / contexto:** julio 2026. Se acuerda **no** priorizar el pulido de WhatsApp/Telegram ni el puente **correo → mensaje proactivo al bot** hasta resolver el aviso nativo en el teléfono.

**Por qué:** el correo bancario ya crea el pendiente. El hueco es el *ping* («hay algo por confirmar») sin abrir el chat ni pagar plantillas Meta. Una notificación del sistema (como Drive u otras apps) es el canal natural: llega con la app cerrada, es gratuita a nivel de Meta, y reutiliza `emitir_notificacion_pendiente` + la bandeja.

**Alcance acordado (a implementar después — etapa 3b):**

1. Registro de token de dispositivo (Expo Notifications / FCM) en el backend.
2. Al crear un pendiente por correo (u origen automático), emitir **push** además de la `NotificacionUsuario` in-app.
3. Contenido orientativo: monto, comercio, últimos 4 dígitos si hay.
4. Interacción: un toque abre deep link al pendiente (`/pendientes` o detalle) para perfeccionar categoría / ámbito / tarjeta; opcionalmente 1–2 **acciones rápidas** en la notificación (p. ej. Común / Personal o «Confirmar sugerido» si hay confianza alta). Notar: Android permite más acciones que iOS.
5. WhatsApp/Telegram siguen para captura iniciada por el usuario; el ping correo→chat queda **después** de 3b (etapa 5).

**Estado de implementación hoy:** in-app `MOVIMIENTO_PENDIENTE` sí; push del SO y deep links / acciones en notificación **no**.

---

## Arquitectura general

```
Usuario escribe / foto boleta          Correo de notificación bancaria
(WhatsApp o Telegram)                            │
        │                                        ▼
        ▼                               Casilla dedicada / label Gmail
  Bot + parser LLM                      Parser por banco (regex/LLM)
        │                                        │
        └────────────┬───────────────────────────┘
                     ▼
        ┌─────────────────────────┐
        │  MovimientoPendiente    │  ← también entradas manuales incompletas
        │  (borrador + confianza) │
        └───────────┬─────────────┘
                    │  motor de reglas · deduplicación
                    │  + NotificacionUsuario (in-app)
                    │  + [3b] push SO (móvil)
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
  Usuario abre el chat     Vista Pendientes (app)
  («pendientes» / gasto)   ← tap en push / acciones rápidas
  WhatsApp o Telegram
        │                       │
        └───────────┬───────────┘
                    ▼
              Movimiento (definitivo)

  [Después de 3b] Correo → mensaje proactivo al bot (p. ej. WhatsApp utility)
```

---

## Modelo de datos propuesto

### `MovimientoPendiente`

| Campo | Tipo | Notas |
|-------|------|-------|
| `usuario` / `espacio` | FK | Mismo esquema de tenancy que `Movimiento`. |
| `origen` | choice | `WHATSAPP` · `TELEGRAM` · `EMAIL_BANCO` · `MANUAL` |
| `monto`, `fecha`, `comercio` | — | Extraídos por el parser. |
| `categoria_sugerida` | FK nullable | Propuesta del LLM / reglas. |
| `ambito_sugerido` | choice nullable | `COMUN` · `PERSONAL` · null (ambiguo). |
| `metodo_pago_sugerido` | FK nullable | Por últimos 4 dígitos de tarjeta (email) o default del usuario. |
| `confianza` | float | Confianza global del parseo; bajo umbral → siempre pedir confirmación. |
| `payload_original` | JSON | Texto del mensaje / correo parseado, para auditoría y re-parseo. |
| `estado` | choice | `PENDIENTE` · `CONFIRMADO` · `DESCARTADO` · `DUPLICADO` |
| `movimiento` | FK nullable | Movimiento definitivo creado al confirmar, o existente si se detectó duplicado. |

### `ReglaClasificacion` (por usuario o por espacio)

| Campo | Notas |
|-------|-------|
| `patron_comercio` / `categoria` | Condición: comercio contiene X, o categoría = Y. |
| `ambito` | Resultado: común o personal. |
| `metodo_pago` | Opcional: «Copec con Visa terminada en 1234 → común». |
| `origen` | `MANUAL` (definida por el usuario) o `APRENDIDA` (inferida de confirmaciones repetidas). |

Las reglas aprendidas se crean cuando el usuario corrige lo mismo N veces (p. ej. 3 confirmaciones consecutivas de «Líder → común»).

---

## Fuente 1 — Mensajería (WhatsApp y Telegram)

Ambos canales son **ciudadanos de primera clase**: misma lógica de captura, mismos comandos, misma confirmación. El usuario elige (o vincula) el que use a diario.

**Doble rol:**

1. **Captura:** el usuario **inicia** escribiendo en lenguaje natural («2 lucas café», «12.500 líder con la visa») o manda foto de boleta. Webhook + LLM → `MovimientoPendiente` → botones de ámbito / categoría / cuenta.
2. **Confirmación de pendientes ajenos al chat** (p. ej. nacidos de correo): el usuario abre el chat y escribe «pendientes» (o equivalente); el bot lista y permite confirmar. Misma superficie en WhatsApp y en Telegram.

**Por qué abrir la conversación está bien:** no requiere que el negocio empuje mensajes; en WhatsApp las respuestas dentro de la ventana de 24 h tras el mensaje del usuario son de servicio (sin cargo Meta por plantilla). Abrir WhatsApp para un gasto o para vaciar pendientes es aceptable como hábito de producto.

**Resolución del ámbito, en capas:**

1. **Reglas**: si el comercio/categoría calza con una `ReglaClasificacion`, se aplica automáticamente.
2. **Respuesta rápida**: «$12.500 Líder → ¿Común / Personal?» y luego categoría / cuenta si falta.
3. **Sin terminar:** queda `PENDIENTE`; se completa después en el mismo chat, en el otro canal (si está vinculado) o en la app.

**Extras:** OCR de boletas; comandos («pendientes», «cuánto llevo este mes») reutilizando analytics del asistente.

**Costos / prototipo:**

| Canal | Rol | Coste de canal |
|-------|-----|----------------|
| **Telegram** | Ideal para prototipo y usuarios que lo prefieran | API del bot gratis |
| **WhatsApp** | Canal cotidiano para muchos; misma UX | Gratis si el usuario inicia; plantillas proactivas = de pago (ver pendiente correo → WA) |

Identificación: teléfono / `chat_id` verificado asociado a la cuenta.

---

## Fuente 2 — Correos de notificación bancaria

**Flujo técnico actual (prototipo etapas 1–3):**

1. `ingestar_correos_bancarios` lee **un** buzón desde `CAPTURA_EMAIL_IMAP_*` en `.env` y asocia todo a `CAPTURA_EMAIL_USUARIO_ID`.
2. Parser por banco → `MovimientoPendiente` (`origen=EMAIL_BANCO`).
3. Se emite `NotificacionUsuario` (`MOVIMIENTO_PENDIENTE`). El usuario lo ve en la **app** (bandeja + badge) **o** abre WhatsApp/Telegram y pide «pendientes».
4. Confirma cuenta y categoría en cualquiera de las dos superficies.

Ese prototipo IMAP vía `.env` quedó **retirado**. El producto usa **OAuth por usuario**.

### Decisión: correo por usuario con OAuth (etapas 3a / 3a.2) — implementado

**Fecha / contexto:** julio 2026.

**Implementado:**

- Modelo `ConfiguracionCapturaCorreo`: OAuth (`refresh_token_enc` Fernet), `proveedor` GMAIL|OUTLOOK, `remitentes_banco`, `intervalo_minutos` (mín. 5), `notificaciones_activas`.
- Conectar con un clic: Gmail API o Microsoft Graph (sin contraseña de aplicación ni IMAP).
- API: `GET/PUT /api/finanzas/captura/correo/` (preferencias), `POST …/oauth/connect/`, callbacks google/microsoft, `probar/`, `desconectar/`.
- UI Configuración → Captura: botones Conectar Gmail / Outlook + remitentes + refresco + notificaciones.
- UI Pendientes: botón **Buscar en correo** (`POST …/sincronizar/`, fuerza ingestión ignorando intervalo).
- `ingestar_correos_bancarios` solo sobre cuentas OAuth conectadas. Cron cada 5 min.

**Privacidad / ley 21.719:** acceso al buzón es dato sensible; consentimiento OAuth claro, cifrado en reposo, poder desconectar.

**Qué se extrae:** monto, comercio (si el mail solo dice “comercio nacional”, se intenta el asunto), fecha/hora, últimos 4 dígitos → tarjeta sugerida. Categoría y ámbito: elección del usuario (categorías filtradas por ámbito).

**Decisión — aviso proactivo vía app (etapa 3b):** el ping principal tras un correo será el **push del sistema** en el móvil (ver sección «Decisión: push de la app…»).

**Más adelante — correo → WhatsApp/Telegram proactivo (etapa 5):** queda **después** de 3a/3b.

**Red de seguridad:** el correo crea el pendiente aunque nadie lo haya digited; el olvido se corrige al vaciar la bandeja (app, push o «pendientes» en el bot).

**Advertencia:** formatos frágiles; no todo movimiento genera mail. Puente antes de Fintoc/Floid.

---

## Deduplicación

WhatsApp, Telegram y correo pueden capturar el mismo gasto.

- **Matching:** mismo espacio/usuario + monto exacto + fecha ± 1 día (± 3 online). Comercio como criterio secundario.
- Email vs `Movimiento` ya confirmado → `DUPLICADO`.
- Dos pendientes del mismo hecho → fusión por confianza.
- Dudosos → juntos en chat o bandeja de la app.

---

## Confirmación

- **App:** mismos pendientes; útil para lotes; **objetivo 3b:** abrir desde push o acciones rápidas en la notificación del SO.
- **WhatsApp / Telegram:** el usuario abre; botones/listas para ámbito, categoría y cuenta/método.
- Al confirmar → `Movimiento` por el flujo normal (serializers/validaciones) + vínculo al pendiente.
- Autoconfirmar alta confianza solo con preferencia **opt-in**.

---

## Etapas de implementación sugeridas

| Etapa | Alcance | Estado |
|-------|---------|--------|
| **1. Bandeja de pendientes** | Modelo `MovimientoPendiente`, API `/api/finanzas/pendientes/`, vista web `/pendientes`, badge. | **Hecho** |
| **2. Bots WhatsApp y Telegram** | `captura_bot/`, webhooks, vínculo en Configuración → Captura. Flags `CAPTURA_*_HABILITADO`. | **Hecho** (activar tokens) |
| **3. Correos → pendiente (prototipo)** | Parsers + `ingestar_correos_bancarios` con **un** buzón vía `.env`. In-app `MOVIMIENTO_PENDIENTE`. | **Hecho** (solo demo/dev) |
| **3a / 3a.2. Correo OAuth por usuario** | Gmail API + Microsoft Graph; UI un clic; remitentes/intervalo/notif. IMAP password retirado. | **Hecho** (migrar `0031`+`0032`) |
| **3b. Correo → push nativo + deep link** | Token de dispositivo; push al crear pendiente; abrir pendientes / acciones rápidas. | **Decidido — por implementar** |
| **4. Reglas aprendidas** | `ReglaClasificacion` por confirmaciones repetidas. | Backlog |
| **5. Correo → mensaje proactivo al chat** | Plantilla WhatsApp / push Telegram. | Pendiente (después de 3a/3b) |
| **6. Agregación bancaria** | Fintoc/Floid. | Futuro |

### Endpoints y comandos (referencia rápida)

| Método | Ruta / comando | Descripción |
|--------|----------------|-------------|
| GET/POST | `/api/finanzas/pendientes/` | Listar / crear borrador manual |
| GET | `/api/finanzas/pendientes/contador/` | Badge |
| POST | `/api/finanzas/pendientes/<id>/confirmar/` | Confirma vía `MovimientoSerializer` |
| POST | `/api/finanzas/pendientes/<id>/descartar/` | Descarta |
| POST | `/api/finanzas/captura/vinculo/` | Código `/vincular` |
| GET/PUT | `/api/finanzas/captura/correo/` | Preferencias (remitentes, intervalo, notif) |
| POST | `/api/finanzas/captura/correo/oauth/connect/` | `{ proveedor }` → `auth_url` |
| GET | `/api/finanzas/captura/correo/oauth/callback/google/` | Callback OAuth Gmail |
| GET | `/api/finanzas/captura/correo/oauth/callback/microsoft/` | Callback OAuth Outlook |
| POST | `/api/finanzas/captura/correo/probar/` | Valida token OAuth |
| POST | `/api/finanzas/captura/correo/sincronizar/` | Fuerza ingestión del buzón OAuth |
| POST | `/api/finanzas/captura/correo/desconectar/` | Borra refresh token |
| GET/POST | `/api/finanzas/captura/webhooks/telegram/` | Webhook Telegram |
| GET/POST | `/api/finanzas/captura/webhooks/whatsapp/` | Webhook WhatsApp |
| CLI | `ingestar_correos_bancarios` | IMAP → pendientes (configs por usuario; fallback `.env`) |

**Criterio de éxito (etapas 2–3 prototipo):** parsers + bandeja funcionan con un buzón de prueba.

**Criterio de éxito (etapa 3a):** cada usuario conecta/desconecta su propio correo desde la app; los pendientes nacen asociados a ese usuario.

**Criterio de éxito (etapa 3b):** el usuario se entera del pendiente por push del teléfono y puede confirmar o abrir el detalle sin depender de WhatsApp/Telegram.

---

## Riesgos y pendientes

- **Privacidad:** acceso al buzón personal; cifrado / OAuth; ley 21.719 si se comercializa. El `.env` compartido **no** es aceptable en multi-usuario.
- **Fragilidad de parsers** de correo.
- **Costo LLM** en parseo de mensajes/boletas.
- **WhatsApp:** coste solo relevante si se activa la etapa 5 (plantilla proactiva); con conversación iniciada por el usuario, el flujo de confirmación no depende de eso.
- **Push (3b):** permisos del SO, tokens caducados, límites de acciones en iOS vs Android.
- **Orden explícito:** **3a (correo por usuario)** y **3b (push)** antes de perfeccionar bots o **correo → WhatsApp/Telegram** proactivo.
