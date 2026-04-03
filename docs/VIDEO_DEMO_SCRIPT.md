# Guión Video Demo — Finanzas App
**Duración objetivo: 4–5 minutos**

---

## Intro (0:00 – 0:20)

**[Pantalla: Logo o pantalla de login]**

> "Esta es Finanzas App, una app de gestión financiera personal y familiar que construí con Vibe Coding — yo como CTO y director de producto, con Claude Code y Cursor ejecutando la implementación bajo mi dirección.
>
> Voy a mostrarte el flujo real de cómo mi familia y yo la usamos en el día a día."

---

## Escena 1: Registrar un gasto con tarjeta en cuotas (0:20 – 1:10)

**[Pantalla: Mobile — Formulario nuevo movimiento]**

> "Imaginemos que compré un computador por $900.000 con la Visa en 12 cuotas.
>
> Selecciono el método de pago: **Tarjeta de crédito**, elijo la Visa BCI, ingreso el monto total y pongo **12 cuotas**."

*[Llenar el formulario: monto 900000, categoría "Tecnología", método CREDITO, tarjeta Visa BCI, 12 cuotas]*

> "Lo que pasa acá es importante: el sistema no guarda 12 movimientos separados. Guarda **uno solo** — el compromiso — y genera automáticamente 12 registros de cuota, cada uno con el mes exacto en que va a aparecer en el estado de cuenta.
>
> ¿Cómo sabe qué mes? Cada tarjeta tiene configurado su **día de cierre de facturación**. Si la Visa cierra el día 15 y hoy es 20 de abril, la primera cuota va a aparecer en **mayo**, no en abril."

*[Guardar — mostrar brevemente que el movimiento aparece en lista]*

> "El movimiento aparece instantáneamente en la lista, incluso si no hay señal — la app es offline-first."

---

## Escena 2: El dashboard se actualiza solo (1:10 – 1:45)

**[Pantalla: Mobile — Dashboard, tab índice]**

> "Sin hacer nada más, el dashboard ya refleja el nuevo gasto.
>
> Acá puedo ver mi **deuda pendiente en tarjetas** — ese computador sumó $900.000 al total — y mi **efectivo disponible**, que es mi saldo real en cuentas corrientes y efectivo, separado de lo que debo en crédito.
>
> Ese spinner chico que ves arriba indica que la app está sincronizando en segundo plano con el servidor. Puedo usar la app mientras tanto sin esperar."

*[Mostrar el spinner de sincronización y el badge "Mes actual"]*

> "Si arrastro hacia abajo, fuerzo una sincronización completa. En el día a día, eso no es necesario — los datos viven locales y se sincronizan solos."

---

## Escena 3: Vista de Pagar Tarjeta con ciclo de facturación (1:45 – 2:40)

**[Pantalla: Mobile o Web — Vista Tarjetas / Pagar Tarjeta]**

> "Ahora viene la parte más interesante. Es fin de mes y tengo que pagar la tarjeta.
>
> Entro a la vista de **Pagar Tarjeta** y selecciono la Visa BCI. El sistema me muestra exactamente las cuotas que **vencen este mes** según el ciclo de facturación de esa tarjeta — no todas las cuotas que tengo pendientes, solo las de este período."

*[Mostrar lista de cuotas del mes: el computador aparece como cuota 1/12]*

> "Veo la cuota 1 de 12 del computador, más otras cuotas de compras anteriores. Puedo ver el detalle de cada una: de qué compra viene, en qué número de cuota estamos, y el monto.
>
> Si quiero **diferir** una cuota — digamos que este mes está muy apretado — la desmarco. El sistema la mueve automáticamente al mes siguiente. Sin llamadas al banco, sin reprogramar nada."

*[Demostrar el deferimiento de una cuota]*

> "Al hacer clic en **Pagar**, el sistema registra un egreso en efectivo por el total de las cuotas seleccionadas. Así el flujo de caja refleja el pago real, separado del compromiso original."

---

## Escena 4: Liquidación mensual con prorrateo proporcional (2:40 – 3:40)

**[Pantalla: Web — Liquidación mensual o Resumen familiar]**

> "Acá está la funcionalidad que más diferencia a esta app de cualquier otra: la **liquidación con prorrateo proporcional**.
>
> En nuestra familia, yo gano distinto a mi señora. Dividir los gastos comunes en partes iguales no es justo. La app los divide **proporcionalmente al sueldo de cada uno**."

*[Mostrar la vista de liquidación con los dos usuarios, sus ingresos declarados y el prorrateo]*

> "Cada integrante declara su ingreso mensual. El sistema calcula el porcentaje de cada uno sobre el total familiar — digamos 60% y 40%.
>
> Luego suma todos los gastos comunes del mes: supermercado, arriendo, colegio. El total es $800.000.
>
> El que gana 60% debería haber pagado $480.000. El que gana 40%, $320.000. Si uno pagó más de lo que le corresponde, el otro le debe esa diferencia."

*[Mostrar el resultado: 'Transferir $X a Y']*

> "Al final del mes, la liquidación nos dice exactamente una sola transferencia — quién le paga cuánto a quién — y las cuentas quedan cerradas."

*[Mostrar la compensación proyectada con sueldos estimados]*

> "Y si quiero anticipar cómo va a quedar antes de que termine el mes, puedo editar el **sueldo estimado** y el sistema calcula la compensación proyectada en tiempo real."

---

## Escena 5: Inversiones (3:40 – 4:20)

**[Pantalla: Web o Mobile — Módulo Inversiones]**

> "Para cerrar, una mirada rápida al módulo de inversiones.
>
> Tengo registrados mis fondos de APV y acciones. Para cada fondo puedo ver los **aportes de capital** que hice — cuánto metí yo de bolsillo — y el **valor actual** basado en el precio cuota más reciente que registré."

*[Mostrar un fondo con historial de aportes y valor actual]*

> "La rentabilidad es: valor actual menos suma de aportes. Simple y honesto, sin promesas de la corredora.
>
> El fondo de inversiones con categoría `es_inversion = True` no entra en los cálculos de gastos corrientes — está separado del flujo mensual."

---

## Cierre (4:20 – 4:50)

**[Pantalla: Dashboard mobile con SyncStatusBanner visible]*

> "En resumen: una app que maneja la complejidad real de las finanzas familiares — cuotas con ciclos de facturación reales, liquidación proporcional al ingreso, respaldo diario automático a Google Drive, y funciona offline.
>
> Todo construido en un monorepo: Django REST en el backend, React en web, React Native en mobile, con un cliente de API compartido entre ambos frontends.
>
> El código está en GitHub. Si te interesa ver la arquitectura, el modelo de datos o cómo está implementado el algoritmo de prorrateo, está todo documentado en el README."

---

## Notas de producción

- **Resolución recomendada**: 1920×1080 para web, 390×844 (iPhone 14) o equivalente Android para mobile
- **Velocidad**: grabación en tiempo real, sin cortes de tiempo. Los tiempos de respuesta muestran la experiencia offline-first real
- **Datos de demo**: usar datos reales pero con montos ficticios. Mostrar al menos 2 usuarios en la liquidación
- **Voz**: tono conversacional y técnico. Evitar exceso de términos en inglés cuando existe el equivalente en español
- **Música de fondo**: opcional, instrumental suave, -20dB bajo la voz
- **Subtítulos**: recomendado para distribución en LinkedIn/YouTube
