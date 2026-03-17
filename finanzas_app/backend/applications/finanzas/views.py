# applications/finanzas/views.py

from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

from applications.utils import get_usuario_autenticado
from .models import Categoria, MetodoPago, Tarjeta
from .serializers import (
    CategoriaSerializer,
    MetodoPagoSerializer,
    TarjetaSerializer,
)


# ── CATEGORÍAS ────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def categorias(request):
    """
    GET  → Lista categorías visibles para el usuario:
           globales (familia=None, usuario=None) +
           de su familia +
           personales suyas
    POST → Crea una categoría nueva (familiar o personal según body)
    """
    usuario, error = get_usuario_autenticado(request)
    if error:
        return error

    if request.method == 'GET':
        q_globales = Q(familia__isnull=True, usuario__isnull=True)
        q_personales = Q(usuario=usuario)
        q_familia = Q(familia=usuario.familia, usuario__isnull=True) if usuario.familia else Q(pk__in=[])
        qs = Categoria.objects.filter(q_globales | q_familia | q_personales).order_by('tipo', 'nombre')
        return Response(CategoriaSerializer(qs, many=True).data)

    if request.method == 'POST':
        ambito = request.data.get('ambito', 'PERSONAL')  # 'FAMILIAR' o 'PERSONAL'
        data = request.data.copy()
        if 'ambito' in data:
            del data['ambito']

        serializer = CategoriaSerializer(data=data)
        if serializer.is_valid():
            if ambito == 'FAMILIAR':
                serializer.save(familia=usuario.familia, usuario=None)
            else:
                serializer.save(familia=usuario.familia, usuario=usuario)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT', 'DELETE'])
@permission_classes([AllowAny])
def categoria_detalle(request, pk):
    """
    PUT    → Edita una categoría (solo si pertenece a la familia o al usuario)
    DELETE → Elimina una categoría (solo familiar o personal, no globales)
    """
    usuario, error = get_usuario_autenticado(request)
    if error:
        return error

    try:
        categoria = Categoria.objects.get(pk=pk)
    except Categoria.DoesNotExist:
        return Response(
            {'error': 'Categoría no encontrada.'},
            status=status.HTTP_404_NOT_FOUND
        )

    es_global = categoria.familia is None and categoria.usuario is None
    es_familiar = categoria.familia == usuario.familia and categoria.usuario is None
    es_personal = categoria.usuario == usuario

    if not (es_global or es_familiar or es_personal):
        return Response(
            {'error': 'Sin permisos para modificar esta categoría.'},
            status=status.HTTP_403_FORBIDDEN
        )

    if request.method == 'DELETE':
        if es_global:
            return Response(
                {'error': 'No se pueden eliminar categorías globales.'},
                status=status.HTTP_403_FORBIDDEN
            )
        categoria.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if request.method == 'PUT':
        serializer = CategoriaSerializer(categoria, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ── MÉTODOS DE PAGO ───────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def metodos_pago(request):
    """
    GET → Lista todos los métodos de pago disponibles.
    Son globales del sistema, no se crean por usuario.
    Si no existen, los crea automáticamente (seed).
    """
    usuario, error = get_usuario_autenticado(request)
    if error:
        return error

    if not MetodoPago.objects.exists():
        MetodoPago.objects.bulk_create([
            MetodoPago(nombre='Efectivo', tipo='EFECTIVO'),
            MetodoPago(nombre='Débito', tipo='DEBITO'),
            MetodoPago(nombre='Crédito', tipo='CREDITO'),
        ])

    metodos = MetodoPago.objects.all().order_by('tipo')
    return Response(MetodoPagoSerializer(metodos, many=True).data)


# ── TARJETAS ──────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def tarjetas(request):
    """
    GET  → Lista las tarjetas del usuario autenticado
    POST → Crea una tarjeta nueva para el usuario autenticado
    """
    usuario, error = get_usuario_autenticado(request)
    if error:
        return error

    if request.method == 'GET':
        qs = Tarjeta.objects.filter(usuario=usuario).order_by('nombre')
        return Response(TarjetaSerializer(qs, many=True).data)

    if request.method == 'POST':
        serializer = TarjetaSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(usuario=usuario)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT', 'DELETE'])
@permission_classes([AllowAny])
def tarjeta_detalle(request, pk):
    """
    PUT    → Edita una tarjeta (solo si es del usuario autenticado)
    DELETE → Elimina una tarjeta (solo si es del usuario autenticado)
    """
    usuario, error = get_usuario_autenticado(request)
    if error:
        return error

    try:
        tarjeta = Tarjeta.objects.get(pk=pk, usuario=usuario)
    except Tarjeta.DoesNotExist:
        return Response(
            {'error': 'Tarjeta no encontrada.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if request.method == 'DELETE':
        tarjeta.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if request.method == 'PUT':
        serializer = TarjetaSerializer(tarjeta, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
