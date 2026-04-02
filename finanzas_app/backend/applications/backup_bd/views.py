# Respaldo / restauración PostgreSQL (solo administradores).

import os
import tempfile

from django.conf import settings
from django.http import StreamingHttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .drive_pg import (
    backup_filename,
    iter_pg_dump_gzip_chunks,
    restore_from_sql_gz_file,
    run_backup_to_drive,
)


def _es_admin(request) -> bool:
    return getattr(request.user, 'rol', None) == 'ADMIN'


def _database_url() -> str:
    u = os.environ.get('DATABASE_URL')
    if u:
        return u
    db = settings.DATABASES['default']
    eng = db.get('ENGINE', '')
    if 'sqlite' in eng:
        raise ValueError('El respaldo SQL solo está soportado con PostgreSQL.')
    pwd = db.get('PASSWORD', '') or ''
    host = db.get('HOST', 'localhost')
    port = str(db.get('PORT', '5432'))
    name = db.get('NAME', '')
    user = db.get('USER', '')
    return f'postgresql://{user}:{pwd}@{host}:{port}/{name}'


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def descargar_dump(request):
    """
    Descarga finanzas_pg_YYYY-MM-DD_HHMM.sql.gz (pg_dump texto + gzip).
    """
    if not _es_admin(request):
        return Response(
            {'detail': 'Solo administradores pueden exportar la base de datos.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    try:
        url = _database_url()
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    fn = backup_filename()
    resp = StreamingHttpResponse(
        iter_pg_dump_gzip_chunks(url),
        content_type='application/gzip',
    )
    resp['Content-Disposition'] = f'attachment; filename="{fn}"'
    return resp


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def subir_dump_a_drive(request):
    """
    Genera el mismo dump que el cron y lo sube a Drive; mantiene solo 2 respaldos recientes.
    """
    if not _es_admin(request):
        return Response(
            {'detail': 'Solo administradores pueden subir respaldos a Drive.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    try:
        data = run_backup_to_drive()
        return Response(data)
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


CONFIRMACION_IMPORT = 'RESTAURAR_BD'
MAX_IMPORT_BYTES = 200 * 1024 * 1024


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def importar_dump(request):
    """
    Restaura desde un .sql.gz generado por esta app (pg_dump -Fp | gzip).
    Requiere confirmacion=RESTAURAR_BD en el formulario.
    """
    if not _es_admin(request):
        return Response(
            {'detail': 'Solo administradores pueden importar la base de datos.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    if request.POST.get('confirmacion') != CONFIRMACION_IMPORT:
        return Response(
            {
                'error': f'Confirma escribiendo confirmacion={CONFIRMACION_IMPORT} en el formulario.',
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    f = request.FILES.get('archivo')
    if not f:
        return Response({'error': 'Falta el archivo.'}, status=status.HTTP_400_BAD_REQUEST)

    if f.size > MAX_IMPORT_BYTES:
        return Response(
            {'error': f'El archivo supera el máximo permitido ({MAX_IMPORT_BYTES // (1024 * 1024)} MB).'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    name = (f.name or '').lower()
    if not (name.endswith('.gz') or name.endswith('.sql.gz')):
        return Response(
            {'error': 'Se espera un archivo .sql.gz (respaldo exportado desde esta app).'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        url = _database_url()
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.sql.gz') as tmp:
            tmp_path = tmp.name
            for chunk in f.chunks():
                tmp.write(chunk)
        restore_from_sql_gz_file(url, tmp_path)
        return Response({'ok': True, 'mensaje': 'Base de datos restaurada desde el respaldo.'})
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
