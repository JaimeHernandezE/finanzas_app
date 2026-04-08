# Respaldo / restauración PostgreSQL (solo administradores).

import os
import tempfile
from urllib.parse import quote as urlquote

from django.conf import settings
from django.db.utils import OperationalError, ProgrammingError
from django.http import StreamingHttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from applications.demo_guard import respuesta_demo_no_disponible
from applications.usuarios.models import Usuario
from applications.usuarios.views import obtener_usuario_desde_token

from .drive_pg import (
    backup_filename,
    iter_pg_dump_gzip_chunks,
    restore_from_sql_gz_file,
    run_backup_to_drive,
)


def _usuario_y_error_firebase(request):
    """
    Misma autenticación que /api/usuarios/me/: Authorization: Bearer <Firebase ID token>.
    No usar SimpleJWT: el frontend (Vite) solo guarda el token de Firebase en localStorage.
    """
    decoded, error = obtener_usuario_desde_token(request)
    if error:
        return None, Response({'detail': error}, status=status.HTTP_401_UNAUTHORIZED)
    email = (decoded.get('email') or '').strip()
    try:
        return Usuario.objects.select_related('familia').get(email__iexact=email), None
    except Usuario.DoesNotExist:
        return None, Response(
            {'detail': 'Usuario no registrado.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )


def _es_admin(usuario: Usuario) -> bool:
    return usuario.rol == 'ADMIN'


def _database_url() -> str:
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


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def descargar_dump(request):
    """
    Descarga finanzas_pg_YYYY-MM-DD_HHMM.sql.gz (pg_dump texto + gzip).
    """
    if getattr(settings, 'DEMO', False):
        return respuesta_demo_no_disponible()
    usuario, err = _usuario_y_error_firebase(request)
    if err is not None:
        return err
    if not _es_admin(usuario):
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
@authentication_classes([])
@permission_classes([AllowAny])
def subir_dump_a_drive(request):
    """
    Genera el mismo dump que el cron y lo sube a Drive; mantiene solo 2 respaldos recientes.
    """
    if getattr(settings, 'DEMO', False):
        return respuesta_demo_no_disponible()
    usuario, err = _usuario_y_error_firebase(request)
    if err is not None:
        return err
    if not _es_admin(usuario):
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
CONFIRMACION_IMPORT_EMERGENCIA = 'IMPORTAR_MODO_EMERGENCIA'
MAX_IMPORT_BYTES = 200 * 1024 * 1024


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def importar_dump(request):
    """
    Restaura desde un .sql.gz generado por esta app (pg_dump -Fp | gzip).
    Requiere confirmacion=RESTAURAR_BD en el formulario.

    Modo recuperación: si la BD quedó inconsistente y no existe usuarios_usuario,
    permite continuar con token Firebase válido + confirmacion_emergencia.
    """
    if getattr(settings, 'DEMO', False):
        return respuesta_demo_no_disponible()

    decoded, error = obtener_usuario_desde_token(request)
    if error:
        return Response({'detail': error}, status=status.HTTP_401_UNAUTHORIZED)

    email = (decoded.get('email') or '').strip()
    try:
        usuario = Usuario.objects.select_related('familia').get(email__iexact=email)
        if not _es_admin(usuario):
            return Response(
                {'detail': 'Solo administradores pueden importar la base de datos.'},
                status=status.HTTP_403_FORBIDDEN,
            )
    except Usuario.DoesNotExist:
        return Response(
            {'detail': 'Usuario no registrado.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    except (ProgrammingError, OperationalError) as e:
        # Si la tabla de usuarios ya no existe por una restauración incompleta, habilitamos
        # un modo de recuperación explícito para permitir importar nuevamente el respaldo.
        detalle = str(e)
        if 'usuarios_usuario' not in detalle or 'does not exist' not in detalle:
            return Response({'error': detalle}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        if request.POST.get('confirmacion_emergencia') != CONFIRMACION_IMPORT_EMERGENCIA:
            return Response(
                {
                    'error': (
                        'La base de datos está incompleta (falta tabla de usuarios). '
                        f'Para forzar la restauración agrega confirmacion_emergencia={CONFIRMACION_IMPORT_EMERGENCIA}.'
                    ),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
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
