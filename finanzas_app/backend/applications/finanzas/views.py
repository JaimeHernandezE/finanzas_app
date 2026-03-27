# applications/finanzas/views.py

from datetime import date
from decimal import Decimal

from django.db.models import Q, Sum, OuterRef, Subquery
from django.utils import timezone
from dateutil.relativedelta import relativedelta
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

import applications.utils as utils_auth
from .models import (
    Categoria,
    CuentaPersonal,
    MetodoPago,
    Tarjeta,
    Movimiento,
    Cuota,
    IngresoComun,
    Presupuesto,
)
from .serializers import (
    CategoriaSerializer,
    CuentaPersonalSerializer,
    CuentaPersonalWriteSerializer,
    MetodoPagoSerializer,
    TarjetaSerializer,
    MovimientoSerializer,
    MovimientoListSerializer,
    CuotaSerializer,
    IngresoComunSerializer,
    PresupuestoSerializer,
)


def _qs_movimientos_con_ingreso_comun(qs):
    """Anota _ingreso_comun_pk para serializers (evita N+1)."""
    sub = IngresoComun.objects.filter(movimiento_id=OuterRef('pk')).values('pk')[:1]
    return qs.annotate(_ingreso_comun_pk=Subquery(sub))


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
        if es_global:
            data = {'nombre': request.data.get('nombre', categoria.nombre)}
            serializer = CategoriaSerializer(categoria, data=data, partial=True)
        else:
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


# ── CUENTAS PERSONALES ────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def cuentas_personales(request):
    """
    GET  → Cuentas que el usuario puede ver: propias + tuteladas (TutorCuenta).
    POST → Crea una cuenta personal propia del usuario autenticado.
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    if request.method == 'GET':
        qs = usuario.cuentas_visibles().select_related('usuario')
        propias = [c for c in qs if c.usuario_id == usuario.id]
        tuteladas = [c for c in qs if c.usuario_id != usuario.id]
        propias.sort(key=lambda x: x.nombre.lower())
        tuteladas.sort(key=lambda x: x.nombre.lower())
        ordered = propias + tuteladas
        ctx = {'usuario': usuario}
        return Response(
            CuentaPersonalSerializer(ordered, many=True, context=ctx).data
        )

    serializer = CuentaPersonalWriteSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    cuenta = CuentaPersonal.objects.create(
        usuario=usuario,
        nombre=serializer.validated_data['nombre'],
        descripcion=serializer.validated_data.get('descripcion') or '',
        visible_familia=serializer.validated_data.get('visible_familia', False),
    )
    return Response(
        CuentaPersonalSerializer(
            cuenta, context={'usuario': usuario}
        ).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def cuenta_personal_detalle(request, pk):
    """
    GET    → Detalle si la cuenta está en cuentas_visibles.
    PUT/PATCH → Solo el dueño puede editar.
    DELETE → Solo el dueño puede eliminar (si tiene movimientos, puede fallar por FK).
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    try:
        cuenta = CuentaPersonal.objects.select_related('usuario').get(pk=pk)
    except CuentaPersonal.DoesNotExist:
        return Response(
            {'error': 'Cuenta no encontrada.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    visibles = usuario.cuentas_visibles()
    if not visibles.filter(pk=cuenta.pk).exists():
        return Response(
            {'error': 'Sin permisos para acceder a esta cuenta.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    ctx = {'usuario': usuario}

    if request.method == 'GET':
        return Response(CuentaPersonalSerializer(cuenta, context=ctx).data)

    if cuenta.usuario_id != usuario.id:
        return Response(
            {'error': 'Solo el dueño puede modificar o eliminar esta cuenta.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    if request.method == 'DELETE':
        cuenta.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = CuentaPersonalWriteSerializer(
        cuenta, data=request.data, partial=request.method == 'PATCH'
    )
    if serializer.is_valid():
        serializer.save()
        cuenta.refresh_from_db()
        return Response(CuentaPersonalSerializer(cuenta, context=ctx).data)
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
        solo_mios = request.GET.get('solo_mios')
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
        if solo_mios in ('1', 'true', 'True', 'yes', 'on'):
            qs = qs.filter(usuario=usuario)
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
        qs = _qs_movimientos_con_ingreso_comun(qs)

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


@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def movimiento_detalle(request, pk):
    """
    GET    → Retorna el movimiento con sus cuotas (campo ingreso_comun si aplica).
    PUT/PATCH → Edita el movimiento. Si está vinculado a un ingreso común,
                solo fecha, monto y comentario; los cambios se reflejan en IngresoComun.
    DELETE → Elimina el movimiento. No aplica a movimientos vinculados a ingreso común
             (eliminar el ingreso común en su lugar).
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    try:
        movimiento = _qs_movimientos_con_ingreso_comun(
            Movimiento.objects.select_related(
                'categoria', 'metodo_pago', 'tarjeta', 'usuario'
            ).prefetch_related('cuotas')
        ).get(
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
        if movimiento._ingreso_comun_pk is not None:
            return Response(
                {
                    'error': (
                        'Este movimiento está vinculado a un ingreso común. '
                        'Elimínalo desde Ingresos comunes o edítalo allí / aquí (monto, fecha, comentario).'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        movimiento.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if request.method in ('PUT', 'PATCH'):
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
            movimiento.refresh_from_db()
            movimiento = _qs_movimientos_con_ingreso_comun(
                Movimiento.objects.select_related(
                    'categoria', 'metodo_pago', 'tarjeta', 'usuario'
                ).prefetch_related('cuotas')
            ).get(pk=movimiento.pk, familia=usuario.familia)
            return Response(MovimientoSerializer(movimiento).data)
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


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def cuotas_deuda_pendiente(request):
    """
    Suma del gasto personal con tarjeta de crédito del usuario autenticado
    para el mes actual, considerando solo movimientos hasta el día de
    facturación de cada tarjeta.
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    hoy = timezone.localdate()
    tarjetas = Tarjeta.objects.filter(usuario=usuario).only('id', 'dia_facturacion')
    if not tarjetas.exists():
        return Response({'total': '0'})

    total = Decimal('0')
    base_qs = Movimiento.objects.filter(
        usuario=usuario,
        tipo='EGRESO',
        ambito='PERSONAL',
        oculto=False,
        metodo_pago__tipo='CREDITO',
        fecha__year=hoy.year,
        fecha__month=hoy.month,
    )

    for tarjeta in tarjetas:
        qs_tarjeta = base_qs.filter(tarjeta_id=tarjeta.id)
        if tarjeta.dia_facturacion:
            qs_tarjeta = qs_tarjeta.filter(fecha__day__lte=tarjeta.dia_facturacion)
        subtotal = qs_tarjeta.aggregate(t=Sum('monto')).get('t') or Decimal('0')
        total += subtotal

    return Response({'total': str(total)})


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


# ── INGRESOS COMUNES (SUELDOS) ──────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def ingresos_comunes(request):
    """
    GET  → Lista ingresos comunes de la familia.
           Filtros opcionales:
           ?mes=3&anio=2026  filtra por mes y año
           ?usuario=1        filtra por usuario (para ver solo los propios)

    POST → Crea un ingreso común para el usuario autenticado.
           Body: { "mes": "2026-03-01", "monto": "1800000.00", "origen": "Sueldo" }
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    if request.method == 'GET':
        qs = IngresoComun.objects.filter(
            familia=usuario.familia
        ).select_related('usuario').order_by('-mes', 'usuario__first_name')

        mes = request.GET.get('mes')
        anio = request.GET.get('anio')
        uid = request.GET.get('usuario')

        if mes and anio:
            qs = qs.filter(mes__month=mes, mes__year=anio)
        if uid:
            qs = qs.filter(usuario_id=uid)

        return Response(IngresoComunSerializer(qs, many=True).data)

    if request.method == 'POST':
        serializer = IngresoComunSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                usuario=usuario,
                familia=usuario.familia,
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT', 'PATCH', 'DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def ingreso_comun_detalle(request, pk):
    """
    PUT/PATCH → Edita un ingreso común (solo el autor); el Movimiento vinculado se actualiza.
    DELETE → Elimina el ingreso y el movimiento vinculado.
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    try:
        ingreso = IngresoComun.objects.get(pk=pk, familia=usuario.familia)
    except IngresoComun.DoesNotExist:
        return Response(
            {'error': 'Ingreso no encontrado.'},
            status=status.HTTP_404_NOT_FOUND
        )

    if ingreso.usuario != usuario:
        return Response(
            {'error': 'Solo puedes modificar tus propios ingresos.'},
            status=status.HTTP_403_FORBIDDEN
        )

    if request.method == 'DELETE':
        ingreso.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if request.method in ('PUT', 'PATCH'):
        serializer = IngresoComunSerializer(ingreso, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            ingreso.refresh_from_db()
            return Response(IngresoComunSerializer(ingreso).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ── PRESUPUESTO MENSUAL (familia / personal) ─────────────────────────────────

def _categoria_accesible(usuario, categoria_id):
    """Categoría global, familiar o personal del usuario."""
    try:
        cid = int(categoria_id)
    except (TypeError, ValueError):
        return None
    q_glob = Q(familia__isnull=True, usuario__isnull=True)
    q_fam = Q(familia=usuario.familia, usuario__isnull=True) if usuario.familia_id else Q(pk__in=[])
    q_per = Q(usuario=usuario)
    return Categoria.objects.filter(pk=cid).filter(q_glob | q_fam | q_per).first()


def _puede_editar_presupuesto(usuario, presupuesto):
    if presupuesto.familia_id != usuario.familia_id:
        return False
    if presupuesto.usuario_id is None:
        return True
    return presupuesto.usuario_id == usuario.id


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def presupuesto_mes(request):
    """
    GET ?mes=3&anio=2026&ambito=FAMILIAR|PERSONAL[&cuenta=ID]
    Lista categorías con presupuesto y/o gastos del mes (egresos COMUN o PERSONAL).
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error
    if not usuario.familia_id:
        return Response([])

    try:
        mes = int(request.GET.get('mes', 0))
        anio = int(request.GET.get('anio', 0))
    except ValueError:
        return Response(
            {'error': 'mes y anio deben ser numéricos.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    ambito = (request.GET.get('ambito') or 'FAMILIAR').upper()
    cuenta_id = request.GET.get('cuenta')
    if ambito not in ('FAMILIAR', 'PERSONAL'):
        return Response(
            {'error': 'ambito debe ser FAMILIAR o PERSONAL.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not (1 <= mes <= 12) or anio < 2000 or anio > 2100:
        return Response(
            {'error': 'mes o anio inválido.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    mes_first = date(anio, mes, 1)

    if ambito == 'FAMILIAR':
        pres_qs = Presupuesto.objects.filter(
            familia_id=usuario.familia_id,
            mes=mes_first,
            usuario__isnull=True,
        ).select_related('categoria')
        mov_qs = Movimiento.objects.filter(
            familia_id=usuario.familia_id,
            fecha__month=mes,
            fecha__year=anio,
            tipo='EGRESO',
            ambito='COMUN',
            oculto=False,
        )
    else:
        pres_qs = Presupuesto.objects.filter(
            familia_id=usuario.familia_id,
            mes=mes_first,
            usuario=usuario,
        ).select_related('categoria')
        mov_qs = Movimiento.objects.filter(
            familia_id=usuario.familia_id,
            usuario=usuario,
            fecha__month=mes,
            fecha__year=anio,
            tipo='EGRESO',
            ambito='PERSONAL',
            oculto=False,
        )
        if cuenta_id:
            try:
                cuenta_int = int(cuenta_id)
            except (TypeError, ValueError):
                return Response(
                    {'error': 'cuenta debe ser numérica.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not CuentaPersonal.objects.filter(pk=cuenta_int, usuario=usuario).exists():
                return Response(
                    {'error': 'Cuenta personal no válida.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            mov_qs = mov_qs.filter(cuenta_id=cuenta_int)

    gastos_por_cat = {
        row['categoria_id']: row['t'] or 0
        for row in mov_qs.values('categoria_id').annotate(t=Sum('monto'))
    }
    pres_map = {p.categoria_id: p for p in pres_qs}
    all_ids = set(pres_map.keys()) | set(gastos_por_cat.keys())
    nombres = {
        c.id: c.nombre
        for c in Categoria.objects.filter(pk__in=all_ids)
    }

    filas = []
    for cid in sorted(all_ids, key=lambda x: nombres.get(x, '')):
        p = pres_map.get(cid)
        g = gastos_por_cat.get(cid) or 0
        try:
            gastado = int(g)
        except (TypeError, ValueError):
            gastado = int(float(g))
        filas.append({
            'presupuesto_id': p.id if p else None,
            'categoria_id': cid,
            'categoria_nombre': nombres.get(cid, '—'),
            'monto_presupuestado': str(p.monto) if p else None,
            'gastado': gastado,
        })
    return Response(filas)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def presupuestos_create(request):
    """
    POST { categoria, mes (YYYY-MM-01), monto, ambito: FAMILIAR|PERSONAL }
    Crea o actualiza el presupuesto de esa categoría/mes.
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error
    if not usuario.familia_id:
        return Response(
            {'error': 'Usuario sin familia.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    cat = _categoria_accesible(usuario, request.data.get('categoria'))
    if not cat:
        return Response(
            {'error': 'Categoría no válida o no accesible.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    mes_raw = request.data.get('mes')
    if not mes_raw:
        return Response({'error': 'mes es obligatorio.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        parts = str(mes_raw)[:10].split('-')
        mes_first = date(int(parts[0]), int(parts[1]), int(parts[2]) if len(parts) > 2 else 1)
        if mes_first.day != 1:
            mes_first = date(mes_first.year, mes_first.month, 1)
    except (ValueError, IndexError):
        return Response({'error': 'mes inválido (use YYYY-MM-01).'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        monto = Decimal(str(request.data.get('monto', '0')))
    except Exception:
        return Response({'error': 'monto inválido.'}, status=status.HTTP_400_BAD_REQUEST)
    if monto < 0:
        return Response({'error': 'monto no puede ser negativo.'}, status=status.HTTP_400_BAD_REQUEST)

    ambito = (request.data.get('ambito') or 'FAMILIAR').upper()
    if ambito == 'FAMILIAR':
        p, _ = Presupuesto.objects.update_or_create(
            familia=usuario.familia,
            usuario=None,
            categoria=cat,
            mes=mes_first,
            defaults={'monto': monto},
        )
    elif ambito == 'PERSONAL':
        p, _ = Presupuesto.objects.update_or_create(
            familia=usuario.familia,
            usuario=usuario,
            categoria=cat,
            mes=mes_first,
            defaults={'monto': monto},
        )
    else:
        return Response(
            {'error': 'ambito debe ser FAMILIAR o PERSONAL.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response(PresupuestoSerializer(p).data, status=status.HTTP_201_CREATED)


@api_view(['PATCH', 'DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def presupuesto_detalle_finanzas(request, pk):
    """PATCH { monto } o DELETE."""
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    try:
        p = Presupuesto.objects.get(pk=pk, familia_id=usuario.familia_id)
    except Presupuesto.DoesNotExist:
        return Response(
            {'error': 'Presupuesto no encontrado.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    if not _puede_editar_presupuesto(usuario, p):
        return Response(
            {'error': 'Sin permisos para modificar este presupuesto.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    if request.method == 'DELETE':
        p.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    try:
        monto = Decimal(str(request.data.get('monto', p.monto)))
    except Exception:
        return Response({'error': 'monto inválido.'}, status=status.HTTP_400_BAD_REQUEST)
    if monto < 0:
        return Response({'error': 'monto no puede ser negativo.'}, status=status.HTTP_400_BAD_REQUEST)
    p.monto = monto
    p.save(update_fields=['monto'])
    return Response(PresupuestoSerializer(p).data)


# ── LIQUIDACIÓN ────────────────────────────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def liquidacion(request):
    """
    Retorna los datos crudos necesarios para que el frontend
    calcule la liquidación mensual on-the-fly.

    Query params obligatorios: ?mes=3&anio=2026
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    mes = request.GET.get('mes')
    anio = request.GET.get('anio')

    if not mes or not anio:
        return Response(
            {'error': 'Los parámetros mes y anio son obligatorios.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    mes = int(mes)
    anio = int(anio)

    ingresos_qs = IngresoComun.objects.filter(
        familia=usuario.familia,
        mes__month=mes,
        mes__year=anio,
    ).values(
        'usuario__id',
        'usuario__first_name',
    ).annotate(
        total=Sum('monto')
    ).order_by('usuario__first_name')

    ingresos = [
        {
            'usuario_id': i['usuario__id'],
            'nombre': i['usuario__first_name'],
            'total': str(i['total']),
        }
        for i in ingresos_qs
    ]

    gastos_qs = Movimiento.objects.filter(
        familia=usuario.familia,
        ambito='COMUN',
        tipo='EGRESO',
        fecha__month=mes,
        fecha__year=anio,
        oculto=False,
    ).values(
        'usuario__id',
        'usuario__first_name',
    ).annotate(
        total=Sum('monto')
    ).order_by('usuario__first_name')

    gastos_comunes = [
        {
            'usuario_id': g['usuario__id'],
            'nombre': g['usuario__first_name'],
            'total': str(g['total']),
        }
        for g in gastos_qs
    ]

    return Response({
        'periodo': {
            'mes': mes,
            'anio': anio,
        },
        'ingresos': ingresos,
        'gastos_comunes': gastos_comunes,
    })
