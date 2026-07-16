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
    ConfiguracionCapturaCorreo,
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


def _correo_efectivamente_conectado(config: ConfiguracionCapturaCorreo | None) -> bool:
    return bool(config and config.conectado and (config.refresh_token_enc or '').strip())


def _sanear_conexion_correo(config: ConfiguracionCapturaCorreo | None) -> ConfiguracionCapturaCorreo | None:
    """Si quedó conectado=True sin refresh OAuth (p. ej. resto de IMAP), corrige el estado."""
    if config is None:
        return None
    if config.conectado and not (config.refresh_token_enc or '').strip():
        config.conectado = False
        config.ultimo_error = (
            'Debes volver a conectar con Gmail u Outlook (OAuth). '
            'La conexión anterior (IMAP) ya no es válida.'
        )
        config.save(update_fields=['conectado', 'ultimo_error', 'updated_at'])
    return config


def _serializar_config_correo(config: ConfiguracionCapturaCorreo | None) -> dict:
    from applications.finanzas.services.captura.mail_ingest import intervalo_minimo_permitido

    config = _sanear_conexion_correo(config)
    if config is None:
        return {
            'conectado': False,
            'proveedor': ConfiguracionCapturaCorreo.PROVEEDOR_GMAIL,
            'email': '',
            'remitentes_banco': [],
            'intervalo_minutos': 15,
            'notificaciones_activas': True,
            'ultimo_sync_at': None,
            'ultimo_error': '',
            'intervalo_minimo_permitido': intervalo_minimo_permitido(),
        }
    return {
        'conectado': _correo_efectivamente_conectado(config),
        'proveedor': config.proveedor,
        'email': config.email or '',
        'remitentes_banco': list(config.remitentes_banco or []),
        'intervalo_minutos': int(config.intervalo_minutos or 15),
        'notificaciones_activas': bool(config.notificaciones_activas),
        'ultimo_sync_at': config.ultimo_sync_at.isoformat() if config.ultimo_sync_at else None,
        'ultimo_error': config.ultimo_error or '',
        'intervalo_minimo_permitido': intervalo_minimo_permitido(),
    }


def _correo_redirect_uri(request, proveedor: str) -> str:
    scheme = 'https' if request.is_secure() else 'http'
    host = request.get_host()
    slug = 'google' if proveedor == ConfiguracionCapturaCorreo.PROVEEDOR_GMAIL else 'microsoft'
    return f'{scheme}://{host}/api/finanzas/captura/correo/oauth/callback/{slug}/'


@api_view(['GET', 'PUT'])
@authentication_classes([])
@permission_classes([AllowAny])
def captura_correo(request):
    """GET estado / PUT preferencias (remitentes, intervalo, notificaciones)."""
    usuario, espacio, error = _contexto(request)
    if error:
        return error

    config = ConfiguracionCapturaCorreo.objects.filter(usuario=usuario).first()
    config = _sanear_conexion_correo(config)

    if request.method == 'GET':
        return Response(_serializar_config_correo(config))

    if settings.DEMO:
        return respuesta_demo_no_disponible()

    from applications.finanzas.services.captura.mail_ingest import (
        intervalo_minimo_permitido,
        normalizar_remitentes,
    )

    data = request.data if isinstance(request.data, dict) else {}
    if config is None:
        config = ConfiguracionCapturaCorreo(usuario=usuario)

    if 'remitentes_banco' in data:
        remitentes = normalizar_remitentes(data.get('remitentes_banco'))
        if _correo_efectivamente_conectado(config) and not remitentes:
            return Response(
                {'error': 'Registra al menos un remitente de banco (email o @dominio).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        config.remitentes_banco = remitentes

    minimo = intervalo_minimo_permitido()
    if 'intervalo_minutos' in data:
        try:
            intervalo = int(data.get('intervalo_minutos'))
        except (TypeError, ValueError):
            return Response(
                {'error': 'intervalo_minutos debe ser un entero.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if intervalo < minimo:
            return Response(
                {'error': f'intervalo_minutos mínimo permitido: {minimo}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        config.intervalo_minutos = intervalo

    if 'notificaciones_activas' in data:
        config.notificaciones_activas = bool(data.get('notificaciones_activas'))

    config.save()
    return Response(_serializar_config_correo(config))


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def captura_correo_oauth_connect(request):
    """Inicia OAuth Gmail u Outlook. Body: { proveedor: GMAIL|OUTLOOK }."""
    usuario, espacio, error = _contexto(request)
    if error:
        return error
    if settings.DEMO:
        return respuesta_demo_no_disponible()

    data = request.data if isinstance(request.data, dict) else {}
    proveedor = (data.get('proveedor') or '').strip().upper()
    if proveedor not in (
        ConfiguracionCapturaCorreo.PROVEEDOR_GMAIL,
        ConfiguracionCapturaCorreo.PROVEEDOR_OUTLOOK,
    ):
        return Response(
            {'error': 'proveedor debe ser GMAIL u OUTLOOK.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    redirect_uri = _correo_redirect_uri(request, proveedor)
    try:
        if proveedor == ConfiguracionCapturaCorreo.PROVEEDOR_GMAIL:
            from applications.finanzas.services.captura import oauth_google_mail as oauth

            state = oauth.generar_state(usuario.id)
            url = oauth.generar_auth_url(redirect_uri, state)
        else:
            from applications.finanzas.services.captura import oauth_microsoft as oauth

            state = oauth.generar_state(usuario.id)
            url = oauth.generar_auth_url(redirect_uri, state)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return Response({'auth_url': url, 'proveedor': proveedor})


def _oauth_callback_common(request, *, proveedor: str, oauth_mod):
    from django.shortcuts import redirect as django_redirect

    from applications.espacios.drive_usuario import encrypt_token
    from applications.usuarios.models import Usuario

    frontend_base = getattr(settings, 'FRONTEND_URL', '') or 'http://localhost:5173'
    dest = f'{frontend_base}/configuracion/captura'

    err = request.GET.get('error')
    if err:
        return django_redirect(f'{dest}?correo_oauth_error={err}')

    code = request.GET.get('code')
    state = request.GET.get('state', '')
    if not code:
        return django_redirect(f'{dest}?correo_oauth_error=no_code')

    usuario_id = oauth_mod.validar_state(state)
    if usuario_id is None:
        return django_redirect(f'{dest}?correo_oauth_error=invalid_state')

    try:
        usuario = Usuario.objects.get(pk=usuario_id)
    except Usuario.DoesNotExist:
        return django_redirect(f'{dest}?correo_oauth_error=user_not_found')

    redirect_uri = _correo_redirect_uri(request, proveedor)
    try:
        tokens = oauth_mod.intercambiar_codigo(code, redirect_uri)
        access = tokens.get('access_token', '')
        email = oauth_mod.obtener_email(access) if access else ''
    except ValueError as exc:
        import logging

        logging.getLogger(__name__).warning(
            'OAuth correo token_exchange (%s): %s', proveedor, exc,
        )
        msg = str(exc).lower()
        if 'secret id' in msg or 'guid' in msg or '7000215' in msg or 'invalid_client' in msg:
            err_code = 'invalid_client_secret'
        elif 'redirect' in msg:
            err_code = 'redirect_mismatch'
        else:
            err_code = 'token_exchange'
        return django_redirect(f'{dest}?correo_oauth_error={err_code}')

    config, _ = ConfiguracionCapturaCorreo.objects.get_or_create(usuario=usuario)
    config.proveedor = proveedor
    config.email = email or config.email
    config.refresh_token_enc = encrypt_token(tokens['refresh_token'])
    config.conectado = True
    config.ultimo_error = ''
    config.save(update_fields=[
        'proveedor', 'email', 'refresh_token_enc', 'conectado', 'ultimo_error', 'updated_at',
    ])
    return django_redirect(f'{dest}?correo_oauth=1')


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def captura_correo_oauth_callback_google(request):
    from applications.finanzas.services.captura import oauth_google_mail as oauth

    return _oauth_callback_common(
        request,
        proveedor=ConfiguracionCapturaCorreo.PROVEEDOR_GMAIL,
        oauth_mod=oauth,
    )


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def captura_correo_oauth_callback_microsoft(request):
    from applications.finanzas.services.captura import oauth_microsoft as oauth

    return _oauth_callback_common(
        request,
        proveedor=ConfiguracionCapturaCorreo.PROVEEDOR_OUTLOOK,
        oauth_mod=oauth,
    )


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def captura_correo_probar(request):
    """Valida el token OAuth contra Gmail API / Graph."""
    usuario, espacio, error = _contexto(request)
    if error:
        return error
    if settings.DEMO:
        return respuesta_demo_no_disponible()

    from applications.finanzas.services.captura.mail_ingest import probar_conexion_oauth

    config = ConfiguracionCapturaCorreo.objects.filter(usuario=usuario).first()
    config = _sanear_conexion_correo(config)
    if not _correo_efectivamente_conectado(config):
        return Response(
            {
                'error': (
                    'Conecta Gmail u Outlook con el botón OAuth antes de probar. '
                    'Si ya aparecía “conectado”, era una sesión antigua (IMAP): vuelve a conectar.'
                ),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        probar_conexion_oauth(config)
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'ok': True, 'mensaje': 'Conexión OAuth correcta.'})


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def captura_correo_sincronizar(request):
    """Fuerza ingestión OAuth del correo conectado (ignora intervalo)."""
    usuario, espacio, error = _contexto(request)
    if error:
        return error
    if settings.DEMO:
        return respuesta_demo_no_disponible()

    from applications.finanzas.services.captura.mail_ingest import ingerir_config

    config = ConfiguracionCapturaCorreo.objects.filter(usuario=usuario).first()
    config = _sanear_conexion_correo(config)
    if not _correo_efectivamente_conectado(config):
        return Response(
            {
                'error': (
                    'Conecta Gmail u Outlook en Configuración → Captura '
                    'antes de buscar correos.'
                ),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        stats = ingerir_config(config, force=True, espacio=espacio)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    if stats is None:
        return Response(
            {'error': 'No se pudo sincronizar el correo.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    creados = int(stats.creados)
    duplicados = int(getattr(stats, 'duplicados', 0) or 0)
    reutilizados = int(getattr(stats, 'reutilizados', 0) or 0)
    if creados == 0 and duplicados > 0 and reutilizados == 0:
        mensaje = (
            'Se encontró un correo ya registrado como movimiento '
            '(marcado duplicado; no aparece en pendientes).'
        )
    elif creados == 0 and reutilizados > 0:
        mensaje = 'Sin nuevos pendientes (correo ya procesado).'
    elif creados == 0:
        mensaje = 'Sin nuevos pendientes desde el correo.'
    elif creados == 1:
        mensaje = 'Se creó 1 pendiente desde el correo.'
    else:
        mensaje = f'Se crearon {creados} pendientes desde el correo.'

    return Response({
        'ok': True,
        'creados': creados,
        'duplicados': duplicados,
        'reutilizados': reutilizados,
        'skip_remitente': int(stats.skip_remitente),
        'skip_parseo': int(stats.skip_parseo),
        'errores': int(stats.errores),
        'mensaje': mensaje,
        'config': _serializar_config_correo(config),
    })


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def captura_correo_desconectar(request):
    usuario, espacio, error = _contexto(request)
    if error:
        return error
    if settings.DEMO:
        return respuesta_demo_no_disponible()

    config = ConfiguracionCapturaCorreo.objects.filter(usuario=usuario).first()
    if config is None:
        return Response(_serializar_config_correo(None))

    config.refresh_token_enc = ''
    config.conectado = False
    config.email = ''
    config.ultimo_error = ''
    config.save(update_fields=[
        'refresh_token_enc', 'conectado', 'email', 'ultimo_error', 'updated_at',
    ])
    return Response(_serializar_config_correo(config))
