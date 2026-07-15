"""API de bandeja de movimientos pendientes y vínculo de captura."""

from __future__ import annotations

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from applications.demo_guard import respuesta_demo_no_disponible
from applications.espacios.contexto import usuario_y_espacio
from applications.finanzas.models import (
    Categoria,
    CodigoVinculoCaptura,
    CuentaPersonal,
    MetodoPago,
    MovimientoPendiente,
    Tarjeta,
)
from applications.finanzas.serializers import (
    MovimientoPendienteSerializer,
    MovimientoSerializer,
)
from applications.finanzas.services.captura import (
    CapturaError,
    confirmar_pendiente,
    crear_pendiente,
    descartar_pendiente,
)
from applications.finanzas.services.captura.vinculo import generar_codigo_vinculo


def _contexto(request):
    usuario, espacio, err = usuario_y_espacio(request)
    if err is not None:
        return None, None, err
    if request.method not in ('GET', 'HEAD', 'OPTIONS') and getattr(espacio, 'archivado', False):
        return None, None, Response(
            {'error': 'El espacio está archivado (registro histórico de solo lectura).'},
            status=status.HTTP_403_FORBIDDEN,
        )
    return usuario, espacio, None


def _fk_or_none(model, pk, **filtros):
    if pk in (None, ''):
        return None
    try:
        return model.objects.get(pk=int(pk), **filtros)
    except (model.DoesNotExist, TypeError, ValueError):
        return None


@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def pendientes(request):
    """
    GET  → Lista pendientes del usuario en el espacio (default: estado=PENDIENTE).
    POST → Crea un pendiente manual (borrador incompleto).
    """
    usuario, espacio, error = _contexto(request)
    if error:
        return error

    if request.method == 'GET':
        estado = request.GET.get('estado', MovimientoPendiente.ESTADO_PENDIENTE)
        qs = (
            MovimientoPendiente.objects.filter(usuario=usuario, espacio=espacio)
            .select_related(
                'categoria_sugerida',
                'metodo_pago_sugerido',
                'tarjeta_sugerida',
                'cuenta_sugerida',
            )
            .order_by('-creado_at')
        )
        if estado:
            qs = qs.filter(estado=estado)
        return Response(MovimientoPendienteSerializer(qs, many=True).data)

    if settings.DEMO:
        return respuesta_demo_no_disponible()

    data = request.data or {}
    if 'monto' not in data:
        return Response({'error': 'monto es obligatorio.'}, status=status.HTTP_400_BAD_REQUEST)

    pendiente = crear_pendiente(
        usuario=usuario,
        espacio=espacio,
        origen=data.get('origen') or MovimientoPendiente.ORIGEN_MANUAL,
        monto=data['monto'],
        fecha=data.get('fecha') or None,
        comercio=data.get('comercio') or '',
        tipo=data.get('tipo') or 'EGRESO',
        categoria_sugerida=_fk_or_none(Categoria, data.get('categoria_sugerida')),
        ambito_sugerido=data.get('ambito_sugerido'),
        metodo_pago_sugerido=_fk_or_none(MetodoPago, data.get('metodo_pago_sugerido')),
        tarjeta_sugerida=_fk_or_none(Tarjeta, data.get('tarjeta_sugerida'), usuario=usuario),
        cuenta_sugerida=_fk_or_none(CuentaPersonal, data.get('cuenta_sugerida'), usuario=usuario),
        confianza=float(data.get('confianza') or 0),
        payload_original=data.get('payload_original') or {},
        notificar=bool(data.get('notificar')),
    )
    return Response(
        MovimientoPendienteSerializer(pendiente).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def pendientes_contador(request):
    usuario, espacio, error = _contexto(request)
    if error:
        return error
    total = MovimientoPendiente.objects.filter(
        usuario=usuario,
        espacio=espacio,
        estado=MovimientoPendiente.ESTADO_PENDIENTE,
    ).count()
    return Response({'count': total})


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def pendiente_confirmar(request, pk):
    usuario, espacio, error = _contexto(request)
    if error:
        return error
    if settings.DEMO:
        return respuesta_demo_no_disponible()

    try:
        pendiente = MovimientoPendiente.objects.get(
            pk=pk, usuario=usuario, espacio=espacio,
        )
    except MovimientoPendiente.DoesNotExist:
        return Response({'error': 'Pendiente no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    overrides = {}
    data = request.data or {}
    for key in (
        'ambito', 'categoria', 'metodo_pago', 'cuenta', 'tarjeta',
        'comentario', 'tipo', 'fecha', 'monto', 'num_cuotas', 'monto_cuota',
    ):
        if key in data:
            overrides[key] = data[key]

    try:
        movimiento = confirmar_pendiente(pendiente, overrides=overrides or None)
    except CapturaError as exc:
        code = status.HTTP_400_BAD_REQUEST
        if exc.code == 'estado_invalido':
            code = status.HTTP_409_CONFLICT
        return Response({'error': exc.mensaje, 'code': exc.code}, status=code)

    return Response(
        {
            'pendiente': MovimientoPendienteSerializer(pendiente).data,
            'movimiento': MovimientoSerializer(movimiento).data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def pendiente_descartar(request, pk):
    usuario, espacio, error = _contexto(request)
    if error:
        return error
    if settings.DEMO:
        return respuesta_demo_no_disponible()

    try:
        pendiente = MovimientoPendiente.objects.get(
            pk=pk, usuario=usuario, espacio=espacio,
        )
    except MovimientoPendiente.DoesNotExist:
        return Response({'error': 'Pendiente no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    try:
        descartar_pendiente(pendiente)
    except CapturaError as exc:
        return Response(
            {'error': exc.mensaje, 'code': exc.code},
            status=status.HTTP_409_CONFLICT,
        )
    return Response(MovimientoPendienteSerializer(pendiente).data)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def captura_generar_vinculo(request):
    """Genera código de un solo uso para vincular Telegram o WhatsApp."""
    usuario, espacio, error = _contexto(request)
    if error:
        return error
    if settings.DEMO:
        return respuesta_demo_no_disponible()

    canal = (request.data.get('canal') or '').strip().upper()
    if canal not in (
        CodigoVinculoCaptura.CANAL_TELEGRAM,
        CodigoVinculoCaptura.CANAL_WHATSAPP,
    ):
        return Response(
            {'error': 'canal debe ser TELEGRAM o WHATSAPP.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    row = generar_codigo_vinculo(usuario, canal)
    return Response(
        {
            'canal': row.canal,
            'codigo': row.codigo,
            'expira_at': row.expira_at.isoformat(),
            'instruccion': (
                f'Envía al bot: /vincular {row.codigo}'
            ),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def captura_estado_vinculo(request):
    usuario, espacio, error = _contexto(request)
    if error:
        return error
    return Response({
        'telegram_vinculado': bool(usuario.telegram_vinculado),
        'whatsapp_vinculado': bool(usuario.whatsapp_vinculado),
        'whatsapp_phone': usuario.whatsapp_phone or '',
        # No exponer telegram_chat_id completo en clientes no confiables: basura segura
        'telegram_chat_id_presente': bool(usuario.telegram_chat_id),
    })
