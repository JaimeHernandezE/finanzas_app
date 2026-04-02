# Lógica compartida: pg_dump / Drive / limpieza de respaldos antiguos.
# Sin importar modelos Django (usable desde script GH Actions con sys.path).
#
# Backup a Drive usa solo OAuth de usuario (cuota de “Mi unidad” de esa cuenta Gmail).
# Variables: GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN, GOOGLE_DRIVE_OAUTH_CLIENT_ID,
# GOOGLE_DRIVE_OAUTH_CLIENT_SECRET (mismo proyecto con API Drive y alcance drive).
# GOOGLE_DRIVE_BACKUP_FOLDER_ID = ID de carpeta en la cuenta autorizada.

from __future__ import annotations

import gzip
import json
import os
import re
import shutil
import subprocess
import tempfile
import zlib
from datetime import datetime, timezone
from typing import Iterator

from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials as OAuthCredentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

BACKUP_NAME_PREFIX = 'finanzas_pg_'
BACKUP_NAME_SUFFIX = '.sql.gz'
SCOPES = ['https://www.googleapis.com/auth/drive']

# pg_dump de PostgreSQL 17+ emite SET transaction_timeout; servidores <17 fallan al restaurar.
_RE_SET_TRANSACTION_TIMEOUT = re.compile(br'^\s*SET\s+transaction_timeout\b', re.IGNORECASE)


def _mensaje_error_oauth_drive(exc: Exception) -> str:
    msg = str(exc).strip()
    bajo = msg.lower()
    if 'invalid_grant' in bajo or (
        'token' in bajo and ('invalid' in bajo or 'revoked' in bajo or 'expired' in bajo)
    ):
        return (
            'Google rechazó el refresh token de Drive (revocado o inválido). '
            'Genera uno nuevo con alcance https://www.googleapis.com/auth/drive y el mismo '
            'GOOGLE_DRIVE_OAUTH_CLIENT_ID / GOOGLE_DRIVE_OAUTH_CLIENT_SECRET. '
            f'Detalle: {msg}'
        )
    return msg


def build_drive_service():
    """Cliente Drive API con OAuth de usuario (refresh token)."""
    refresh = (os.getenv('GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN') or '').strip()
    client_id = (os.getenv('GOOGLE_DRIVE_OAUTH_CLIENT_ID') or '').strip()
    client_secret = (os.getenv('GOOGLE_DRIVE_OAUTH_CLIENT_SECRET') or '').strip()
    if not refresh or not client_id or not client_secret:
        raise ValueError(
            'Define las tres variables de OAuth para Drive: GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN, '
            'GOOGLE_DRIVE_OAUTH_CLIENT_ID y GOOGLE_DRIVE_OAUTH_CLIENT_SECRET '
            '(proyecto Google Cloud con API “Google Drive” habilitada y consentimiento con alcance drive).'
        )
    try:
        creds = OAuthCredentials(
            token=None,
            refresh_token=refresh,
            token_uri='https://oauth2.googleapis.com/token',
            client_id=client_id,
            client_secret=client_secret,
            scopes=SCOPES,
        )
        creds.refresh(Request())
        return build('drive', 'v3', credentials=creds, cache_discovery=False)
    except GoogleAuthError as e:
        raise ValueError(
            'No se pudo autenticar en Google Drive con OAuth. '
            'Revisa refresh token, client_id y client_secret. '
            f'Detalle: {e!s}'
        ) from e


def backup_filename() -> str:
    now = datetime.now(timezone.utc)
    return f"{BACKUP_NAME_PREFIX}{now:%Y-%m-%d_%H%M}{BACKUP_NAME_SUFFIX}"


def run_pg_dump_plain_gz(database_url: str, out_path: str) -> None:
    """pg_dump formato texto plano comprimido con gzip (compatible con psql en import)."""
    with open(out_path, 'wb') as out_f:
        p = subprocess.Popen(
            [
                'pg_dump',
                '--no-owner',
                '--no-acl',
                '-Fp',
                database_url,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        assert p.stdout is not None
        with gzip.GzipFile(fileobj=out_f, mode='wb', mtime=0) as gz:
            while True:
                chunk = p.stdout.read(1024 * 1024)
                if not chunk:
                    break
                gz.write(chunk)
        err = p.stderr.read() if p.stderr else b''
        p.wait()
        if p.returncode != 0:
            raise RuntimeError(f'pg_dump falló ({p.returncode}): {err.decode("utf-8", errors="replace")}')


def iter_pg_dump_gzip_chunks(database_url: str) -> Iterator[bytes]:
    """
    Generador para StreamingHttpResponse: bytes gzip (zlib con cabecera gzip)
    del volcado pg_dump en texto plano.
    """
    compressor = zlib.compressobj(9, zlib.DEFLATED, zlib.MAX_WBITS | 16)
    p = subprocess.Popen(
        ['pg_dump', '--no-owner', '--no-acl', '-Fp', database_url],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert p.stdout is not None
    try:
        while True:
            chunk = p.stdout.read(64 * 1024)
            if not chunk:
                break
            out = compressor.compress(chunk)
            if out:
                yield out
        tail = compressor.flush()
        if tail:
            yield tail
    finally:
        err = p.stderr.read() if p.stderr else b''
        rc = p.wait()
        if rc != 0:
            raise RuntimeError(f'pg_dump falló ({rc}): {err.decode("utf-8", errors="replace")}')


def _razon_http_error_drive(exc: HttpError) -> str:
    try:
        raw = exc.content.decode('utf-8') if exc.content else ''
        data = json.loads(raw) if raw else {}
        errs = (data.get('error') or {}).get('errors') or []
        if errs and isinstance(errs[0], dict):
            return str(errs[0].get('reason') or '')
    except (json.JSONDecodeError, TypeError, UnicodeDecodeError):
        pass
    return ''


def _mensaje_drive_http_error(exc: HttpError) -> str:
    """Mensaje en español según el motivo de 403/401 de Drive."""
    status = getattr(exc.resp, 'status', None) if exc.resp else None
    razon = _razon_http_error_drive(exc)
    if status == 403 and razon == 'storageQuotaExceeded':
        return (
            'Google Drive rechazó la subida por cuota de almacenamiento. '
            'Libera espacio en la cuenta de Google asociada al OAuth o revisa que '
            'GOOGLE_DRIVE_BACKUP_FOLDER_ID sea una carpeta en «Mi unidad» de esa misma cuenta. '
            f'Detalle API: {exc!s}'
        )
    if status in (401, 403):
        return (
            f'Google Drive respondió {status}. Habilita la API “Google Drive” en el proyecto OAuth, '
            'revisa el refresh token y que GOOGLE_DRIVE_BACKUP_FOLDER_ID sea el ID de la carpeta '
            f'en la cuenta autorizada. Detalle: {exc!s}'
        )
    return f'Error al usar Google Drive (HTTP {status}): {exc!s}'


def verificar_carpeta_backup(service, folder_id: str) -> None:
    """Comprueba que la carpeta existe y el usuario OAuth puede acceder a ella."""
    meta = (
        service.files()
        .get(
            fileId=folder_id,
            fields='id,name,mimeType,driveId',
            supportsAllDrives=True,
        )
        .execute()
    )
    if meta.get('mimeType') != 'application/vnd.google-apps.folder':
        raise ValueError(
            'GOOGLE_DRIVE_BACKUP_FOLDER_ID no apunta a una carpeta de Drive '
            f'(mimeType={meta.get("mimeType")!r}).'
        )


def upload_file_to_drive(service, folder_id: str, local_path: str, drive_name: str) -> str:
    meta = {'name': drive_name, 'parents': [folder_id]}
    media = MediaFileUpload(local_path, mimetype='application/gzip', resumable=True)
    created = (
        service.files()
        .create(
            body=meta,
            media_body=media,
            fields='id',
            supportsAllDrives=True,
        )
        .execute()
    )
    return created['id']


def cleanup_keep_two_most_recent(service, folder_id: str) -> list[str]:
    """
    Entre archivos en la carpeta cuyo nombre empieza por BACKUP_NAME_PREFIX,
    conserva los 2 más recientes por modifiedTime y borra el resto.
    Devuelve ids eliminados.
    """
    deleted: list[str] = []
    files = []
    page_token = None
    while True:
        resp = (
            service.files()
            .list(
                q=f"'{folder_id}' in parents and trashed=false",
                spaces='drive',
                fields='nextPageToken, files(id,name,modifiedTime)',
                pageToken=page_token,
                pageSize=100,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            )
            .execute()
        )
        for f in resp.get('files', []):
            name = f.get('name') or ''
            if name.startswith(BACKUP_NAME_PREFIX) and name.endswith(BACKUP_NAME_SUFFIX):
                files.append(f)
        page_token = resp.get('nextPageToken')
        if not page_token:
            break

    files.sort(key=lambda x: x.get('modifiedTime') or '', reverse=True)
    for f in files[2:]:
        fid = f['id']
        service.files().delete(fileId=fid, supportsAllDrives=True).execute()
        deleted.append(fid)
    return deleted


def run_backup_to_drive() -> dict:
    """
    pg_dump → archivo temporal → subida a Drive → limpieza (máx. 2 respaldos recientes).
    """
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise ValueError('DATABASE_URL no está definida.')

    folder_id = os.getenv('GOOGLE_DRIVE_BACKUP_FOLDER_ID')
    if not folder_id:
        raise ValueError('GOOGLE_DRIVE_BACKUP_FOLDER_ID no está definida.')

    name = backup_filename()
    service = build_drive_service()

    with tempfile.NamedTemporaryFile(suffix='.sql.gz', delete=False) as tmp:
        tmp_path = tmp.name

    try:
        verificar_carpeta_backup(service, folder_id)
        run_pg_dump_plain_gz(database_url, tmp_path)
        upload_file_to_drive(service, folder_id, tmp_path, name)
        deleted = cleanup_keep_two_most_recent(service, folder_id)
        return {'ok': True, 'archivo': name, 'eliminados_en_drive': len(deleted)}
    except GoogleAuthError as e:
        raise ValueError(_mensaje_error_oauth_drive(e)) from e
    except HttpError as e:
        status = getattr(e.resp, 'status', None) if e.resp else None
        if status in (401, 403):
            raise ValueError(_mensaje_drive_http_error(e)) from e
        raise ValueError(f'Error al usar Google Drive (HTTP {status}): {e!s}') from e
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _decompress_sql_gz_to_path(gz_path: str, sql_path: str) -> None:
    """Descomprime .sql.gz a disco; omite SET transaction_timeout (PG17) para restaurar en PG <17."""
    with gzip.open(gz_path, 'rb') as gz, open(sql_path, 'wb') as out:
        for line in gz:
            if _RE_SET_TRANSACTION_TIMEOUT.match(line):
                continue
            out.write(line)


def _run_psql(database_url: str, psql_args: list[str]) -> None:
    """Ejecuta psql con ON_ERROR_STOP; lanza RuntimeError con stderr si falla."""
    completed = subprocess.run(
        ['psql', database_url, '-v', 'ON_ERROR_STOP=1', *psql_args],
        capture_output=True,
        text=False,
    )
    if completed.returncode != 0:
        err_b = completed.stderr or b''
        out_b = completed.stdout or b''
        err = err_b.decode('utf-8', errors='replace')
        if not err.strip() and out_b:
            err = out_b.decode('utf-8', errors='replace')
        raise RuntimeError(
            f'psql falló ({completed.returncode}): {err}'
        )


def _reset_public_schema(database_url: str) -> None:
    """
    Elimina y recrea el esquema ``public`` para que un volcado completo no choque con
    tablas existentes (p. ej. auth_group). Requiere permisos suficientes sobre la BD.
    """
    _run_psql(
        database_url,
        [
            '-c',
            'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;',
        ],
    )


def restore_from_sql_gz_file(database_url: str, gz_path: str) -> None:
    """
    Restaura BD desde .sql.gz (plain SQL comprimido).

    Antes de aplicar el volcado, recrea el esquema ``public`` (sustitución completa).
    Descomprime a un .sql temporal y ejecuta ``psql -f`` (sin stdin por tubería).
    """
    sql_path: str | None = None
    try:
        _reset_public_schema(database_url)

        fd, sql_path = tempfile.mkstemp(suffix='.sql')
        os.close(fd)
        _decompress_sql_gz_to_path(gz_path, sql_path)

        _run_psql(database_url, ['-f', sql_path])
    finally:
        if sql_path:
            try:
                os.unlink(sql_path)
            except OSError:
                pass
