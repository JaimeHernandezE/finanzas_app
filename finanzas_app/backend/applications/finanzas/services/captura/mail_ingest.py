"""Ingestión de alertas bancarias vía Gmail API / Microsoft Graph (OAuth)."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Sequence

from django.conf import settings
from django.utils import timezone

from applications.espacios.drive_usuario import decrypt_token
from applications.espacios.services import (
    crear_espacio_personal,
    obtener_espacio_familiar_activo,
    obtener_espacio_personal,
)
from applications.finanzas.models import (
    ConfiguracionCapturaCorreo,
    MetodoPago,
    MovimientoPendiente,
)
from applications.finanzas.services.captura import (
    crear_pendiente,
    resolver_tarjeta_por_ultimos_4,
)
from applications.finanzas.services.captura.parsers import parse_email


@dataclass
class IngestStats:
    creados: int = 0
    skip_remitente: int = 0
    skip_parseo: int = 0
    errores: int = 0


def intervalo_minimo_permitido() -> int:
    return int(getattr(settings, 'CAPTURA_EMAIL_INTERVALO_MIN_MINUTOS', 5) or 5)


def normalizar_remitentes(raw: Sequence[Any] | None) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in raw or []:
        s = str(item or '').strip().lower()
        if not s or '@' not in s:
            continue
        if s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


def from_calza_remitentes(from_addr: str, remitentes: Sequence[str]) -> bool:
    addr = (from_addr or '').strip().lower()
    if not addr or not remitentes:
        return False
    dominio = addr.split('@', 1)[-1] if '@' in addr else ''
    for r in remitentes:
        pat = (r or '').strip().lower()
        if not pat:
            continue
        if pat.startswith('@'):
            dom = pat[1:]
            if dom and (dominio == dom or dominio.endswith('.' + dom)):
                return True
        elif '@' in pat:
            if addr == pat:
                return True
        else:
            if dominio == pat or dominio.endswith('.' + pat):
                return True
    return False


def debe_sincronizar(config: ConfiguracionCapturaCorreo, now=None) -> bool:
    now = now or timezone.now()
    if config.ultimo_sync_at is None:
        return True
    mins = max(1, int(config.intervalo_minutos or 15))
    return now >= config.ultimo_sync_at + timedelta(minutes=mins)


def _espacio_para(usuario):
    espacio = obtener_espacio_familiar_activo(usuario) or obtener_espacio_personal(usuario)
    if espacio is None:
        espacio = crear_espacio_personal(usuario)
    return espacio


def _access_token_para(config: ConfiguracionCapturaCorreo) -> str:
    if not config.refresh_token_enc:
        raise ValueError('Correo no conectado (sin refresh token).')
    refresh = decrypt_token(config.refresh_token_enc)
    if config.proveedor == ConfiguracionCapturaCorreo.PROVEEDOR_GMAIL:
        from applications.finanzas.services.captura import oauth_google_mail as gmail

        return gmail.refrescar_access_token(refresh)
    if config.proveedor == ConfiguracionCapturaCorreo.PROVEEDOR_OUTLOOK:
        from applications.finanzas.services.captura import oauth_microsoft as ms

        return ms.refrescar_access_token(refresh)
    raise ValueError(f'Proveedor no soportado: {config.proveedor}')


def probar_conexion_oauth(config: ConfiguracionCapturaCorreo) -> None:
    token = _access_token_para(config)
    if config.proveedor == ConfiguracionCapturaCorreo.PROVEEDOR_GMAIL:
        from applications.finanzas.services.captura import oauth_google_mail as gmail

        gmail.probar_acceso(token)
    else:
        from applications.finanzas.services.captura import oauth_microsoft as ms

        ms.probar_acceso(token)


def ingerir_config(
    config: ConfiguracionCapturaCorreo,
    *,
    dry_run: bool = False,
    limit: int = 50,
    force: bool = False,
) -> IngestStats | None:
    """
    Ingiere no leídos del buzón OAuth.
    Retorna None si se omite por intervalo.
    """
    if not config.conectado or not config.refresh_token_enc:
        return None
    if not force and not debe_sincronizar(config):
        return None

    remitentes = normalizar_remitentes(config.remitentes_banco or [])
    if not remitentes:
        config.ultimo_error = 'Registra al menos un remitente de banco antes de sincronizar.'
        config.save(update_fields=['ultimo_error', 'updated_at'])
        raise ValueError(config.ultimo_error)

    try:
        access = _access_token_para(config)
        if config.proveedor == ConfiguracionCapturaCorreo.PROVEEDOR_GMAIL:
            from applications.finanzas.services.captura import oauth_google_mail as provider
        else:
            from applications.finanzas.services.captura import oauth_microsoft as provider

        messages = provider.listar_no_leidos(access, limit=limit)
        stats = _procesar_mensajes(
            usuario=config.usuario,
            messages=messages,
            remitentes=remitentes,
            notificar=bool(config.notificaciones_activas),
            dry_run=dry_run,
            mark_read=None if dry_run else (lambda mid: provider.marcar_leido(access, mid)),
        )
        if not dry_run:
            config.ultimo_sync_at = timezone.now()
            config.ultimo_error = ''
            config.save(update_fields=['ultimo_sync_at', 'ultimo_error', 'updated_at'])
        return stats
    except Exception as exc:
        config.ultimo_error = str(exc)[:500]
        config.save(update_fields=['ultimo_error', 'updated_at'])
        raise


def _procesar_mensajes(
    *,
    usuario,
    messages: list[dict],
    remitentes: list[str],
    notificar: bool,
    dry_run: bool,
    mark_read,
) -> IngestStats:
    stats = IngestStats()
    espacio = _espacio_para(usuario)
    metodo_default = (
        MetodoPago.objects.filter(tipo='CREDITO').first()
        or MetodoPago.objects.filter(tipo='DEBITO').first()
        or MetodoPago.objects.first()
    )

    for msg in messages:
        mid = msg.get('id') or ''
        from_addr = msg.get('from_addr') or ''
        subject = msg.get('subject') or ''
        body = msg.get('body') or ''

        if not from_calza_remitentes(from_addr, remitentes):
            stats.skip_remitente += 1
            continue

        parsed = parse_email(subject=subject, body=body, from_addr=from_addr)
        if parsed is None:
            stats.skip_parseo += 1
            continue

        if dry_run:
            stats.creados += 1
            continue

        hash_ext = hashlib.sha256(
            f'{mid}|{from_addr}|{subject}|{parsed.monto}'.encode(),
        ).hexdigest()
        tipo_tarjeta = (parsed.tipo_tarjeta or '').upper()
        tarjeta = resolver_tarjeta_por_ultimos_4(
            usuario=usuario,
            ultimos_4=parsed.ultimos_4,
            tipo=tipo_tarjeta or None,
        )
        if tarjeta and tarjeta.tipo in ('DEBITO', 'CREDITO'):
            tipo_metodo = tarjeta.tipo
        elif tipo_tarjeta in ('DEBITO', 'CREDITO'):
            tipo_metodo = tipo_tarjeta
        else:
            tipo_metodo = ''
        metodo = (
            MetodoPago.objects.filter(tipo=tipo_metodo).first()
            if tipo_metodo
            else metodo_default
        )
        hora_str = parsed.hora.strftime('%H:%M') if parsed.hora else ''
        crear_pendiente(
            usuario=usuario,
            espacio=espacio,
            origen=MovimientoPendiente.ORIGEN_EMAIL_BANCO,
            monto=parsed.monto,
            fecha=parsed.fecha or timezone.localdate(),
            comercio=parsed.comercio,
            metodo_pago_sugerido=metodo,
            tarjeta_sugerida=tarjeta,
            confianza=parsed.confianza,
            payload_original={
                'subject': subject,
                'from': from_addr,
                'banco': parsed.banco,
                'ultimos_4': parsed.ultimos_4,
                'tipo_tarjeta': tipo_tarjeta,
                'hora': hora_str,
                'provider_message_id': mid,
            },
            hash_externo=hash_ext,
            notificar=notificar,
        )
        if mark_read and mid:
            try:
                mark_read(mid)
            except Exception:
                stats.errores += 1
        stats.creados += 1

    return stats
