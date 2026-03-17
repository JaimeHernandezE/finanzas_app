# applications/finanzas/views.py

from django.db.models import Q
from dateutil.relativedelta import relativedelta
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

import applications.utils as utils_auth
from .models import Categoria, MetodoPago, Tarjeta, Movimiento, Cuota
from .serializers import (
    CategoriaSerializer,
    MetodoPagoSerializer,
    TarjetaSerializer,
    MovimientoSerializer,
    MovimientoListSerializer,
    CuotaSerializer,
)


# ── CATEGORÍAS ────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def categorias(request):
    """
    GET  → Lista categorías visibles para el usuario:
           globales (familia=None, usuario=None) +
           de su familia +
           personales suyas
    POST → Crea una categoría nueva (familiar o personal según body)
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
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
@authentication_classes([])
@permission_classes([AllowAny])
def categoria_detalle(request, pk):
    """
    PUT    → Edita una categoría (solo si pertenece a la familia o al usuario)
    DELETE → Elimina una categoría (solo familiar o personal, no globales)
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
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
@authentication_classes([])
@permission_classes([AllowAny])
def metodos_pago(request):
    """
    GET → Lista todos los métodos de pago disponibles.
    Son globales del sistema, no se crean por usuario.
    Si no existen, los crea automáticamente (seed).
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
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
@authentication_classes([])
@permission_classes([AllowAny])
def tarjetas(request):
    """
    GET  → Lista las tarjetas del usuario autenticado
    POST → Crea una tarjeta nueva para el usuario autenticado
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
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
@authentication_classes([])
@permission_classes([AllowAny])
def tarjeta_detalle(request, pk):
    """
    PUT    → Edita una tarjeta (solo si es del usuario autenticado)
    DELETE → Elimina una tarjeta (solo si es del usuario autenticado)
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
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


# ── MOVIMIENTOS ───────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def movimientos(request):
    """
    GET  → Lista movimientos con filtros opcionales por query params:
           ?cuenta=1        filtra por CuentaPersonal
           ?ambito=COMUN    filtra por ámbito (PERSONAL / COMUN)
           ?mes=3&anio=2026 filtra por mes y año
           ?tipo=EGRESO     filtra por tipo (INGRESO / EGRESO)
           ?categoria=1     filtra por categoría
           ?metodo=CREDITO  filtra por tipo de método de pago
           ?q=supermercado  búsqueda por descripción (comentario)

    POST → Crea un movimiento nuevo. Si es crédito, el signal genera las cuotas.
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    if request.method == 'GET':
        qs = Movimiento.objects.filter(
            familia=usuario.familia
        ).select_related(
            'categoria', 'metodo_pago', 'tarjeta', 'usuario'
        ).order_by('-fecha', '-created_at')

        cuenta = request.GET.get('cuenta')
        ambito = request.GET.get('ambito')
        mes = request.GET.get('mes')
        anio = request.GET.get('anio')
        tipo = request.GET.get('tipo')
        categoria = request.GET.get('categoria')
        metodo = request.GET.get('metodo')
        q = request.GET.get('q')

        if cuenta:
            qs = qs.filter(cuenta_id=cuenta)
        if ambito:
            qs = qs.filter(ambito=ambito)
        if mes and anio:
            qs = qs.filter(fecha__month=mes, fecha__year=anio)
        elif mes:
            qs = qs.filter(fecha__month=mes)
        if tipo:
            qs = qs.filter(tipo=tipo)
        if categoria:
            qs = qs.filter(categoria_id=categoria)
        if metodo:
            qs = qs.filter(metodo_pago__tipo=metodo)
        if q:
            qs = qs.filter(comentario__icontains=q)

        qs = qs.filter(oculto=False)

        return Response(MovimientoListSerializer(qs, many=True).data)

    if request.method == 'POST':
        serializer = MovimientoSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                usuario=usuario,
                familia=usuario.familia,
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PUT', 'DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def movimiento_detalle(request, pk):
    """
    GET    → Retorna el movimiento con sus cuotas
    PUT    → Edita el movimiento (no regenera cuotas si ya existen)
    DELETE → Elimina el movimiento y sus cuotas en cascada
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    try:
        movimiento = Movimiento.objects.select_related(
            'categoria', 'metodo_pago', 'tarjeta', 'usuario'
        ).prefetch_related('cuotas').get(
            pk=pk,
            familia=usuario.familia
        )
    except Movimiento.DoesNotExist:
        return Response(
            {'error': 'Movimiento no encontrado.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if request.method == 'GET':
        return Response(MovimientoSerializer(movimiento).data)

    if request.method == 'DELETE':
        if movimiento.usuario != usuario:
            return Response(
                {'error': 'Solo puedes eliminar tus propios movimientos.'},
                status=status.HTTP_403_FORBIDDEN
            )
        movimiento.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if request.method == 'PUT':
        if movimiento.usuario != usuario:
            return Response(
                {'error': 'Solo puedes editar tus propios movimientos.'},
                status=status.HTTP_403_FORBIDDEN
            )
        serializer = MovimientoSerializer(
            movimiento, data=request.data, partial=True
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ── CUOTAS ────────────────────────────────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def cuotas(request):
    """
    GET → Lista cuotas con filtros opcionales:
          ?tarjeta=1       filtra por tarjeta
          ?mes=3&anio=2026 filtra por mes de facturación
          ?estado=PENDIENTE filtra por estado
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    qs = Cuota.objects.filter(
        movimiento__familia=usuario.familia
    ).select_related(
        'movimiento', 'movimiento__tarjeta', 'movimiento__categoria'
    ).order_by('mes_facturacion', 'numero')

    tarjeta = request.GET.get('tarjeta')
    mes = request.GET.get('mes')
    anio = request.GET.get('anio')
    estado = request.GET.get('estado')

    if tarjeta:
        qs = qs.filter(movimiento__tarjeta_id=tarjeta)
    if mes and anio:
        qs = qs.filter(
            mes_facturacion__month=mes,
            mes_facturacion__year=anio
        )
    if estado:
        qs = qs.filter(estado=estado)

    return Response(CuotaSerializer(qs, many=True).data)


@api_view(['PUT'])
@authentication_classes([])
@permission_classes([AllowAny])
def cuota_detalle(request, pk):
    """
    PUT → Actualiza el estado o el campo incluir de una cuota.
          Si incluir pasa a False, mueve mes_facturacion al mes siguiente.
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    try:
        cuota = Cuota.objects.select_related('movimiento').get(
            pk=pk,
            movimiento__familia=usuario.familia
        )
    except Cuota.DoesNotExist:
        return Response(
            {'error': 'Cuota no encontrada.'},
            status=status.HTTP_404_NOT_FOUND
        )

    incluir_anterior = cuota.incluir
    incluir_nuevo = request.data.get('incluir', cuota.incluir)

    data = dict(request.data)
    if incluir_anterior and not incluir_nuevo:
        cuota.mes_facturacion = cuota.mes_facturacion + relativedelta(months=1)
        data['mes_facturacion'] = cuota.mes_facturacion

    serializer = CuotaSerializer(cuota, data=data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
