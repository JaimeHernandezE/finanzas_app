"""OAuth Google para lectura de Gmail (captura de alertas bancarias)."""

from __future__ import annotations

import os
from urllib.parse import urlencode

import requests as http_requests
from django.conf import settings

from applications.espacios.drive_usuario import decrypt_token, encrypt_token

SCOPES = [
    'https://www.googleapis.com/auth/gmail.modify',
    'openid',
    'email',
]
AUTH_URI = 'https://accounts.google.com/o/oauth2/v2/auth'
TOKEN_URI = 'https://oauth2.googleapis.com/token'
USERINFO_URI = 'https://www.googleapis.com/oauth2/v3/userinfo'
GMAIL_API = 'https://gmail.googleapis.com/gmail/v1'


def _client_credentials() -> tuple[str, str]:
    client_id = (getattr(settings, 'GOOGLE_MAIL_OAUTH_CLIENT_ID', '') or '').strip()
    client_secret = (getattr(settings, 'GOOGLE_MAIL_OAUTH_CLIENT_SECRET', '') or '').strip()
    if not client_id or not client_secret:
        raise ValueError(
            'GOOGLE_MAIL_OAUTH_CLIENT_ID/SECRET (o GOOGLE_DRIVE_OAUTH_*) '
            'deben estar configurados para conectar Gmail.',
        )
    return client_id, client_secret


def generar_state(usuario_id: int) -> str:
    return encrypt_token(f'correo:GMAIL:{usuario_id}:{os.urandom(8).hex()}')


def validar_state(state: str) -> int | None:
    try:
        payload = decrypt_token(state)
    except ValueError:
        return None
    parts = payload.split(':')
    if len(parts) < 3 or parts[0] != 'correo' or parts[1] != 'GMAIL':
        return None
    try:
        return int(parts[2])
    except (TypeError, ValueError):
        return None


def generar_auth_url(redirect_uri: str, state: str) -> str:
    client_id, _ = _client_credentials()
    params = {
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'response_type': 'code',
        'scope': ' '.join(SCOPES),
        'access_type': 'offline',
        'prompt': 'consent',
        'state': state,
    }
    return f'{AUTH_URI}?{urlencode(params)}'


def intercambiar_codigo(code: str, redirect_uri: str) -> dict:
    client_id, client_secret = _client_credentials()
    resp = http_requests.post(
        TOKEN_URI,
        data={
            'code': code,
            'client_id': client_id,
            'client_secret': client_secret,
            'redirect_uri': redirect_uri,
            'grant_type': 'authorization_code',
        },
        timeout=20,
    )
    if resp.status_code != 200:
        raise ValueError(f'Error al intercambiar código Google: {resp.text[:300]}')
    data = resp.json()
    if 'refresh_token' not in data:
        raise ValueError(
            'Google no devolvió refresh_token. Revoca el acceso en '
            'https://myaccount.google.com/permissions y vuelve a conectar Gmail.',
        )
    return data


def refrescar_access_token(refresh_token: str) -> str:
    client_id, client_secret = _client_credentials()
    resp = http_requests.post(
        TOKEN_URI,
        data={
            'client_id': client_id,
            'client_secret': client_secret,
            'refresh_token': refresh_token,
            'grant_type': 'refresh_token',
        },
        timeout=20,
    )
    if resp.status_code != 200:
        raise ValueError(f'No se pudo refrescar token Gmail: {resp.text[:300]}')
    token = resp.json().get('access_token')
    if not token:
        raise ValueError('Google no devolvió access_token.')
    return token


def obtener_email(access_token: str) -> str:
    resp = http_requests.get(
        USERINFO_URI,
        headers={'Authorization': f'Bearer {access_token}'},
        timeout=15,
    )
    if resp.status_code != 200:
        return ''
    return (resp.json().get('email') or '').strip()


def listar_no_leidos(access_token: str, *, limit: int = 50) -> list[dict]:
    """Retorna lista de dicts: id, from_addr, subject, body."""
    headers = {'Authorization': f'Bearer {access_token}'}
    resp = http_requests.get(
        f'{GMAIL_API}/users/me/messages',
        headers=headers,
        params={'q': 'is:unread in:inbox', 'maxResults': limit},
        timeout=30,
    )
    if resp.status_code != 200:
        raise ValueError(f'Gmail list falló: {resp.text[:300]}')
    ids = [m['id'] for m in (resp.json().get('messages') or [])]
    out: list[dict] = []
    for mid in ids:
        detail = http_requests.get(
            f'{GMAIL_API}/users/me/messages/{mid}',
            headers=headers,
            params={'format': 'full'},
            timeout=30,
        )
        if detail.status_code != 200:
            continue
        msg = detail.json()
        out.append(_parse_gmail_message(mid, msg))
    return out


def marcar_leido(access_token: str, message_id: str) -> None:
    headers = {'Authorization': f'Bearer {access_token}'}
    http_requests.post(
        f'{GMAIL_API}/users/me/messages/{message_id}/modify',
        headers=headers,
        json={'removeLabelIds': ['UNREAD']},
        timeout=20,
    )


def probar_acceso(access_token: str) -> None:
    headers = {'Authorization': f'Bearer {access_token}'}
    resp = http_requests.get(
        f'{GMAIL_API}/users/me/profile',
        headers=headers,
        timeout=15,
    )
    if resp.status_code != 200:
        raise ValueError(f'Gmail no accesible: {resp.text[:300]}')


def _header_map(payload: dict) -> dict[str, str]:
    headers = {}
    for h in payload.get('headers') or []:
        name = (h.get('name') or '').lower()
        if name:
            headers[name] = h.get('value') or ''
    return headers


def _decode_body_data(data: str) -> str:
    import base64

    if not data:
        return ''
    pad = '=' * (-len(data) % 4)
    raw = base64.urlsafe_b64decode(data + pad)
    return raw.decode('utf-8', errors='replace')


def _strip_html(html: str) -> str:
    import re

    text = re.sub(r'(?is)<(script|style).*?>.*?</\1>', ' ', html or '')
    text = re.sub(r'(?i)<br\s*/?>', '\n', text)
    text = re.sub(r'(?i)</p>', '\n', text)
    text = re.sub(r'(?i)<[^>]+>', ' ', text)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _extract_plain_body(payload: dict) -> str:
    if not payload:
        return ''
    mime = (payload.get('mimeType') or '').lower()
    body = payload.get('body') or {}
    if mime == 'text/plain' and body.get('data'):
        return _decode_body_data(body['data'])
    if mime == 'text/html' and body.get('data'):
        return _strip_html(_decode_body_data(body['data']))
    if mime.startswith('multipart/'):
        plain_chunks: list[str] = []
        html_chunks: list[str] = []
        for part in payload.get('parts') or []:
            part_mime = (part.get('mimeType') or '').lower()
            text = _extract_plain_body(part)
            if not text:
                continue
            if part_mime == 'text/plain':
                plain_chunks.append(text)
            else:
                html_chunks.append(text)
        if plain_chunks:
            return '\n'.join(plain_chunks)
        return '\n'.join(html_chunks)
    if body.get('data'):
        raw = _decode_body_data(body['data'])
        if '<' in raw and '>' in raw:
            return _strip_html(raw)
        return raw
    return ''


def _parse_gmail_message(mid: str, msg: dict) -> dict:
    from email.utils import parseaddr

    payload = msg.get('payload') or {}
    headers = _header_map(payload)
    from_addr = parseaddr(headers.get('from', ''))[1]
    subject = headers.get('subject', '')
    body = _extract_plain_body(payload) or (msg.get('snippet') or '')
    return {
        'id': mid,
        'from_addr': from_addr,
        'subject': subject,
        'body': body,
    }
