from django.db import models


class Viaje(models.Model):
    """
    Representa un viaje o evento con presupuesto propio.
    Cuando es_activo=True, la app entra en 'Modo Vacaciones':
    cambia la paleta de colores según color_tema y pre-selecciona
    campos en los formularios de movimientos.
    """
    familia      = models.ForeignKey(
        'usuarios.Familia',
        on_delete=models.CASCADE,
        related_name='viajes',
    )
    nombre       = models.CharField(max_length=100, help_text="Ej: 'Vacaciones Llanquihue 2026'")
    fecha_inicio = models.DateField()
    fecha_fin    = models.DateField()
    es_activo    = models.BooleanField(
        default=False,
        help_text="Solo puede haber un viaje activo por familia a la vez. "
                  "El frontend usa este flag para activar el Modo Vacaciones."
    )
    color_tema   = models.CharField(
        max_length=7,
        blank=True,
        help_text="Color hexadecimal para la paleta temática del viaje. Ej: '#2E86AB'."
    )

    def __str__(self):
        return self.nombre

    class Meta:
        ordering = ['-fecha_inicio']


class PresupuestoViaje(models.Model):
    """
    Presupuesto planificado por categoría para un viaje específico.
    El gasto real se obtiene on-the-fly filtrando los movimientos
    asociados al viaje por categoría.
    """
    viaje     = models.ForeignKey(
        Viaje,
        on_delete=models.CASCADE,
        related_name='presupuestos',
        help_text="Viaje al que pertenece este ítem de presupuesto."
    )
    categoria = models.ForeignKey(
        'finanzas.Categoria',
        on_delete=models.PROTECT,
        related_name='presupuestos_viaje',
        help_text="Categoría presupuestada. Ej: Pasajes, Alojamiento, Comida."
    )
    monto_planificado = models.DecimalField(max_digits=12, decimal_places=2)

    def __str__(self):
        return f"{self.viaje} — {self.categoria}: ${self.monto_planificado}"

    class Meta:
        unique_together = [['viaje', 'categoria']]
