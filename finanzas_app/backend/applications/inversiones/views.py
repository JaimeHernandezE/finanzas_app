# applications/inversiones/views.py
#
# Migrado al patrón multitenant (cutover Fase 3→4): lecturas y escrituras por
# espacio activo (X-Espacio-Id o espacio por defecto), vía Fondo.tenant.
# Durante la transición las escrituras mantienen también familia (dual-write)
# y solo se permiten en espacios FAMILIAR con familia legacy vinculada.

from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Sum, Q

from applications.espacios.contexto import usuario_y_espacio

from .models import Fondo, Aporte, RegistroValor
from .serializers import (
    FondoListSerializer, FondoDetalleSerializer,
    AporteSerializer, RegistroValorSerializer,
)


def _bloqueo_escritura(espacio):
    """Guard de escritura: espacios archivados son solo lectura."""
    if espacio.archivado:
        return Response(
            {'error': 'El espacio está archivado (registro histórico de solo lectura).'},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


def calcular_metricas(fondo):
    """
    Calcula capital total, valor actual, ganancia y rentabilidad de un fondo.
    Se añaden como atributos al objeto para que los serializers los lean.
    """
    capital = fondo.aportes.aggregate(total=Sum('monto'))['total'] or 0
    ultimo_valor = fondo.registros_valor.order_by('-fecha').first()
    valor_actual = ultimo_valor.valor_cuota if ultimo_valor else capital

    ganancia = valor_actual - capital
    rentabilidad = (ganancia / capital * 100) if capital > 0 else 0

    fondo.capital_total = capital
    fondo.valor_actual  = valor_actual
    fondo.ganancia      = ganancia
    fondo.rentabilidad  = round(rentabilidad, 2)
    return fondo


@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def fondos(request):
    """
    GET  → Lista fondos visibles para el usuario con métricas calculadas.
           Incluye fondos propios y compartidos del espacio activo.
    POST → Crea un fondo nuevo en el espacio activo.
           Body: { "nombre": "...", "descripcion": "...", "es_compartido": true }
    """
    usuario, espacio, error = usuario_y_espacio(request)
    if error:
        return error

    if request.method == 'GET':
        qs = Fondo.tenant.en_espacio(espacio).filter(
            Q(usuario=usuario) | Q(usuario__isnull=True)
        ).prefetch_related('aportes', 'registros_valor').order_by('nombre')

        fondos_con_metricas = [calcular_metricas(f) for f in qs]
        return Response(FondoListSerializer(fondos_con_metricas, many=True).data)

    if request.method == 'POST':
        bloqueo = _bloqueo_escritura(espacio)
        if bloqueo is not None:
            return bloqueo
        es_compartido = request.data.get('es_compartido', False)
        fondo = Fondo.objects.create(
            nombre      = request.data.get('nombre', ''),
            descripcion = request.data.get('descripcion', ''),
            espacio     = espacio,
            usuario     = None if es_compartido else usuario,
        )
        fondo = calcular_metricas(fondo)
        return Response(
            FondoListSerializer(fondo).data,
            status=status.HTTP_201_CREATED
        )


@api_view(['GET', 'PUT', 'DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def fondo_detalle(request, pk):
    """
    GET    → Retorna el fondo con historial completo y métricas.
    PUT    → Edita nombre o descripción.
    DELETE → Elimina el fondo y todos sus registros.
    """
    usuario, espacio, error = usuario_y_espacio(request)
    if error:
        return error

    try:
        fondo = Fondo.tenant.en_espacio(espacio).prefetch_related(
            'aportes', 'registros_valor'
        ).get(pk=pk)
    except Fondo.DoesNotExist:
        return Response(
            {'error': 'Fondo no encontrado.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if request.method == 'GET':
        fondo = calcular_metricas(fondo)
        return Response(FondoDetalleSerializer(fondo).data)

    bloqueo = _bloqueo_escritura(espacio)
    if bloqueo is not None:
        return bloqueo

    if request.method == 'DELETE':
        fondo.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if request.method == 'PUT':
        if 'nombre' in request.data:
            fondo.nombre = request.data['nombre']
        if 'descripcion' in request.data:
            fondo.descripcion = request.data['descripcion']
        fondo.save()
        fondo = calcular_metricas(fondo)
        return Response(FondoListSerializer(fondo).data)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def agregar_aporte(request, pk):
    """POST → Agrega un aporte de capital al fondo."""
    usuario, espacio, error = usuario_y_espacio(request)
    if error:
        return error

    try:
        fondo = Fondo.tenant.en_espacio(espacio).get(pk=pk)
    except Fondo.DoesNotExist:
        return Response({'error': 'Fondo no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    bloqueo = _bloqueo_escritura(espacio)
    if bloqueo is not None:
        return bloqueo

    serializer = AporteSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(fondo=fondo)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def eliminar_aporte(request, pk):
    """DELETE → Elimina un aporte."""
    usuario, espacio, error = usuario_y_espacio(request)
    if error:
        return error

    try:
        aporte = Aporte.objects.get(pk=pk, fondo__espacio=espacio)
    except Aporte.DoesNotExist:
        return Response({'error': 'Aporte no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    bloqueo = _bloqueo_escritura(espacio)
    if bloqueo is not None:
        return bloqueo

    aporte.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def agregar_valor(request, pk):
    """POST → Registra el valor actual del fondo."""
    usuario, espacio, error = usuario_y_espacio(request)
    if error:
        return error

    try:
        fondo = Fondo.tenant.en_espacio(espacio).get(pk=pk)
    except Fondo.DoesNotExist:
        return Response({'error': 'Fondo no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    bloqueo = _bloqueo_escritura(espacio)
    if bloqueo is not None:
        return bloqueo

    serializer = RegistroValorSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(fondo=fondo)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def eliminar_valor(request, pk):
    """DELETE → Elimina un registro de valor."""
    usuario, espacio, error = usuario_y_espacio(request)
    if error:
        return error

    try:
        valor = RegistroValor.objects.get(pk=pk, fondo__espacio=espacio)
    except RegistroValor.DoesNotExist:
        return Response({'error': 'Registro no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    bloqueo = _bloqueo_escritura(espacio)
    if bloqueo is not None:
        return bloqueo

    valor.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
