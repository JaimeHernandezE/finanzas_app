# Lógica compartida: pg_dump / Drive / limpieza de respaldos antiguos.
# Sin importar modelos Django (usable desde script GH Actions con sys.path).

from __future__ import annotations

import gzip
import json
import os
import subprocess
import zlib
from datetime import datetime, timezone
from typing import Iterator

from google.auth.exceptions import GoogleAuthError
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

BACKUP_NAME_PREFIX = 'finanzas_pg_'
BACKUP_NAME_SUFFIX = '.sql.gz'
SCOPES = ['https://www.googleapis.com/auth/drive.file']


def _credentials_json() -> str:
    s = os.getenv('GOOGLE_DRIVE_CREDENTIALS_JSON') or os.getenv('GOOGLE_SHEETS_CREDENTIALS_JSON')
    if not s:
        raise ValueError(
            'Define GOOGLE_DRIVE_CREDENTIALS_JSON o GOOGLE_SHEETS_CREDENTIALS_JSON con la service account.'
        )
    return s


def _validar_json_cuenta_servicio(info: dict) -> None:
    """Evita usar OAuth de escritorio / JSON equivocado; mensajes claros en español."""
    tipo = info.get('type')
    if tipo != 'service_account':
        raise ValueError(
            'Las credenciales de Drive deben ser el JSON de una cuenta de servicio de Google Cloud '
            '(campo "type": "service_account"). No uses el JSON de cliente OAuth de escritorio/web ni '
            'credenciales de otro tipo. Crea una cuenta de servicio en IAM → Cuentas de servicio → Claves → JSON.'
        )
    if not (info.get('private_key') and info.get('client_email')):
        raise ValueError(
            'El JSON no contiene private_key o client_email. Si pegaste GOOGLE_DRIVE_CREDENTIALS_JSON '
            'en una sola línea, revisa que la clave privada conserve los saltos de línea (\\n dentro del string).'
        )


def _mensaje_error_credenciales_google(exc: Exception) -> str:
    """Traduce errores frecuentes de token al configurar la variable de entorno."""
    msg = str(exc).strip()
    bajo = msg.lower()
    if (
        'token' in bajo
        and ('no es válido' in bajo or 'invalid' in bajo or 'not valid' in bajo)
    ) or 'invalid_grant' in bajo:
        return (
            'Google rechazó el token de la cuenta de servicio (“token no válido”). '
            'Revisa: (1) que el JSON sea el descargado desde Google Cloud (IAM → cuenta de servicio → clave JSON); '
            '(2) que la clave privada no esté cortada ni mal escapada en la variable de entorno; '
            '(3) que la clave no esté deshabilitada o rotada en Google Cloud; '
            '(4) que en el mismo proyecto esté habilitada la API “Google Drive API”. '
            f'Detalle: {msg}'
        )
    return msg


def build_drive_service():
    raw = _credentials_json().strip()
    try:
        info = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(
            'GOOGLE_DRIVE_CREDENTIALS_JSON (o GOOGLE_SHEETS_CREDENTIALS_JSON) no es JSON válido. '
            'Comprueba comillas y que el contenido sea una sola línea compacta (p. ej. python -m json.tool --compact).'
        ) from e
    if not isinstance(info, dict):
        raise ValueError('Las credenciales deben ser un objeto JSON (diccionario).')
    _validar_json_cuenta_servicio(info)
    try:
        creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
        return build('drive', 'v3', credentials=creds, cache_discovery=False)
    except GoogleAuthError as e:
        raise ValueError(_mensaje_error_credenciales_google(e)) from e


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

    import tempfile

    with tempfile.NamedTemporaryFile(suffix='.sql.gz', delete=False) as tmp:
        tmp_path = tmp.name

    try:
        run_pg_dump_plain_gz(database_url, tmp_path)
        upload_file_to_drive(service, folder_id, tmp_path, name)
        deleted = cleanup_keep_two_most_recent(service, folder_id)
        return {'ok': True, 'archivo': name, 'eliminados_en_drive': len(deleted)}
    except GoogleAuthError as e:
        raise ValueError(_mensaje_error_credenciales_google(e)) from e
    except HttpError as e:
        status = getattr(e.resp, 'status', None) if e.resp else None
        if status in (401, 403):
            raise ValueError(
                f'Google Drive respondió {status}. Habilita la API “Google Drive” en el proyecto de la cuenta '
                'de servicio, revisa GOOGLE_DRIVE_BACKUP_FOLDER_ID y comparte la carpeta con el client_email '
                f'del JSON (permiso de editor). Detalle: {e!s}'
            ) from e
        raise ValueError(f'Error al usar Google Drive (HTTP {status}): {e!s}') from e
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def restore_from_sql_gz_file(database_url: str, gz_path: str) -> None:
    """Restaura BD desde .sql.gz (plain SQL comprimido)."""
    with gzip.open(gz_path, 'rb') as gz:
        p = subprocess.Popen(
            ['psql', database_url, '-v', 'ON_ERROR_STOP=1'],
            stdin=gz,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        _out, err = p.communicate()
        if p.returncode != 0:
            raise RuntimeError(
                f'psql falló ({p.returncode}): {err.decode("utf-8", errors="replace")}'
            )
