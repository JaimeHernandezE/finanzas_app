# Operaciones compartidas de respaldo PostgreSQL (API REST y Django admin).

from __future__ import annotations

import os
import tempfile
from urllib.parse import quote as urlquote

from django.conf import settings
from django.db.utils import OperationalError, ProgrammingError

from .drive_pg import (
    backup_filename,
    restore_from_sql_file,
    restore_from_sql_gz_file,
    run_pg_dump_plain_gz,
    validate_sql_gz_backup_file,
)

CONFIRMACION_IMPORT = 'RESTAURAR_BD'
CONFIRMACION_IMPORT_EMERGENCIA = 'IMPORTAR_MODO_EMERGENCIA'
MAX_IMPORT_BYTES = 200 * 1024 * 1024


def env_true(name: str) -> bool:
    return (os.environ.get(name) or '').strip().lower() in {'1', 'true', 'yes', 'on'}


def import_habilitado() -> bool:
    return settings.DEBUG or env_true('ALLOW_DB_IMPORT')


def export_habilitado() -> bool:
    return settings.DEBUG or env_true('ALLOW_DB_EXPORT')


def database_url() -> str:
    u = os.environ.get('DATABASE_URL')
    if u:
        return u
    db = settings.DATABASES['default']
    eng = db.get('ENGINE', '')
    if 'sqlite' in eng:
        raise ValueError('El respaldo SQL solo está soportado con PostgreSQL.')
    pwd = urlquote(db.get('PASSWORD', '') or '', safe='')
    user = urlquote(db.get('USER', '') or '', safe='')
    host = db.get('HOST', 'localhost')
    port = str(db.get('PORT', '5432'))
    name = db.get('NAME', '')
    return f'postgresql://{user}:{pwd}@{host}:{port}/{name}'


def validar_archivo_respaldo(nombre: str, tamano: int) -> str | None:
    """Retorna mensaje de error o None si el archivo es aceptable."""
    if tamano > MAX_IMPORT_BYTES:
        return f'El archivo supera el máximo permitido ({MAX_IMPORT_BYTES // (1024 * 1024)} MB).'
    name = (nombre or '').lower()
    if name.endswith('.sql.gz') or name.endswith('.gz'):
        return None
    if name.endswith('.sql'):
        return None
    return 'Se espera un archivo .sql.gz o .sql (respaldo exportado desde esta app).'


def restaurar_desde_upload(nombre: str, chunks) -> None:
    """
    Guarda el upload en un temporal y restaura la BD.
    `chunks` es un iterable de bytes (p. ej. UploadedFile.chunks()).
    """
    name = (nombre or '').lower()
    url = database_url()
    tmp_path: str | None = None
    try:
        suffix = '.sql.gz' if name.endswith('.gz') else '.sql'
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
            for chunk in chunks:
                tmp.write(chunk)
        if name.endswith('.sql') and not name.endswith('.sql.gz'):
            restore_from_sql_file(url, tmp_path)
        else:
            restore_from_sql_gz_file(url, tmp_path)
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def generar_dump_temporal() -> str:
    """Genera un .sql.gz temporal validado. El llamador debe borrar el archivo."""
    url = database_url()
    with tempfile.NamedTemporaryFile(delete=False, suffix='.sql.gz') as tmp:
        tmp_path = tmp.name
    run_pg_dump_plain_gz(url, tmp_path)
    validate_sql_gz_backup_file(tmp_path)
    return tmp_path


def puede_modo_emergencia() -> bool:
    """True si la tabla de usuarios no existe (restauración interrumpida)."""
    from applications.usuarios.models import Usuario

    try:
        Usuario.objects.exists()
        return False
    except (ProgrammingError, OperationalError) as e:
        detalle = str(e)
        return 'usuarios_usuario' in detalle and 'does not exist' in detalle
