# applications/finanzas/signals.py

from decimal import Decimal, ROUND_DOWN
from datetime import date, datetime

from django.contrib.auth import get_user_model
from django.db.models.signals import post_delete, post_save, pre_delete, pre_save
from django.dispatch import receiver
from dateutil.relativedelta import relativedelta

from .models import (
    CATEGORIA_INGRESO_DECLARADO_FONDO_COMUN,
    CambioCompensacionMensual,
    Categoria,
    CuentaPersonal,
    IngresoComun,
    MetodoPago,
    Movimiento,
    Cuota,
)
from . import services_recalculo
from .recalculo_context import RecalculoContext, recalculo_context


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
        espacio__isnull=True,
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


def _meses_compensacion_movimiento(instance: Movimiento) -> set[date]:
    meses = {services_recalculo.primer_dia_mes(instance.fecha)}
    prev = getattr(instance, '_fecha_previa_resumen', None)
    if prev:
        meses.add(services_recalculo.primer_dia_mes(prev))
    return meses


def _cache_payloads_compensacion_antes(
    instance, espacio_id: int, meses: set[date]
) -> dict[str, dict]:
    """Estado de compensación antes de persistir el cambio (lee la BD aún sin el nuevo valor)."""
    cache: dict[str, dict] = {}
    for mes_pd in meses:
        row = services_recalculo.calcular_resumen_mes(espacio_id, mes_pd, miembros=None)
        if row is not None:
            cache[services_recalculo.primer_dia_mes(mes_pd).isoformat()] = row
    return cache


@receiver(pre_save, sender=Movimiento)
def _cache_movimiento_fecha_resumen(sender, instance, **kwargs):
    if instance.pk:
        try:
            prev = Movimiento.objects.get(pk=instance.pk)
            instance._fecha_previa_resumen = prev.fecha
        except Movimiento.DoesNotExist:
            pass


@receiver(pre_save, sender=Movimiento)
def _cache_payload_compensacion_antes_movimiento(sender, instance, **kwargs):
    if instance.ambito != 'COMUN' or not instance.espacio_id:
        return
    instance._payload_resumen_antes_por_mes = _cache_payloads_compensacion_antes(
        instance,
        instance.espacio_id,
        _meses_compensacion_movimiento(instance),
    )


@receiver(pre_delete, sender=Movimiento)
def _cache_payload_compensacion_antes_borrar_movimiento(sender, instance, **kwargs):
    if instance.ambito != 'COMUN' or not instance.espacio_id:
        return
    mes_pd = services_recalculo.primer_dia_mes(instance.fecha)
    instance._payload_resumen_antes_por_mes = _cache_payloads_compensacion_antes(
        instance,
        instance.espacio_id,
        {mes_pd},
    )


@receiver(pre_save, sender=IngresoComun)
def _cache_ingreso_comun_mes_resumen(sender, instance, **kwargs):
    if instance.pk:
        try:
            prev = IngresoComun.objects.get(pk=instance.pk)
            instance._mes_previo_resumen = prev.mes
        except IngresoComun.DoesNotExist:
            pass


@receiver(pre_save, sender=IngresoComun)
def _cache_payload_compensacion_antes_ingreso(sender, instance, **kwargs):
    if not instance.espacio_id:
        return
    meses = {services_recalculo.primer_dia_mes(instance.mes)}
    prev = getattr(instance, '_mes_previo_resumen', None)
    if prev:
        meses.add(services_recalculo.primer_dia_mes(prev))
    instance._payload_resumen_antes_por_mes = _cache_payloads_compensacion_antes(
        instance,
        instance.espacio_id,
        meses,
    )


@receiver(pre_delete, sender=IngresoComun)
def _cache_payload_compensacion_antes_borrar_ingreso(sender, instance, **kwargs):
    if not instance.espacio_id:
        return
    mes_pd = services_recalculo.primer_dia_mes(instance.mes)
    instance._payload_resumen_antes_por_mes = _cache_payloads_compensacion_antes(
        instance,
        instance.espacio_id,
        {mes_pd},
    )


@receiver(post_save, sender=IngresoComun)
def sincronizar_movimiento_desde_ingreso_comun(sender, instance, created, **kwargs):
    """
    Refleja cada IngresoComun como Movimiento INGRESO en efectivo en cuenta Personal.
    """
    if getattr(instance, '_skip_signal', False):
        return
    cuenta = _asegurar_cuenta_personal(instance.usuario)
    metodo = _obtener_metodo_efectivo()
    categoria = _obtener_categoria_ingreso_declarado()

    fecha_mov = instance.fecha_pago or instance.mes

    if created or not instance.movimiento_id:
        mov = Movimiento.objects.create(
            espacio_id=instance.espacio_id,
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
        mov.espacio_id = instance.espacio_id
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
    if not instance.espacio_id:
        return
    meses = {services_recalculo.primer_dia_mes(instance.mes)}
    prev = getattr(instance, '_mes_previo_resumen', None)
    if prev:
        meses.add(services_recalculo.primer_dia_mes(prev))
    ctx = RecalculoContext(
        modificado_por_id=instance.usuario_id,
        origen_tipo=CambioCompensacionMensual.ORIGEN_INGRESO_COMUN,
        origen_id=instance.pk,
        payloads_resumen_antes=getattr(instance, '_payload_resumen_antes_por_mes', None),
    )
    with recalculo_context(ctx):
        services_recalculo.dispatch_recalculo_multiples_meses(
            instance.espacio_id,
            meses,
            refrescar_resumen_compensacion=True,
        )


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
    if not instance.espacio_id:
        return
    ctx = RecalculoContext(
        modificado_por_id=instance.usuario_id,
        origen_tipo=CambioCompensacionMensual.ORIGEN_INGRESO_COMUN,
        origen_id=instance.pk,
        payloads_resumen_antes=getattr(instance, '_payload_resumen_antes_por_mes', None),
    )
    with recalculo_context(ctx):
        services_recalculo.dispatch_recalculo_multiples_meses(
            instance.espacio_id,
            services_recalculo.meses_afectados_por_ingreso_comun(instance, None),
            refrescar_resumen_compensacion=True,
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

    if getattr(instance, '_skip_cuota_signal', False):
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


def _meses_movimiento_afectados(instance: Movimiento) -> set[date]:
    meses = {services_recalculo.primer_dia_mes(instance.fecha)}
    prev = getattr(instance, '_fecha_previa_resumen', None)
    if prev:
        meses.add(services_recalculo.primer_dia_mes(prev))
    return meses


@receiver(post_save, sender=Movimiento)
def dispatch_recalculo_snapshots_tras_movimiento(sender, instance, **kwargs):
    """Recalcula snapshots mensuales al crear/editar movimiento."""
    if not instance.espacio_id:
        return
    meses = _meses_movimiento_afectados(instance)
    refrescar_resumen = instance.ambito == 'COMUN'
    ctx = RecalculoContext(
        modificado_por_id=instance.usuario_id,
        origen_tipo=CambioCompensacionMensual.ORIGEN_MOVIMIENTO,
        origen_id=instance.pk,
        payloads_resumen_antes=getattr(instance, '_payload_resumen_antes_por_mes', None),
    )
    with recalculo_context(ctx):
        services_recalculo.dispatch_recalculo_multiples_meses(
            instance.espacio_id,
            meses,
            refrescar_resumen_compensacion=refrescar_resumen,
        )


@receiver(post_delete, sender=Movimiento)
def dispatch_recalculo_snapshots_borrar_movimiento(sender, instance, **kwargs):
    if not instance.espacio_id:
        return
    meses = {services_recalculo.primer_dia_mes(instance.fecha)}
    refrescar_resumen = instance.ambito == 'COMUN'
    ctx = RecalculoContext(
        modificado_por_id=instance.usuario_id,
        origen_tipo=CambioCompensacionMensual.ORIGEN_MOVIMIENTO,
        origen_id=instance.pk,
        payloads_resumen_antes=getattr(instance, '_payload_resumen_antes_por_mes', None),
    )
    with recalculo_context(ctx):
        services_recalculo.dispatch_recalculo_multiples_meses(
            instance.espacio_id,
            meses,
            refrescar_resumen_compensacion=refrescar_resumen,
        )
