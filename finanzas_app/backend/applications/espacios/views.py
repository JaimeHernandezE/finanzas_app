# Endpoints de espacios (Fase 2): selector de espacio para el frontend y
# configuración del espacio (modo de reparto). El aislamiento de los datos
# financieros por espacio llega con la migración de esquema (Fase 3).

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from applications import utils as utils_auth
from applications.demo_guard import respuesta_demo_no_disponible

from .contexto import resolver_espacio_activo
from .models import Espacio, PertenenciaEspacio


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
