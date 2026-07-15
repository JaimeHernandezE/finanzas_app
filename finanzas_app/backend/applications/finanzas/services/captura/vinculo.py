"""Códigos de vinculación Telegram / WhatsApp."""

from __future__ import annotations

import secrets
import string
from datetime import timedelta

from django.utils import timezone

from applications.finanzas.models import CodigoVinculoCaptura
from applications.usuarios.models import Usuario


def generar_codigo_vinculo(usuario, canal: str, *, minutos: int = 30) -> CodigoVinculoCaptura:
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(20):
        codigo = ''.join(secrets.choice(alphabet) for _ in range(8))
        if not CodigoVinculoCaptura.objects.filter(codigo=codigo).exists():
            break
    else:
        raise RuntimeError('No se pudo generar código de vínculo único.')

    return CodigoVinculoCaptura.objects.create(
        usuario=usuario,
        canal=canal,
        codigo=codigo,
        expira_at=timezone.now() + timedelta(minutes=minutos),
    )


def canjear_codigo_vinculo(
    codigo: str,
    *,
    canal: str,
    telegram_chat_id: str = '',
    whatsapp_phone: str = '',
) -> Usuario:
    now = timezone.now()
    row = (
        CodigoVinculoCaptura.objects
        .select_related('usuario')
        .filter(codigo=codigo.strip().upper(), canal=canal, usado_at__isnull=True)
        .first()
    )
    if row is None:
        raise ValueError('Código inválido o ya usado.')
    if row.expira_at < now:
        raise ValueError('Código expirado.')

    usuario = row.usuario
    if canal == CodigoVinculoCaptura.CANAL_TELEGRAM:
        if not telegram_chat_id:
            raise ValueError('Falta chat_id de Telegram.')
        # Liberar chat_id si estaba en otro usuario
        Usuario.objects.filter(telegram_chat_id=telegram_chat_id).exclude(pk=usuario.pk).update(
            telegram_chat_id='',
            telegram_vinculado=False,
        )
        usuario.telegram_chat_id = str(telegram_chat_id)
        usuario.telegram_vinculado = True
        usuario.save(update_fields=['telegram_chat_id', 'telegram_vinculado'])
    elif canal == CodigoVinculoCaptura.CANAL_WHATSAPP:
        phone = (whatsapp_phone or '').strip()
        if not phone:
            raise ValueError('Falta teléfono de WhatsApp.')
        Usuario.objects.filter(whatsapp_phone=phone).exclude(pk=usuario.pk).update(
            whatsapp_phone='',
            whatsapp_vinculado=False,
        )
        usuario.whatsapp_phone = phone
        usuario.whatsapp_vinculado = True
        usuario.save(update_fields=['whatsapp_phone', 'whatsapp_vinculado'])
    else:
        raise ValueError('Canal no soportado.')

    row.usado_at = now
    row.save(update_fields=['usado_at'])
    return usuario
