"""Adapter Telegram Bot API."""

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


def _token() -> str:
    return (getattr(settings, 'CAPTURA_TELEGRAM_BOT_TOKEN', '') or '').strip()


def enviar_mensaje(chat_id: str, reply: BotReply) -> None:
    token = _token()
    if not token:
        logger.warning('CAPTURA_TELEGRAM_BOT_TOKEN no configurado; no se envía respuesta.')
        return

    payload: dict = {
        'chat_id': chat_id,
        'text': reply.text,
    }
    if reply.buttons:
        rows = []
        row = []
        for b in reply.buttons[:12]:
            row.append({'text': b['label'][:40], 'callback_data': b['id'][:64]})
            if len(row) == 2:
                rows.append(row)
                row = []
        if row:
            rows.append(row)
        payload['reply_markup'] = json.dumps({'inline_keyboard': rows})

    url = f'https://api.telegram.org/bot{token}/sendMessage'
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp.read()
    except Exception:
        logger.exception('Error enviando mensaje Telegram a chat_id=%s', chat_id)


def procesar_update(update: dict) -> None:
    if not getattr(settings, 'CAPTURA_TELEGRAM_HABILITADO', False):
        return

    callback = update.get('callback_query')
    if callback:
        chat_id = str(callback.get('message', {}).get('chat', {}).get('id', ''))
        data = callback.get('data') or ''
        if chat_id:
            reply = manejar_callback(canal='TELEGRAM', chat_id=chat_id, callback_data=data)
            enviar_mensaje(chat_id, reply)
        return

    message = update.get('message') or update.get('edited_message') or {}
    chat_id = str(message.get('chat', {}).get('id', ''))
    text = message.get('text') or ''
    if message.get('photo'):
        reply = BotReply(text='Aún no soporte fotos de boleta. Envía el gasto en texto.')
        if chat_id:
            enviar_mensaje(chat_id, reply)
        return
    if chat_id and text:
        reply = manejar_texto(canal='TELEGRAM', chat_id=chat_id, texto=text)
        enviar_mensaje(chat_id, reply)
