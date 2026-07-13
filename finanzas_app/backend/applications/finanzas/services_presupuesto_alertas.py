"""Alertas in-app cuando el gasto de una categoría cruza umbrales del presupuesto."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model

from applications.espacios.models import Espacio
from applications.usuarios.formato_moneda import formatear_monto_codigo

from .models import Movimiento, NotificacionUsuario, Presupuesto
from .recalculo_context import get_recalculo_context
from .services.presupuesto_mes import gasto_categoria_mes

User = get_user_model()

_MESES_ES = (
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
)


def umbrales_a_evaluar(umbral_usuario: int) -> list[int]:
    umbral = max(50, min(100, int(umbral_usuario)))
    if umbral >= 100:
        return [100]
    return sorted({umbral, 100})


def _suprimidas() -> bool:
    ctx = get_recalculo_context()
    return bool(ctx and ctx.suprimir_notificaciones)


def _mes_etiqueta(mes: int, anio: int) -> str:
    if 1 <= mes <= 12:
        return f'{_MESES_ES[mes - 1]} {anio}'
    return f'{mes:02d}/{anio}'


def _ambito_etiqueta(ambito: str) -> str:
    return 'familiar' if ambito == 'FAMILIAR' else 'personal'


def ya_notificado(
    usuario_id: int,
    espacio_id: int,
    categoria_id: int,
    mes: int,
    anio: int,
    umbral_disparado: int,
) -> bool:
    return NotificacionUsuario.objects.filter(
        usuario_id=usuario_id,
        espacio_id=espacio_id,
        tipo=NotificacionUsuario.TIPO_PRESUPUESTO_UMBRAL,
        payload__categoria_id=categoria_id,
        payload__mes=mes,
        payload__anio=anio,
        payload__umbral_disparado=umbral_disparado,
    ).exists()


def umbral_pendiente_mas_alto(
    umbrales: list[int],
    porcentaje: float,
    usuario_id: int,
    espacio_id: int,
    categoria_id: int,
    mes: int,
    anio: int,
) -> int | None:
    """
    Si un mismo evento cruza varios umbrales (p. ej. 85% y 100%), devuelve solo el más alto
    que aún no tenga notificación. Si el gasto sube gradualmente, en otra evaluación
    puede dispararse un umbral menor ya notificado o el siguiente pendiente.
    """
    cruzados = [u for u in umbrales if porcentaje >= u]
    for umbral in reversed(cruzados):
        if not ya_notificado(usuario_id, espacio_id, categoria_id, mes, anio, umbral):
            return umbral
    return None


def destinatarios_presupuesto(presupuesto: Presupuesto, espacio_id: int) -> list[User]:
    if presupuesto.usuario_id is None:
        return list(
            User.objects.filter(
                pertenencias_espacio__espacio_id=espacio_id,
                pertenencias_espacio__activo=True,
                activo=True,
                notif_presupuesto_activa=True,
            ).distinct()
        )
    try:
        u = User.objects.get(
            pk=presupuesto.usuario_id,
            activo=True,
            notif_presupuesto_activa=True,
        )
    except User.DoesNotExist:
        return []
    return [u]


def _titulo_y_mensaje(
    categoria_nombre: str,
    ambito: str,
    mes: int,
    anio: int,
    gastado: int,
    presupuestado: int,
    porcentaje: float,
    umbral_disparado: int,
    moneda_codigo: str,
) -> tuple[str, str]:
    mes_txt = _mes_etiqueta(mes, anio)
    ambito_txt = _ambito_etiqueta(ambito)
    gastado_txt = formatear_monto_codigo(gastado, moneda_codigo)
    pres_txt = formatear_monto_codigo(presupuestado, moneda_codigo)

    if umbral_disparado >= 100:
        titulo = f'Presupuesto superado: {categoria_nombre}'
        mensaje = (
            f'{categoria_nombre} superó el presupuesto {ambito_txt} ({mes_txt}): '
            f'{gastado_txt} de {pres_txt}.'
        )
    else:
        titulo = f'Presupuesto al {int(round(porcentaje))}%: {categoria_nombre}'
        mensaje = (
            f'{categoria_nombre} alcanzó el {porcentaje:.0f}% del presupuesto {ambito_txt} '
            f'({mes_txt}): {gastado_txt} de {pres_txt}.'
        )
    return titulo, mensaje


def evaluar_alertas_categoria(
    espacio_id: int,
    categoria_id: int,
    mes: int,
    anio: int,
    ambito: str,
    usuario_presupuesto_id: int | None,
) -> None:
    if _suprimidas():
        return

    mes_first = date(anio, mes, 1)
    pres_filter = {
        'espacio_id': espacio_id,
        'mes': mes_first,
        'categoria_id': categoria_id,
    }
    if ambito == 'FAMILIAR':
        pres_filter['usuario__isnull'] = True
    else:
        if usuario_presupuesto_id is None:
            return
        pres_filter['usuario_id'] = usuario_presupuesto_id

    presupuesto = (
        Presupuesto.objects.filter(**pres_filter)
        .select_related('categoria')
        .first()
    )
    if presupuesto is None or presupuesto.monto <= 0:
        return

    try:
        espacio = Espacio.objects.get(pk=espacio_id)
    except Espacio.DoesNotExist:
        return

    presupuestado = int(presupuesto.monto.quantize(Decimal('1')))
    destinatarios = destinatarios_presupuesto(presupuesto, espacio_id)
    if not destinatarios:
        return

    usuario_gasto = presupuesto.usuario or destinatarios[0]

    cuenta_id = presupuesto.categoria.cuenta_personal_id
    gastado = gasto_categoria_mes(
        usuario_gasto,
        categoria_id,
        mes,
        anio,
        ambito,
        cuenta_id=cuenta_id,
        espacio=espacio,
    )
    if gastado <= 0:
        return

    porcentaje = round((gastado / presupuestado) * 100, 1) if presupuestado > 0 else 0.0

    for destinatario in destinatarios:
        umbrales = umbrales_a_evaluar(destinatario.notif_presupuesto_umbral_pct)
        umbral = umbral_pendiente_mas_alto(
            umbrales,
            porcentaje,
            destinatario.pk,
            espacio_id,
            categoria_id,
            mes,
            anio,
        )
        if umbral is None:
            continue

        moneda = (destinatario.moneda_display or 'CLP').upper()
        titulo, mensaje = _titulo_y_mensaje(
            presupuesto.categoria.nombre,
            ambito,
            mes,
            anio,
            gastado,
            presupuestado,
            porcentaje,
            umbral,
            moneda,
        )
        NotificacionUsuario.objects.create(
            usuario=destinatario,
            espacio_id=espacio_id,
            cambio=None,
            tipo=NotificacionUsuario.TIPO_PRESUPUESTO_UMBRAL,
            titulo=titulo,
            mensaje=mensaje,
            payload={
                'mes': mes,
                'anio': anio,
                'categoria_id': categoria_id,
                'categoria_nombre': presupuesto.categoria.nombre,
                'ambito': ambito,
                'presupuesto_id': presupuesto.pk,
                'monto_presupuestado': str(presupuestado),
                'gastado': str(gastado),
                'porcentaje': porcentaje,
                'umbral_disparado': umbral,
                'cuenta_id': cuenta_id,
            },
        )


def evaluar_alertas_por_movimiento(movimiento_id: int) -> None:
    if _suprimidas():
        return
    try:
        mov = Movimiento.objects.select_related('categoria').get(pk=movimiento_id)
    except Movimiento.DoesNotExist:
        return
    if mov.tipo != 'EGRESO' or mov.oculto or not mov.espacio_id:
        return

    mes = mov.fecha.month
    anio = mov.fecha.year
    if mov.ambito == 'COMUN':
        evaluar_alertas_categoria(
            mov.espacio_id,
            mov.categoria_id,
            mes,
            anio,
            'FAMILIAR',
            None,
        )
    elif mov.ambito == 'PERSONAL':
        evaluar_alertas_categoria(
            mov.espacio_id,
            mov.categoria_id,
            mes,
            anio,
            'PERSONAL',
            mov.usuario_id,
        )


def evaluar_alertas_por_cuota(cuota_id: int) -> None:
    if _suprimidas():
        return
    from .models import Cuota

    try:
        cuota = Cuota.objects.select_related('movimiento', 'movimiento__categoria').get(pk=cuota_id)
    except Cuota.DoesNotExist:
        return

    mov = cuota.movimiento
    if mov.tipo != 'EGRESO' or mov.oculto or not mov.espacio_id:
        return

    mes = cuota.mes_facturacion.month
    anio = cuota.mes_facturacion.year
    if mov.ambito == 'COMUN':
        evaluar_alertas_categoria(
            mov.espacio_id,
            mov.categoria_id,
            mes,
            anio,
            'FAMILIAR',
            None,
        )
    elif mov.ambito == 'PERSONAL':
        evaluar_alertas_categoria(
            mov.espacio_id,
            mov.categoria_id,
            mes,
            anio,
            'PERSONAL',
            mov.usuario_id,
        )


def evaluar_alertas_por_presupuesto(presupuesto_id: int) -> None:
    if _suprimidas():
        return
    try:
        pres = Presupuesto.objects.select_related('categoria').get(pk=presupuesto_id)
    except Presupuesto.DoesNotExist:
        return
    if pres.monto <= 0:
        return

    mes = pres.mes.month
    anio = pres.mes.year
    if pres.usuario_id is None:
        evaluar_alertas_categoria(
            pres.espacio_id,
            pres.categoria_id,
            mes,
            anio,
            'FAMILIAR',
            None,
        )
    else:
        evaluar_alertas_categoria(
            pres.espacio_id,
            pres.categoria_id,
            mes,
            anio,
            'PERSONAL',
            pres.usuario_id,
        )
