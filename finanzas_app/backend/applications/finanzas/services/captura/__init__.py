"""
Servicios de captura: crear / confirmar / descartar MovimientoPendiente.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from applications.finanzas.models import (
    Movimiento,
    MovimientoPendiente,
    NotificacionUsuario,
    Tarjeta,
)
from applications.finanzas.serializers import MovimientoSerializer


class CapturaError(Exception):
    """Error de dominio al operar sobre un pendiente."""

    def __init__(self, mensaje: str, *, code: str = 'captura_error'):
        self.mensaje = mensaje
        self.code = code
        super().__init__(mensaje)


def _decimal(monto) -> Decimal:
    return Decimal(str(monto)).quantize(Decimal('0.01'))


def buscar_duplicado_movimiento(
    *,
    usuario,
    espacio,
    monto,
    fecha: date,
    tolerancia_dias: int = 1,
) -> Movimiento | None:
    monto_d = _decimal(monto)
    desde = fecha - timedelta(days=tolerancia_dias)
    hasta = fecha + timedelta(days=tolerancia_dias)
    return (
        Movimiento.objects.filter(
            usuario=usuario,
            espacio=espacio,
            monto=monto_d,
            fecha__gte=desde,
            fecha__lte=hasta,
        )
        .order_by('-fecha', '-created_at')
        .first()
    )


def buscar_duplicado_pendiente(
    *,
    usuario,
    espacio,
    monto,
    fecha: date,
    tolerancia_dias: int = 1,
    excluir_id: int | None = None,
) -> MovimientoPendiente | None:
    monto_d = _decimal(monto)
    desde = fecha - timedelta(days=tolerancia_dias)
    hasta = fecha + timedelta(days=tolerancia_dias)
    qs = MovimientoPendiente.objects.filter(
        usuario=usuario,
        espacio=espacio,
        estado=MovimientoPendiente.ESTADO_PENDIENTE,
        monto=monto_d,
        fecha__gte=desde,
        fecha__lte=hasta,
    )
    if excluir_id:
        qs = qs.exclude(pk=excluir_id)
    return qs.order_by('-creado_at').first()


def emitir_notificacion_pendiente(pendiente: MovimientoPendiente) -> NotificacionUsuario:
    comercio = pendiente.comercio or 'sin comercio'
    return NotificacionUsuario.objects.create(
        usuario=pendiente.usuario,
        espacio=pendiente.espacio,
        tipo=NotificacionUsuario.TIPO_MOVIMIENTO_PENDIENTE,
        titulo='Movimiento pendiente de confirmar',
        mensaje=f'${pendiente.monto} — {comercio}. Confírmalo en Pendientes o en el bot.',
        payload={
            'pendiente_id': pendiente.id,
            'origen': pendiente.origen,
            'monto': str(pendiente.monto),
            'comercio': pendiente.comercio,
        },
    )


def crear_pendiente(
    *,
    usuario,
    espacio,
    origen: str,
    monto,
    fecha: date | str | None = None,
    comercio: str = '',
    tipo: str = 'EGRESO',
    categoria_sugerida=None,
    ambito_sugerido: str | None = None,
    metodo_pago_sugerido=None,
    tarjeta_sugerida=None,
    cuenta_sugerida=None,
    confianza: float = 0.0,
    payload_original: dict | None = None,
    hash_externo: str = '',
    notificar: bool = False,
) -> MovimientoPendiente:
    """
    Crea un MovimientoPendiente. Si hay hash_externo duplicado o match
    con movimiento/pendiente existente, marca DUPLICADO o reutiliza.
    """
    if isinstance(fecha, str) and fecha.strip():
        from datetime import date as date_cls
        fecha_f = date_cls.fromisoformat(fecha[:10])
    else:
        fecha_f = fecha or timezone.localdate()
    monto_d = _decimal(monto)
    payload_original = payload_original or {}

    if hash_externo:
        existente = MovimientoPendiente.objects.filter(
            usuario=usuario,
            espacio=espacio,
            hash_externo=hash_externo,
        ).first()
        if existente:
            return existente

    movimiento_dup = buscar_duplicado_movimiento(
        usuario=usuario, espacio=espacio, monto=monto_d, fecha=fecha_f,
    )
    if movimiento_dup:
        pendiente = MovimientoPendiente.objects.create(
            usuario=usuario,
            espacio=espacio,
            origen=origen,
            tipo=tipo,
            monto=monto_d,
            fecha=fecha_f,
            comercio=comercio or '',
            categoria_sugerida=categoria_sugerida,
            ambito_sugerido=ambito_sugerido,
            metodo_pago_sugerido=metodo_pago_sugerido,
            tarjeta_sugerida=tarjeta_sugerida,
            cuenta_sugerida=cuenta_sugerida,
            confianza=confianza,
            payload_original=payload_original,
            estado=MovimientoPendiente.ESTADO_DUPLICADO,
            movimiento=movimiento_dup,
            hash_externo=hash_externo or '',
        )
        return pendiente

    otro = buscar_duplicado_pendiente(
        usuario=usuario, espacio=espacio, monto=monto_d, fecha=fecha_f,
    )
    if otro:
        # Fusionar: subir confianza / completar sugerencias vacías
        if confianza > (otro.confianza or 0):
            otro.confianza = confianza
        if comercio and not otro.comercio:
            otro.comercio = comercio
        if categoria_sugerida and not otro.categoria_sugerida_id:
            otro.categoria_sugerida = categoria_sugerida
        if ambito_sugerido and not otro.ambito_sugerido:
            otro.ambito_sugerido = ambito_sugerido
        if metodo_pago_sugerido and not otro.metodo_pago_sugerido_id:
            otro.metodo_pago_sugerido = metodo_pago_sugerido
        if tarjeta_sugerida and not otro.tarjeta_sugerida_id:
            otro.tarjeta_sugerida = tarjeta_sugerida
        if cuenta_sugerida and not otro.cuenta_sugerida_id:
            otro.cuenta_sugerida = cuenta_sugerida
        if payload_original:
            merged = dict(otro.payload_original or {})
            merged.update(payload_original)
            otro.payload_original = merged
        if hash_externo and not otro.hash_externo:
            otro.hash_externo = hash_externo
        otro.save()
        return otro

    pendiente = MovimientoPendiente.objects.create(
        usuario=usuario,
        espacio=espacio,
        origen=origen,
        tipo=tipo,
        monto=monto_d,
        fecha=fecha_f,
        comercio=comercio or '',
        categoria_sugerida=categoria_sugerida,
        ambito_sugerido=ambito_sugerido,
        metodo_pago_sugerido=metodo_pago_sugerido,
        tarjeta_sugerida=tarjeta_sugerida,
        cuenta_sugerida=cuenta_sugerida,
        confianza=confianza,
        payload_original=payload_original,
        estado=MovimientoPendiente.ESTADO_PENDIENTE,
        hash_externo=hash_externo or '',
    )
    if notificar:
        emitir_notificacion_pendiente(pendiente)
    return pendiente


def _payload_confirmacion(
    pendiente: MovimientoPendiente,
    overrides: dict[str, Any] | None,
) -> dict[str, Any]:
    o = overrides or {}
    ambito = o.get('ambito') or pendiente.ambito_sugerido
    categoria = o.get('categoria') or (
        pendiente.categoria_sugerida_id if pendiente.categoria_sugerida_id else None
    )
    metodo_pago = o.get('metodo_pago') or (
        pendiente.metodo_pago_sugerido_id if pendiente.metodo_pago_sugerido_id else None
    )
    cuenta = o.get('cuenta') if 'cuenta' in o else (
        pendiente.cuenta_sugerida_id if pendiente.cuenta_sugerida_id else None
    )
    tarjeta = o.get('tarjeta') if 'tarjeta' in o else (
        pendiente.tarjeta_sugerida_id if pendiente.tarjeta_sugerida_id else None
    )
    comentario = o.get('comentario')
    if comentario is None:
        comentario = pendiente.comercio or ''

    data: dict[str, Any] = {
        'fecha': o.get('fecha') or pendiente.fecha,
        'tipo': o.get('tipo') or pendiente.tipo or 'EGRESO',
        'ambito': ambito,
        'categoria': categoria,
        'monto': o.get('monto') or pendiente.monto,
        'comentario': comentario,
        'metodo_pago': metodo_pago,
        'oculto': False,
    }
    if cuenta is not None:
        data['cuenta'] = cuenta
    if tarjeta is not None:
        data['tarjeta'] = tarjeta
    if 'num_cuotas' in o:
        data['num_cuotas'] = o['num_cuotas']
    if 'monto_cuota' in o:
        data['monto_cuota'] = o['monto_cuota']

    faltantes = []
    if not data.get('ambito'):
        faltantes.append('ambito')
    if not data.get('categoria'):
        faltantes.append('categoria')
    if not data.get('metodo_pago'):
        faltantes.append('metodo_pago')
    if faltantes:
        raise CapturaError(
            f'Faltan campos para confirmar: {", ".join(faltantes)}.',
            code='campos_requeridos',
        )
    return data


@transaction.atomic
def confirmar_pendiente(
    pendiente: MovimientoPendiente,
    *,
    overrides: dict[str, Any] | None = None,
) -> Movimiento:
    if pendiente.estado != MovimientoPendiente.ESTADO_PENDIENTE:
        raise CapturaError(
            f'El pendiente no está en estado PENDIENTE (actual: {pendiente.estado}).',
            code='estado_invalido',
        )

    data = _payload_confirmacion(pendiente, overrides)
    serializer = MovimientoSerializer(data=data)
    if not serializer.is_valid():
        raise CapturaError(
            f'Datos inválidos al confirmar: {serializer.errors}',
            code='validacion',
        )
    movimiento = serializer.save(
        usuario=pendiente.usuario,
        espacio=pendiente.espacio,
    )
    pendiente.estado = MovimientoPendiente.ESTADO_CONFIRMADO
    pendiente.movimiento = movimiento
    pendiente.save(update_fields=['estado', 'movimiento', 'actualizado_at'])
    return movimiento


def descartar_pendiente(pendiente: MovimientoPendiente) -> MovimientoPendiente:
    if pendiente.estado != MovimientoPendiente.ESTADO_PENDIENTE:
        raise CapturaError(
            f'El pendiente no está en estado PENDIENTE (actual: {pendiente.estado}).',
            code='estado_invalido',
        )
    pendiente.estado = MovimientoPendiente.ESTADO_DESCARTADO
    pendiente.save(update_fields=['estado', 'actualizado_at'])
    return pendiente


def resolver_tarjeta_por_ultimos_4(*, usuario, ultimos_4: str) -> Tarjeta | None:
    digits = (ultimos_4 or '').strip()
    if len(digits) != 4 or not digits.isdigit():
        return None
    return Tarjeta.objects.filter(usuario=usuario, ultimos_4_digitos=digits).first()
