# applications/viajes/views.py
#
# Migrado al patrón multitenant (cutover Fase 3→4): lecturas y escrituras por
# espacio activo (X-Espacio-Id o espacio por defecto), vía Viaje.tenant.
# Durante la transición las escrituras mantienen también familia (dual-write)
# y solo se permiten en espacios FAMILIAR con familia legacy vinculada.

from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.core.cache import cache

from applications.espacios.contexto import usuario_y_espacio

from .models import Viaje, PresupuestoViaje
from .serializers import ViajeSerializer, ViajeDetalleSerializer, PresupuestoViajeSerializer

_VIAJES_LIST_CACHE_SECONDS = 45


def _cache_key_viajes_list(espacio_id: int, archivado: bool) -> str:
    return f'viajes-list:e{espacio_id}:{1 if archivado else 0}'


def _invalidar_cache_viajes(espacio_id: int) -> None:
    cache.delete(_cache_key_viajes_list(espacio_id, archivado=False))
    cache.delete(_cache_key_viajes_list(espacio_id, archivado=True))


def _bloqueo_escritura(espacio):
    """Guard de escritura durante la transición multitenant."""
    if espacio.archivado:
        return Response(
            {'error': 'El espacio está archivado (registro histórico de solo lectura).'},
            status=status.HTTP_403_FORBIDDEN,
        )
    if espacio.es_personal or espacio.familia_origen_id is None:
        return Response(
            {
                'error': (
                    'Los viajes aún no están habilitados en este espacio '
                    '(transición multitenant en curso).'
                ),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def viajes(request):
    """
    GET  → Lista viajes del espacio activo.
           ?archivado=true  incluye viajes archivados
    POST → Crea un viaje nuevo en el espacio activo.
    """
    usuario, espacio, error = usuario_y_espacio(request)
    if error:
        return error

    if request.method == 'GET':
        archivado = request.GET.get('archivado', 'false').lower() == 'true'
        cache_key = _cache_key_viajes_list(espacio.id, archivado)
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        qs = Viaje.tenant.en_espacio(espacio).filter(
            archivado=archivado,
        ).prefetch_related('presupuestos', 'movimientos').order_by('fecha_inicio')
        data = ViajeDetalleSerializer(qs, many=True).data
        cache.set(cache_key, data, _VIAJES_LIST_CACHE_SECONDS)
        return Response(data)

    if request.method == 'POST':
        bloqueo = _bloqueo_escritura(espacio)
        if bloqueo is not None:
            return bloqueo
        serializer = ViajeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(espacio=espacio, familia=espacio.familia_origen)
            _invalidar_cache_viajes(espacio.id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PUT', 'DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def viaje_detalle(request, pk):
    usuario, espacio, error = usuario_y_espacio(request)
    if error:
        return error

    try:
        viaje = Viaje.tenant.en_espacio(espacio).prefetch_related(
            'presupuestos__categoria', 'movimientos'
        ).get(pk=pk)
    except Viaje.DoesNotExist:
        return Response({'error': 'Viaje no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response(ViajeDetalleSerializer(viaje).data)

    bloqueo = _bloqueo_escritura(espacio)
    if bloqueo is not None:
        return bloqueo

    if request.method == 'DELETE':
        # Archivar en lugar de eliminar
        viaje.archivado = True
        viaje.es_activo = False
        viaje.save()
        _invalidar_cache_viajes(espacio.id)
        return Response(status=status.HTTP_204_NO_CONTENT)

    if request.method == 'PUT':
        serializer = ViajeSerializer(viaje, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            _invalidar_cache_viajes(espacio.id)
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def activar_viaje(request, pk):
    """
    Activa un viaje y desactiva todos los demás del espacio.
    Si el viaje ya está activo, lo desactiva (toggle).
    """
    usuario, espacio, error = usuario_y_espacio(request)
    if error:
        return error

    try:
        viaje = Viaje.tenant.en_espacio(espacio).get(pk=pk)
    except Viaje.DoesNotExist:
        return Response({'error': 'Viaje no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    bloqueo = _bloqueo_escritura(espacio)
    if bloqueo is not None:
        return bloqueo

    if viaje.es_activo:
        viaje.es_activo = False
        viaje.save()
    else:
        # Desactivar todos los viajes del espacio
        Viaje.tenant.en_espacio(espacio).update(es_activo=False)
        viaje.es_activo = True
        viaje.save()

    _invalidar_cache_viajes(espacio.id)
    return Response(ViajeSerializer(viaje).data)


@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def presupuestos_viaje(request, pk):
    usuario, espacio, error = usuario_y_espacio(request)
    if error:
        return error

    try:
        viaje = Viaje.tenant.en_espacio(espacio).get(pk=pk)
    except Viaje.DoesNotExist:
        return Response({'error': 'Viaje no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        qs = PresupuestoViaje.objects.filter(
            viaje=viaje
        ).select_related('categoria')
        return Response(PresupuestoViajeSerializer(qs, many=True).data)

    if request.method == 'POST':
        bloqueo = _bloqueo_escritura(espacio)
        if bloqueo is not None:
            return bloqueo
        serializer = PresupuestoViajeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(viaje=viaje)
            _invalidar_cache_viajes(espacio.id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT', 'DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def presupuesto_detalle(request, pk):
    usuario, espacio, error = usuario_y_espacio(request)
    if error:
        return error

    try:
        presupuesto = PresupuestoViaje.objects.get(
            pk=pk, viaje__espacio=espacio
        )
    except PresupuestoViaje.DoesNotExist:
        return Response({'error': 'Presupuesto no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    bloqueo = _bloqueo_escritura(espacio)
    if bloqueo is not None:
        return bloqueo

    if request.method == 'DELETE':
        presupuesto.delete()
        _invalidar_cache_viajes(espacio.id)
        return Response(status=status.HTTP_204_NO_CONTENT)

    if request.method == 'PUT':
        serializer = PresupuestoViajeSerializer(
            presupuesto, data=request.data, partial=True
        )
        if serializer.is_valid():
            serializer.save()
            _invalidar_cache_viajes(espacio.id)
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
