# Captura de movimientos — WhatsApp/Telegram, correos bancarios y bandeja de pendientes

**Estado:** MVP etapas 1–3 implementadas en código (activar bots/IMAP con env vars). Correo→WhatsApp proactivo sigue pendiente.
**Objetivo:** reducir la fricción del registro manual, principal causa de abandono en apps de finanzas personales. Cambiar la tarea de «registrar» (crear desde cero) a «confirmar» (revisar un borrador ya armado) desde la app de mensajería o desde la app.

**No es el camino principal:** import CSV/Excel desde el home banking. Exportar, subir archivo y mapear columnas añade más fricción que resolver un pendiente con un toque. El comando admin `importar_movimientos_csv` puede seguir existiendo para carga masiva / demos; no forma parte de este producto.

---

## Problema

- El registro manual depende de la disciplina del usuario. En un espacio familiar, el fondo común y las devoluciones de fin de mes se calculan sobre lo registrado: si un miembro olvida movimientos, **pierde plata** en la compensación.
- Aunque haya incentivo económico para registrar, los olvidos ocurren igual.
- Todo movimiento capturado automáticamente necesita resolver datos que la fuente no trae de forma explícita: **ámbito** (común / personal), **categoría** y, a veces, **cuenta / método de pago**. Los correos bancarios ayudan con los últimos 4 dígitos de la tarjeta; el resto lo elige el usuario en la confirmación.

## Principio de diseño

Ninguna fuente automática crea un `Movimiento` definitivo directamente. Todas convergen en una **bandeja de pendientes**: borradores que el usuario confirma con un toque. El sistema propone (categoría, ámbito, método de pago) y el usuario solo corrige lo ambiguo.

**Dos superficies de confirmación (equivalentes):**

1. **Mensajería — WhatsApp y Telegram** (ambos contemplados). Misma experiencia: captura + botones para confirmar. Preferencia de producto: el usuario **abre la conversación** (escribe un gasto, «pendientes», etc.); no es incómodo y en WhatsApp evita cargos por plantillas proactivas.
2. **App** — vista «Pendientes» con el mismo flujo.

Confirmar en uno cierra el pendiente en el otro (misma fuente de verdad: `MovimientoPendiente`).

**Pendiente de diseño:** aviso proactivo **correo → WhatsApp** (el bot escribe primero cuando llega un mail). Queda fuera del MVP: coste de plantillas Meta + complejidad de ventanas. Mientras tanto el correo deja el pendiente en bandeja / notificación de app; el usuario lo resuelve en la app o abriendo el chat.

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
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
  Usuario abre el chat     Vista Pendientes (app)
  («pendientes» / gasto)   + notificación in-app
  WhatsApp o Telegram
        │                       │
        └───────────┬───────────┘
                    ▼
              Movimiento (definitivo)

  [Pendiente] Correo → mensaje proactivo al bot (p. ej. WhatsApp utility)
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

**Flujo del MVP (sin ping proactivo al chat):**

1. Worker lee casilla dedicada (o label Gmail con reenvío de alertas).
2. Parser por banco → `MovimientoPendiente` (`origen=EMAIL_BANCO`).
3. El usuario lo ve en la **app** (bandeja + badge / `NotificacionUsuario`) **o** abre WhatsApp/Telegram y pide «pendientes».
4. Confirma cuenta y categoría en cualquiera de las dos superficies.

**Qué se extrae:** monto, comercio, fecha/hora, últimos 4 dígitos de tarjeta → método/cuenta sugeridos. Categoría y ámbito: reglas + elección del usuario.

**Pendiente — correo → WhatsApp (u otro bot) proactivo:** cuando exista presupuesto y plantillas Meta (o se elija Telegram, donde el push es libre), el worker podría mandar «Gasto $8.990 Falabella → elige cuenta y categoría» sin que el usuario abra el chat. No bloquea etapas 1–3; se documenta como mejora posterior.

**Red de seguridad:** el correo crea el pendiente aunque nadie lo haya digited; el olvido se corrige al vaciar la bandeja (app o «pendientes» en el bot), no al depender solo de la memoria.

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

- **WhatsApp / Telegram:** el usuario abre; botones/listas para ámbito, categoría y cuenta/método.
- **App:** mismos pendientes; útil para lotes.
- Al confirmar → `Movimiento` por el flujo normal (serializers/validaciones) + vínculo al pendiente.
- Autoconfirmar alta confianza solo con preferencia **opt-in**.

---

## Etapas de implementación sugeridas

| Etapa | Alcance | Estado |
|-------|---------|--------|
| **1. Bandeja de pendientes** | Modelo `MovimientoPendiente`, API `/api/finanzas/pendientes/`, vista web `/pendientes`, badge. | **Hecho** |
| **2. Bots WhatsApp y Telegram** | `captura_bot/`, webhooks, vínculo en Configuración → Captura. Flags `CAPTURA_*_HABILITADO`. | **Hecho** (activar tokens) |
| **3. Correos → pendiente** | `ingestar_correos_bancarios` + parsers BCI/Santander/genérico. Sin push WA. | **Hecho** (configurar IMAP) |
| **4. Reglas aprendidas** | `ReglaClasificacion` por confirmaciones repetidas. | Backlog |
| **5. Correo → mensaje proactivo** | Plantilla WhatsApp / push Telegram. | Pendiente |
| **6. Agregación bancaria** | Fintoc/Floid. | Futuro |

### Endpoints y comandos (referencia rápida)

| Método | Ruta / comando | Descripción |
|--------|----------------|-------------|
| GET/POST | `/api/finanzas/pendientes/` | Listar / crear borrador manual |
| GET | `/api/finanzas/pendientes/contador/` | Badge |
| POST | `/api/finanzas/pendientes/<id>/confirmar/` | Confirma vía `MovimientoSerializer` |
| POST | `/api/finanzas/pendientes/<id>/descartar/` | Descarta |
| POST | `/api/finanzas/captura/vinculo/` | Código `/vincular` |
| GET/POST | `/api/finanzas/captura/webhooks/telegram/` | Webhook Telegram |
| GET/POST | `/api/finanzas/captura/webhooks/whatsapp/` | Webhook WhatsApp |
| CLI | `ingestar_correos_bancarios` | IMAP → pendientes |

**Criterio de éxito (etapas 2–3):** pendientes de correo se vacían a tiempo vía app o chat iniciado por el usuario; la compensación deja de castigar olvidos.

---

## Riesgos y pendientes

- **Privacidad:** casilla dedicada; ley 21.719 si se comercializa.
- **Fragilidad de parsers** de correo.
- **Costo LLM** en parseo de mensajes/boletas.
- **WhatsApp:** coste solo relevante si se activa el pendiente correo→plantilla proactiva; con conversación iniciada por el usuario, el flujo de confirmación no depende de eso.
- **Pendiente explícito:** diseñar y presupuestar **correo → WhatsApp** (y el equivalente en Telegram) cuando convenga el ping automático.
