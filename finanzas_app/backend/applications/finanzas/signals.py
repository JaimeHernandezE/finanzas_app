# applications/finanzas/signals.py

from decimal import Decimal, ROUND_DOWN
from datetime import date, datetime

from django.db.models.signals import post_save
from django.dispatch import receiver
from dateutil.relativedelta import relativedelta

from .models import Movimiento, Cuota


@receiver(post_save, sender=Movimiento)
def generar_cuotas(sender, instance, created, **kwargs):
    """
    Genera automáticamente los registros de Cuota cuando se crea
    un Movimiento con método de pago tipo CRÉDITO.

    Reglas:
    - Solo se ejecuta en la creación (created=True), no en ediciones
    - Si el movimiento ya tiene cuotas, no genera nuevas (evita duplicados)
    - El mes de facturación de la primera cuota es el mes actual
    - Las siguientes cuotas se prorratean mes a mes
    - Si hay diferencia de centavos, va a la primera cuota
    """
    if not created:
        return

    if instance.metodo_pago.tipo != 'CREDITO':
        return

    if not instance.num_cuotas or instance.num_cuotas <= 0:
        return

    # Evitar duplicados si el signal se dispara dos veces
    if Cuota.objects.filter(movimiento=instance).exists():
        return

    n = instance.num_cuotas
    monto_base = Decimal(instance.monto)

    # Usar monto_cuota manual si fue ingresado, si no calcular
    if instance.monto_cuota:
        monto_cuota = Decimal(instance.monto_cuota)
    else:
        # Redondear hacia abajo para evitar exceder el total
        monto_cuota = (monto_base / n).quantize(
            Decimal('0.01'),
            rounding=ROUND_DOWN
        )

    # La diferencia de centavos va a la primera cuota
    diferencia = monto_base - (monto_cuota * n)

    fecha = instance.fecha
    if isinstance(fecha, str):
        fecha = datetime.strptime(fecha, '%Y-%m-%d').date()
    mes_base = date(fecha.year, fecha.month, 1)

    cuotas = []
    for i in range(n):
        mes_facturacion = mes_base + relativedelta(months=i)
        monto_final = monto_cuota + (diferencia if i == 0 else 0)

        cuotas.append(Cuota(
            movimiento=instance,
            numero=i + 1,
            monto=monto_final,
            mes_facturacion=mes_facturacion,
            estado='PENDIENTE',
            incluir=True,
        ))

    Cuota.objects.bulk_create(cuotas)
