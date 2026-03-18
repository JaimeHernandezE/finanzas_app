# applications/finanzas/signals.py

from decimal import Decimal, ROUND_DOWN
from datetime import date, datetime

from django.contrib.auth import get_user_model
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver
from dateutil.relativedelta import relativedelta

from .models import (
    Categoria,
    CuentaPersonal,
    IngresoComun,
    MetodoPago,
    Movimiento,
    Cuota,
)

# Nombre estable de la categoría global para ingresos generados desde IngresoComun.
CATEGORIA_INGRESO_DECLARADO_FONDO_COMUN = 'Ingreso declarado (fondo común)'


@receiver(post_save, sender=get_user_model())
def crear_cuenta_personal_por_defecto(sender, instance, created, **kwargs):
    """Crea la cuenta personal «Personal» al registrar un usuario."""
    if not created:
        return
    CuentaPersonal.objects.get_or_create(
        usuario=instance,
        nombre='Personal',
        defaults={
            'descripcion': 'Cuenta por defecto para finanzas personales y efectivo.',
        },
    )


def _obtener_metodo_efectivo():
    m = MetodoPago.objects.filter(tipo='EFECTIVO').order_by('pk').first()
    if m:
        return m
    return MetodoPago.objects.create(nombre='Efectivo', tipo='EFECTIVO')


def _obtener_categoria_ingreso_declarado():
    c = Categoria.objects.filter(
        nombre=CATEGORIA_INGRESO_DECLARADO_FONDO_COMUN,
        familia__isnull=True,
        usuario__isnull=True,
    ).first()
    if c:
        return c
    return Categoria.objects.create(
        nombre=CATEGORIA_INGRESO_DECLARADO_FONDO_COMUN,
        tipo='INGRESO',
        es_inversion=False,
    )


def _asegurar_cuenta_personal(usuario):
    cuenta, _ = CuentaPersonal.objects.get_or_create(
        usuario=usuario,
        nombre='Personal',
        defaults={
            'descripcion': 'Cuenta por defecto para finanzas personales y efectivo.',
        },
    )
    return cuenta


@receiver(post_save, sender=IngresoComun)
def sincronizar_movimiento_desde_ingreso_comun(sender, instance, created, **kwargs):
    """
    Refleja cada IngresoComun como Movimiento INGRESO en efectivo en cuenta Personal.
    """
    cuenta = _asegurar_cuenta_personal(instance.usuario)
    metodo = _obtener_metodo_efectivo()
    categoria = _obtener_categoria_ingreso_declarado()

    payload = {
        'familia_id': instance.familia_id,
        'usuario_id': instance.usuario_id,
        'cuenta_id': cuenta.pk,
        'tipo': 'INGRESO',
        'ambito': 'PERSONAL',
        'categoria_id': categoria.pk,
        'metodo_pago_id': metodo.pk,
        'fecha': instance.mes,
        'monto': instance.monto,
        'comentario': instance.origen or '',
    }

    if created or not instance.movimiento_id:
        mov = Movimiento.objects.create(
            familia_id=instance.familia_id,
            usuario_id=instance.usuario_id,
            cuenta=cuenta,
            tipo='INGRESO',
            ambito='PERSONAL',
            categoria=categoria,
            metodo_pago=metodo,
            fecha=instance.mes,
            monto=instance.monto,
            comentario=instance.origen or '',
        )
        IngresoComun.objects.filter(pk=instance.pk).update(movimiento_id=mov.pk)
    else:
        Movimiento.objects.filter(pk=instance.movimiento_id).update(**payload)


@receiver(post_delete, sender=IngresoComun)
def eliminar_movimiento_vinculado_ingreso_comun(sender, instance, **kwargs):
    if instance.movimiento_id:
        Movimiento.objects.filter(pk=instance.movimiento_id).delete()


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
