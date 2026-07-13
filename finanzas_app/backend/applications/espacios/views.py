# Endpoints de espacios (Fase 2+5): selector de espacio, configuración,
# export/import lógico por espacio (Fase 5 V1 — DISPOSITIVO), y flujo
# OAuth de Google Drive por usuario (Fase 5 V2 — DRIVE).

import json
import logging

from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import redirect as django_redirect
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from applications import utils as utils_auth
from applications.demo_guard import respuesta_demo_no_disponible

from .contexto import resolver_espacio_activo
from .exportar_espacio import exportar_espacio
from .importar_espacio import ImportError as ImportEspacioError, importar_espacio
from .models import ConfiguracionRespaldoUsuario, Espacio, PertenenciaEspacio

logger = logging.getLogger(__name__)


def _payload_espacio(espacio: Espacio, rol: str | None = None) -> dict:
    data = {
        'id': espacio.id,
        'nombre': espacio.nombre,
        'tipo': espacio.tipo,
        'modo_reparto': espacio.modo_reparto,
        'activo': espacio.activo,
        'archivado': espacio.archivado,
    }
    if rol is not None:
        data['rol'] = rol
    return data


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def mis_espacios(request):
    """Espacios del usuario autenticado (para el selector de espacio activo)."""
    usuario, err = utils_auth.get_usuario_autenticado(request)
    if err is not None:
        return err
    pertenencias = (
        PertenenciaEspacio.objects
        .select_related('espacio')
        .filter(usuario=usuario, activo=True, espacio__activo=True)
        .order_by('espacio__tipo', 'espacio__nombre')
    )
    return Response([
        _payload_espacio(p.espacio, rol=p.rol)
        for p in pertenencias
    ])


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def espacio_activo(request):
    """Espacio activo resuelto para este request (header X-Espacio-Id o personal)."""
    usuario, err = utils_auth.get_usuario_autenticado(request)
    if err is not None:
        return err
    espacio, err = resolver_espacio_activo(request, usuario)
    if err is not None:
        return err
    rol = (
        PertenenciaEspacio.objects
        .filter(usuario=usuario, espacio=espacio, activo=True)
        .values_list('rol', flat=True)
        .first()
    )
    return Response(_payload_espacio(espacio, rol=rol))


@api_view(['PATCH'])
@authentication_classes([])
@permission_classes([AllowAny])
def espacio_actualizar(request, pk):
    """
    Actualiza nombre y/o modo_reparto del espacio. Solo ADMIN del espacio.
    modo_reparto aplica únicamente a espacios FAMILIAR no archivados.
    """
    if getattr(settings, 'DEMO', False):
        return respuesta_demo_no_disponible()
    usuario, err = utils_auth.get_usuario_autenticado(request)
    if err is not None:
        return err

    pertenencia = (
        PertenenciaEspacio.objects
        .select_related('espacio')
        .filter(usuario=usuario, espacio_id=pk, activo=True, espacio__activo=True)
        .first()
    )
    if pertenencia is None:
        return Response(
            {'error': 'No perteneces al espacio indicado o no está disponible.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    if pertenencia.rol != PertenenciaEspacio.ROL_ADMIN:
        return Response(
            {'error': 'Solo un administrador del espacio puede modificarlo.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    espacio = pertenencia.espacio
    if espacio.archivado:
        return Response(
            {'error': 'El espacio está archivado (registro histórico de solo lectura).'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    update_fields = []

    if 'nombre' in request.data:
        nombre = (request.data.get('nombre') or '').strip()
        if not nombre:
            return Response(
                {'error': 'El nombre no puede estar vacío.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        espacio.nombre = nombre[:150]
        update_fields.append('nombre')

    if 'modo_reparto' in request.data:
        if espacio.tipo != Espacio.TIPO_FAMILIAR:
            return Response(
                {'error': 'El modo de reparto solo aplica a espacios familiares.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        modo = request.data.get('modo_reparto')
        codigos_validos = dict(Espacio.REPARTO_CHOICES)
        if modo not in codigos_validos:
            return Response(
                {'error': f'Modo de reparto inválido. Opciones: {list(codigos_validos.keys())}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        espacio.modo_reparto = modo
        update_fields.append('modo_reparto')

    if not update_fields:
        return Response(
            {'error': 'No se proporcionó ningún campo para actualizar.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    espacio.save(update_fields=update_fields)
    return Response(_payload_espacio(espacio, rol=pertenencia.rol))


# ── Fase 5 V1: export/import por espacio ─────────────────────────────────────

def _validar_pertenencia(usuario, espacio_id):
    """Valida que el usuario pertenezca al espacio. Returns (espacio, pertenencia, err_response)."""
    pertenencia = (
        PertenenciaEspacio.objects
        .select_related('espacio')
        .filter(usuario=usuario, espacio_id=espacio_id, activo=True, espacio__activo=True)
        .first()
    )
    if pertenencia is None:
        return None, None, Response(
            {'error': 'No perteneces al espacio indicado.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    return pertenencia.espacio, pertenencia, None


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def espacio_exportar(request, pk):
    """Exporta los datos de un espacio como JSON descargable."""
    usuario, err = utils_auth.get_usuario_autenticado(request)
    if err:
        return err

    espacio, pertenencia, err = _validar_pertenencia(usuario, pk)
    if err:
        return err

    data = exportar_espacio(espacio)
    response = JsonResponse(data, json_dumps_params={'ensure_ascii': False, 'indent': 2})
    filename = f'respaldo_{espacio.nombre.replace(" ", "_")}_{data["exportado_at"][:10]}.json'
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def espacio_importar(request, pk):
    """Importa datos desde un archivo JSON a un espacio."""
    if getattr(settings, 'DEMO', False):
        return respuesta_demo_no_disponible()

    usuario, err = utils_auth.get_usuario_autenticado(request)
    if err:
        return err

    espacio, pertenencia, err = _validar_pertenencia(usuario, pk)
    if err:
        return err

    if espacio.archivado:
        return Response(
            {'error': 'No se puede importar a un espacio archivado.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    archivo = request.FILES.get('archivo')
    if archivo is None:
        return Response(
            {'error': 'Se requiere un archivo JSON (campo "archivo").'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        contenido = archivo.read().decode('utf-8')
        data = json.loads(contenido)
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        return Response(
            {'error': f'El archivo no es un JSON válido: {e}'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        conteos = importar_espacio(data, espacio, usuario)
    except ImportEspacioError as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response({
        'mensaje': 'Importación completada.',
        'conteos': conteos,
    })


# ── Fase 5 V2: Google Drive por usuario ──────────────────────────────────────

def _get_or_create_config(usuario):
    config, _ = ConfiguracionRespaldoUsuario.objects.get_or_create(usuario=usuario)
    return config


def _drive_redirect_uri(request):
    """URI de callback OAuth — debe coincidir con la configurada en Google Cloud Console."""
    scheme = 'https' if request.is_secure() else 'http'
    host = request.get_host()
    return f'{scheme}://{host}/api/espacios/drive/callback/'


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def drive_status(request):
    """Estado de conexión Drive del usuario."""
    usuario, err = utils_auth.get_usuario_autenticado(request)
    if err:
        return err
    config = _get_or_create_config(usuario)
    return Response({
        'connected': config.drive_connected,
        'email': config.drive_email,
        'folder_id': config.drive_folder_id,
        'sheet_id': config.sheet_id,
    })


@api_view(['PATCH'])
@authentication_classes([])
@permission_classes([AllowAny])
def drive_config(request):
    """Actualiza folder_id / sheet_id del respaldo por usuario (tras conectar Drive)."""
    if getattr(settings, 'DEMO', False):
        return respuesta_demo_no_disponible()
    usuario, err = utils_auth.get_usuario_autenticado(request)
    if err:
        return err

    config = _get_or_create_config(usuario)
    if not config.drive_connected:
        return Response(
            {'error': 'Conecta tu cuenta de Google Drive primero.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    update_fields = ['updated_at']
    if 'folder_id' in request.data:
        folder = str(request.data.get('folder_id') or '').strip()
        config.drive_folder_id = folder
        update_fields.append('drive_folder_id')
    if 'sheet_id' in request.data:
        sheet = str(request.data.get('sheet_id') or '').strip()
        config.sheet_id = sheet
        update_fields.append('sheet_id')

    config.save(update_fields=update_fields)
    return Response({
        'connected': config.drive_connected,
        'email': config.drive_email,
        'folder_id': config.drive_folder_id,
        'sheet_id': config.sheet_id,
    })


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def drive_connect(request):
    """Inicia el flujo OAuth: devuelve la URL de autorización de Google."""
    if getattr(settings, 'DEMO', False):
        return respuesta_demo_no_disponible()
    usuario, err = utils_auth.get_usuario_autenticado(request)
    if err:
        return err

    from .drive_usuario import generar_auth_url, generar_state_token

    redirect_uri = _drive_redirect_uri(request)
    state = generar_state_token(usuario.id)

    try:
        url = generar_auth_url(redirect_uri, state)
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return Response({'auth_url': url})


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def drive_callback(request):
    """Callback OAuth de Google. Intercambia el code por tokens y redirige al frontend."""
    from .drive_usuario import (
        encrypt_token,
        intercambiar_codigo,
        obtener_email_google,
        validar_state_token,
    )

    code = request.GET.get('code')
    state = request.GET.get('state', '')
    error = request.GET.get('error')

    frontend_base = getattr(settings, 'FRONTEND_URL', '')

    if error:
        return django_redirect(f'{frontend_base}/configuracion?drive_error={error}')

    if not code:
        return django_redirect(f'{frontend_base}/configuracion?drive_error=no_code')

    usuario_id = validar_state_token(state)
    if usuario_id is None:
        return django_redirect(f'{frontend_base}/configuracion?drive_error=invalid_state')

    from applications.usuarios.models import Usuario
    try:
        usuario = Usuario.objects.get(pk=usuario_id)
    except Usuario.DoesNotExist:
        return django_redirect(f'{frontend_base}/configuracion?drive_error=user_not_found')

    redirect_uri = _drive_redirect_uri(request)

    try:
        tokens = intercambiar_codigo(code, redirect_uri)
    except ValueError as e:
        logger.warning('Drive OAuth code exchange failed: %s', e)
        return django_redirect(f'{frontend_base}/configuracion?drive_error=token_exchange')

    email = obtener_email_google(tokens.get('access_token', ''))

    config = _get_or_create_config(usuario)
    config.drive_refresh_token_enc = encrypt_token(tokens['refresh_token'])
    config.drive_email = email
    config.drive_connected = True
    config.save(update_fields=[
        'drive_refresh_token_enc', 'drive_email', 'drive_connected', 'updated_at',
    ])

    return django_redirect(f'{frontend_base}/configuracion?drive_connected=1')


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def drive_disconnect(request):
    """Revoca el token y desconecta Drive."""
    if getattr(settings, 'DEMO', False):
        return respuesta_demo_no_disponible()
    usuario, err = utils_auth.get_usuario_autenticado(request)
    if err:
        return err

    from .drive_usuario import revocar_token

    config = _get_or_create_config(usuario)
    if not config.drive_connected:
        return Response({'error': 'Drive no está conectado.'}, status=status.HTTP_400_BAD_REQUEST)

    revocar_token(config)
    return Response({'ok': True, 'mensaje': 'Google Drive desconectado.'})


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def drive_backup_espacio(request, pk):
    """Exporta un espacio y lo sube al Drive del usuario."""
    if getattr(settings, 'DEMO', False):
        return respuesta_demo_no_disponible()
    usuario, err = utils_auth.get_usuario_autenticado(request)
    if err:
        return err

    espacio, pertenencia, err = _validar_pertenencia(usuario, pk)
    if err:
        return err

    from .drive_usuario import (
        asegurar_carpeta_backup,
        build_drive_service_usuario,
        limpiar_backups_antiguos,
        subir_backup_espacio,
    )

    config = _get_or_create_config(usuario)
    if not config.drive_connected:
        return Response(
            {'error': 'Conecta tu cuenta de Google Drive primero.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        service = build_drive_service_usuario(config)
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    try:
        folder_id = config.drive_folder_id
        if not folder_id:
            folder_id = asegurar_carpeta_backup(service)
            config.drive_folder_id = folder_id
            config.save(update_fields=['drive_folder_id', 'updated_at'])

        datos = exportar_espacio(espacio)
        archivo = subir_backup_espacio(service, folder_id, espacio, datos)
        eliminados = limpiar_backups_antiguos(service, folder_id, espacio.nombre)
    except Exception as e:
        logger.exception('Error subiendo backup a Drive')
        return Response(
            {'error': f'Error al subir a Drive: {e}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response({
        'ok': True,
        'archivo': archivo,
        'eliminados': len(eliminados),
        'folder_id': folder_id,
    })
