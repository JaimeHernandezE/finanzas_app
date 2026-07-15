# Dataset anonimizado de Finanzas Familiares — contexto para portafolio

## Objetivo

Convertir el uso real de la app (decenas de usuarios: amigos y familia) en un
activo técnico presentable en CV/portafolio, sin exponer datos sensibles.

Enfoque: **agregados de grupo** (nunca por persona ni por familia) + métricas
de producto. El proceso de anonimización/agregación es tan mostrable como el
resultado.

**Narrativa de portafolio (evitar claims demográficos):**
> Dataset y pipeline de agregación a partir del uso de una app de finanzas
> personales/familiares (N≈30–40 usuarios activos, Chile). Muestra diseño
> de queries, privacidad por diseño y storytelling con datos — data
> engineering + producto, no microdatos crudos.

No enmarcar como "clase media chilena" u otro perfil socioeconómico que no
se pueda demostrar.

## Qué datos ya existen (sin construir nada nuevo)

- `Movimiento` — ingresos/egresos, categoría, ámbito (FAMILIAR/PERSONAL),
  método de pago, fecha.
- `Presupuesto` — montos por categoría/mes.
- Snapshots ya calculados: `SaldoMensualSnapshot`,
  `LiquidacionComunMensualSnapshot`, `ResumenHistoricoMesSnapshot`.
- Metadata de uso (si se agrega logging básico): timestamps, frecuencia de
  uso por endpoint.

Todo vive ya en Postgres — la materia prima no requiere instrumentación nueva
para el Nivel A. El Nivel B sí puede requerir logging/métricas mínimas.

## Dos niveles de producto (orden recomendado)

### Nivel B — Analytics de producto (hacer primero o en paralelo)

Ingeniería, no finanzas personales:

- Requests/día, latencia de `dashboard-resumen`, tasa de acierto de dedup en
  importación CSV, distribución de uso por feature.
- Más seguro: no toca montos de nadie, solo comportamiento agregado de la app.
- Más fácil de vender en portafolio de ingeniería con el mismo storytelling
  de data pipeline.

### Nivel A — Dataset agregado de grupo (no microdatos)

**Única forma permitida:** tablas ya agregadas (`GROUP BY categoria`, mes,
método de pago, etc.). No exportar filas de movimientos ni tablas por usuario.

- Eliminar por diseño (nunca llegan al archivo): nombres, `comentario`,
  emails, IDs reales, `firebase_uid`.
- Mantener: categorías, fechas a granularidad mensual, estructura de ámbito
  (solo si el agregado del corte cumple el umbral k), proporciones y totales
  de grupo.
- **No** anonimizar fila a fila con ruido y luego agregar. Eso deja un
  recorrido hacia el detalle individual. Si algún día se necesitara un
  dataset "micro" (poco útil aquí y más riesgoso), sería un producto
  separado, no este.

Output: CSV o Parquet **solo agregado**, con diccionario de datos.

## Inferencias agregadas "como grupo"

Agregar a nivel de *todos los usuarios juntos* baja el riesgo de
re-identificación: no se puede aislar el gasto de una persona.

Con el modelo actual se puede sacar (sujeto al umbral k de cada celda):

- **Distribución de gasto por categoría** — % del gasto total en comida,
  transporte, salud, etc.
- **Tasa de ahorro implícita del grupo** — ingresos + egresos del mes →
  saldo vs gasto (mismo espíritu que `dashboard-resumen`, agregado).
- **Estacionalidad de gasto** — variación mes a mes.
- **Vivienda vs consumo variable** — fracción del gasto mensual del grupo
  asociada a categorías de vivienda/crédito hipotecario vs resto.
- **Presupuesto declarado vs gasto real** — % de categorías donde el grupo
  se pasa del presupuesto. Insight de comportamiento.
- **Uso de crédito vs efectivo** — proporción de movimientos por
  `metodo_pago`.

## Umbral k y celdas no publicables

Con decenas de usuarios, un corte muy granular (categoría × mes) puede quedar
por debajo de k y volverse identificable de forma indirecta.

**Regla:** no publicar una celda (o omitir esa fila del export) si menos de
**k ≈ 10** usuarios distintos contribuyen a ese corte.

Cuando N < k, opciones (elegir una y documentarla en el README):

1. **Omitir la celda** — dejar vacío / no incluir la fila (preferida).
2. **Recategorizar** — fusionar en "Otras" u otra categoría residual.
3. **Subir granularidad** — solo totales anuales o por macrocategoría.

El script de export debe aplicar esto de forma automática, no a ojo.

## Riesgos a decidir antes de construir

- **Consentimiento**: aviso simple a los usuarios de que datos *agregados*
  podrían usarse como muestra técnica de portafolio.
- **Separación de entornos**: generar el export desde una réplica o dump,
  no desde la base de producción viva.
- **Sin tabla intermedia por usuario** en disco: el command agrega en SQL/ORM
  y escribe solo el resultado agregado.

## Punto técnico clave del pipeline

La forma correcta **no** es anonimizar fila por fila y después agregar — es
**agregar primero** y nunca materializar el detalle por usuario en el dataset
exportado. Así no existe el archivo intermedio del que alguien podría
reconstruir el detalle.

El management command debe tener el agregado como **única salida posible**
para este caso de uso.

## Entregable concreto

### Ubicación sugerida

```
finanzas_app/
├── portfolio-data/          # o docs/portfolio-data/
│   ├── README.md            # proceso = pieza de portafolio
│   ├── diccionario-datos.md
│   ├── exports/             # CSV/Parquet agregados (sin PII)
│   └── notebooks/           # o screenshots si el notebook no es público
```

### Esquema mínimo del export (Nivel A)

Ejemplo orientativo — una fila = un corte agregado que pasó el umbral k:

| Columna              | Tipo     | Descripción                                      |
|----------------------|----------|--------------------------------------------------|
| `periodo`            | date/str | Mes (`YYYY-MM`) o año                            |
| `categoria`          | str      | Nombre o slug de categoría                       |
| `ambito`             | str      | `FAMILIAR` / `PERSONAL` / `TODOS` (si aplica)    |
| `gasto_total`        | decimal  | Suma del grupo en el corte                       |
| `n_movimientos`      | int      | Cantidad de movimientos                          |
| `n_usuarios`         | int      | Usuarios distintos que contribuyen (debe ≥ k)    |
| `pct_gasto_grupo`    | float    | % sobre el gasto total del periodo               |

Tablas adicionales opcionales (mismo criterio k): presupuesto vs real,
distribución por `metodo_pago`, serie temporal de ahorro implícito.

### Notebook vs screenshots

- Preferible: notebook o Streamlit **público** solo si consume el export
  agregado (sin dump ni credenciales).
- Si el entorno o el consentimiento no dan para publicar el notebook:
  screenshots + README del pipeline bastan para el portafolio.

## Piezas técnicas a construir (orden sugerido)

1. **Nivel B (opcional pero prioritario en ingeniería):** recolección mínima
   de métricas de producto + un export/dashboard simple.
2. Management command Django: export + agregación en un solo paso
   (rango de fechas, nivel de agregación, umbral k), sin paso intermedio
   por usuario.
3. Script de validación: confirma umbral k por fila, ausencia de nombres,
   emails, IDs reales, comentarios; falla el CI/export si encuentra PII.
4. Notebook o dashboard (o screenshots) con 3–4 visualizaciones sobre el
   dataset agregado.
5. README del sub-proyecto: diccionario de datos, reglas k, consentimiento,
   y el pipeline como pieza de portafolio en sí misma.
