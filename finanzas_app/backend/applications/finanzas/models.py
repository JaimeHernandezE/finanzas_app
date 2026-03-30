from django.conf import settings
from django.db import models
from django.utils import timezone


class Categoria(models.Model):
    """
    Categorías para clasificar movimientos (ej: Alimentación, Transporte, Sueldo).

    Jerarquía de visibilidad:
      - familia=None, usuario=None → categoría global del sistema (visible para todos)
      - familia=X,    usuario=None → categoría compartida dentro de la familia X
      - familia=X,    usuario=Y   → categoría personal del usuario Y
    """
    TIPO_CHOICES = [('INGRESO', 'Ingreso'), ('EGRESO', 'Egreso')]

    nombre       = models.CharField(max_length=100)
    tipo         = models.CharField(max_length=10, choices=TIPO_CHOICES)
    es_inversion = models.BooleanField(
        default=False,
        help_text="Si es True, los movimientos de esta categoría se contabilizan "
                  "como patrimonio y quedan excluidos del cálculo de gastos corrientes."
    )
    familia = models.ForeignKey(
        'usuarios.Familia',
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='categorias',
        help_text="Si es null, la categoría es global del sistema."
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='categorias_personales',
        help_text="Si es null, la categoría es compartida en la familia. "
                  "Si tiene valor, es privada de este usuario."
    )

    def __str__(self):
        return self.nombre

    class Meta:
        verbose_name_plural = "categorías"


class MetodoPago(models.Model):
    """
    Catálogo de métodos de pago disponibles.
    El tipo determina el comportamiento del sistema:
      - EFECTIVO / DEBITO: el gasto impacta inmediatamente el saldo en efectivo.
      - CREDITO: genera registros de Cuota diferidos en meses futuros.
    """
    TIPO_CHOICES = [
        ('EFECTIVO', 'Efectivo'),
        ('DEBITO',   'Débito'),
        ('CREDITO',  'Crédito'),
    ]

    nombre = models.CharField(max_length=50)
    tipo   = models.CharField(max_length=10, choices=TIPO_CHOICES)

    def __str__(self):
        return f"{self.nombre} ({self.tipo})"


class Tarjeta(models.Model):
    """
    Tarjetas de crédito del usuario. Son personales: cada usuario gestiona
    las suyas. La separación entre gastos personales y comunes la determina
    el campo 'ambito' en Movimiento, no la tarjeta en sí.

    dia_facturacion: día del mes en que el banco genera el estado de cuenta.
                     Determina en qué ciclo cae cada gasto.
                     Ej: 15 → gastos del 16 al 15 del mes siguiente forman un ciclo.

    dia_vencimiento: día del mes en que vence el pago del estado de cuenta.
                     Generalmente es el mes siguiente al de facturación.
                     Ej: 5 → el pago vence el 5 del mes siguiente al cierre.
    """
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='tarjetas',
        help_text="Propietario de la tarjeta. Solo este usuario puede "
                  "usarla al registrar movimientos."
    )
    nombre          = models.CharField(max_length=100, help_text="Ej: 'Visa BCI', 'Mastercard Santander'")
    banco           = models.CharField(max_length=100)
    dia_facturacion = models.IntegerField(
        null=True, blank=True,
        help_text="Día del mes en que cierra el ciclo de facturación (1-31)."
    )
    dia_vencimiento = models.IntegerField(
        null=True, blank=True,
        help_text="Día del mes en que vence el pago (1-31)."
    )

    def __str__(self):
        return f"{self.nombre} — {self.usuario}"


class CuentaPersonal(models.Model):
    """
    Agrupador lógico para separar contextos financieros distintos de un mismo usuario.
    No representa una cuenta bancaria real, sino una 'vista' de sus finanzas.

    Ejemplo de uso: un arquitecto independiente puede tener una cuenta 'Personal'
    para gastos cotidianos y otra 'Arquitecto' para honorarios y gastos profesionales,
    aunque ambas compartan las mismas cuentas bancarias reales.
    """
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='cuentas',
        help_text="Usuario dueño de esta cuenta personal."
    )
    nombre          = models.CharField(max_length=100, help_text="Ej: 'Personal', 'Arquitecto'")
    descripcion     = models.CharField(max_length=255, blank=True)
    visible_familia = models.BooleanField(
        default=False,
        help_text="Si es True, los miembros de la familia pueden ver los movimientos "
                  "de esta cuenta. Por defecto es privada."
    )

    def __str__(self):
        return f"{self.nombre} ({self.usuario})"

    @property
    def tiene_tutores(self) -> bool:
        """Retorna True si algún usuario externo tutela esta cuenta."""
        return self.tutores.exists()


class TutorCuenta(models.Model):
    """
    Relación de tutoría entre un usuario y la cuenta personal de otro.
    Permite que un adulto (tutor) vea y registre movimientos en la cuenta
    de un tercero (ej: cuenta de un hijo) sin ser el dueño de esa cuenta.

    La visibilidad en el sidebar se construye combinando:
      - Cuentas propias: CuentaPersonal.objects.filter(usuario=request.user)
      - Cuentas tuteladas: CuentaPersonal.objects.filter(tutores__tutor=request.user)
    """
    tutor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='tutelas',
        help_text="Usuario que ejerce la tutoría. Ve y puede operar esta cuenta."
    )
    cuenta = models.ForeignKey(
        CuentaPersonal,
        on_delete=models.CASCADE,
        related_name='tutores',
        help_text="Cuenta personal tutelada. Pertenece a otro usuario."
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['tutor', 'cuenta']]
        verbose_name = "tutoría de cuenta"
        verbose_name_plural = "tutorías de cuentas"

    def __str__(self):
        return f"{self.tutor} tutela → {self.cuenta}"


class Movimiento(models.Model):
    """
    Modelo central de la app. Representa cualquier transacción económica:
    ingreso o egreso, personal o común, en cualquier método de pago.

    Reglas clave:
      - Si metodo_pago.tipo == 'CREDITO', el signal post_save genera
        automáticamente los registros de Cuota correspondientes.
      - El campo 'ambito' determina si el movimiento aparece en las vistas
        personales o en las vistas familiares compartidas.
      - Los movimientos con cuenta != null son privados por defecto
        (respetan la visibilidad de CuentaPersonal).
    """
    TIPO_CHOICES   = [('INGRESO', 'Ingreso'), ('EGRESO', 'Egreso')]
    AMBITO_CHOICES = [('PERSONAL', 'Personal'), ('COMUN', 'Común')]

    # --- Contexto ---
    familia = models.ForeignKey(
        'usuarios.Familia',
        on_delete=models.CASCADE,
        related_name='movimientos',
        help_text="Familia a la que pertenece este movimiento. "
                  "Todos los filtros de vistas parten por este campo."
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='movimientos',
        help_text="Usuario que registró el movimiento."
    )
    cuenta = models.ForeignKey(
        CuentaPersonal,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='movimientos',
        help_text="Cuenta personal opcional. Si se asigna, el movimiento "
                  "se agrupa bajo ese contexto financiero del usuario."
    )

    # --- Clasificación ---
    tipo   = models.CharField(max_length=10, choices=TIPO_CHOICES)
    ambito = models.CharField(
        max_length=10,
        choices=AMBITO_CHOICES,
        help_text="PERSONAL: visible solo para el usuario. "
                  "COMUN: visible para toda la familia y se incluye en la liquidación mensual."
    )
    categoria = models.ForeignKey(
        Categoria,
        on_delete=models.PROTECT,
        related_name='movimientos',
        help_text="Categoría del movimiento. PROTECT evita borrar categorías con movimientos asociados."
    )

    # --- Datos del movimiento ---
    fecha      = models.DateField(default=timezone.now)
    monto      = models.DecimalField(max_digits=12, decimal_places=2)
    comentario = models.CharField(max_length=255, blank=True)
    oculto     = models.BooleanField(
        default=False,
        help_text="Si es True, el movimiento no aparece en los listados normales. "
                  "Útil para ocultar movimientos sensibles sin eliminarlos."
    )

    # --- Pago con tarjeta de crédito ---
    metodo_pago = models.ForeignKey(
        MetodoPago,
        on_delete=models.PROTECT,
        related_name='movimientos',
    )
    tarjeta = models.ForeignKey(
        Tarjeta,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='movimientos',
        help_text="Obligatorio si metodo_pago.tipo == 'CREDITO'. "
                  "El signal de post_save valida esta condición antes de generar cuotas."
    )
    num_cuotas  = models.IntegerField(
        null=True, blank=True,
        help_text="Número de cuotas. Obligatorio si el pago es con crédito."
    )
    monto_cuota = models.DecimalField(
        max_digits=12, decimal_places=2,
        null=True, blank=True,
        help_text="Valor de cada cuota. Si no se ingresa, el sistema calcula "
                  "monto / num_cuotas. La diferencia de centavos va a la primera cuota."
    )

    # --- Viaje asociado ---
    viaje = models.ForeignKey(
        'viajes.Viaje',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='movimientos',
        help_text="Si el movimiento ocurre durante un viaje activo, se asocia aquí "
                  "para el seguimiento de presupuesto vs. gasto real del viaje."
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.fecha} | {self.tipo} | ${self.monto} | {self.usuario}"

    class Meta:
        ordering = ['-fecha', '-created_at']


class Cuota(models.Model):
    """
    Representa una cuota individual de un Movimiento pagado con tarjeta de crédito.
    Los registros son generados automáticamente por un signal post_save en Movimiento.

    El campo 'incluir' es el corazón de la vista 'Pagar tarjeta': permite al usuario
    decidir si una cuota se cobra este mes o se prorrata al siguiente.
    """
    ESTADO_CHOICES = [
        ('PENDIENTE', 'Pendiente'),
        ('FACTURADO', 'Facturado'),
        ('PAGADO',    'Pagado'),
    ]

    movimiento = models.ForeignKey(
        Movimiento,
        on_delete=models.CASCADE,
        related_name='cuotas',
        help_text="Movimiento de origen. Si se elimina el movimiento, "
                  "todas sus cuotas se eliminan en cascada."
    )
    numero          = models.IntegerField(help_text="Número de cuota (1, 2, 3... N).")
    monto           = models.DecimalField(max_digits=12, decimal_places=2)
    mes_facturacion = models.DateField(
        help_text="Primer día del mes en que esta cuota debe aparecer en el estado de cuenta. "
                  "Se usa para filtrar cuotas por período en la vista 'Pagar tarjeta'."
    )
    estado  = models.CharField(max_length=10, choices=ESTADO_CHOICES, default='PENDIENTE')
    incluir = models.BooleanField(
        default=True,
        help_text="Si es False, esta cuota queda excluida del pago del mes actual "
                  "y su mes_facturacion se mueve al mes siguiente (prorrateo manual)."
    )

    def __str__(self):
        return f"Cuota {self.numero} de {self.movimiento} — {self.mes_facturacion:%Y-%m}"

    class Meta:
        ordering = ['mes_facturacion', 'numero']
        unique_together = [['movimiento', 'numero']]


class Presupuesto(models.Model):
    """
    Monto presupuestado por categoría para un mes dado.
    Se compara on-the-fly contra los movimientos reales del mismo mes y categoría
    para mostrar el avance de gasto vs. lo planificado.
    """
    familia = models.ForeignKey(
        'usuarios.Familia',
        on_delete=models.CASCADE,
        related_name='presupuestos',
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='presupuestos',
        help_text="Si es null, el presupuesto aplica a toda la familia. "
                  "Si tiene valor, es un presupuesto personal del usuario."
    )
    categoria = models.ForeignKey(
        Categoria,
        on_delete=models.CASCADE,
        related_name='presupuestos',
    )
    mes   = models.DateField(help_text="Primer día del mes al que aplica este presupuesto.")
    monto = models.DecimalField(max_digits=12, decimal_places=2)

    def __str__(self):
        return f"Presupuesto {self.categoria} — {self.mes:%Y-%m} (${self.monto})"

    class Meta:
        unique_together = [['familia', 'usuario', 'categoria', 'mes']]


class IngresoComun(models.Model):
    """
    Registro de ingresos mensuales de cada miembro al fondo común familiar.
    Se usa para calcular la proporción de cada usuario en la liquidación mensual.

    Al guardar, un signal crea o actualiza un Movimiento INGRESO en efectivo en la
    cuenta personal «Personal» (comentario = origen). Si se elimina este registro,
    ese movimiento se elimina en cascada lógica.

    Ejemplo: si el usuario A gana $1.000.000 y el usuario B gana $500.000,
    A aporta el 66.7% y B el 33.3% de los gastos comunes del mes.
    """
    familia = models.ForeignKey(
        'usuarios.Familia',
        on_delete=models.CASCADE,
        related_name='ingresos_comunes',
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='ingresos_comunes',
        help_text="Miembro que reporta este ingreso. Cada uno ingresa el suyo."
    )
    mes    = models.DateField(help_text="Primer día del mes al que corresponde este ingreso.")
    fecha_pago = models.DateField(
        null=True,
        blank=True,
        help_text='Fecha real de pago del ingreso (si se conoce).',
    )
    monto  = models.DecimalField(max_digits=12, decimal_places=2)
    origen = models.CharField(
        max_length=100,
        blank=True,
        help_text="Descripción del origen del ingreso. Ej: 'Sueldo', 'Honorarios', 'Arriendo'."
    )
    movimiento = models.OneToOneField(
        'Movimiento',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ingreso_comun',
        help_text='Ingreso en efectivo en cuenta Personal generado automáticamente.',
    )

    def __str__(self):
        return f"{self.usuario} — {self.mes:%Y-%m} — ${self.monto}"

    class Meta:
        ordering = ['-mes']


class SaldoMensualSnapshot(models.Model):
    """
    Snapshot mensual por usuario/cuenta: ingresos y egresos en efectivo/débito (sin crédito)
    y efectivo_neto = ingresos_efectivo − egresos_efectivo.
    cuenta_id=0 representa movimientos personales sin cuenta asignada.
    """
    familia = models.ForeignKey(
        'usuarios.Familia',
        on_delete=models.CASCADE,
        related_name='saldos_mensuales_snapshot',
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='saldos_mensuales_snapshot',
    )
    mes = models.DateField(help_text='Primer día del mes.')
    cuenta_id = models.PositiveIntegerField(
        default=0,
        help_text='PK de CuentaPersonal o 0 si el movimiento no tiene cuenta.',
    )
    ingresos_efectivo = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        help_text='Suma de ingresos en efectivo/débito (sin crédito, sin ingreso declarado fondo común/sueldo).',
    )
    egresos_efectivo = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        help_text='Suma de egresos corrientes en efectivo/débito (sin crédito, sin categoría inversión).',
    )
    efectivo_neto = models.DecimalField(max_digits=14, decimal_places=2)
    movimientos_contados = models.PositiveIntegerField(default=0)
    calculado_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['familia', 'usuario', 'mes', 'cuenta_id'],
                name='uniq_saldo_mensual_snapshot',
            ),
        ]
        indexes = [
            models.Index(fields=['familia', 'usuario', 'mes']),
        ]

    def __str__(self):
        return f'Saldo {self.usuario} {self.mes:%Y-%m} c={self.cuenta_id}'


class LiquidacionComunMensualSnapshot(models.Model):
    """Totales agregados para liquidación común por mes y usuario."""
    TIPO_LINEA_CHOICES = [
        ('INGRESO_COMUN', 'Ingreso común declarado'),
        ('GASTO_COMUN_NO_CREDITO', 'Gasto común (efectivo/débito)'),
    ]

    familia = models.ForeignKey(
        'usuarios.Familia',
        on_delete=models.CASCADE,
        related_name='liquidaciones_comun_snapshot',
    )
    mes = models.DateField(help_text='Primer día del mes.')
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='liquidaciones_comun_snapshot',
    )
    tipo_linea = models.CharField(max_length=30, choices=TIPO_LINEA_CHOICES)
    total = models.DecimalField(max_digits=14, decimal_places=2)
    items_contados = models.PositiveIntegerField(default=0)
    calculado_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['familia', 'mes', 'usuario', 'tipo_linea'],
                name='uniq_liquidacion_comun_mensual',
            ),
        ]
        indexes = [
            models.Index(fields=['familia', 'mes']),
        ]

    def __str__(self):
        return f'{self.tipo_linea} {self.familia_id} {self.mes:%Y-%m} u={self.usuario_id}'


class ResumenHistoricoMesSnapshot(models.Model):
    """
    Resumen familiar por mes (gasto común, sueldos, prorrateo, compensación).
    El payload replica la estructura devuelta por la API resumen-historico por mes.
    """

    familia = models.ForeignKey(
        'usuarios.Familia',
        on_delete=models.CASCADE,
        related_name='resumenes_historicos_mes',
    )
    mes = models.DateField(help_text='Primer día del mes.')
    payload = models.JSONField()
    calculado_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['familia', 'mes'],
                name='uniq_resumen_historico_mes_familia',
            ),
        ]
        indexes = [
            models.Index(fields=['familia', 'mes']),
        ]

    def __str__(self):
        return f'Resumen histórico {self.familia_id} {self.mes:%Y-%m}'


class SueldoEstimadoProrrateoMensual(models.Model):
    """
    Base de sueldos para prorrateo del saldo proyectado (misma lógica que Resumen común,
    con proporciones editables). Un registro por usuario y mes calendario.
    Al guardar un mes, se eliminan registros de meses anteriores de la misma familia.
    """

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='sueldos_estimados_prorrateo_mensual',
    )
    mes = models.DateField(help_text='Primer día del mes al que aplica.')
    monto = models.DecimalField(max_digits=12, decimal_places=2)
    actualizado_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['usuario', 'mes'],
                name='uniq_sueldo_estimado_prorrateo_usuario_mes',
            ),
        ]
        indexes = [
            models.Index(fields=['usuario', 'mes']),
        ]

    def __str__(self):
        return f'Sueldo est. prorrateo u={self.usuario_id} {self.mes:%Y-%m}'


class RecalculoPendiente(models.Model):
    """
    Marca que hay recálculo pendiente desde dirty_from (primer día de mes)
    para una familia. Un solo registro por familia.
    """
    familia = models.OneToOneField(
        'usuarios.Familia',
        on_delete=models.CASCADE,
        related_name='recalculo_pendiente',
    )
    dirty_from = models.DateField(
        help_text='Recalcular snapshots desde este mes (inclusive) hasta el actual.',
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Pendiente desde {self.dirty_from} — {self.familia_id}'
