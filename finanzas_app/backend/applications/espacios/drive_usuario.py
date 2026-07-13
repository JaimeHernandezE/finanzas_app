# Per-user Google Drive OAuth and backup (Fase 5 V2).
#
# Flujo OAuth separado de Firebase Auth: Firebase no entrega refresh tokens
# con scopes de Drive. Usamos el mismo Client ID de Google Cloud pero un
# flujo OAuth distinto con access_type=offline y scope drive.file.

from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import tempfile
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials as OAuthCredentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

if TYPE_CHECKING:
    from applications.espacios.models import ConfiguracionRespaldoUsuario

SCOPES = ['https://www.googleapis.com/auth/drive.file']
TOKEN_URI = 'https://oauth2.googleapis.com/token'
AUTH_URI = 'https://accounts.googleapis.com/o/oauth2/v2/auth'
USERINFO_URI = 'https://www.googleapis.com/oauth2/v3/userinfo'

BACKUP_PREFIX = 'finanzas_espacio_'
BACKUP_SUFFIX = '.json'
MAX_BACKUPS_KEEP = 5


def _get_client_credentials() -> tuple[str, str]:
    client_id = (os.getenv('GOOGLE_DRIVE_OAUTH_CLIENT_ID') or '').strip()
    client_secret = (os.getenv('GOOGLE_DRIVE_OAUTH_CLIENT_SECRET') or '').strip()
    if not client_id or not client_secret:
        raise ValueError(
            'GOOGLE_DRIVE_OAUTH_CLIENT_ID y GOOGLE_DRIVE_OAUTH_CLIENT_SECRET '
            'deben estar configurados para el flujo OAuth por usuario.'
        )
    return client_id, client_secret


def _fernet_key() -> bytes:
    key_material = settings.SECRET_KEY.encode()
    digest = hashlib.sha256(key_material).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt_token(plaintext: str) -> str:
    f = Fernet(_fernet_key())
    return f.encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    f = Fernet(_fernet_key())
    try:
        return f.decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        raise ValueError('No se pudo descifrar el token de Drive (SECRET_KEY cambió o dato corrupto).')


def generar_auth_url(redirect_uri: str, state: str) -> str:
    client_id, _ = _get_client_credentials()
    from urllib.parse import urlencode
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
    """Intercambia authorization code por tokens. Retorna dict con access_token, refresh_token, etc."""
    import requests as http_requests

    client_id, client_secret = _get_client_credentials()
    resp = http_requests.post(TOKEN_URI, data={
        'code': code,
        'client_id': client_id,
        'client_secret': client_secret,
        'redirect_uri': redirect_uri,
        'grant_type': 'authorization_code',
    }, timeout=15)
    if resp.status_code != 200:
        raise ValueError(f'Error al intercambiar código OAuth: {resp.text}')
    data = resp.json()
    if 'refresh_token' not in data:
        raise ValueError(
            'Google no devolvió refresh_token. Revoca el acceso en '
            'https://myaccount.google.com/permissions y vuelve a conectar.'
        )
    return data


def obtener_email_google(access_token: str) -> str:
    import requests as http_requests

    resp = http_requests.get(USERINFO_URI, headers={
        'Authorization': f'Bearer {access_token}',
    }, timeout=10)
    if resp.status_code != 200:
        return ''
    return resp.json().get('email', '')


def build_drive_service_usuario(config: 'ConfiguracionRespaldoUsuario'):
    """Construye un cliente Drive API con el refresh token del usuario."""
    if not config.drive_connected or not config.drive_refresh_token_enc:
        raise ValueError('Drive no está conectado para este usuario.')

    refresh_token = decrypt_token(config.drive_refresh_token_enc)
    client_id, client_secret = _get_client_credentials()

    creds = OAuthCredentials(
        token=None,
        refresh_token=refresh_token,
        token_uri=TOKEN_URI,
        client_id=client_id,
        client_secret=client_secret,
        scopes=SCOPES,
    )
    try:
        creds.refresh(Request())
    except GoogleAuthError as e:
        raise ValueError(
            'No se pudo autenticar con Drive. Es posible que el acceso haya sido '
            f'revocado. Reconecta tu cuenta de Google. Detalle: {e}'
        )
    return build('drive', 'v3', credentials=creds, cache_discovery=False)


def asegurar_carpeta_backup(service, nombre_carpeta: str = 'Finanzas App Backups') -> str:
    """Busca o crea la carpeta de backups en el Drive del usuario. Retorna folder_id."""
    query = (
        f"name='{nombre_carpeta}' and "
        "mimeType='application/vnd.google-apps.folder' and "
        "trashed=false"
    )
    resp = service.files().list(q=query, spaces='drive', fields='files(id,name)').execute()
    files = resp.get('files', [])
    if files:
        return files[0]['id']

    meta = {
        'name': nombre_carpeta,
        'mimeType': 'application/vnd.google-apps.folder',
    }
    folder = service.files().create(body=meta, fields='id').execute()
    return folder['id']


def subir_backup_espacio(service, folder_id: str, espacio, datos_json: dict) -> dict:
    """Sube el JSON de un espacio a Drive. Retorna info del archivo creado."""
    now = datetime.now(timezone.utc)
    nombre_espacio = espacio.nombre.replace(' ', '_')
    filename = f'{BACKUP_PREFIX}{nombre_espacio}_{now:%Y-%m-%d_%H%M}{BACKUP_SUFFIX}'

    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(datos_json, f, ensure_ascii=False, indent=2)
        temp_path = f.name

    try:
        meta = {'name': filename, 'parents': [folder_id]}
        media = MediaFileUpload(temp_path, mimetype='application/json', resumable=True)
        created = service.files().create(
            body=meta, media_body=media, fields='id,name,size',
        ).execute()
    finally:
        os.unlink(temp_path)

    return {
        'id': created['id'],
        'nombre': created['name'],
        'tamaño': created.get('size', ''),
    }


def limpiar_backups_antiguos(service, folder_id: str, espacio_nombre: str) -> list[str]:
    """Conserva los MAX_BACKUPS_KEEP más recientes por espacio y borra el resto."""
    prefix = f'{BACKUP_PREFIX}{espacio_nombre.replace(" ", "_")}_'
    query = f"'{folder_id}' in parents and trashed=false"

    all_files = []
    page_token = None
    while True:
        resp = service.files().list(
            q=query, spaces='drive',
            fields='nextPageToken,files(id,name,modifiedTime)',
            pageToken=page_token, pageSize=100,
        ).execute()
        for f in resp.get('files', []):
            name = f.get('name', '')
            if name.startswith(prefix) and name.endswith(BACKUP_SUFFIX):
                all_files.append(f)
        page_token = resp.get('nextPageToken')
        if not page_token:
            break

    all_files.sort(key=lambda x: x.get('modifiedTime', ''), reverse=True)
    deleted = []
    for f in all_files[MAX_BACKUPS_KEEP:]:
        service.files().delete(fileId=f['id']).execute()
        deleted.append(f['id'])
    return deleted


def revocar_token(config: 'ConfiguracionRespaldoUsuario') -> None:
    """Revoca el refresh token en Google y limpia la configuración local."""
    if config.drive_refresh_token_enc:
        try:
            import requests as http_requests
            refresh = decrypt_token(config.drive_refresh_token_enc)
            http_requests.post(
                'https://oauth2.googleapis.com/revoke',
                params={'token': refresh},
                timeout=10,
            )
        except Exception:
            pass

    config.drive_refresh_token_enc = ''
    config.drive_email = ''
    config.drive_connected = False
    config.drive_folder_id = ''
    config.save(update_fields=[
        'drive_refresh_token_enc', 'drive_email', 'drive_connected',
        'drive_folder_id', 'updated_at',
    ])


def generar_state_token(usuario_id: int) -> str:
    """Genera un state opaco con el user ID embebido, firmado con Fernet."""
    payload = json.dumps({'uid': usuario_id, 'nonce': secrets.token_hex(8)})
    return encrypt_token(payload)


def validar_state_token(state: str) -> int | None:
    """Valida y retorna el usuario_id del state. None si inválido."""
    try:
        payload = decrypt_token(state)
        data = json.loads(payload)
        return data.get('uid')
    except (ValueError, json.JSONDecodeError, KeyError):
        return None
