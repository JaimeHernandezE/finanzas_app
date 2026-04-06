# applications/finanzas/views.py

import csv
import io
import logging
import re
import traceback
import uuid
from datetime import date, datetime
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import Min, OuterRef, ProtectedError, Q, Subquery, Sum
from django.contrib.auth import get_user_model
from django.utils import timezone
from dateutil.relativedelta import relativedelta
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

import applications.utils as utils_auth
from applications.demo_guard import respuesta_demo_no_disponible
from .models import (
    Categoria,
    CuentaPersonal,
    MetodoPago,
    Tarjeta,
    Movimiento,
    Cuota,
    IngresoComun,
    Presupuesto,
    RecalculoPendiente,
    SueldoEstimadoProrrateoMensual,
)
from . import services_recalculo
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

logger = logging.getLogger(__name__)


def _nuevo_import_debug_id():
    """Identificador corto para correlacionar respuestas API con logs (p. ej. en Render)."""
    return uuid.uuid4().hex[:12]


def _qs_movimientos_con_ingreso_comun(qs):
    """Anota _ingreso_comun_pk para serializers (evita N+1)."""
    sub = IngresoComun.objects.filter(movimiento_id=OuterRef('pk')).values('pk')[:1]
    return qs.annotate(_ingreso_comun_pk=Subquery(sub))


def _asegurar_catalogo_metodos_pago():
    """
    Garantiza un registro por cada tipo (EFECTIVO, DEBITO, CREDITO).

    El seed antiguo solo corría si la tabla estaba vacía; si había datos parciales
    (p. ej. sin DEBITO), el cliente móvil fallaba al usar Débito por defecto.
    """
    for tipo, nombre in MetodoPago.TIPO_CHOICES:
        if not MetodoPago.objects.filter(tipo=tipo).exists():
            MetodoPago.objects.create(nombre=nombre, tipo=tipo)


def _as_bool(value):
    return str(value).lower() in ('1', 'true', 'yes', 'on')


def _parse_cuenta_personal_usuario(usuario, cuenta_raw):
    if cuenta_raw in (None, ''):
        return None, None
    try:
        cuenta_id = int(cuenta_raw)
    except (TypeError, ValueError):
        return None, Response(
            {'error': 'cuenta debe ser numérica.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not CuentaPersonal.objects.filter(pk=cuenta_id, usuario=usuario).exists():
        return None, Response(
            {'error': 'Cuenta personal no válida.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return cuenta_id, None


# ── CATEGORÍAS ────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def categorias(request):
    """
    GET  → Lista categorías visibles para el usuario:
           familiares de su familia + personales suyas (sin globales).
    POST → Crea una categoría nueva (familiar o personal según body)
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    if request.method == 'GET':
        ambito = (request.GET.get('ambito') or '').upper()
        tipo = (request.GET.get('tipo') or '').upper()
        solo_padres = _as_bool(request.GET.get('solo_padres', '0'))
        solo_hijas = _as_bool(request.GET.get('solo_hijas', '0'))
        cuenta_id, err_resp = _parse_cuenta_personal_usuario(
            usuario, request.GET.get('cuenta')
        )
        if err_resp:
            return err_resp

        q_globales = Q(familia__isnull=True, usuario__isnull=True)
        q_personales = Q(usuario=usuario)
        q_familia = (
            Q(familia=usuario.familia, usuario__isnull=True)
            if usuario.familia
            else Q(pk__in=[])
        )
        # Compatibilidad: sin ambito explícito mantenemos globales en el listado general.
        qs_base = q_familia | q_personales
        if not ambito:
            qs_base = qs_base | q_globales
        qs = Categoria.objects.filter(qs_base)

        if ambito == 'FAMILIAR':
            qs = qs.filter(
                familia=usuario.familia,
                usuario__isnull=True,
                cuenta_personal__isnull=True,
            )
        elif ambito == 'PERSONAL':
            qs = qs.filter(usuario=usuario)
            if cuenta_id is not None:
                qs = qs.filter(cuenta_personal_id=cuenta_id)
        elif ambito:
            return Response(
                {'error': 'ambito debe ser FAMILIAR o PERSONAL.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if tipo in ('INGRESO', 'EGRESO'):
            qs = qs.filter(tipo=tipo)
        elif tipo:
            return Response(
                {'error': 'tipo debe ser INGRESO o EGRESO.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if solo_padres and solo_hijas:
            return Response(
                {'error': 'solo_padres y solo_hijas no pueden usarse juntos.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if solo_padres:
            qs = qs.filter(categoria_padre__isnull=True)
        if solo_hijas:
            qs = qs.filter(categoria_padre__isnull=False)

        qs = qs.order_by('tipo', 'nombre')
        return Response(CategoriaSerializer(qs, many=True).data)

    if request.method == 'POST':
        ambito = request.data.get('ambito', 'PERSONAL')  # 'FAMILIAR' o 'PERSONAL'
        data = request.data.copy()
        if 'ambito' in data:
            del data['ambito']

        serializer = CategoriaSerializer(data=data)
        if serializer.is_valid():
            if ambito == 'FAMILIAR':
                serializer.save(
                    familia=usuario.familia,
                    usuario=None,
                    cuenta_personal=None,
                )
            elif ambito == 'PERSONAL':
                cuenta_id, err_resp = _parse_cuenta_personal_usuario(
                    usuario, request.data.get('cuenta_personal')
                )
                if err_resp:
                    return err_resp
                serializer.save(
                    familia=usuario.familia,
                    usuario=usuario,
                    cuenta_personal_id=cuenta_id,
                )
            else:
                return Response(
                    {'error': 'ambito debe ser FAMILIAR o PERSONAL.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT', 'DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def categoria_detalle(request, pk):
    """
    PUT    → Edita una categoría (globales, familiares o personales si aplica permiso).
    DELETE → Elimina una categoría (incluidas globales). Falla si hay movimientos
             u otros registros protegidos por FK.
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
        try:
            categoria.delete()
        except ProtectedError:
            return Response(
                {
                    'error': 'No se puede eliminar: hay movimientos u otros registros '
                    'asociados a esta categoría.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    if request.method == 'PUT':
        allowed_keys = {
            'nombre',
            'tipo',
            'es_inversion',
            'categoria_padre',
            'cuenta_personal',
        }
        data = {k: v for k, v in request.data.items() if k in allowed_keys}
        serializer = CategoriaSerializer(categoria, data=data, partial=True)
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
    Asegura que exista un registro por cada tipo (EFECTIVO, DEBITO, CREDITO).
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    _asegurar_catalogo_metodos_pago()

    # Si por cualquier motivo hay duplicados en DB, devolvemos 1 por tipo.
    por_tipo: dict[str, MetodoPago] = {}
    for m in MetodoPago.objects.all().order_by('tipo', 'pk'):
        if m.tipo not in por_tipo:
            por_tipo[m.tipo] = m
    metodos = [por_tipo[t] for t, _ in MetodoPago.TIPO_CHOICES if t in por_tipo]
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
        if settings.DEMO:
            return respuesta_demo_no_disponible()
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

    if settings.DEMO:
        return respuesta_demo_no_disponible()

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

    if settings.DEMO:
        return respuesta_demo_no_disponible()

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

    if settings.DEMO:
        return respuesta_demo_no_disponible()

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

def _parse_movimiento_fecha_query(raw):
    """
    Devuelve (date|None, invalida_no_vacia).
    Vacío o ausente → (None, False). Texto no vacío ilegible → (None, True).
    """
    if raw is None:
        return None, False
    s = str(raw).strip()
    if not s:
        return None, False
    try:
        return date.fromisoformat(s), False
    except ValueError:
        return None, True


@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def movimientos(request):
    """
    GET  → Lista movimientos con filtros opcionales por query params:
           ?cuenta=1        filtra por CuentaPersonal
           ?ambito=COMUN    filtra por ámbito (PERSONAL / COMUN)
           ?fecha_desde=2026-01-01&fecha_hasta=2026-03-31  rango inclusive (prioridad
                         sobre mes/año); cada extremo es opcional
           ?mes=3&anio=2026 filtra por mes y año (si no hay rango por fechas)
           ?anio=2026       solo año calendario (sin mes)
           ?tipo=EGRESO     filtra por tipo (INGRESO / EGRESO)
           ?categoria=1     filtra por categoría
           ?metodo=CREDITO  filtra por tipo de método de pago
           ?q=texto        búsqueda por palabras en comentario y/o nombre de categoría
                         (varias palabras: deben aparecer todas, cada una en comentario o categoría)

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
        fecha_desde_raw = request.GET.get('fecha_desde')
        fecha_hasta_raw = request.GET.get('fecha_hasta')

        if cuenta:
            qs = qs.filter(
                Q(cuenta_id=cuenta) | Q(categoria__cuenta_personal_id=cuenta)
            )
        if ambito:
            qs = qs.filter(ambito=ambito)
        if solo_mios in ('1', 'true', 'True', 'yes', 'on'):
            qs = qs.filter(usuario=usuario)

        rango_solicitado = bool(
            (fecha_desde_raw or '').strip() or (fecha_hasta_raw or '').strip()
        )
        if rango_solicitado:
            d_val, d_inv = _parse_movimiento_fecha_query(fecha_desde_raw)
            h_val, h_inv = _parse_movimiento_fecha_query(fecha_hasta_raw)
            desde_ne = bool((fecha_desde_raw or '').strip())
            hasta_ne = bool((fecha_hasta_raw or '').strip())
            tiene_desde_ok = desde_ne and not d_inv and d_val is not None
            tiene_hasta_ok = hasta_ne and not h_inv and h_val is not None

            if desde_ne and d_inv and hasta_ne and h_inv:
                return Response(
                    {
                        'error': 'fecha_desde y fecha_hasta no son fechas válidas (use YYYY-MM-DD).',
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if desde_ne and d_inv and not tiene_hasta_ok:
                return Response(
                    {'error': 'fecha_desde no es una fecha válida (use YYYY-MM-DD).'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if hasta_ne and h_inv and not tiene_desde_ok:
                return Response(
                    {'error': 'fecha_hasta no es una fecha válida (use YYYY-MM-DD).'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if tiene_desde_ok:
                qs = qs.filter(fecha__gte=d_val)
            if tiene_hasta_ok:
                qs = qs.filter(fecha__lte=h_val)
        elif mes and anio:
            try:
                m_int = int(mes)
                y_int = int(anio)
                qs = qs.filter(fecha__month=m_int, fecha__year=y_int)
            except (TypeError, ValueError):
                pass
        elif anio:
            try:
                y_int = int(anio)
                qs = qs.filter(fecha__year=y_int)
            except (TypeError, ValueError):
                pass
        elif mes:
            try:
                m_int = int(mes)
                qs = qs.filter(fecha__month=m_int)
            except (TypeError, ValueError):
                pass
        if tipo:
            qs = qs.filter(tipo=tipo)
        if categoria:
            qs = qs.filter(categoria_id=categoria)
        if metodo:
            qs = qs.filter(metodo_pago__tipo=metodo)
        if q:
            tokens = [t for t in str(q).strip().split() if t]
            if tokens:
                combined = None
                for token in tokens:
                    token_q = Q(comentario__icontains=token) | Q(
                        categoria__nombre__icontains=token
                    )
                    combined = token_q if combined is None else combined & token_q
                qs = qs.filter(combined)

        qs = qs.filter(oculto=False)
        qs = _qs_movimientos_con_ingreso_comun(qs)

        return Response(MovimientoListSerializer(qs, many=True).data)

    if request.method == 'POST':
        serializer = MovimientoSerializer(data=request.data)
        if serializer.is_valid():
            instance = serializer.save(
                usuario=usuario,
                familia=usuario.familia,
            )
            # Re-fetch con select_related para que MovimientoListSerializer
            # pueda resolver categoria_nombre, metodo_pago_tipo, etc.
            instance = _qs_movimientos_con_ingreso_comun(
                Movimiento.objects.select_related(
                    'categoria', 'metodo_pago', 'tarjeta', 'usuario', 'cuenta'
                )
            ).get(pk=instance.pk)
            return Response(MovimientoListSerializer(instance).data, status=status.HTTP_201_CREATED)
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
            return Response(MovimientoListSerializer(movimiento).data)
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
    Suma de cuotas de tarjeta del usuario autenticado con mes de facturación
    igual al mes calendario actual (facturación del mes en curso), pendientes
    de pago (PENDIENTE o FACTURADO) e incluidas en el estado de cuenta.
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    hoy = timezone.localdate()
    mes_facturacion = date(hoy.year, hoy.month, 1)

    qs = Cuota.objects.filter(
        movimiento__usuario=usuario,
        mes_facturacion=mes_facturacion,
        incluir=True,
        estado__in=('PENDIENTE', 'FACTURADO'),
    )
    if usuario.familia_id:
        qs = qs.filter(movimiento__familia_id=usuario.familia_id)

    total = qs.aggregate(t=Sum('monto'))['t'] or Decimal('0')
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
           Body: {
             "mes": "2026-03-01",
             "fecha_pago": "2026-03-25",  # opcional
             "monto": "1800000.00",
             "origen": "Sueldo"
           }
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

def _categoria_accesible(usuario, categoria_id, ambito, cuenta_id=None):
    """Categoría familiar o personal del usuario (sin globales)."""
    try:
        cid = int(categoria_id)
    except (TypeError, ValueError):
        return None

    qs = Categoria.objects.filter(pk=cid)
    if ambito == 'FAMILIAR':
        return qs.filter(
            familia=usuario.familia,
            usuario__isnull=True,
            cuenta_personal__isnull=True,
        ).first()
    if ambito == 'PERSONAL':
        qs = qs.filter(usuario=usuario)
        if cuenta_id is not None:
            qs = qs.filter(cuenta_personal_id=cuenta_id)
        return qs.first()
    return None


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
    cuenta_id, err_resp = _parse_cuenta_personal_usuario(
        usuario, request.GET.get('cuenta')
    )
    if err_resp:
        return err_resp
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
            categoria__familia_id=usuario.familia_id,
            categoria__usuario__isnull=True,
            categoria__cuenta_personal__isnull=True,
        ).select_related('categoria')
        mov_qs = Movimiento.objects.filter(
            familia_id=usuario.familia_id,
            fecha__month=mes,
            fecha__year=anio,
            tipo='EGRESO',
            ambito='COMUN',
            oculto=False,
            categoria__familia_id=usuario.familia_id,
            categoria__usuario__isnull=True,
            categoria__cuenta_personal__isnull=True,
        ).exclude(metodo_pago__tipo='CREDITO')
    else:
        pres_qs = Presupuesto.objects.filter(
            familia_id=usuario.familia_id,
            mes=mes_first,
            usuario=usuario,
            categoria__usuario=usuario,
        ).select_related('categoria')
        mov_qs = Movimiento.objects.filter(
            familia_id=usuario.familia_id,
            usuario=usuario,
            fecha__month=mes,
            fecha__year=anio,
            tipo='EGRESO',
            ambito='PERSONAL',
            oculto=False,
            categoria__usuario=usuario,
        ).exclude(metodo_pago__tipo='CREDITO')
        if cuenta_id is not None:
            mov_qs = mov_qs.filter(cuenta_id=cuenta_id, categoria__cuenta_personal_id=cuenta_id)
            pres_qs = pres_qs.filter(categoria__cuenta_personal_id=cuenta_id)

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
    cat_meta_inicial = {
        c['id']: c['categoria_padre_id']
        for c in Categoria.objects.filter(pk__in=all_ids).values('id', 'categoria_padre_id')
    }

    # Padres con subcategorías: no tienen fila propia ni presupuesto/gasto agregable al padre.
    padres_con_hijos_ids = set(
        Categoria.objects.filter(pk__in=all_ids, subcategorias__isnull=False)
        .values_list('id', flat=True)
        .distinct()
    )

    def _gastado_int(g):
        try:
            return int(g)
        except (TypeError, ValueError):
            return int(float(g))

    def _monto_pres_a_decimal(monto_str):
        if monto_str is None:
            return Decimal('0')
        try:
            return Decimal(str(monto_str))
        except Exception:
            return Decimal('0')

    filas = []
    for cid in sorted(all_ids, key=lambda x: nombres.get(x, '')):
        if cid in padres_con_hijos_ids:
            continue
        p = pres_map.get(cid)
        g = gastos_por_cat.get(cid) or 0
        filas.append({
            'presupuesto_id': p.id if p else None,
            'categoria_id': cid,
            'categoria_nombre': nombres.get(cid, '—'),
            'monto_presupuestado': str(p.monto) if p else None,
            'gastado': _gastado_int(g),
            'es_agregado_padre': False,
            'categoria_padre_id': cat_meta_inicial.get(cid),
        })

    fila_por_cid = {f['categoria_id']: f for f in filas}
    hijos_por_padre = {}
    for cid in all_ids:
        padre_id = cat_meta_inicial.get(cid)
        if padre_id:
            hijos_por_padre.setdefault(padre_id, []).append(cid)

    padres_ids = set(hijos_por_padre.keys())
    if padres_ids:
        faltan_nombres = padres_ids - set(nombres.keys())
        if faltan_nombres:
            for c in Categoria.objects.filter(pk__in=faltan_nombres).values('id', 'nombre'):
                nombres[c['id']] = c['nombre']

    ids_meta = set(all_ids) | padres_ids
    cat_meta = {
        c['id']: c['categoria_padre_id']
        for c in Categoria.objects.filter(pk__in=ids_meta).values('id', 'categoria_padre_id')
    }

    for padre_id in sorted(padres_ids, key=lambda x: nombres.get(x, '')):
        hijos = hijos_por_padre.get(padre_id) or []
        if not hijos:
            continue
        sum_pres = Decimal('0')
        sum_gast_hijos = 0
        for hid in hijos:
            fh = fila_por_cid.get(hid)
            if not fh:
                continue
            sum_pres += _monto_pres_a_decimal(fh.get('monto_presupuestado'))
            sum_gast_hijos += int(fh.get('gastado') or 0)

        monto_str = str(sum_pres) if sum_pres > 0 else None
        fila_padre = {
            'presupuesto_id': None,
            'categoria_id': padre_id,
            'categoria_nombre': nombres.get(padre_id, '—'),
            'monto_presupuestado': monto_str,
            'gastado': sum_gast_hijos,
            'es_agregado_padre': True,
            'categoria_padre_id': cat_meta_inicial.get(padre_id),
        }
        if padre_id in fila_por_cid:
            existente = fila_por_cid[padre_id]
            existente.update(fila_padre)
        else:
            filas.append(fila_padre)
            fila_por_cid[padre_id] = fila_padre

    def _orden_fila(row):
        """
        Primero todas las categorías raíz (sin padre en jerarquía), alfabético;
        después las hijas, por nombre del padre y luego de la categoría.
        """
        cid = row['categoria_id']
        padre_id = cat_meta.get(cid)
        nombre = (row.get('categoria_nombre') or '').lower()
        if padre_id is None:
            return (0, nombre)
        clave_padre = (nombres.get(padre_id) or '').lower()
        return (1, clave_padre, nombre)

    filas.sort(key=_orden_fila)
    for row in filas:
        row['categoria_padre_id'] = cat_meta.get(row['categoria_id'])
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

    ambito = (request.data.get('ambito') or 'FAMILIAR').upper()
    if ambito not in ('FAMILIAR', 'PERSONAL'):
        return Response(
            {'error': 'ambito debe ser FAMILIAR o PERSONAL.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    cuenta_id, err_resp = _parse_cuenta_personal_usuario(
        usuario, request.data.get('cuenta')
    )
    if err_resp:
        return err_resp

    cat = _categoria_accesible(
        usuario,
        request.data.get('categoria'),
        ambito=ambito,
        cuenta_id=cuenta_id,
    )
    if not cat:
        return Response(
            {'error': 'Categoría no válida o no accesible para el ámbito/cuenta.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if cat.es_padre:
        return Response(
            {
                'error': 'Las categorías padre solo agrupan subcategorías; asigna presupuesto en las hijas.',
            },
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

    if request.method == 'PATCH' and p.categoria.es_padre:
        return Response(
            {
                'error': 'Las categorías padre solo agrupan subcategorías; edita el presupuesto en las hijas.',
            },
            status=status.HTTP_400_BAD_REQUEST,
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


# ── PAGO DE TARJETA ───────────────────────────────────────────────────────────

@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def pagar_tarjeta(request):
    """
    POST { tarjeta_id, mes?, anio?, fecha_pago?, cuota_ids? }

    Paga cuotas incluidas (incluir=True, estado=PENDIENTE):
      - Si llega `cuota_ids`, paga exactamente esas cuotas.
      - Si no llega `cuota_ids`, usa el filtro por `mes` y `anio` (comportamiento histórico).
      1. Por cada cuota genera un Movimiento EGRESO en EFECTIVO que refleja
         el flujo real de caja al saldar la tarjeta.
      2. Marca las cuotas como PAGADO.

    Los movimientos con crédito no se contabilizan como egreso en el momento
    del gasto; el impacto en caja ocurre aquí, al pagar la tarjeta.
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    tarjeta_id = request.data.get('tarjeta_id')
    mes = request.data.get('mes')
    anio = request.data.get('anio')
    fecha_pago_raw = request.data.get('fecha_pago')
    cuota_ids_raw = request.data.get('cuota_ids')

    if not tarjeta_id:
        return Response(
            {'error': 'tarjeta_id es obligatorio.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        tarjeta = Tarjeta.objects.get(pk=tarjeta_id, usuario=usuario)
    except Tarjeta.DoesNotExist:
        return Response(
            {'error': 'Tarjeta no encontrada.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    if fecha_pago_raw:
        try:
            fecha_pago = date.fromisoformat(str(fecha_pago_raw)[:10])
        except ValueError:
            return Response(
                {'error': 'fecha_pago inválida (use YYYY-MM-DD).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
    else:
        fecha_pago = timezone.localdate()

    base_qs = Cuota.objects.filter(
        movimiento__tarjeta=tarjeta,
        movimiento__usuario=usuario,
        estado='PENDIENTE',
        incluir=True,
    ).select_related(
        'movimiento__categoria',
        'movimiento__cuenta',
    )

    if cuota_ids_raw is not None:
        if not isinstance(cuota_ids_raw, list) or len(cuota_ids_raw) == 0:
            return Response(
                {'error': 'cuota_ids debe ser una lista no vacía.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            cuota_ids = sorted({int(x) for x in cuota_ids_raw})
        except (TypeError, ValueError):
            return Response(
                {'error': 'cuota_ids debe contener IDs numéricos.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cuotas_a_pagar = list(base_qs.filter(pk__in=cuota_ids))
        encontrados = {c.pk for c in cuotas_a_pagar}
        faltantes = [cid for cid in cuota_ids if cid not in encontrados]
        if faltantes:
            return Response(
                {'error': 'Algunas cuotas no son válidas para pago.', 'cuotas_invalidas': faltantes},
                status=status.HTTP_400_BAD_REQUEST,
            )
    else:
        if not mes or not anio:
            return Response(
                {'error': 'mes y anio son obligatorios cuando no se envía cuota_ids.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cuotas_a_pagar = list(
            base_qs.filter(
                mes_facturacion__month=mes,
                mes_facturacion__year=anio,
            )
        )

    if not cuotas_a_pagar:
        return Response({'pagados': [], 'cuotas_pagadas': 0,
                         'mensaje': 'No hay cuotas pendientes para pagar.'})

    metodo_efectivo = MetodoPago.objects.filter(tipo='EFECTIVO').order_by('pk').first()
    if not metodo_efectivo:
        metodo_efectivo = MetodoPago.objects.create(nombre='Efectivo', tipo='EFECTIVO')

    movimientos_creados = []

    with transaction.atomic():
        for cuota in cuotas_a_pagar:
            mov = cuota.movimiento
            ref = mov.comentario or mov.categoria.nombre
            num_cuotas = mov.num_cuotas or 1
            sufijo = f" (cuota {cuota.numero}/{num_cuotas})" if num_cuotas > 1 else ""
            comentario = f"Pago tarjeta {tarjeta.nombre}: {ref}{sufijo}"

            nuevo = Movimiento.objects.create(
                familia=mov.familia,
                usuario=usuario,
                cuenta=mov.cuenta,
                tipo='EGRESO',
                ambito=mov.ambito,
                categoria=mov.categoria,
                metodo_pago=metodo_efectivo,
                fecha=fecha_pago,
                monto=cuota.monto,
                comentario=comentario,
            )
            movimientos_creados.append(nuevo)

        ids_cuotas = [c.pk for c in cuotas_a_pagar]
        Cuota.objects.filter(pk__in=ids_cuotas).update(estado='PAGADO')

    return Response(
        {
            'pagados': MovimientoListSerializer(movimientos_creados, many=True).data,
            'cuotas_pagadas': len(ids_cuotas),
        },
        status=status.HTTP_201_CREATED,
    )


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

    snap = services_recalculo.liquidacion_datos_desde_snapshot_o_query(
        usuario.familia_id, mes, anio
    )
    if snap is not None:
        ingresos, gastos_comunes = snap
    else:
        ingresos_qs = IngresoComun.objects.filter(
            familia=usuario.familia,
            mes__month=mes,
            mes__year=anio,
        ).values(
            'usuario__id',
            'usuario__first_name',
            'usuario__last_name',
            'usuario__username',
        ).annotate(
            total=Sum('monto')
        ).order_by('usuario__first_name', 'usuario__last_name', 'usuario__id')

        ingresos = [
            {
                'usuario_id': i['usuario__id'],
                'nombre': services_recalculo.nombre_para_liquidacion_valores(
                    i.get('usuario__first_name'),
                    i.get('usuario__last_name'),
                    i.get('usuario__username'),
                ),
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
        ).exclude(metodo_pago__tipo='CREDITO').values(
            'usuario__id',
            'usuario__first_name',
            'usuario__last_name',
            'usuario__username',
        ).annotate(
            total=Sum('monto')
        ).order_by('usuario__first_name', 'usuario__last_name', 'usuario__id')

        gastos_comunes = [
            {
                'usuario_id': g['usuario__id'],
                'nombre': services_recalculo.nombre_para_liquidacion_valores(
                    g.get('usuario__first_name'),
                    g.get('usuario__last_name'),
                    g.get('usuario__username'),
                ),
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
        'recalculo': services_recalculo.get_recalculo_estado(usuario.familia_id),
    })


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def resumen_historico(request):
    """
    Resumen mensual histórico de la familia (neto común, sueldos, prorrateo, compensación).
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error
    if not usuario.familia_id:
        return Response(
            {
                'meses': [],
                'recalculo': {'pendiente': False, 'dirty_from': None},
            }
        )
    meses = services_recalculo.resumen_historico_familia(usuario.familia_id)
    return Response(
        {
            'meses': meses,
            'recalculo': services_recalculo.get_recalculo_estado(usuario.familia_id),
        }
    )


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def saldo_mensual(request):
    """
    GET ?mes=3&anio=2026
    Efectivo neto (no crédito) por cuenta personal del usuario, desde snapshot o cálculo en vivo.
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    mes = request.GET.get('mes')
    anio = request.GET.get('anio')
    if not mes or not anio:
        return Response(
            {'error': 'Los parámetros mes y anio son obligatorios.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        mes = int(mes)
        anio = int(anio)
    except ValueError:
        return Response(
            {'error': 'mes y anio deben ser numéricos.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not usuario.familia_id:
        return Response(
            {
                'mes': mes,
                'anio': anio,
                'cuentas': [],
                'recalculo': {'pendiente': False, 'dirty_from': None},
            }
        )

    cuentas = services_recalculo.saldo_efectivo_cuentas_desde_snapshot(
        usuario, usuario.familia_id, mes, anio
    )
    if cuentas is None:
        cuentas = services_recalculo.efectivo_por_cuenta_live(
            usuario, usuario.familia_id, mes, anio
        )

    return Response(
        {
            'mes': mes,
            'anio': anio,
            'cuentas': cuentas,
            'recalculo': services_recalculo.get_recalculo_estado(usuario.familia_id),
        }
    )


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def cuenta_resumen_mensual(request):
    """
    GET ?cuenta=ID
    Resumen por mes calendario de una cuenta personal (ingresos/egresos efectivo-débito, neto).
    Solo cuentas visibles para el usuario (propias o tuteladas).
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    raw = request.GET.get('cuenta')
    if not raw:
        return Response(
            {'error': 'El parámetro cuenta es obligatorio.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        cuenta_id = int(raw)
    except ValueError:
        return Response(
            {'error': 'cuenta debe ser numérico.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        cuenta = CuentaPersonal.objects.get(pk=cuenta_id)
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

    if not usuario.familia_id:
        return Response(
            {
                'cuenta': {'id': cuenta.pk, 'nombre': cuenta.nombre},
                'meses': [],
                'recalculo': {'pendiente': False, 'dirty_from': None},
            }
        )

    meses = services_recalculo.resumen_cuenta_personal_mensual(
        usuario.familia_id, cuenta_id
    )
    return Response(
        {
            'cuenta': {'id': cuenta.pk, 'nombre': cuenta.nombre},
            'meses': meses,
            'recalculo': services_recalculo.get_recalculo_estado(usuario.familia_id),
        }
    )


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def efectivo_disponible(request):
    """
    Efectivo del dashboard: ver services_recalculo.efectivo_disponible_dashboard
    (desglose A–E en campo desglose).
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    datos = services_recalculo.efectivo_disponible_dashboard(usuario)
    recalculo = (
        services_recalculo.get_recalculo_estado(usuario.familia_id)
        if usuario.familia_id
        else {'pendiente': False, 'dirty_from': None}
    )
    desglose = datos['desglose']
    return Response(
        {
            'efectivo': str(datos['efectivo']),
            'personal_historico': str(datos['personal_historico']),
            'comun_movimientos_historico': str(datos['comun_movimientos_historico']),
            'prorrateo_gastos_comunes_acumulado': str(datos['prorrateo_gastos_comunes_acumulado']),
            'desglose': {k: str(v) for k, v in desglose.items()},
            'recalculo': recalculo,
        }
    )


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def compensacion_proyectada_datos(request):
    """
    GET ?mes=3&anio=2026
    Neto familiar COMÚN y neto/ingreso declarado por miembro (para saldo proyectado con prorrateo estimado).
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error
    if not usuario.familia_id:
        return Response(
            {'error': 'Usuario sin familia asociada.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    mes = request.GET.get('mes')
    anio = request.GET.get('anio')
    if not mes or not anio:
        return Response(
            {'error': 'Los parámetros mes y anio son obligatorios.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    datos = services_recalculo.datos_compensacion_proyectada(usuario, int(mes), int(anio))
    if datos is None:
        return Response({'error': 'Sin datos.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(datos)


def _primer_dia_mes_param(mes: int, anio: int) -> date:
    return date(anio, mes, 1)


@api_view(['GET', 'PUT'])
@authentication_classes([])
@permission_classes([AllowAny])
def sueldos_estimados_prorrateo(request):
    """
    GET ?mes=&anio= — Montos guardados por usuario para el mes (primer día).
    PUT { "montos": { "<usuario_id>": "12345.67", ... } } — Guarda y elimina
    registros de meses anteriores de la misma familia.
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error
    if not usuario.familia_id:
        return Response(
            {'error': 'Usuario sin familia asociada.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    mes_q = request.query_params.get('mes')
    anio_q = request.query_params.get('anio')
    if not mes_q or not anio_q:
        return Response(
            {'error': 'Los parámetros mes y anio son obligatorios.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        mes_i = int(mes_q)
        anio_i = int(anio_q)
    except (TypeError, ValueError):
        return Response(
            {'error': 'mes y anio deben ser enteros.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    primer = _primer_dia_mes_param(mes_i, anio_i)
    miembros_list = services_recalculo.miembros_para_prorrateo_fondo_comun(
        usuario.familia_id, primer
    )
    miembros_ids = [u.pk for u in miembros_list]
    if not miembros_ids:
        return Response({'mes': mes_i, 'anio': anio_i, 'montos': {}}, status=status.HTTP_200_OK)

    if request.method == 'GET':
        rows = SueldoEstimadoProrrateoMensual.objects.filter(
            usuario_id__in=miembros_ids,
            mes=primer,
        ).values('usuario_id', 'monto')
        montos = {str(r['usuario_id']): str(r['monto']) for r in rows}
        return Response({'mes': mes_i, 'anio': anio_i, 'montos': montos})

    if request.method == 'PUT':
        raw = request.data.get('montos')
        if not isinstance(raw, dict):
            return Response(
                {'error': 'Se esperaba un objeto {"montos": { "id": "monto", ... }}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        miembros_set = set(miembros_ids)
        to_save: list[tuple[int, Decimal]] = []
        for k, v in raw.items():
            try:
                uid = int(k)
            except (TypeError, ValueError):
                return Response(
                    {'error': f'Clave de usuario inválida: {k!r}.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if uid not in miembros_set:
                return Response(
                    {'error': f'El usuario {uid} no pertenece a la familia.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                dec = Decimal(str(v))
            except Exception:
                return Response(
                    {'error': f'Monto inválido para usuario {uid}.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if dec < 0:
                return Response(
                    {'error': f'El monto no puede ser negativo (usuario {uid}).'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if dec.as_tuple().exponent < -2:
                return Response(
                    {'error': f'Máximo 2 decimales (usuario {uid}).'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            to_save.append((uid, dec.quantize(Decimal('0.01'))))

        with transaction.atomic():
            for uid, monto in to_save:
                SueldoEstimadoProrrateoMensual.objects.update_or_create(
                    usuario_id=uid,
                    mes=primer,
                    defaults={'monto': monto},
                )
            SueldoEstimadoProrrateoMensual.objects.filter(
                usuario__familia_id=usuario.familia_id,
                mes__lt=primer,
            ).delete()

        rows = SueldoEstimadoProrrateoMensual.objects.filter(
            usuario_id__in=miembros_ids,
            mes=primer,
        ).values('usuario_id', 'monto')
        montos = {str(r['usuario_id']): str(r['monto']) for r in rows}
        return Response({'mes': mes_i, 'anio': anio_i, 'montos': montos})


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def recalculo_estado(request):
    """GET estado de recálculo pendiente (snapshots históricos)."""
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error
    if not usuario.familia_id:
        return Response({'pendiente': False, 'dirty_from': None})
    return Response(services_recalculo.get_recalculo_estado(usuario.familia_id))


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def recalculo_historico(request):
    """
    Recalcula snapshots históricos de la familia:
    - Liquidación común y saldos personales (todos los miembros) desde el primer mes con datos
      hasta el mes actual.
    - Snapshots de resumen histórico familiar por mes (backfill_resumen_historico_snapshots).
    - Refuerzo explícito de saldos mensuales por cuenta solo del usuario autenticado
      (backfill_saldos_personales_usuario).
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    if not usuario.familia_id:
        return Response(
            {'error': 'El usuario no pertenece a una familia.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    familia_id = usuario.familia_id
    min_mov = Movimiento.objects.filter(familia_id=familia_id).aggregate(
        m=Min('fecha')
    )['m']
    min_ing = IngresoComun.objects.filter(familia_id=familia_id).aggregate(
        m=Min('mes')
    )['m']

    candidatos = [d for d in (min_mov, min_ing) if d is not None]
    if not candidatos:
        return Response(
            {
                'ok': True,
                'procesado': False,
                'detalle': 'No hay datos históricos para recalcular.',
            }
        )

    mes_inicio = services_recalculo.primer_dia_mes(min(candidatos))
    services_recalculo.recalcular_familia_desde(familia_id, mes_inicio)
    meses_resumen_familia = services_recalculo.backfill_resumen_historico_snapshots(
        familia_id
    )
    meses_saldos_usuario = services_recalculo.backfill_saldos_personales_usuario(
        usuario.pk, familia_id
    )
    RecalculoPendiente.objects.filter(familia_id=familia_id).delete()

    return Response(
        {
            'ok': True,
            'procesado': True,
            'desde': mes_inicio.isoformat(),
            'hasta': services_recalculo.primer_dia_mes(timezone.localdate()).isoformat(),
            'meses_resumen_historico_familia': meses_resumen_familia,
            'meses_saldos_personales_usuario': meses_saldos_usuario,
        }
    )


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def importar_cuenta_personal_planilla(request):
    """
    Importa movimientos desde una planilla CSV para la cuenta Personal.

    Cada importación real sustituye los movimientos de efectivo en esa cuenta (no se
    borran movimientos vinculados a ingresos comunes declarados ni otros métodos de pago).

    Encabezados esperados:
      - Fecha (obligatorio)
      - Mes/año (ignorado)
      - Categoría
      - Monto
      - Descripción
      - ID gasto (ignorado)

    Reglas:
      - Si una categoría no existe, se crea como categoría personal.
      - Si el monto es negativo, se crea movimiento INGRESO en categoría "Otros".
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    if settings.DEMO:
        return respuesta_demo_no_disponible()

    debug_id = _nuevo_import_debug_id()

    try:
        archivo = request.FILES.get('archivo')
        if not archivo:
            logger.warning(
                "importar_cuenta_personal_planilla id=%s usuario_id=%s sin archivo",
                debug_id,
                getattr(usuario, 'id', None),
            )
            return Response(
                {
                    'error': 'Debes adjuntar un archivo en el campo "archivo".',
                    'import_debug_id': debug_id,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        dry_run = str(request.data.get('dry_run', '')).lower() in ('1', 'true', 'yes', 'on')
        nombre_archivo = getattr(archivo, 'name', '') or ''
        tam_previo = getattr(archivo, 'size', None)

        try:
            contenido = archivo.read().decode('utf-8-sig')
        except UnicodeDecodeError:
            logger.warning(
                "importar_cuenta_personal_planilla id=%s usuario_id=%s familia_id=%s decode utf-8 falló nombre=%r tam=%s",
                debug_id,
                getattr(usuario, 'id', None),
                getattr(usuario, 'familia_id', None),
                nombre_archivo,
                tam_previo,
            )
            return Response(
                {
                    'error': 'No se pudo leer el archivo. Exporta la planilla como CSV UTF-8.',
                    'import_debug_id': debug_id,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        logger.info(
            "importar_cuenta_personal_planilla id=%s usuario_id=%s familia_id=%s dry_run=%s archivo=%r bytes=%s",
            debug_id,
            getattr(usuario, 'id', None),
            getattr(usuario, 'familia_id', None),
            dry_run,
            nombre_archivo,
            len(contenido),
        )

        stream = io.StringIO(contenido)
        try:
            sample = stream.read(4096)
            stream.seek(0)
            dialect = csv.Sniffer().sniff(sample, delimiters=',;')
        except csv.Error:
            dialect = csv.excel
        reader = csv.DictReader(stream, dialect=dialect)

        if not reader.fieldnames:
            logger.warning(
                "importar_cuenta_personal_planilla id=%s usuario_id=%s sin encabezados csv",
                debug_id,
                getattr(usuario, 'id', None),
            )
            return Response(
                {'error': 'La planilla no tiene encabezados.', 'import_debug_id': debug_id},
                status=status.HTTP_400_BAD_REQUEST,
            )

        normalizados = {_normalizar_header(h) for h in reader.fieldnames if h}
        if 'fecha' not in normalizados or 'monto' not in normalizados:
            logger.warning(
                "importar_cuenta_personal_planilla id=%s usuario_id=%s faltan columnas fecha/monto fieldnames=%s",
                debug_id,
                getattr(usuario, 'id', None),
                list(reader.fieldnames),
            )
            return Response(
                {
                    'error': 'Faltan encabezados obligatorios: Fecha y/o Monto.',
                    'import_debug_id': debug_id,
                    'headers_recibidos': list(reader.fieldnames),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        metodo_efectivo = MetodoPago.objects.filter(tipo='EFECTIVO').order_by('pk').first()
        if not metodo_efectivo:
            metodo_efectivo = MetodoPago.objects.create(nombre='Efectivo', tipo='EFECTIVO')

        cuenta_personal, _ = CuentaPersonal.objects.get_or_create(
            usuario=usuario,
            nombre='Personal',
            defaults={'descripcion': 'Cuenta por defecto para finanzas personales y efectivo.'},
        )

        categoria_otros, _ = Categoria.objects.get_or_create(
            familia=usuario.familia,
            usuario=usuario,
            nombre='Otros',
            tipo='INGRESO',
            defaults={'es_inversion': False},
        )

        creados = 0
        categorias_creadas = 0
        errores = []
        meses_importados = set()
        movimientos_para_crear = []

        vinculados_ingreso_comun = IngresoComun.objects.filter(
            familia_id=usuario.familia_id,
            usuario_id=usuario.pk,
            movimiento_id__isnull=False,
        ).values_list('movimiento_id', flat=True)

        with transaction.atomic():
            qs_borrar = Movimiento.objects.filter(
                familia_id=usuario.familia_id,
                usuario_id=usuario.pk,
                cuenta_id=cuenta_personal.pk,
                ambito='PERSONAL',
                metodo_pago__tipo='EFECTIVO',
            ).exclude(pk__in=vinculados_ingreso_comun)
            movimientos_anteriores_eliminados = qs_borrar.count()
            qs_borrar.delete()

            for fila_idx, fila in enumerate(reader, start=2):
                fila = _reparar_fila_colapsada(fila)
                # Ignorar filas completamente vacías en la planilla.
                if _fila_vacia(fila):
                    continue
                try:
                    fecha = _parsear_fecha_importacion(_obtener_columna(fila, 'fecha'))
                    meses_importados.add(services_recalculo.primer_dia_mes(fecha))
                    monto_raw = _obtener_columna(fila, 'monto')
                    monto = _parsear_monto_importacion(monto_raw)
                    descripcion = _obtener_columna(fila, 'descripcion') or ''
                    categoria_txt = _obtener_columna(fila, 'categoria') or 'Sin categoría'

                    if monto < 0:
                        tipo = 'INGRESO'
                        categoria = categoria_otros
                        monto_final = abs(monto)
                    else:
                        tipo = 'EGRESO'
                        categoria, creada = Categoria.objects.get_or_create(
                            familia=usuario.familia,
                            usuario=usuario,
                            nombre=categoria_txt,
                            tipo='EGRESO',
                            defaults={'es_inversion': False},
                        )
                        if creada:
                            categorias_creadas += 1
                        monto_final = monto

                    Movimiento.objects.create(
                        familia=usuario.familia,
                        usuario=usuario,
                        cuenta=cuenta_personal,
                        tipo=tipo,
                        ambito='PERSONAL',
                        categoria=categoria,
                        fecha=fecha,
                        monto=monto_final,
                        comentario=descripcion,
                        metodo_pago=metodo_efectivo,
                    )
                    creados += 1
                except ValueError as exc:
                    errores.append(f'Fila {fila_idx}: {exc}')

            if dry_run:
                transaction.set_rollback(True)

        if errores:
            logger.warning(
                "importar_cuenta_personal_planilla id=%s usuario_id=%s familia_id=%s filas_invalidas=%s muestra=%s",
                debug_id,
                getattr(usuario, 'id', None),
                getattr(usuario, 'familia_id', None),
                len(errores),
                errores[:15],
            )
            return Response(
                {
                    'error': 'La importación contiene filas inválidas.',
                    'errores': errores,
                    'movimientos_validos': creados,
                    'categorias_personales_creadas': categorias_creadas,
                    'dry_run': dry_run,
                    'import_debug_id': debug_id,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not dry_run and creados and meses_importados and usuario.familia_id:
            services_recalculo.recalcular_familia_desde(
                usuario.familia_id, min(meses_importados)
            )
            RecalculoPendiente.objects.filter(familia_id=usuario.familia_id).delete()

        logger.info(
            "importar_cuenta_personal_planilla id=%s usuario_id=%s ok movimientos_creados=%s dry_run=%s",
            debug_id,
            getattr(usuario, 'id', None),
            creados,
            dry_run,
        )
        return Response(
            {
                'ok': True,
                'dry_run': dry_run,
                'movimientos_creados': creados,
                'movimientos_anteriores_eliminados': movimientos_anteriores_eliminados,
                'categorias_personales_creadas': categorias_creadas,
                'cuenta_objetivo': cuenta_personal.nombre,
                'import_debug_id': debug_id,
            },
            status=status.HTTP_200_OK,
        )
    except Exception as exc:
        logger.exception(
            "importar_cuenta_personal_planilla id=%s usuario_id=%s familia_id=%s",
            debug_id,
            getattr(usuario, 'id', None),
            getattr(usuario, 'familia_id', None),
        )
        payload = {
            'error': 'Error interno al importar cuenta personal.',
            'detalle': str(exc),
            'import_debug_id': debug_id,
        }
        if settings.DEBUG:
            payload['traceback'] = traceback.format_exc()
        return Response(payload, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def importar_honorarios_planilla(request):
    """
    Importa movimientos para la cuenta personal Honorarios.

    Encabezados esperados:
      - Fecha
      - Mes/año (opcional)
      - Gasto
      - Ingreso
      - Entrada (ignorado)
      - Valor (monto real)
      - Monto (ignorado)
      - Descripción
      - ID entrada (ignorado)

    Reglas:
      - Si Gasto tiene contenido -> EGRESO.
      - Si Ingreso tiene contenido -> INGRESO.
      - El monto siempre se toma desde columna Valor.
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    if settings.DEMO:
        return respuesta_demo_no_disponible()

    debug_id = _nuevo_import_debug_id()

    try:
        archivo = request.FILES.get('archivo')
        if not archivo:
            logger.warning(
                "importar_honorarios_planilla id=%s usuario_id=%s sin archivo",
                debug_id,
                getattr(usuario, 'id', None),
            )
            return Response(
                {'error': 'Debes adjuntar un archivo en el campo "archivo".', 'import_debug_id': debug_id},
                status=status.HTTP_400_BAD_REQUEST,
            )

        dry_run = str(request.data.get('dry_run', '')).lower() in ('1', 'true', 'yes', 'on')
        nombre_archivo = getattr(archivo, 'name', '') or ''

        try:
            contenido = archivo.read().decode('utf-8-sig')
        except UnicodeDecodeError:
            logger.warning(
                "importar_honorarios_planilla id=%s usuario_id=%s decode utf-8 falló nombre=%r",
                debug_id,
                getattr(usuario, 'id', None),
                nombre_archivo,
            )
            return Response(
                {
                    'error': 'No se pudo leer el archivo. Exporta la planilla como CSV UTF-8.',
                    'import_debug_id': debug_id,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        logger.info(
            "importar_honorarios_planilla id=%s usuario_id=%s familia_id=%s dry_run=%s archivo=%r bytes=%s",
            debug_id,
            getattr(usuario, 'id', None),
            getattr(usuario, 'familia_id', None),
            dry_run,
            nombre_archivo,
            len(contenido),
        )

        stream = io.StringIO(contenido)
        try:
            sample = stream.read(4096)
            stream.seek(0)
            dialect = csv.Sniffer().sniff(sample, delimiters=',;')
        except csv.Error:
            dialect = csv.excel
        reader = csv.DictReader(stream, dialect=dialect)

        if not reader.fieldnames:
            logger.warning(
                "importar_honorarios_planilla id=%s usuario_id=%s sin encabezados csv",
                debug_id,
                getattr(usuario, 'id', None),
            )
            return Response(
                {'error': 'La planilla no tiene encabezados.', 'import_debug_id': debug_id},
                status=status.HTTP_400_BAD_REQUEST,
            )

        normalizados = {_normalizar_header(h) for h in reader.fieldnames if h}
        obligatorios = {'fecha', 'gasto', 'ingreso', 'valor'}
        faltantes = [h for h in obligatorios if h not in normalizados]
        if faltantes:
            logger.warning(
                "importar_honorarios_planilla id=%s usuario_id=%s faltan columnas %s fieldnames=%s",
                debug_id,
                getattr(usuario, 'id', None),
                faltantes,
                list(reader.fieldnames),
            )
            return Response(
                {
                    'error': f'Faltan encabezados obligatorios: {", ".join(sorted(faltantes))}.',
                    'import_debug_id': debug_id,
                    'headers_recibidos': list(reader.fieldnames),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        metodo_efectivo = MetodoPago.objects.filter(tipo='EFECTIVO').order_by('pk').first()
        if not metodo_efectivo:
            metodo_efectivo = MetodoPago.objects.create(nombre='Efectivo', tipo='EFECTIVO')

        cuenta_honorarios, _ = CuentaPersonal.objects.get_or_create(
            usuario=usuario,
            nombre='Honorarios',
            defaults={'descripcion': 'Cuenta para movimientos importados desde planilla de honorarios.'},
        )

        categoria_ingreso_default, _ = Categoria.objects.get_or_create(
            familia=usuario.familia,
            usuario=usuario,
            nombre='Otros',
            tipo='INGRESO',
            defaults={'es_inversion': False},
        )

        creados = 0
        categorias_creadas = 0
        errores = []
        meses_importados = set()

        with transaction.atomic():
            for fila_idx, fila in enumerate(reader, start=2):
                fila = _reparar_fila_colapsada_honorarios(fila)
                if _fila_vacia(fila):
                    continue
                try:
                    fecha = _parsear_fecha_importacion(_obtener_columna(fila, 'fecha'))
                    meses_importados.add(services_recalculo.primer_dia_mes(fecha))

                    valor_txt = _obtener_columna(fila, 'valor')
                    monto = _parsear_monto_importacion(valor_txt)
                    monto_final = abs(monto)

                    gasto_txt = _obtener_columna(fila, 'gasto')
                    ingreso_txt = _obtener_columna(fila, 'ingreso')
                    descripcion = _obtener_columna(fila, 'descripcion') or ''

                    if bool(gasto_txt) == bool(ingreso_txt):
                        raise ValueError(
                            'debe indicar exactamente una de las columnas: Gasto o Ingreso.'
                        )

                    if gasto_txt:
                        tipo = 'EGRESO'
                        categoria_txt = gasto_txt or 'Sin categoría'
                        categoria, creada = Categoria.objects.get_or_create(
                            familia=usuario.familia,
                            usuario=usuario,
                            nombre=categoria_txt,
                            tipo='EGRESO',
                            defaults={'es_inversion': False},
                        )
                        if creada:
                            categorias_creadas += 1
                    else:
                        tipo = 'INGRESO'
                        categoria_txt = ingreso_txt.strip()
                        if categoria_txt:
                            categoria, creada = Categoria.objects.get_or_create(
                                familia=usuario.familia,
                                usuario=usuario,
                                nombre=categoria_txt,
                                tipo='INGRESO',
                                defaults={'es_inversion': False},
                            )
                            if creada:
                                categorias_creadas += 1
                        else:
                            categoria = categoria_ingreso_default

                    Movimiento.objects.create(
                        familia=usuario.familia,
                        usuario=usuario,
                        cuenta=cuenta_honorarios,
                        tipo=tipo,
                        ambito='PERSONAL',
                        categoria=categoria,
                        fecha=fecha,
                        monto=monto_final,
                        comentario=descripcion,
                        metodo_pago=metodo_efectivo,
                    )
                    creados += 1
                except ValueError as exc:
                    errores.append(f'Fila {fila_idx}: {exc}')

            if dry_run:
                transaction.set_rollback(True)

        if errores:
            logger.warning(
                "importar_honorarios_planilla id=%s usuario_id=%s familia_id=%s filas_invalidas=%s muestra=%s",
                debug_id,
                getattr(usuario, 'id', None),
                getattr(usuario, 'familia_id', None),
                len(errores),
                errores[:15],
            )
            return Response(
                {
                    'error': 'La importación contiene filas inválidas.',
                    'errores': errores,
                    'movimientos_validos': creados,
                    'categorias_personales_creadas': categorias_creadas,
                    'dry_run': dry_run,
                    'import_debug_id': debug_id,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not dry_run and creados and meses_importados and usuario.familia_id:
            services_recalculo.recalcular_familia_desde(
                usuario.familia_id, min(meses_importados)
            )
            RecalculoPendiente.objects.filter(familia_id=usuario.familia_id).delete()

        logger.info(
            "importar_honorarios_planilla id=%s usuario_id=%s ok movimientos_creados=%s dry_run=%s",
            debug_id,
            getattr(usuario, 'id', None),
            creados,
            dry_run,
        )
        return Response(
            {
                'ok': True,
                'dry_run': dry_run,
                'movimientos_creados': creados,
                'categorias_personales_creadas': categorias_creadas,
                'cuenta_objetivo': cuenta_honorarios.nombre,
                'import_debug_id': debug_id,
            },
            status=status.HTTP_200_OK,
        )
    except Exception as exc:
        logger.exception(
            "importar_honorarios_planilla id=%s usuario_id=%s familia_id=%s",
            debug_id,
            getattr(usuario, 'id', None),
            getattr(usuario, 'familia_id', None),
        )
        payload = {
            'error': 'Error interno al importar honorarios.',
            'detalle': str(exc),
            'import_debug_id': debug_id,
        }
        if settings.DEBUG:
            payload['traceback'] = traceback.format_exc()
        return Response(payload, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def importar_sueldos_planilla(request):
    """
    Importa sueldos desde CSV a IngresoComun.

    Cada importación real sustituye solo los ingresos comunes del usuario autenticado
    (no los de otros miembros de la familia). Todas las filas se registran como
    sueldos del usuario que importa; la columna Integrante (si existe) se ignora.

    Encabezados esperados:
      - día
      - Mes/año
      - Sueldo
      - Descripción (opcional)
      - Integrante (opcional, ignorado)
      - ID entrada (ignorado)
    """
    usuario_auth, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error
    if settings.DEMO:
        return respuesta_demo_no_disponible()
    if not usuario_auth.familia_id:
        return Response(
            {'error': 'Usuario sin familia asociada.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    archivo = request.FILES.get('archivo')
    if not archivo:
        return Response(
            {'error': 'Debes adjuntar un archivo en el campo "archivo".'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    dry_run = str(request.data.get('dry_run', '')).lower() in ('1', 'true', 'yes', 'on')

    try:
        contenido = archivo.read().decode('utf-8-sig')
    except UnicodeDecodeError:
        return Response(
            {'error': 'No se pudo leer el archivo. Exporta la planilla como CSV UTF-8.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    stream = io.StringIO(contenido)
    try:
        sample = stream.read(4096)
        stream.seek(0)
        dialect = csv.Sniffer().sniff(sample, delimiters=',;')
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(stream, dialect=dialect)

    if not reader.fieldnames:
        return Response(
            {'error': 'La planilla no tiene encabezados.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    headers = {_normalizar_header(h) for h in reader.fieldnames if h}
    if 'sueldo' not in headers:
        return Response(
            {'error': 'Falta encabezado obligatorio: Sueldo.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if 'dia' not in headers:
        return Response(
            {'error': 'Falta encabezado obligatorio: día.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    creados = 0
    errores = []
    meses_importados = set()

    with transaction.atomic():
        ingresos_anteriores_eliminados = IngresoComun.objects.filter(
            familia_id=usuario_auth.familia_id,
            usuario_id=usuario_auth.pk,
        ).count()
        IngresoComun.objects.filter(
            familia_id=usuario_auth.familia_id,
            usuario_id=usuario_auth.pk,
        ).delete()

        for fila_idx, fila in enumerate(reader, start=2):
            fila = _reparar_fila_colapsada_sueldos(fila)
            if _fila_vacia(fila):
                continue
            try:
                dia_txt = _obtener_columna(fila, 'dia') or _obtener_columna(fila, 'día')
                mes_anio_txt = _obtener_columna(fila, 'mes/año')
                fecha_pago = _parsear_fecha_pago_desde_dia_o_mes_anio(dia_txt, mes_anio_txt)
                mes = services_recalculo.primer_dia_mes(fecha_pago)
                meses_importados.add(services_recalculo.primer_dia_mes(mes))

                sueldo_txt = _obtener_columna(fila, 'sueldo')
                monto = _parsear_monto_importacion(sueldo_txt)
                if monto < 0:
                    monto = abs(monto)

                origen = _obtener_columna(fila, 'descripcion') or ''

                IngresoComun.objects.create(
                    familia=usuario_auth.familia,
                    usuario=usuario_auth,
                    mes=mes,
                    fecha_pago=fecha_pago,
                    monto=monto,
                    origen=origen,
                )
                creados += 1
            except ValueError as exc:
                errores.append(f'Fila {fila_idx}: {exc}')

        if dry_run:
            transaction.set_rollback(True)

    if errores:
        return Response(
            {
                'error': 'La importación contiene filas inválidas.',
                'errores': errores,
                'ingresos_validos': creados,
                'dry_run': dry_run,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not dry_run and creados and meses_importados:
        services_recalculo.recalcular_familia_desde(
            usuario_auth.familia_id, min(meses_importados)
        )
        RecalculoPendiente.objects.filter(familia_id=usuario_auth.familia_id).delete()

    return Response(
        {
            'ok': True,
            'dry_run': dry_run,
            'ingresos_creados': creados,
            'ingresos_anteriores_eliminados': ingresos_anteriores_eliminados,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def importar_gastos_comunes_planilla(request):
    """
    Importa movimientos desde CSV para gastos comunes.
    Misma lógica de cuenta personal, pero guarda ambito=COMUN.
    """
    usuario, error = utils_auth.get_usuario_autenticado(request)
    if error:
        return error

    if settings.DEMO:
        return respuesta_demo_no_disponible()

    debug_id = _nuevo_import_debug_id()

    if not usuario.familia_id:
        logger.warning(
            "importar_gastos_comunes_planilla id=%s usuario_id=%s sin familia",
            debug_id,
            getattr(usuario, 'id', None),
        )
        return Response(
            {'error': 'Usuario sin familia asociada.', 'import_debug_id': debug_id},
            status=status.HTTP_400_BAD_REQUEST,
        )

    archivo = request.FILES.get('archivo')
    if not archivo:
        logger.warning(
            "importar_gastos_comunes_planilla id=%s usuario_id=%s sin archivo",
            debug_id,
            getattr(usuario, 'id', None),
        )
        return Response(
            {'error': 'Debes adjuntar un archivo en el campo "archivo".', 'import_debug_id': debug_id},
            status=status.HTTP_400_BAD_REQUEST,
        )

    dry_run = str(request.data.get('dry_run', '')).lower() in ('1', 'true', 'yes', 'on')

    try:
        contenido = archivo.read().decode('utf-8-sig')
    except UnicodeDecodeError:
        logger.warning(
            "importar_gastos_comunes_planilla id=%s usuario_id=%s decode utf-8 falló",
            debug_id,
            getattr(usuario, 'id', None),
        )
        return Response(
            {
                'error': 'No se pudo leer el archivo. Exporta la planilla como CSV UTF-8.',
                'import_debug_id': debug_id,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    nombre_archivo = getattr(archivo, 'name', '') or ''
    logger.info(
        "importar_gastos_comunes_planilla id=%s usuario_id=%s familia_id=%s dry_run=%s archivo=%r bytes=%s",
        debug_id,
        getattr(usuario, 'id', None),
        getattr(usuario, 'familia_id', None),
        dry_run,
        nombre_archivo,
        len(contenido),
    )

    stream = io.StringIO(contenido)
    try:
        sample = stream.read(4096)
        stream.seek(0)
        dialect = csv.Sniffer().sniff(sample, delimiters=',;')
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(stream, dialect=dialect)

    if not reader.fieldnames:
        logger.warning(
            "importar_gastos_comunes_planilla id=%s usuario_id=%s sin encabezados csv",
            debug_id,
            getattr(usuario, 'id', None),
        )
        return Response(
            {'error': 'La planilla no tiene encabezados.', 'import_debug_id': debug_id},
            status=status.HTTP_400_BAD_REQUEST,
        )

    normalizados = {_normalizar_header(h) for h in reader.fieldnames if h}
    if 'fecha' not in normalizados or 'monto' not in normalizados:
        logger.warning(
            "importar_gastos_comunes_planilla id=%s usuario_id=%s faltan columnas fecha/monto fieldnames=%s",
            debug_id,
            getattr(usuario, 'id', None),
            list(reader.fieldnames),
        )
        return Response(
            {
                'error': 'Faltan encabezados obligatorios: Fecha y/o Monto.',
                'import_debug_id': debug_id,
                'headers_recibidos': list(reader.fieldnames),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    metodo_efectivo = MetodoPago.objects.filter(tipo='EFECTIVO').order_by('pk').first()
    if not metodo_efectivo:
        metodo_efectivo = MetodoPago.objects.create(nombre='Efectivo', tipo='EFECTIVO')

    categoria_otros, _ = Categoria.objects.get_or_create(
        familia=usuario.familia,
        usuario=None,
        nombre='Otros',
        tipo='INGRESO',
        defaults={'es_inversion': False},
    )

    creados = 0
    categorias_creadas = 0
    errores = []
    meses_importados = set()
    movimientos_para_crear = []

    try:
        with transaction.atomic():
            for fila_idx, fila in enumerate(reader, start=2):
                fila = _reparar_fila_colapsada(fila)
                if _fila_vacia(fila):
                    continue
                try:
                    fecha = _parsear_fecha_importacion(_obtener_columna(fila, 'fecha'))
                    meses_importados.add(services_recalculo.primer_dia_mes(fecha))
                    monto_raw = _obtener_columna(fila, 'monto')
                    monto = _parsear_monto_importacion(monto_raw)
                    descripcion = _obtener_columna(fila, 'descripcion') or ''
                    categoria_txt = _obtener_columna(fila, 'categoria') or 'Sin categoría'

                    if monto < 0:
                        tipo = 'INGRESO'
                        categoria = categoria_otros
                        monto_final = abs(monto)
                    else:
                        tipo = 'EGRESO'
                        categoria, creada = Categoria.objects.get_or_create(
                            familia=usuario.familia,
                            usuario=None,
                            nombre=categoria_txt,
                            tipo='EGRESO',
                            defaults={'es_inversion': False},
                        )
                        if creada:
                            categorias_creadas += 1
                        monto_final = monto

                    movimientos_para_crear.append(
                        Movimiento(
                            familia=usuario.familia,
                            usuario=usuario,
                            cuenta=None,
                            tipo=tipo,
                            ambito='COMUN',
                            categoria=categoria,
                            fecha=fecha,
                            monto=monto_final,
                            comentario=descripcion,
                            metodo_pago=metodo_efectivo,
                        )
                    )
                    creados += 1
                except ValueError as exc:
                    errores.append(f'Fila {fila_idx}: {exc}')

            if movimientos_para_crear:
                # Evita disparar señales por fila; el recálculo se hace una sola vez al final.
                try:
                    Movimiento.objects.bulk_create(movimientos_para_crear)
                except Exception:
                    logger.exception(
                        "Error en bulk_create importacion gastos comunes id=%s usuario_id=%s familia_id=%s filas=%s",
                        debug_id,
                        getattr(usuario, 'id', None),
                        getattr(usuario, 'familia_id', None),
                        len(movimientos_para_crear),
                    )
                    raise

            if dry_run:
                transaction.set_rollback(True)

        if errores:
            logger.warning(
                "importar_gastos_comunes_planilla id=%s usuario_id=%s familia_id=%s filas_invalidas=%s muestra=%s",
                debug_id,
                getattr(usuario, 'id', None),
                getattr(usuario, 'familia_id', None),
                len(errores),
                errores[:15],
            )
            return Response(
                {
                    'error': 'La importación contiene filas inválidas.',
                    'errores': errores,
                    'movimientos_validos': creados,
                    'categorias_familiares_creadas': categorias_creadas,
                    'dry_run': dry_run,
                    'import_debug_id': debug_id,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not dry_run and creados and meses_importados and usuario.familia_id:
            # Para importaciones grandes, evitar recálculo síncrono en request web:
            # dejamos el recálculo marcado como pendiente para proceso diferido.
            try:
                services_recalculo.merge_recalculo_pendiente(
                    usuario.familia_id, min(meses_importados)
                )
            except Exception:
                logger.exception(
                    "Error marcando recálculo pendiente post importación id=%s usuario_id=%s familia_id=%s desde_mes=%s",
                    debug_id,
                    getattr(usuario, 'id', None),
                    getattr(usuario, 'familia_id', None),
                    min(meses_importados),
                )
                raise

        logger.info(
            "importar_gastos_comunes_planilla id=%s usuario_id=%s ok movimientos_creados=%s dry_run=%s",
            debug_id,
            getattr(usuario, 'id', None),
            creados,
            dry_run,
        )
        return Response(
            {
                'ok': True,
                'dry_run': dry_run,
                'movimientos_creados': creados,
                'categorias_familiares_creadas': categorias_creadas,
                'ambito_objetivo': 'COMUN',
                'recalculo': 'pendiente',
                'import_debug_id': debug_id,
            },
            status=status.HTTP_200_OK,
        )
    except Exception as exc:
        logger.exception(
            "importar_gastos_comunes_planilla id=%s usuario_id=%s familia_id=%s",
            debug_id,
            getattr(usuario, 'id', None),
            getattr(usuario, 'familia_id', None),
        )
        payload = {
            'error': 'Error interno al importar gastos comunes.',
            'detalle': str(exc),
            'import_debug_id': debug_id,
        }
        if settings.DEBUG:
            payload['traceback'] = traceback.format_exc()
        return Response(payload, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _normalizar_header(header):
    if not header:
        return ''
    return (
        str(header)
        .strip()
        .lower()
        .replace('á', 'a')
        .replace('é', 'e')
        .replace('í', 'i')
        .replace('ó', 'o')
        .replace('ú', 'u')
    )


def _obtener_columna(fila, nombre):
    objetivo = _normalizar_header(nombre)
    for key, value in fila.items():
        if _normalizar_header(key) == objetivo:
            return (value or '').strip()
    return ''


def _parsear_fecha_importacion(valor):
    if not valor:
        raise ValueError('fecha vacía.')
    candidato = str(valor).strip()
    formatos = ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y')
    for fmt in formatos:
        try:
            return datetime.strptime(candidato, fmt).date()
        except ValueError:
            continue
    # Fila colapsada sin reparar: "8/2/2025,02-2025,Otros,..."
    if ',' in candidato:
        primero = candidato.split(',', 1)[0].strip()
        for fmt in formatos:
            try:
                return datetime.strptime(primero, fmt).date()
            except ValueError:
                continue
    raise ValueError(f"fecha inválida '{valor}'.")


def _parsear_monto_importacion(valor):
    if not valor:
        raise ValueError('monto vacío.')
    limpio = str(valor).replace(' ', '').replace('$', '')
    if ',' in limpio and '.' in limpio:
        # Formato tipo 1.234.567,89 -> 1234567.89
        limpio = limpio.replace('.', '').replace(',', '.')
    elif ',' in limpio:
        # Formato decimal con coma tipo 1234,56 -> 1234.56
        limpio = limpio.replace(',', '.')
    elif '.' in limpio:
        # Si hay mas de un punto, se asume separador de miles: 1.234.567 -> 1234567
        if limpio.count('.') > 1:
            limpio = limpio.replace('.', '')
        else:
            # Un solo punto puede ser decimal (1234.56) o miles (1.234).
            # Si hay exactamente 3 digitos a la derecha, se interpreta como miles.
            parte_entera, parte_decimal = limpio.split('.', 1)
            if len(parte_decimal) == 3 and parte_entera.lstrip('-').isdigit():
                limpio = f'{parte_entera}{parte_decimal}'
    try:
        monto = Decimal(limpio)
    except Exception as exc:
        raise ValueError(f"monto inválido '{valor}'.") from exc
    if monto == 0:
        raise ValueError('monto no puede ser 0.')
    return monto


def _fila_vacia(fila):
    return all(not str(value or '').strip() for value in fila.values())


def _parece_fecha_con_fila_colapsada_cuenta_personal(fecha: str) -> bool:
    """True si el valor en Fecha parece ser toda la fila (fecha + mes/año + resto)."""
    s = (fecha or '').strip()
    if ',' not in s:
        return False
    return bool(re.match(r'^\d{1,2}/\d{1,2}/\d{4},', s))


def _partir_campos_cuenta_personal_colapsada(blob: str):
    """
    Separa Fecha, Mes/año, Categoría, Monto y resto (descripción / ID) desde un texto colapsado.
    Usa csv.reader y, si falla o faltan campos, un patrón tolerante a comillas rotas.
    """
    blob = (blob or '').strip()
    partes = []
    try:
        partes = next(csv.reader([blob], delimiter=',', quotechar='"'))
    except Exception:
        partes = []
    if len(partes) >= 4:
        return partes
    m = re.match(
        r'^(\d{1,2}/\d{1,2}/\d{4}),([^,]+),([^,]+),([^,]+)(?:,(.*))?$',
        blob,
        re.DOTALL,
    )
    if not m:
        return None
    g5 = (m.group(5) or '').strip() if m.lastindex >= 5 else ''
    return [m.group(1), m.group(2), m.group(3), m.group(4), g5]


def _reparar_fila_colapsada(fila):
    """
    Algunas exportaciones traen filas donde toda la linea queda dentro de "Fecha".
    Ejemplo: "22/11/2024,11-2024,Libros,$18.900,\"El cerebro, ...\",123"
    En esos casos intentamos reconstruir las columnas esperadas.
    """
    fecha = _obtener_columna(fila, 'fecha')
    categoria = _obtener_columna(fila, 'categoria')
    monto = _obtener_columna(fila, 'monto')
    descripcion = _obtener_columna(fila, 'descripcion')

    # Heuristica: fila colapsada en Fecha, o Fecha contiene dd/mm/yyyy,... aunque haya ruido en otras columnas.
    if not fecha or ',' not in fecha:
        return fila
    solo_fecha_llena = not any([categoria, monto, descripcion])
    if not solo_fecha_llena and not _parece_fecha_con_fila_colapsada_cuenta_personal(fecha):
        return fila

    partes = _partir_campos_cuenta_personal_colapsada(fecha)
    if not partes or len(partes) < 4:
        return fila

    # Estructura minima: Fecha, Mes/año, Categoría, Monto, [Descripción...], [ID gasto]
    fecha_v = (partes[0] or '').strip()
    mes_anio_v = (partes[1] or '').strip() if len(partes) > 1 else ''
    categoria_v = (partes[2] or '').strip() if len(partes) > 2 else ''
    monto_v = (partes[3] or '').strip() if len(partes) > 3 else ''

    if len(partes) <= 4:
        descripcion_v = ''
        id_gasto_v = ''
    elif len(partes) == 5:
        descripcion_v = (partes[4] or '').strip()
        id_gasto_v = ''
    else:
        descripcion_v = ','.join((p or '').strip() for p in partes[4:-1]).strip()
        id_gasto_v = (partes[-1] or '').strip()

    return {
        'Fecha': fecha_v,
        'Mes/año': mes_anio_v,
        'Categoría': categoria_v,
        'Monto': monto_v,
        'Descripción': descripcion_v,
        'ID gasto': id_gasto_v,
    }


def _reparar_fila_colapsada_honorarios(fila):
    """
    Variante para planilla Honorarios:
    Fecha, Mes/año, Gasto, Ingreso, Entrada, Valor, Monto, Descripción, ID entrada
    """
    fecha = _obtener_columna(fila, 'fecha')
    if not fecha or ',' not in fecha:
        return fila
    if any(
        [
            _obtener_columna(fila, 'gasto'),
            _obtener_columna(fila, 'ingreso'),
            _obtener_columna(fila, 'valor'),
            _obtener_columna(fila, 'descripcion'),
        ]
    ):
        return fila

    try:
        partes = next(csv.reader([fecha], delimiter=',', quotechar='"'))
    except Exception:
        return fila

    if len(partes) < 6:
        return fila

    def _p(i):
        return (partes[i] or '').strip() if i < len(partes) else ''

    descripcion_v = ''
    id_entrada_v = ''
    if len(partes) > 8:
        descripcion_v = ','.join((p or '').strip() for p in partes[7:-1]).strip()
        id_entrada_v = (partes[-1] or '').strip()
    elif len(partes) == 8:
        descripcion_v = _p(7)
    elif len(partes) == 9:
        descripcion_v = _p(7)
        id_entrada_v = _p(8)

    return {
        'Fecha': _p(0),
        'Mes/año': _p(1),
        'Gasto': _p(2),
        'Ingreso': _p(3),
        'Entrada': _p(4),
        'Valor': _p(5),
        'Monto': _p(6),
        'Descripción': descripcion_v,
        'ID entrada': id_entrada_v,
    }


def _parsear_mes_desde_dia_o_mes_anio(dia_txt, mes_anio_txt):
    dia_txt = (dia_txt or '').strip()
    mes_anio_txt = (mes_anio_txt or '').strip()

    # Caso 1: dia viene como fecha completa (dd/mm/aaaa, dd-mm-aaaa, yyyy-mm-dd)
    for fmt in ('%d/%m/%Y', '%d-%m-%Y', '%Y-%m-%d', '%d/%m/%y', '%d-%m-%y'):
        try:
            d = datetime.strptime(dia_txt, fmt).date()
            return date(d.year, d.month, 1)
        except ValueError:
            pass

    # Caso 2: dia numerico + mes/año
    if dia_txt.isdigit() and mes_anio_txt:
        m, y = _parsear_mes_anio(mes_anio_txt)
        return date(y, m, 1)

    # Caso 3: solo mes/año
    if mes_anio_txt:
        m, y = _parsear_mes_anio(mes_anio_txt)
        return date(y, m, 1)

    raise ValueError('no se pudo determinar el mes desde día/Mes/año.')


def _parsear_fecha_pago_desde_dia_o_mes_anio(dia_txt, mes_anio_txt):
    dia_txt = (dia_txt or '').strip()
    mes_anio_txt = (mes_anio_txt or '').strip()

    for fmt in ('%d/%m/%Y', '%d-%m-%Y', '%Y-%m-%d', '%d/%m/%y', '%d-%m-%y'):
        try:
            return datetime.strptime(dia_txt, fmt).date()
        except ValueError:
            pass

    if dia_txt.isdigit() and mes_anio_txt:
        day = int(dia_txt)
        m, y = _parsear_mes_anio(mes_anio_txt)
        try:
            return date(y, m, day)
        except ValueError as exc:
            raise ValueError(f'día inválido para mes/año: {dia_txt}/{mes_anio_txt}.') from exc

    if mes_anio_txt:
        m, y = _parsear_mes_anio(mes_anio_txt)
        return date(y, m, 1)

    raise ValueError('no se pudo determinar fecha de pago desde día/Mes/año.')


def _parsear_mes_anio(valor):
    raw = (valor or '').strip()
    for sep in ('-', '/'):
        if sep in raw:
            a, b = raw.split(sep, 1)
            a = a.strip()
            b = b.strip()
            if len(a) == 4 and a.isdigit() and b.isdigit():
                year = int(a)
                month = int(b)
            elif a.isdigit() and len(b) == 4 and b.isdigit():
                month = int(a)
                year = int(b)
            else:
                continue
            if 1 <= month <= 12:
                return month, year
    raise ValueError(f"Mes/año inválido '{valor}'.")


def _reparar_fila_colapsada_sueldos(fila):
    """
    Repara filas donde toda la linea quedó en "Integrante".
    """
    integrante = _obtener_columna(fila, 'integrante')
    dia = _obtener_columna(fila, 'dia') or _obtener_columna(fila, 'día')
    sueldo = _obtener_columna(fila, 'sueldo')
    descripcion = _obtener_columna(fila, 'descripcion')
    if not integrante or ',' not in integrante:
        return fila
    if any([dia, sueldo, descripcion]):
        return fila

    try:
        partes = next(csv.reader([integrante], delimiter=',', quotechar='"'))
    except Exception:
        return fila
    if len(partes) < 4:
        return fila

    integrante_v = (partes[0] or '').strip()
    dia_v = (partes[1] or '').strip() if len(partes) > 1 else ''
    mes_anio_v = (partes[2] or '').strip() if len(partes) > 2 else ''
    sueldo_v = (partes[3] or '').strip() if len(partes) > 3 else ''
    if len(partes) <= 4:
        descripcion_v = ''
        id_entrada_v = ''
    elif len(partes) == 5:
        descripcion_v = (partes[4] or '').strip()
        id_entrada_v = ''
    else:
        descripcion_v = ','.join((p or '').strip() for p in partes[4:-1]).strip()
        id_entrada_v = (partes[-1] or '').strip()

    return {
        'Integrante': integrante_v,
        'día': dia_v,
        'Mes/año': mes_anio_v,
        'Sueldo': sueldo_v,
        'Descripción': descripcion_v,
        'ID entrada': id_entrada_v,
    }
