from django.conf import settings
from django.db import models

from applications.espacios.models import TenantManager


class Fondo(models.Model):
    """
    Fondo de inversión o ahorro que se quiere monitorear.
    Puede ser personal o compartido con la familia.
    """
    familia = models.ForeignKey(
        'usuarios.Familia',
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='fondos',
    )
    espacio = models.ForeignKey(
        'espacios.Espacio',
        on_delete=models.PROTECT,
        null=True, blank=True,
        related_name='+',
    )

    objects = models.Manager()  # legacy (familia); default durante la transición
    tenant = TenantManager()    # lecturas multitenant: .en_espacio(espacio)
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='fondos',
        help_text="Si es null, el fondo es compartido por toda la familia. "
                  "Si tiene valor, es un fondo personal del usuario."
    )
    nombre      = models.CharField(max_length=100)
    descripcion = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return self.nombre


class Aporte(models.Model):
    """
    Movimiento de capital de un fondo (aporte o retiro).
    Monto positivo = ingreso de capital; monto negativo = retiro.
    Se diferencia de RegistroValor: dinero real que entra o sale,
    no una variación del valor de mercado.
    """
    fondo = models.ForeignKey(
        Fondo,
        on_delete=models.CASCADE,
        related_name='aportes',
        help_text="Fondo al que pertenece este movimiento de capital."
    )
    fecha = models.DateField()
    monto = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Positivo = aporte; negativo = retiro.",
    )
    nota  = models.CharField(max_length=255, blank=True)

    def __str__(self):
        etiqueta = 'Retiro' if self.monto < 0 else 'Aporte'
        return f"{etiqueta} ${self.monto} en {self.fondo} el {self.fecha}"

    class Meta:
        ordering = ['-fecha']


class RegistroValor(models.Model):
    """
    Snapshot periódico del valor de mercado de un fondo.
    Se usa para calcular rentabilidad: la diferencia entre el valor actual
    del fondo y la suma neta de movimientos de capital (aportes − retiros)
    determina la ganancia o pérdida.
    """
    fondo = models.ForeignKey(
        Fondo,
        on_delete=models.CASCADE,
        related_name='registros_valor',
        help_text="Fondo cuyo valor se está registrando."
    )
    fecha       = models.DateField()
    valor_cuota = models.DecimalField(
        max_digits=14, decimal_places=6,
        help_text="Valor de la cuota del fondo en esta fecha. "
                  "Se multiplica por el número de cuotas acumuladas para obtener el valor total."
    )

    def __str__(self):
        return f"{self.fondo} — {self.fecha} — ${self.valor_cuota}"

    class Meta:
        ordering = ['-fecha']
        unique_together = [['fondo', 'fecha']]
