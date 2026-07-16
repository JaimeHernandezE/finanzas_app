"""OAuth Microsoft (Hotmail/Outlook) + Microsoft Graph Mail."""

from __future__ import annotations

import os
from urllib.parse import urlencode

import requests as http_requests
from django.conf import settings

from applications.espacios.drive_usuario import decrypt_token, encrypt_token

SCOPES = [
    'offline_access',
    'openid',
    'email',
    'https://graph.microsoft.com/Mail.ReadWrite',
    'https://graph.microsoft.com/User.Read',
]
GRAPH = 'https://graph.microsoft.com/v1.0'


def _tenant() -> str:
    return (getattr(settings, 'MICROSOFT_OAUTH_TENANT', '') or 'consumers').strip() or 'consumers'


def _client_credentials() -> tuple[str, str]:
    client_id = (getattr(settings, 'MICROSOFT_OAUTH_CLIENT_ID', '') or '').strip()
    client_secret = (getattr(settings, 'MICROSOFT_OAUTH_CLIENT_SECRET', '') or '').strip()
    if not client_id or not client_secret:
        raise ValueError(
            'MICROSOFT_OAUTH_CLIENT_ID y MICROSOFT_OAUTH_CLIENT_SECRET '
            'deben estar configurados para conectar Outlook/Hotmail.',
        )
    return client_id, client_secret


def _auth_base() -> str:
    return f'https://login.microsoftonline.com/{_tenant()}/oauth2/v2.0'


def generar_state(usuario_id: int) -> str:
    return encrypt_token(f'correo:OUTLOOK:{usuario_id}:{os.urandom(8).hex()}')


def validar_state(state: str) -> int | None:
    try:
        payload = decrypt_token(state)
    except ValueError:
        return None
    parts = payload.split(':')
    if len(parts) < 3 or parts[0] != 'correo' or parts[1] != 'OUTLOOK':
        return None
    try:
        return int(parts[2])
    except (TypeError, ValueError):
        return None


def generar_auth_url(redirect_uri: str, state: str) -> str:
    client_id, _ = _client_credentials()
    params = {
        'client_id': client_id,
        'response_type': 'code',
        'redirect_uri': redirect_uri,
        'response_mode': 'query',
        'scope': ' '.join(SCOPES),
        'state': state,
    }
    return f'{_auth_base()}/authorize?{urlencode(params)}'


def intercambiar_codigo(code: str, redirect_uri: str) -> dict:
    client_id, client_secret = _client_credentials()
    # Azure muestra "Secret ID" (GUID) y "Value". Solo el Value sirve como client_secret.
    if len(client_secret) == 36 and client_secret.count('-') == 4:
        raise ValueError(
            'MICROSOFT_OAUTH_CLIENT_SECRET parece un Secret ID (GUID). '
            'En Azure → Certificates & secrets usa la columna Value (se muestra solo al crear el secreto).',
        )
    resp = http_requests.post(
        f'{_auth_base()}/token',
        data={
            'client_id': client_id,
            'client_secret': client_secret,
            'code': code,
            'redirect_uri': redirect_uri,
            'grant_type': 'authorization_code',
            'scope': ' '.join(SCOPES),
        },
        timeout=20,
    )
    if resp.status_code != 200:
        detail = (resp.text or '')[:400]
        raise ValueError(f'Error al intercambiar código Microsoft: {detail}')
    data = resp.json()
    if 'refresh_token' not in data:
        raise ValueError('Microsoft no devolvió refresh_token. Vuelve a autorizar la app.')
    return data


def refrescar_access_token(refresh_token: str) -> str:
    client_id, client_secret = _client_credentials()
    resp = http_requests.post(
        f'{_auth_base()}/token',
        data={
            'client_id': client_id,
            'client_secret': client_secret,
            'refresh_token': refresh_token,
            'grant_type': 'refresh_token',
            'scope': ' '.join(SCOPES),
        },
        timeout=20,
    )
    if resp.status_code != 200:
        raise ValueError(f'No se pudo refrescar token Microsoft: {resp.text[:300]}')
    token = resp.json().get('access_token')
    if not token:
        raise ValueError('Microsoft no devolvió access_token.')
    return token


def obtener_email(access_token: str) -> str:
    resp = http_requests.get(
        f'{GRAPH}/me',
        headers={'Authorization': f'Bearer {access_token}'},
        timeout=15,
    )
    if resp.status_code != 200:
        return ''
    data = resp.json()
    return (data.get('mail') or data.get('userPrincipalName') or '').strip()


def listar_no_leidos(access_token: str, *, limit: int = 50) -> list[dict]:
    headers = {'Authorization': f'Bearer {access_token}'}
    resp = http_requests.get(
        f'{GRAPH}/me/mailFolders/inbox/messages',
        headers=headers,
        params={
            '$filter': 'isRead eq false',
            '$top': limit,
            '$select': 'id,subject,from,body,bodyPreview',
        },
        timeout=30,
    )
    if resp.status_code != 200:
        raise ValueError(f'Graph list falló: {resp.text[:300]}')
    out = []
    for msg in resp.json().get('value') or []:
        from_obj = ((msg.get('from') or {}).get('emailAddress') or {})
        from_addr = (from_obj.get('address') or '').strip()
        body_obj = msg.get('body') or {}
        body = body_obj.get('content') or msg.get('bodyPreview') or ''
        if (body_obj.get('contentType') or '').lower() == 'html':
            # parsers trabajan mejor con texto; strip tags burdo
            import re

            body = re.sub(r'<[^>]+>', ' ', body)
        out.append({
            'id': msg.get('id'),
            'from_addr': from_addr,
            'subject': msg.get('subject') or '',
            'body': body,
        })
    return out


def marcar_leido(access_token: str, message_id: str) -> None:
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json',
    }
    http_requests.patch(
        f'{GRAPH}/me/messages/{message_id}',
        headers=headers,
        json={'isRead': True},
        timeout=20,
    )


def probar_acceso(access_token: str) -> None:
    headers = {'Authorization': f'Bearer {access_token}'}
    resp = http_requests.get(f'{GRAPH}/me', headers=headers, timeout=15)
    if resp.status_code != 200:
        raise ValueError(f'Microsoft Graph no accesible: {resp.text[:300]}')
