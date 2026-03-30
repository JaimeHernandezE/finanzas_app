# applications/finanzas/signals.py

from decimal import Decimal, ROUND_DOWN
from datetime import date, datetime

from django.contrib.auth import get_user_model
from django.db.models.signals import post_delete, post_save, pre_save
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
from . import services_recalculo

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


@receiver(pre_save, sender=Movimiento)
def _cache_movimiento_fecha_resumen(sender, instance, **kwargs):
    if instance.pk:
        try:
            prev = Movimiento.objects.get(pk=instance.pk)
            instance._fecha_previa_resumen = prev.fecha
        except Movimiento.DoesNotExist:
            pass


@receiver(post_save, sender=Movimiento)
def invalidar_resumen_tras_movimiento_comun(sender, instance, **kwargs):
    if instance.ambito != 'COMUN' or not instance.familia_id:
        return
    meses = {services_recalculo.primer_dia_mes(instance.fecha)}
    prev = getattr(instance, '_fecha_previa_resumen', None)
    if prev:
        meses.add(services_recalculo.primer_dia_mes(prev))
    services_recalculo.invalidar_snapshots_resumen_historico(instance.familia_id, meses)


@receiver(post_delete, sender=Movimiento)
def invalidar_resumen_borrar_movimiento_comun(sender, instance, **kwargs):
    if instance.ambito != 'COMUN' or not instance.familia_id:
        return
    services_recalculo.invalidar_snapshots_resumen_historico(
        instance.familia_id,
        [services_recalculo.primer_dia_mes(instance.fecha)],
    )


@receiver(pre_save, sender=IngresoComun)
def _cache_ingreso_comun_mes_resumen(sender, instance, **kwargs):
    if instance.pk:
        try:
            prev = IngresoComun.objects.get(pk=instance.pk)
            instance._mes_previo_resumen = prev.mes
        except IngresoComun.DoesNotExist:
            pass


@receiver(post_save, sender=IngresoComun)
def invalidar_resumen_tras_ingreso_comun(sender, instance, **kwargs):
    meses = {services_recalculo.primer_dia_mes(instance.mes)}
    prev = getattr(instance, '_mes_previo_resumen', None)
    if prev:
        meses.add(services_recalculo.primer_dia_mes(prev))
    services_recalculo.invalidar_snapshots_resumen_historico(instance.familia_id, meses)


@receiver(post_delete, sender=IngresoComun)
def invalidar_resumen_borrar_ingreso_comun(sender, instance, **kwargs):
    services_recalculo.invalidar_snapshots_resumen_historico(
        instance.familia_id,
        [services_recalculo.primer_dia_mes(instance.mes)],
    )


@receiver(post_save, sender=IngresoComun)
def sincronizar_movimiento_desde_ingreso_comun(sender, instance, created, **kwargs):
    """
    Refleja cada IngresoComun como Movimiento INGRESO en efectivo en cuenta Personal.
    """
    cuenta = _asegurar_cuenta_personal(instance.usuario)
    metodo = _obtener_metodo_efectivo()
    categoria = _obtener_categoria_ingreso_declarado()

    fecha_mov = instance.fecha_pago or instance.mes

    if created or not instance.movimiento_id:
        mov = Movimiento.objects.create(
            familia_id=instance.familia_id,
            usuario_id=instance.usuario_id,
            cuenta=cuenta,
            tipo='INGRESO',
            ambito='PERSONAL',
            categoria=categoria,
            metodo_pago=metodo,
            fecha=fecha_mov,
            monto=instance.monto,
            comentario=instance.origen or '',
        )
        IngresoComun.objects.filter(pk=instance.pk).update(movimiento_id=mov.pk)
    else:
        mov = Movimiento.objects.get(pk=instance.movimiento_id)
        mov.familia_id = instance.familia_id
        mov.usuario_id = instance.usuario_id
        mov.cuenta = cuenta
        mov.tipo = 'INGRESO'
        mov.ambito = 'PERSONAL'
        mov.categoria = categoria
        mov.metodo_pago = metodo
        mov.fecha = fecha_mov
        mov.monto = instance.monto
        mov.comentario = instance.origen or ''
        mov.save()


@receiver(post_save, sender=IngresoComun)
def dispatch_recalculo_snapshots_tras_ingreso_comun(sender, instance, **kwargs):
    """
    Liquidación usa el mes declarado en IngresoComun (puede diferir del mes del Movimiento).
    Debe ejecutarse después de sincronizar_movimiento_desde_ingreso_comun.
    """
    if not instance.familia_id:
        return
    meses = {services_recalculo.primer_dia_mes(instance.mes)}
    prev = getattr(instance, '_mes_previo_resumen', None)
    if prev:
        meses.add(services_recalculo.primer_dia_mes(prev))
    services_recalculo.dispatch_recalculo_multiples_meses(instance.familia_id, meses)


@receiver(post_delete, sender=IngresoComun)
def eliminar_movimiento_vinculado_ingreso_comun(sender, instance, **kwargs):
    if instance.movimiento_id:
        Movimiento.objects.filter(pk=instance.movimiento_id).delete()


@receiver(post_delete, sender=IngresoComun)
def dispatch_recalculo_snapshots_borrar_ingreso_comun(sender, instance, **kwargs):
    """
    Tras borrar el Movimiento vinculado: recalcula liquidación por mes declarado en IngresoComun.
    Debe ir después de eliminar_movimiento_vinculado_ingreso_comun.
    """
    if not instance.familia_id:
        return
    services_recalculo.dispatch_recalculo_multiples_meses(
        instance.familia_id,
        services_recalculo.meses_afectados_por_ingreso_comun(instance, None),
    )


def calcular_mes_base(fecha_gasto: date, dia_facturacion: int | None) -> date:
    """
    Calcula el primer mes de facturación de las cuotas según el ciclo
    de la tarjeta.

    Si la tarjeta no tiene día de facturación definido, usa el mes
    calendario del gasto (comportamiento anterior).

    Ejemplos con dia_facturacion=15:
      - gasto 10 mar → primer mes: marzo   (10 <= 15)
      - gasto 15 mar → primer mes: marzo   (15 <= 15)
      - gasto 16 mar → primer mes: abril   (16 > 15)
    """
    if not dia_facturacion:
        return date(fecha_gasto.year, fecha_gasto.month, 1)

    if fecha_gasto.day <= dia_facturacion:
        return date(fecha_gasto.year, fecha_gasto.month, 1)
    else:
        siguiente = date(fecha_gasto.year, fecha_gasto.month, 1) + relativedelta(months=1)
        return date(siguiente.year, siguiente.month, 1)


@receiver(post_save, sender=Movimiento)
def generar_cuotas(sender, instance, created, **kwargs):
    """
    Genera automáticamente los registros de Cuota cuando se crea
    un Movimiento con método de pago tipo CRÉDITO.

    El mes de facturación de la primera cuota se calcula según
    el día de facturación de la tarjeta asociada al movimiento.
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

    # Obtener el día de facturación de la tarjeta si existe
    dia_facturacion = None
    if instance.tarjeta:
        dia_facturacion = instance.tarjeta.dia_facturacion

    mes_base = calcular_mes_base(fecha, dia_facturacion)

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


@receiver(post_save, sender=Movimiento)
def dispatch_recalculo_snapshots_tras_movimiento(sender, instance, **kwargs):
    """Recalcula snapshots mensuales (liquidación, saldos por cuenta) al crear/editar movimiento."""
    if not instance.familia_id:
        return
    meses = {services_recalculo.primer_dia_mes(instance.fecha)}
    prev = getattr(instance, '_fecha_previa_resumen', None)
    if prev:
        meses.add(services_recalculo.primer_dia_mes(prev))
    services_recalculo.dispatch_recalculo_multiples_meses(instance.familia_id, meses)


@receiver(post_delete, sender=Movimiento)
def dispatch_recalculo_snapshots_borrar_movimiento(sender, instance, **kwargs):
    if not instance.familia_id:
        return
    services_recalculo.dispatch_recalculo_multiples_meses(
        instance.familia_id,
        {services_recalculo.primer_dia_mes(instance.fecha)},
    )
