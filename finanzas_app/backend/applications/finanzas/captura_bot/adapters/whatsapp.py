"""Adapter WhatsApp Cloud API (usuario inicia la conversación)."""

from __future__ import annotations

import json
import logging
import urllib.request

from django.conf import settings

from applications.finanzas.captura_bot.flujo_conversacion import (
    BotReply,
    manejar_callback,
    manejar_texto,
)

logger = logging.getLogger(__name__)


def _headers() -> dict:
    token = (getattr(settings, 'CAPTURA_WHATSAPP_TOKEN', '') or '').strip()
    return {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
    }


def _phone_number_id() -> str:
    return (getattr(settings, 'CAPTURA_WHATSAPP_PHONE_NUMBER_ID', '') or '').strip()


def enviar_mensaje(to_phone: str, reply: BotReply) -> None:
    phone_id = _phone_number_id()
    if not phone_id or not getattr(settings, 'CAPTURA_WHATSAPP_TOKEN', ''):
        logger.warning('WhatsApp no configurado; no se envía respuesta.')
        return

    to = to_phone.lstrip('+')
    url = f'https://graph.facebook.com/v19.0/{phone_id}/messages'

    if reply.buttons:
        # interactive button (máx 3)
        buttons = [
            {
                'type': 'reply',
                'reply': {'id': b['id'][:256], 'title': b['label'][:20]},
            }
            for b in reply.buttons[:3]
        ]
        payload = {
            'messaging_product': 'whatsapp',
            'to': to,
            'type': 'interactive',
            'interactive': {
                'type': 'button',
                'body': {'text': reply.text[:1024]},
                'action': {'buttons': buttons},
            },
        }
    else:
        payload = {
            'messaging_product': 'whatsapp',
            'to': to,
            'type': 'text',
            'text': {'body': reply.text[:4096]},
        }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers=_headers(),
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp.read()
    except Exception:
        logger.exception('Error enviando mensaje WhatsApp a %s', to_phone)


def procesar_payload(body: dict) -> None:
    if not getattr(settings, 'CAPTURA_WHATSAPP_HABILITADO', False):
        return

    for entry in body.get('entry') or []:
        for change in entry.get('changes') or []:
            value = change.get('value') or {}
            messages = value.get('messages') or []
            for msg in messages:
                from_phone = msg.get('from') or ''
                chat_id = from_phone
                phone = f'+{from_phone}' if from_phone and not from_phone.startswith('+') else from_phone
                msg_type = msg.get('type')
                if msg_type == 'text':
                    text = (msg.get('text') or {}).get('body') or ''
                    reply = manejar_texto(
                        canal='WHATSAPP', chat_id=chat_id, texto=text, phone=phone,
                    )
                    enviar_mensaje(phone, reply)
                elif msg_type == 'interactive':
                    interactive = msg.get('interactive') or {}
                    button_reply = interactive.get('button_reply') or {}
                    list_reply = interactive.get('list_reply') or {}
                    data = button_reply.get('id') or list_reply.get('id') or ''
                    reply = manejar_callback(
                        canal='WHATSAPP',
                        chat_id=chat_id,
                        callback_data=data,
                        phone=phone,
                    )
                    enviar_mensaje(phone, reply)
                elif msg_type == 'image':
                    enviar_mensaje(
                        phone,
                        BotReply(text='Aún no soporte fotos de boleta. Envía el gasto en texto.'),
                    )
