from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from applications.espacios.models import TenantManager


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
    espacio = models.ForeignKey(
        'espacios.Espacio',
        on_delete=models.PROTECT,
        null=True, blank=True,
        related_name='+',
        help_text="Tenant del espacio. Null para categorías globales del sistema."
    )
    origen_familia = models.ForeignKey(
        'espacios.Espacio',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='+',
        help_text="Espacio familiar de origen si el registro fue copiado al salir de una familia.",
    )

    objects = models.Manager()
    tenant = TenantManager()
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='categorias_personales',
        help_text="Si es null, la categoría es compartida en la familia. "
                  "Si tiene valor, es privada de este usuario."
    )
    cuenta_personal = models.ForeignKey(
        'finanzas.CuentaPersonal',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='categorias',
        help_text=(
            "Cuenta personal opcional para categorías privadas del usuario. "
            "Permite filtrar categorías personales por cuenta."
        ),
    )
    categoria_padre = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='subcategorias',
        help_text='Categoría padre para agrupar subcategorías.',
    )

    @property
    def es_padre(self) -> bool:
        return self.subcategorias.exists()

    def clean(self):
        errors = {}

        if self.categoria_padre_id:
            if self.categoria_padre_id == self.id:
                errors['categoria_padre'] = 'Una categoría no puede ser su propio padre.'
            else:
                padre = self.categoria_padre
                if padre is not None:
                    if padre.categoria_padre_id is not None:
                        errors['categoria_padre'] = (
                            'No se permiten nietas: el padre no puede tener padre.'
                        )
                    if padre.tipo != self.tipo:
                        errors['categoria_padre'] = (
                            'La categoría padre debe tener el mismo tipo.'
                        )

        # Categoría compartida del espacio (espacio + usuario null): no puede ir ligada a cuenta.
        if self.espacio_id and self.usuario_id is None and self.cuenta_personal_id is not None:
            errors['cuenta_personal'] = (
                'Las categorías familiares no pueden vincularse a una cuenta personal.'
            )

        # Categoría personal: si tiene cuenta, debe pertenecer al mismo usuario.
        if self.usuario_id and self.cuenta_personal_id:
            if self.cuenta_personal is not None and self.cuenta_personal.usuario_id != self.usuario_id:
                errors['cuenta_personal'] = (
                    'La cuenta personal debe pertenecer al mismo usuario de la categoría.'
                )

        if errors:
            raise ValidationError(errors)

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
    Instrumento de pago del usuario (débito o crédito). Son personales.
    La separación personal/común la determina `ambito` en Movimiento.

    tipo=CREDITO: usa dia_facturacion / dia_vencimiento para el ciclo de cuotas.
    tipo=DEBITO: se asocia al movimiento para trazabilidad (últimos 4, alertas bancarias);
                 numero_cuenta permite matchear transferencias TEF; es_por_defecto
                 preselecciona al registrar gastos con débito.
    """
    TIPO_DEBITO = 'DEBITO'
    TIPO_CREDITO = 'CREDITO'
    TIPO_CHOICES = [
        (TIPO_DEBITO, 'Débito'),
        (TIPO_CREDITO, 'Crédito'),
    ]

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='tarjetas',
        help_text="Propietario de la tarjeta. Solo este usuario puede "
                  "usarla al registrar movimientos."
    )
    nombre = models.CharField(max_length=100, help_text="Ej: 'Visa BCI', 'Cuenta RUT'")
    banco = models.CharField(max_length=100)
    tipo = models.CharField(
        max_length=10,
        choices=TIPO_CHOICES,
        default=TIPO_CREDITO,
        help_text="Débito o crédito; filtra el selector según método de pago del movimiento.",
    )
    ultimos_4_digitos = models.CharField(
        max_length=4,
        blank=True,
        default='',
        help_text="Últimos 4 dígitos (matching de alertas bancarias y etiqueta en UI).",
    )
    numero_cuenta = models.CharField(
        max_length=34,
        blank=True,
        default='',
        help_text="Número de cuenta bancaria (débito). Matching de transferencias TEF.",
    )
    es_por_defecto = models.BooleanField(
        default=False,
        help_text="Si es True, se preselecciona al registrar un egreso con el mismo tipo "
                  "(una por defecto por usuario y tipo).",
    )
    dia_facturacion = models.IntegerField(
        null=True, blank=True,
        help_text="Día del mes en que cierra el ciclo de facturación (1-31). Solo crédito.",
    )
    dia_vencimiento = models.IntegerField(
        null=True, blank=True,
        help_text="Día del mes en que vence el pago (1-31). Solo crédito.",
    )

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.es_por_defecto:
            Tarjeta.objects.filter(
                usuario_id=self.usuario_id,
                tipo=self.tipo,
                es_por_defecto=True,
            ).exclude(pk=self.pk).update(es_por_defecto=False)

    def __str__(self):
        suf = f' ···{self.ultimos_4_digitos}' if self.ultimos_4_digitos else ''
        return f"{self.nombre}{suf} ({self.tipo}) — {self.usuario}"


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
    espacio = models.ForeignKey(
        'espacios.Espacio',
        on_delete=models.PROTECT,
        related_name='+',
    )
    origen_familia = models.ForeignKey(
        'espacios.Espacio',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='+',
        help_text="Espacio familiar de origen si el registro fue copiado al salir de una familia.",
    )

    objects = models.Manager()
    tenant = TenantManager()
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
                  "Recomendado/requerido si hay tarjetas de débito y metodo_pago es DEBITO. "
                  "El signal de post_save valida crédito antes de generar cuotas."
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
    espacio = models.ForeignKey(
        'espacios.Espacio',
        on_delete=models.PROTECT,
        related_name='+',
    )
    origen_familia = models.ForeignKey(
        'espacios.Espacio',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='+',
        help_text="Espacio familiar de origen si el registro fue copiado al salir de una familia.",
    )

    objects = models.Manager()
    tenant = TenantManager()
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
        constraints = [
            models.UniqueConstraint(
                fields=['espacio', 'usuario', 'categoria', 'mes'],
                name='uniq_presupuesto_espacio_usuario_categoria_mes',
            ),
        ]


# Categoría global del movimiento generado desde IngresoComun (ver signals). Mismo texto en signals.
CATEGORIA_INGRESO_DECLARADO_FONDO_COMUN = 'Ingreso declarado (fondo común)'


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
    espacio = models.ForeignKey(
        'espacios.Espacio',
        on_delete=models.PROTECT,
        related_name='+',
    )

    objects = models.Manager()
    tenant = TenantManager()
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
    espacio = models.ForeignKey(
        'espacios.Espacio',
        on_delete=models.PROTECT,
        related_name='+',
    )

    objects = models.Manager()
    tenant = TenantManager()
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
                fields=['espacio', 'usuario', 'mes', 'cuenta_id'],
                name='uniq_saldo_mensual_snapshot_espacio',
            ),
        ]
        indexes = [
            models.Index(fields=['espacio', 'usuario', 'mes']),
        ]

    def __str__(self):
        return f'Saldo {self.usuario} {self.mes:%Y-%m} c={self.cuenta_id}'


class LiquidacionComunMensualSnapshot(models.Model):
    """Totales agregados para liquidación común por mes y usuario."""
    TIPO_LINEA_CHOICES = [
        ('INGRESO_COMUN', 'Ingreso común declarado'),
        ('GASTO_COMUN_NO_CREDITO', 'Gasto común (efectivo/débito)'),
    ]

    espacio = models.ForeignKey(
        'espacios.Espacio',
        on_delete=models.PROTECT,
        related_name='+',
    )

    objects = models.Manager()
    tenant = TenantManager()
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
                fields=['espacio', 'mes', 'usuario', 'tipo_linea'],
                name='uniq_liquidacion_comun_mensual_espacio',
            ),
        ]
        indexes = [
            models.Index(fields=['espacio', 'mes']),
        ]

    def __str__(self):
        return f'{self.tipo_linea} {self.espacio_id} {self.mes:%Y-%m} u={self.usuario_id}'


class ResumenHistoricoMesSnapshot(models.Model):
    """
    Resumen familiar por mes (gasto común, sueldos, prorrateo, compensación).
    El payload replica la estructura devuelta por la API resumen-historico por mes.
    """

    espacio = models.ForeignKey(
        'espacios.Espacio',
        on_delete=models.PROTECT,
        related_name='+',
    )

    objects = models.Manager()
    tenant = TenantManager()
    mes = models.DateField(help_text='Primer día del mes.')
    payload = models.JSONField()
    calculado_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['espacio', 'mes'],
                name='uniq_resumen_historico_mes_espacio',
            ),
        ]
        indexes = [
            models.Index(fields=['espacio', 'mes']),
        ]

    def __str__(self):
        return f'Resumen histórico {self.espacio_id} {self.mes:%Y-%m}'


class SueldoEstimadoProrrateoMensual(models.Model):
    """
    Base de sueldos para prorrateo del saldo proyectado (misma lógica que Resumen común,
    con proporciones editables). Un registro por usuario y mes calendario.
    Al guardar un mes, se eliminan registros de meses anteriores de la misma familia.

    En el mes en curso, el cliente debe usar esta base menos el IngresoComun ya declarado
    para ese mes (evita duplicar con el término B del efectivo disponible).
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


class CambioCompensacionMensual(models.Model):
    """Registro de un cambio en la compensación/prorrateo de un mes familiar."""

    ORIGEN_MOVIMIENTO = 'MOVIMIENTO'
    ORIGEN_INGRESO_COMUN = 'INGRESO_COMUN'
    ORIGEN_RECALCULO_MANUAL = 'RECALCULO_MANUAL'
    ORIGEN_IMPORTACION = 'IMPORTACION'
    ORIGEN_CHOICES = [
        (ORIGEN_MOVIMIENTO, 'Movimiento'),
        (ORIGEN_INGRESO_COMUN, 'Ingreso común'),
        (ORIGEN_RECALCULO_MANUAL, 'Recálculo manual'),
        (ORIGEN_IMPORTACION, 'Importación'),
    ]

    espacio = models.ForeignKey(
        'espacios.Espacio',
        on_delete=models.CASCADE,
        related_name='cambios_compensacion',
    )
    mes = models.DateField(help_text='Primer día del mes afectado.')
    delta = models.JSONField(
        help_text='Resumen estructurado del cambio (diferencias y transferencias).'
    )
    payload_antes = models.JSONField(null=True, blank=True)
    payload_despues = models.JSONField()
    origen_tipo = models.CharField(max_length=20, choices=ORIGEN_CHOICES)
    origen_id = models.PositiveIntegerField(null=True, blank=True)
    modificado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cambios_compensacion_realizados',
    )
    creado_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['espacio', 'mes']),
            models.Index(fields=['creado_at']),
        ]

    def __str__(self):
        return f'Cambio compensación {self.espacio_id} {self.mes:%Y-%m}'


class NotificacionUsuario(models.Model):
    """Notificación in-app para un usuario (compensación y otros tipos futuros)."""

    TIPO_CAMBIO_COMPENSACION = 'CAMBIO_COMPENSACION'
    TIPO_PRESUPUESTO_UMBRAL = 'PRESUPUESTO_UMBRAL'
    TIPO_MOVIMIENTO_PENDIENTE = 'MOVIMIENTO_PENDIENTE'
    TIPO_CHOICES = [
        (TIPO_CAMBIO_COMPENSACION, 'Cambio de compensación'),
        (TIPO_PRESUPUESTO_UMBRAL, 'Alerta de presupuesto'),
        (TIPO_MOVIMIENTO_PENDIENTE, 'Movimiento pendiente de confirmar'),
    ]

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notificaciones',
    )
    espacio = models.ForeignKey(
        'espacios.Espacio',
        on_delete=models.CASCADE,
        related_name='notificaciones',
    )
    cambio = models.ForeignKey(
        CambioCompensacionMensual,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='notificaciones',
    )
    tipo = models.CharField(max_length=32, choices=TIPO_CHOICES)
    titulo = models.CharField(max_length=200)
    mensaje = models.TextField()
    payload = models.JSONField(default=dict, blank=True)
    leida_at = models.DateTimeField(null=True, blank=True)
    creado_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['usuario', 'leida_at', 'creado_at']),
            models.Index(fields=['espacio', 'creado_at']),
        ]
        ordering = ['-creado_at']

    def __str__(self):
        return f'Notif u={self.usuario_id} {self.tipo}'


class BrechaConsultaAsistente(models.Model):
    """
    Telemetría de preguntas del asistente sin cobertura útil (Etapa B).
    No guarda el hilo completo ni montos; solo señales de producto.
    """

    SENAL_SIN_TOOL = 'SIN_TOOL'
    SENAL_TOOL_VACIA = 'TOOL_VACIA'
    SENAL_FUERA_DE_ALCANCE = 'FUERA_DE_ALCANCE'
    SENAL_CHOICES = [
        (SENAL_SIN_TOOL, 'Sin tool'),
        (SENAL_TOOL_VACIA, 'Tool vacía'),
        (SENAL_FUERA_DE_ALCANCE, 'Fuera de alcance'),
    ]

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='brechas_asistente',
    )
    espacio = models.ForeignKey(
        'espacios.Espacio',
        on_delete=models.CASCADE,
        related_name='brechas_asistente',
    )
    senal = models.CharField(max_length=32, choices=SENAL_CHOICES)
    mensaje_normalizado = models.CharField(max_length=240, blank=True, default='')
    intento_label = models.CharField(max_length=64, blank=True, default='otro')
    tools_intentadas = models.JSONField(default=list, blank=True)
    modelo = models.CharField(max_length=128, blank=True, default='')
    provider = models.CharField(max_length=32, blank=True, default='')
    creado_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['senal', 'creado_at']),
            models.Index(fields=['intento_label', 'creado_at']),
            models.Index(fields=['espacio', 'creado_at']),
        ]
        ordering = ['-creado_at']

    def __str__(self):
        return f'Brecha {self.senal} {self.intento_label} u={self.usuario_id}'


class MovimientoPendiente(models.Model):
    """
    Borrador de movimiento capturado (bot, correo o manual incompleto).
    Solo se convierte en Movimiento definitivo tras confirmación explícita.
    """

    ORIGEN_WHATSAPP = 'WHATSAPP'
    ORIGEN_TELEGRAM = 'TELEGRAM'
    ORIGEN_EMAIL_BANCO = 'EMAIL_BANCO'
    ORIGEN_MANUAL = 'MANUAL'
    ORIGEN_CHOICES = [
        (ORIGEN_WHATSAPP, 'WhatsApp'),
        (ORIGEN_TELEGRAM, 'Telegram'),
        (ORIGEN_EMAIL_BANCO, 'Correo bancario'),
        (ORIGEN_MANUAL, 'Manual'),
    ]

    ESTADO_PENDIENTE = 'PENDIENTE'
    ESTADO_CONFIRMADO = 'CONFIRMADO'
    ESTADO_DESCARTADO = 'DESCARTADO'
    ESTADO_DUPLICADO = 'DUPLICADO'
    ESTADO_CHOICES = [
        (ESTADO_PENDIENTE, 'Pendiente'),
        (ESTADO_CONFIRMADO, 'Confirmado'),
        (ESTADO_DESCARTADO, 'Descartado'),
        (ESTADO_DUPLICADO, 'Duplicado'),
    ]

    AMBITO_CHOICES = Movimiento.AMBITO_CHOICES
    TIPO_CHOICES = Movimiento.TIPO_CHOICES

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='movimientos_pendientes',
    )
    espacio = models.ForeignKey(
        'espacios.Espacio',
        on_delete=models.CASCADE,
        related_name='movimientos_pendientes',
    )
    origen = models.CharField(max_length=20, choices=ORIGEN_CHOICES)
    tipo = models.CharField(max_length=10, choices=TIPO_CHOICES, default='EGRESO')
    monto = models.DecimalField(max_digits=12, decimal_places=2)
    fecha = models.DateField(default=timezone.now)
    comercio = models.CharField(max_length=255, blank=True, default='')
    categoria_sugerida = models.ForeignKey(
        Categoria,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pendientes_sugeridos',
    )
    ambito_sugerido = models.CharField(
        max_length=10,
        choices=AMBITO_CHOICES,
        null=True,
        blank=True,
    )
    metodo_pago_sugerido = models.ForeignKey(
        MetodoPago,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pendientes_sugeridos',
    )
    tarjeta_sugerida = models.ForeignKey(
        Tarjeta,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pendientes_sugeridos',
    )
    cuenta_sugerida = models.ForeignKey(
        CuentaPersonal,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pendientes_sugeridos',
    )
    confianza = models.FloatField(default=0.0)
    payload_original = models.JSONField(default=dict, blank=True)
    estado = models.CharField(
        max_length=20,
        choices=ESTADO_CHOICES,
        default=ESTADO_PENDIENTE,
    )
    movimiento = models.ForeignKey(
        Movimiento,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='origen_pendiente',
    )
    hash_externo = models.CharField(
        max_length=64,
        blank=True,
        default='',
        help_text='Hash del mensaje/correo para deduplicar ingestas.',
    )
    creado_at = models.DateTimeField(auto_now_add=True)
    actualizado_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-creado_at']
        indexes = [
            models.Index(fields=['usuario', 'espacio', 'estado', 'creado_at']),
            models.Index(fields=['hash_externo']),
        ]
        verbose_name = 'movimiento pendiente'
        verbose_name_plural = 'movimientos pendientes'

    def __str__(self):
        return f'Pendiente {self.estado} ${self.monto} {self.comercio or self.id}'


class CodigoVinculoCaptura(models.Model):
    """Código de un solo uso para vincular Telegram/WhatsApp a un Usuario."""

    CANAL_TELEGRAM = 'TELEGRAM'
    CANAL_WHATSAPP = 'WHATSAPP'
    CANAL_CHOICES = [
        (CANAL_TELEGRAM, 'Telegram'),
        (CANAL_WHATSAPP, 'WhatsApp'),
    ]

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='codigos_vinculo_captura',
    )
    canal = models.CharField(max_length=20, choices=CANAL_CHOICES)
    codigo = models.CharField(max_length=12, unique=True)
    expira_at = models.DateTimeField()
    usado_at = models.DateTimeField(null=True, blank=True)
    creado_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['codigo']),
            models.Index(fields=['usuario', 'canal']),
        ]

    def __str__(self):
        return f'{self.canal} {self.codigo} u={self.usuario_id}'


class ConfiguracionCapturaCorreo(models.Model):
    """
    OAuth de correo (Gmail / Outlook) + preferencias de ingestión de alertas bancarias.
    refresh_token_enc usa Fernet (mismo patrón que Drive).
    """

    PROVEEDOR_GMAIL = 'GMAIL'
    PROVEEDOR_OUTLOOK = 'OUTLOOK'
    PROVEEDOR_CHOICES = [
        (PROVEEDOR_GMAIL, 'Gmail'),
        (PROVEEDOR_OUTLOOK, 'Outlook / Hotmail'),
    ]

    usuario = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='config_captura_correo',
    )
    proveedor = models.CharField(
        max_length=20,
        choices=PROVEEDOR_CHOICES,
        default=PROVEEDOR_GMAIL,
    )
    email = models.EmailField(blank=True, default='')
    refresh_token_enc = models.TextField(blank=True, default='')
    conectado = models.BooleanField(default=False)
    remitentes_banco = models.JSONField(
        default=list,
        blank=True,
        help_text='Emails o dominios (@banco.cl) de los que se aceptan alertas.',
    )
    intervalo_minutos = models.PositiveSmallIntegerField(default=15)
    notificaciones_activas = models.BooleanField(default=True)
    ultimo_sync_at = models.DateTimeField(null=True, blank=True)
    ultimo_error = models.CharField(max_length=500, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'configuración de captura por correo'
        verbose_name_plural = 'configuraciones de captura por correo'

    def __str__(self):
        estado = 'conectado' if self.conectado else 'desconectado'
        return f'Captura correo {self.email or self.usuario_id} ({estado})'


