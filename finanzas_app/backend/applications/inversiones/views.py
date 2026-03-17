# applications/inversiones/views.py

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Sum, Q
import applications.utils as utils_auth
from .models import Fondo, Aporte, RegistroValor
from .serializers import (
    FondoListSerializer, FondoDetalleSerializer,
    AporteSerializer, RegistroValorSerializer,
)


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
@permission_classes([AllowAny])
def fondos(request):
    """
    GET  → Lista fondos visibles para el usuario con métricas calculadas.
           Incluye fondos propios y compartidos de la familia.
    POST → Crea un fondo nuevo.
           Body: { "nombre": "...", "descripcion": "...", "es_compartido": true }
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error: return error

    if request.method == 'GET':
        qs = Fondo.objects.filter(
            Q(usuario=usuario) | Q(familia=usuario.familia, usuario__isnull=True)
        ).prefetch_related('aportes', 'registros_valor').order_by('nombre')

        fondos_con_metricas = [calcular_metricas(f) for f in qs]
        return Response(FondoListSerializer(fondos_con_metricas, many=True).data)

    if request.method == 'POST':
        es_compartido = request.data.get('es_compartido', False)
        fondo = Fondo.objects.create(
            nombre      = request.data.get('nombre', ''),
            descripcion = request.data.get('descripcion', ''),
            familia     = usuario.familia,
            usuario     = None if es_compartido else usuario,
        )
        fondo = calcular_metricas(fondo)
        return Response(
            FondoListSerializer(fondo).data,
            status=status.HTTP_201_CREATED
        )


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([AllowAny])
def fondo_detalle(request, pk):
    """
    GET    → Retorna el fondo con historial completo y métricas.
    PUT    → Edita nombre o descripción.
    DELETE → Elimina el fondo y todos sus registros.
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error: return error

    try:
        fondo = Fondo.objects.prefetch_related(
            'aportes', 'registros_valor'
        ).get(
            pk=pk,
            familia=usuario.familia,
        )
    except Fondo.DoesNotExist:
        return Response(
            {'error': 'Fondo no encontrado.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if request.method == 'GET':
        fondo = calcular_metricas(fondo)
        return Response(FondoDetalleSerializer(fondo).data)

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
@permission_classes([AllowAny])
def agregar_aporte(request, pk):
    """POST → Agrega un aporte de capital al fondo."""
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error: return error

    try:
        fondo = Fondo.objects.get(pk=pk, familia=usuario.familia)
    except Fondo.DoesNotExist:
        return Response({'error': 'Fondo no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    serializer = AporteSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(fondo=fondo)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
@permission_classes([AllowAny])
def eliminar_aporte(request, pk):
    """DELETE → Elimina un aporte."""
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error: return error

    try:
        aporte = Aporte.objects.get(pk=pk, fondo__familia=usuario.familia)
    except Aporte.DoesNotExist:
        return Response({'error': 'Aporte no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    aporte.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@permission_classes([AllowAny])
def agregar_valor(request, pk):
    """POST → Registra el valor actual del fondo."""
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error: return error

    try:
        fondo = Fondo.objects.get(pk=pk, familia=usuario.familia)
    except Fondo.DoesNotExist:
        return Response({'error': 'Fondo no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    serializer = RegistroValorSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(fondo=fondo)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
@permission_classes([AllowAny])
def eliminar_valor(request, pk):
    """DELETE → Elimina un registro de valor."""
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error: return error

    try:
        valor = RegistroValor.objects.get(pk=pk, fondo__familia=usuario.familia)
    except RegistroValor.DoesNotExist:
        return Response({'error': 'Registro no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    valor.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
