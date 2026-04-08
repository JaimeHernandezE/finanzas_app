# applications/viajes/views.py

from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.core.cache import cache
import applications.utils as utils_auth
from .models import Viaje, PresupuestoViaje
from .serializers import ViajeSerializer, ViajeDetalleSerializer, PresupuestoViajeSerializer

_VIAJES_LIST_CACHE_SECONDS = 45


def _cache_key_viajes_list(familia_id: int, archivado: bool) -> str:
    return f'viajes-list:{familia_id}:{1 if archivado else 0}'


def _invalidar_cache_viajes_familia(familia_id: int) -> None:
    cache.delete(_cache_key_viajes_list(familia_id, archivado=False))
    cache.delete(_cache_key_viajes_list(familia_id, archivado=True))


@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def viajes(request):
    """
    GET  → Lista viajes de la familia.
           ?archivado=true  incluye viajes archivados
    POST → Crea un viaje nuevo.
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error: return error

    if request.method == 'GET':
        archivado = request.GET.get('archivado', 'false').lower() == 'true'
        cache_key = _cache_key_viajes_list(usuario.familia_id, archivado)
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        qs = Viaje.objects.filter(
            familia=usuario.familia,
            archivado=archivado,
        ).prefetch_related('presupuestos', 'movimientos').order_by('fecha_inicio')
        data = ViajeDetalleSerializer(qs, many=True).data
        cache.set(cache_key, data, _VIAJES_LIST_CACHE_SECONDS)
        return Response(data)

    if request.method == 'POST':
        serializer = ViajeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(familia=usuario.familia)
            _invalidar_cache_viajes_familia(usuario.familia_id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PUT', 'DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def viaje_detalle(request, pk):
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error: return error

    try:
        viaje = Viaje.objects.prefetch_related(
            'presupuestos__categoria', 'movimientos'
        ).get(pk=pk, familia=usuario.familia)
    except Viaje.DoesNotExist:
        return Response({'error': 'Viaje no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response(ViajeDetalleSerializer(viaje).data)

    if request.method == 'DELETE':
        # Archivar en lugar de eliminar
        viaje.archivado = True
        viaje.es_activo = False
        viaje.save()
        _invalidar_cache_viajes_familia(usuario.familia_id)
        return Response(status=status.HTTP_204_NO_CONTENT)

    if request.method == 'PUT':
        serializer = ViajeSerializer(viaje, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            _invalidar_cache_viajes_familia(usuario.familia_id)
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def activar_viaje(request, pk):
    """
    Activa un viaje y desactiva todos los demás de la familia.
    Si el viaje ya está activo, lo desactiva (toggle).
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error: return error

    try:
        viaje = Viaje.objects.get(pk=pk, familia=usuario.familia)
    except Viaje.DoesNotExist:
        return Response({'error': 'Viaje no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    if viaje.es_activo:
        viaje.es_activo = False
        viaje.save()
    else:
        # Desactivar todos los viajes de la familia
        Viaje.objects.filter(familia=usuario.familia).update(es_activo=False)
        viaje.es_activo = True
        viaje.save()

    _invalidar_cache_viajes_familia(usuario.familia_id)
    return Response(ViajeSerializer(viaje).data)


@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def presupuestos_viaje(request, pk):
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error: return error

    try:
        viaje = Viaje.objects.get(pk=pk, familia=usuario.familia)
    except Viaje.DoesNotExist:
        return Response({'error': 'Viaje no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        qs = PresupuestoViaje.objects.filter(
            viaje=viaje
        ).select_related('categoria')
        return Response(PresupuestoViajeSerializer(qs, many=True).data)

    if request.method == 'POST':
        serializer = PresupuestoViajeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(viaje=viaje)
            _invalidar_cache_viajes_familia(usuario.familia_id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT', 'DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def presupuesto_detalle(request, pk):
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error: return error

    try:
        presupuesto = PresupuestoViaje.objects.get(
            pk=pk, viaje__familia=usuario.familia
        )
    except PresupuestoViaje.DoesNotExist:
        return Response({'error': 'Presupuesto no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        presupuesto.delete()
        _invalidar_cache_viajes_familia(usuario.familia_id)
        return Response(status=status.HTTP_204_NO_CONTENT)

    if request.method == 'PUT':
        serializer = PresupuestoViajeSerializer(
            presupuesto, data=request.data, partial=True
        )
        if serializer.is_valid():
            serializer.save()
            _invalidar_cache_viajes_familia(usuario.familia_id)
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
