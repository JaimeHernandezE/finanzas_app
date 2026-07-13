import logging
import zoneinfo

from django.conf import settings
from django.db import IntegrityError, transaction
from firebase_admin import auth as firebase_auth
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken


class DemoLoginThrottle(AnonRateThrottle):
    scope = 'demo_login'


class RegistroThrottle(AnonRateThrottle):
    scope = 'registro'

from applications import utils as utils_auth
from applications.demo_guard import respuesta_demo_no_disponible
from .demo_constants import DEMO_EMAIL_GLORI, DEMO_EMAIL_JAIME
from .miembro_salida import puede_quitar_miembro_familia
from applications.espacios.models import PertenenciaEspacio, Espacio
from applications.espacios.services import espacio_para_familia, obtener_espacio_familiar_activo
from .salida_familia import puede_salir_de_familia, salir_de_familia
from .models import Usuario, Familia, InvitacionPendiente

_ZONAS_VALIDAS = zoneinfo.available_timezones()
MAX_ESPACIOS_FAMILIARES_POR_USUARIO = 5

logger = logging.getLogger(__name__)
FIREBASE_CLOCK_SKEW_SECONDS = 60


def obtener_usuario_desde_token(request):
    """
    Extrae y verifica el token Firebase del header Authorization.
    Retorna el usuario Django o None si el token es inválido.
    """
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None, 'Token no proporcionado'

    token = auth_header.split('Bearer ')[1]

    try:
        decoded = firebase_auth.verify_id_token(
            token,
            clock_skew_seconds=FIREBASE_CLOCK_SKEW_SECONDS,
        )
        return decoded, None
    except Exception as e:
        logger.warning('Firebase token verification failed: %s', e, exc_info=True)
        return None, str(e)


def _pertenencia_miembro_espacio(espacio, usuario_id: int) -> PertenenciaEspacio | None:
    """Pertenencia activa de un usuario en el espacio familiar dado."""
    return (
        PertenenciaEspacio.objects
        .select_related('usuario')
        .filter(espacio=espacio, usuario_id=usuario_id, activo=True)
        .first()
    )


def _payload_me(usuario: Usuario, decoded: dict | None = None):
    espacio_familiar = obtener_espacio_familiar_activo(usuario)
    pertenencias = (
        PertenenciaEspacio.objects
        .select_related('espacio')
        .filter(usuario=usuario, activo=True, espacio__activo=True)
        .order_by('espacio__tipo', 'espacio__nombre')
    )
    espacios = [
        {
            'id': p.espacio_id,
            'nombre': p.espacio.nombre,
            'tipo': p.espacio.tipo,
            'modo_reparto': p.espacio.modo_reparto,
            'archivado': p.espacio.archivado,
            'rol': p.rol,
        }
        for p in pertenencias
    ]
    return {
        'id': usuario.id,
        'email': usuario.email,
        'nombre': usuario.get_full_name() or usuario.username,
        'rol': usuario.rol,
        'activo': usuario.activo,
        'foto': (decoded or {}).get('picture'),
        'familia': {
            'id': espacio_familiar.id,
            'nombre': espacio_familiar.nombre,
        } if espacio_familiar else None,
        'espacios': espacios,
        'idioma_ui': usuario.idioma_ui,
        'moneda_display': usuario.moneda_display,
        'zona_horaria': usuario.zona_horaria,
    }


def _patch_me_perfil(usuario: Usuario, request, decoded: dict | None, *, es_demo: bool) -> Response:
    """Actualiza nombre y/o preferencias de UI. En demo, el nombre está bloqueado."""
    update_fields = []

    if 'nombre' in request.data:
        if es_demo:
            return Response(
                {'error': 'En modo demo no se puede cambiar el nombre.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        nombre_raw = (request.data.get('nombre') or '').strip()
        if not nombre_raw:
            return Response(
                {'error': 'El nombre no puede estar vacío.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        partes = nombre_raw.split(maxsplit=1)
        usuario.first_name = partes[0][:150]
        usuario.last_name = (partes[1] if len(partes) > 1 else '')[:150]
        update_fields += ['first_name', 'last_name']

    if 'idioma_ui' in request.data:
        idioma = request.data['idioma_ui']
        codigos_validos = dict(Usuario.IDIOMA_CHOICES)
        if idioma not in codigos_validos:
            return Response(
                {'error': f'Idioma inválido. Opciones: {list(codigos_validos.keys())}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        usuario.idioma_ui = idioma
        update_fields.append('idioma_ui')

    if 'moneda_display' in request.data:
        moneda = request.data['moneda_display']
        codigos_validos = dict(Usuario.MONEDA_CHOICES)
        if moneda not in codigos_validos:
            return Response(
                {'error': f'Moneda inválida. Opciones: {list(codigos_validos.keys())}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        usuario.moneda_display = moneda
        update_fields.append('moneda_display')

    if 'zona_horaria' in request.data:
        zona = request.data['zona_horaria']
        if zona not in _ZONAS_VALIDAS:
            return Response(
                {
                    'error': (
                        'Zona horaria inválida. Debe ser un identificador IANA válido '
                        '(ej: America/Santiago).'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        usuario.zona_horaria = zona
        update_fields.append('zona_horaria')

    if not update_fields:
        return Response(
            {'error': 'No se proporcionó ningún campo para actualizar.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    usuario.save(update_fields=update_fields)
    return Response(_payload_me(usuario, decoded))


@api_view(['GET', 'PATCH'])
@authentication_classes([])  # Firebase ID token o JWT SimpleJWT si DEMO=True
@permission_classes([AllowAny])
def me(request):
    """
    Verifica el token (Firebase o JWT en DEMO) y retorna el usuario registrado.
    Si el email no está registrado en ninguna familia → 404.
    Si el email existe → 200 con datos del usuario.
    """
    if getattr(settings, 'DEMO', False):
        usuario, err = utils_auth.get_usuario_autenticado(request)
        if err:
            return err
        if request.method == 'PATCH':
            return _patch_me_perfil(usuario, request, None, es_demo=True)
        return Response(_payload_me(usuario, None))

    decoded, error = obtener_usuario_desde_token(request)
    if error:
        print(f'[Firebase] /me/ 401: {error}')
        return Response({'error': error}, status=status.HTTP_401_UNAUTHORIZED)

    email = (decoded.get('email') or '').strip()
    uid = decoded.get('uid')
    if not email:
        logger.warning('/me: token Firebase sin email (uid=%r)', uid)
        return Response(
            {'error': 'El token autenticado no contiene email.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        candidatos = list(Usuario.objects.filter(email__iexact=email)[:5])
        if not candidatos:
            raise Usuario.DoesNotExist()

        # Si hay más de un registro para el mismo correo, intenta elegir por UID.
        # Evita un 500 por datos históricos inconsistentes y deja trazabilidad en logs.
        if len(candidatos) > 1:
            coincidencias_uid = [u for u in candidatos if u.firebase_uid == uid]
            if len(coincidencias_uid) == 1:
                usuario = coincidencias_uid[0]
            else:
                logger.error(
                    '/me: múltiples usuarios para email=%r (uid=%r, total=%s)',
                    email,
                    uid,
                    len(candidatos),
                )
                return Response(
                    {
                        'error': (
                            'Se detectaron datos inconsistentes para este correo. '
                            'Contacta al administrador.'
                        ),
                    },
                    status=status.HTTP_409_CONFLICT,
                )
        else:
            usuario = candidatos[0]

        if not usuario.activo:
            return Response(
                {
                    'error': (
                        'Tu cuenta está deshabilitada. Contacta al administrador de la familia '
                        'para que la vuelva a habilitar.'
                    ),
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if usuario.firebase_uid != uid:
            usuario.firebase_uid = uid
            try:
                usuario.save(update_fields=['firebase_uid'])
            except IntegrityError:
                logger.error(
                    '/me: conflicto al actualizar firebase_uid para email=%r (uid=%r)',
                    email,
                    uid,
                    exc_info=True,
                )
                return Response(
                    {
                        'error': (
                            'No fue posible vincular tu cuenta con Firebase por un conflicto '
                            'de datos. Contacta al administrador.'
                        ),
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        if request.method == 'PATCH':
            return _patch_me_perfil(usuario, request, decoded, es_demo=False)

        return Response(_payload_me(usuario, decoded))

    except Usuario.DoesNotExist:
        return Response(
            {'error': 'Usuario no registrado en ninguna familia.'},
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception:
        logger.exception('/me: error inesperado (email=%r, uid=%r)', email, uid)
        return Response(
            {'error': 'Error interno al obtener perfil de usuario.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([DemoLoginThrottle])
def demo_login(request):
    """
    Login sin Firebase cuando DEMO=True. Body: { "usuario": "jaime" | "glori" }.
    """
    if not getattr(settings, 'DEMO', False):
        return Response(
            {'error': 'Solo disponible en modo demo.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    slug = (request.data.get('usuario') or '').strip().lower()
    if slug == 'jaime':
        email = DEMO_EMAIL_JAIME
    elif slug in ('glori', 'gloria'):
        email = DEMO_EMAIL_GLORI
    else:
        return Response(
            {'error': 'Usuario demo inválido. Usa "jaime" o "glori".'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        candidatos = list(Usuario.objects.filter(email__iexact=email)[:2])
        if len(candidatos) > 1:
            logger.error(
                'demo_login: varios usuarios con email %r (esperado 1). Revisa datos o vuelve a seed_demo.',
                email,
            )
            return Response(
                {'error': 'Datos demo inconsistentes (correo duplicado). Contacta al administrador.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        usuario = candidatos[0] if candidatos else None
        if usuario is None:
            return Response(
                {'error': 'Demo no disponible. Ejecuta python manage.py seed_demo.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        refresh = RefreshToken.for_user(usuario)
        usuario_payload = _payload_me(usuario, None)
        usuario_payload['es_demo'] = True
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'usuario': usuario_payload,
        })
    except Exception:
        logger.exception('demo_login: error al emitir JWT o construir respuesta (email=%r)', email)
        return Response(
            {'error': 'Error interno al iniciar sesión demo. Revisa los logs del servidor.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['POST'])
@authentication_classes([])  # No usar JWT de Django; esta vista valida el token de Firebase
@permission_classes([AllowAny])
@throttle_classes([RegistroThrottle])
def registrar_usuario(request):
    """
    Crea un usuario nuevo con token Firebase válido.
    Primer usuario del sistema: crea Familia, espacio FAMILIAR y pertenencia ADMIN.
    Con invitación pendiente: crea el usuario y su pertenencia al espacio invitado.
    Con REQUIRE_VERIFIED_EMAIL=true exige email verificado en Firebase
    (candado Fase 0: activar antes de abrir registro a terceros).
    """
    if getattr(settings, 'DEMO', False):
        return respuesta_demo_no_disponible()
    decoded, error = obtener_usuario_desde_token(request)
    if error:
        return Response({'error': error}, status=status.HTTP_401_UNAUTHORIZED)

    if utils_auth.env_flag('REQUIRE_VERIFIED_EMAIL') and not decoded.get('email_verified'):
        return Response(
            {'error': 'Debes verificar tu correo antes de registrarte. Revisa tu bandeja de entrada.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    email = (decoded.get('email') or '').strip()
    uid = decoded.get('uid')
    nombre = decoded.get('name') or (email.split('@')[0].capitalize() if email else 'Usuario')

    existente = Usuario.objects.filter(email__iexact=email).first()
    if existente:
        if existente.firebase_uid != uid:
            existente.firebase_uid = uid
            existente.save(update_fields=['firebase_uid'])
        body = _payload_me(existente, decoded)
        body['creado'] = False
        return Response(body, status=status.HTTP_200_OK)

    invitaciones_correo = (
        InvitacionPendiente.objects
        .filter(email__iexact=email)
        .select_related('espacio')
    )
    if invitaciones_correo.exists():
        inv = invitaciones_correo.first()
        usuario = Usuario.objects.create(
            username=email,
            email=email,
            firebase_uid=uid,
            first_name=(nombre or email)[:150],
            rol='MIEMBRO',
        )
        PertenenciaEspacio.objects.create(
            usuario=usuario,
            espacio=inv.espacio,
            rol=PertenenciaEspacio.ROL_MIEMBRO,
        )
        body = _payload_me(usuario, decoded)
        body['creado'] = True
        return Response(body, status=status.HTTP_201_CREATED)

    if not Usuario.objects.exists():
        with transaction.atomic():
            familia = Familia.objects.create(nombre='Mi familia')
            espacio = espacio_para_familia(familia)
            usuario = Usuario.objects.create(
                username=email,
                email=email,
                firebase_uid=uid,
                first_name=(nombre or email)[:150],
                rol='ADMIN',
            )
            PertenenciaEspacio.objects.create(
                usuario=usuario,
                espacio=espacio,
                rol=PertenenciaEspacio.ROL_ADMIN,
            )
        body = _payload_me(usuario, decoded)
        body['creado'] = True
        return Response(body, status=status.HTTP_201_CREATED)

    return Response(
        {
            'error': (
                'No hay invitación pendiente para este correo. '
                'Pide a un administrador que te invite desde Configuración → Miembros.'
            )
        },
        status=status.HTTP_403_FORBIDDEN,
    )


def _normalizar_email(s: str) -> str:
    return (s or '').strip().lower()


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def auth_check_email(request):
    email = _normalizar_email(request.data.get('email', ''))
    if not email or '@' not in email:
        return Response({'error': 'Email inválido.'}, status=status.HTTP_400_BAD_REQUEST)

    if getattr(settings, 'DEMO', False):
        return Response({
            'exists': False,
            'has_password': False,
            'requires_linking': False,
            'providers': [],
        })

    try:
        user_record = firebase_auth.get_user_by_email(email)
        provider_ids = sorted(
            {p.provider_id for p in (user_record.provider_data or []) if getattr(p, 'provider_id', None)}
        )
        has_password = 'password' in provider_ids
        has_google = 'google.com' in provider_ids
        return Response({
            'exists': True,
            'has_password': has_password,
            'requires_linking': has_google and not has_password,
            'providers': provider_ids,
        })
    except firebase_auth.UserNotFoundError:
        return Response({
            'exists': False,
            'has_password': False,
            'requires_linking': False,
            'providers': [],
        })
    except Exception as e:
        logger.warning('Email check failed for %s: %s', email, e, exc_info=True)
        return Response(
            {'error': 'No se pudo validar el correo en este momento.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def familia_miembros(request):
    usuario, err = utils_auth.get_usuario_autenticado(request)
    if err:
        return err
    espacio = obtener_espacio_familiar_activo(usuario)
    if espacio is None:
        return Response([])
    pertenencias = (
        PertenenciaEspacio.objects
        .filter(espacio=espacio, activo=True)
        .select_related('usuario')
        .order_by('usuario__first_name', 'usuario__email')
    )
    return Response([
        {
            'id': p.usuario.id,
            'email': p.usuario.email,
            'nombre': p.usuario.get_full_name() or p.usuario.username,
            'rol': p.usuario.rol,
            'activo': p.usuario.activo,
            'puede_quitar': puede_quitar_miembro_familia(
                usuario.id, usuario.rol, p.usuario.id, p.usuario.rol, espacio.id
            )[0],
            'puede_cambiar_activo': usuario.rol == 'ADMIN' and p.usuario.id != usuario.id,
        }
        for p in pertenencias
    ])


@api_view(['PATCH'])
@authentication_classes([])
@permission_classes([AllowAny])
def miembro_actualizar_rol(request, pk):
    if getattr(settings, 'DEMO', False):
        return respuesta_demo_no_disponible()
    usuario, err = utils_auth.get_usuario_autenticado(request)
    if err:
        return err
    if usuario.rol != 'ADMIN':
        return Response(
            {'error': 'Solo un administrador puede cambiar roles.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    espacio = obtener_espacio_familiar_activo(usuario)
    if espacio is None:
        return Response({'error': 'Sin familia asignada.'}, status=status.HTTP_400_BAD_REQUEST)
    pertenencia_otro = _pertenencia_miembro_espacio(espacio, pk)
    if pertenencia_otro is None:
        return Response({'error': 'Miembro no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
    otro = pertenencia_otro.usuario
    nuevo = request.data.get('rol')
    if nuevo not in dict(Usuario.ROL_CHOICES):
        return Response({'error': 'Rol inválido.'}, status=status.HTTP_400_BAD_REQUEST)
    if otro.rol == 'ADMIN' and nuevo != 'ADMIN':
        otros_admins = (
            PertenenciaEspacio.objects
            .filter(espacio=espacio, rol=PertenenciaEspacio.ROL_ADMIN, activo=True)
            .exclude(usuario=otro)
        )
        if not otros_admins.exists():
            return Response(
                {'error': 'Debe existir al menos un administrador en la familia.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
    otro.rol = nuevo
    otro.save(update_fields=['rol'])
    rol_pertenencia = (
        PertenenciaEspacio.ROL_ADMIN if nuevo == 'ADMIN' else PertenenciaEspacio.ROL_MIEMBRO
    )
    if pertenencia_otro.rol != rol_pertenencia:
        pertenencia_otro.rol = rol_pertenencia
        pertenencia_otro.save(update_fields=['rol'])
    return Response({
        'id': otro.id,
        'email': otro.email,
        'nombre': otro.get_full_name() or otro.username,
        'rol': otro.rol,
        'activo': otro.activo,
    })


@api_view(['PATCH'])
@authentication_classes([])
@permission_classes([AllowAny])
def miembro_actualizar_activo(request, pk):
    """
    Habilita o deshabilita un miembro (solo ADMIN, no sobre uno mismo).
    Los deshabilitados no usan la API y no entran en el prorrateo del mes actual ni futuros.
    """
    if getattr(settings, 'DEMO', False):
        return respuesta_demo_no_disponible()
    usuario, err = utils_auth.get_usuario_autenticado(request)
    if err:
        return err
    if usuario.rol != 'ADMIN':
        return Response(
            {'error': 'Solo un administrador puede habilitar o deshabilitar miembros.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    espacio = obtener_espacio_familiar_activo(usuario)
    if espacio is None:
        return Response({'error': 'Sin familia asignada.'}, status=status.HTTP_400_BAD_REQUEST)
    if pk == usuario.id:
        return Response(
            {'error': 'No puedes deshabilitarte ni habilitarte a ti mismo desde aquí.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    pertenencia_otro = _pertenencia_miembro_espacio(espacio, pk)
    if pertenencia_otro is None:
        return Response({'error': 'Miembro no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
    otro = pertenencia_otro.usuario

    activo_raw = request.data.get('activo')
    if not isinstance(activo_raw, bool):
        return Response(
            {'error': 'El campo "activo" debe ser true o false.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if activo_raw == otro.activo:
        return Response({
            'id': otro.id,
            'email': otro.email,
            'nombre': otro.get_full_name() or otro.username,
            'rol': otro.rol,
            'activo': otro.activo,
        })

    if not activo_raw:
        otros_activos = (
            PertenenciaEspacio.objects
            .filter(espacio=espacio, activo=True, usuario__activo=True)
            .exclude(usuario=otro)
        )
        if not otros_activos.exists():
            return Response(
                {'error': 'Debe quedar al menos un miembro habilitado en la familia.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if otro.rol == 'ADMIN':
            otros_admins = (
                PertenenciaEspacio.objects
                .filter(
                    espacio=espacio,
                    rol=PertenenciaEspacio.ROL_ADMIN,
                    activo=True,
                    usuario__activo=True,
                )
                .exclude(usuario=otro)
            )
            if not otros_admins.exists():
                return Response(
                    {'error': 'Debe quedar al menos un administrador habilitado.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

    otro.activo = activo_raw
    otro.save(update_fields=['activo'])
    return Response({
        'id': otro.id,
        'email': otro.email,
        'nombre': otro.get_full_name() or otro.username,
        'rol': otro.rol,
        'activo': otro.activo,
    })


@api_view(['DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def miembro_eliminar(request, pk):
    """
    Quita un usuario del espacio familiar. Solo sin datos asociados
    ni violar regla de administradores; solo ADMIN.
    """
    if getattr(settings, 'DEMO', False):
        return respuesta_demo_no_disponible()
    usuario, err = utils_auth.get_usuario_autenticado(request)
    if err:
        return err
    espacio = obtener_espacio_familiar_activo(usuario)
    if espacio is None:
        return Response(
            {'error': 'Sin familia asignada.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    pertenencia_otro = _pertenencia_miembro_espacio(espacio, pk)
    if pertenencia_otro is None:
        return Response(
            {'error': 'Miembro no encontrado.'},
            status=status.HTTP_404_NOT_FOUND,
        )
    otro = pertenencia_otro.usuario
    ok, msg = puede_quitar_miembro_familia(
        usuario.id, usuario.rol, otro.id, otro.rol, espacio.id
    )
    if not ok:
        return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)
    pertenencia_otro.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def familia_salir(request):
    """
    GET  → Verifica si el usuario puede salir de la familia (pre-check).
    POST → Ejecuta la salida: copia datos al espacio personal, disuelve
           la familia si quedan ≤1 miembros.
    """
    if getattr(settings, 'DEMO', False):
        return respuesta_demo_no_disponible()
    usuario, err = utils_auth.get_usuario_autenticado(request)
    if err:
        return err
    if obtener_espacio_familiar_activo(usuario) is None:
        return Response(
            {'error': 'El usuario no pertenece a una familia.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if request.method == 'GET':
        ok, msg = puede_salir_de_familia(usuario)
        return Response({'puede_salir': ok, 'motivo': msg})

    try:
        resultado = salir_de_familia(usuario)
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(resultado)


@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def familia_invitaciones(request):
    usuario, err = utils_auth.get_usuario_autenticado(request)
    if err:
        return err
    espacio = obtener_espacio_familiar_activo(usuario)
    if espacio is None:
        return Response({'error': 'Sin familia.'}, status=status.HTTP_400_BAD_REQUEST)

    if request.method == 'GET':
        qs = InvitacionPendiente.objects.filter(espacio=espacio).order_by('-created_at')
        return Response([
            {
                'id': i.id,
                'email': i.email,
                'fecha_envio': i.created_at.date().isoformat(),
            }
            for i in qs
        ])

    if getattr(settings, 'DEMO', False):
        return respuesta_demo_no_disponible()

    if usuario.rol != 'ADMIN':
        return Response(
            {'error': 'Solo un administrador puede invitar miembros.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    email = _normalizar_email(request.data.get('email', ''))
    if not email or '@' not in email:
        return Response({'error': 'Email inválido.'}, status=status.HTTP_400_BAD_REQUEST)
    if PertenenciaEspacio.objects.filter(
        espacio=espacio, activo=True, usuario__email__iexact=email,
    ).exists():
        return Response({'error': 'Ese correo ya es miembro de la familia.'}, status=status.HTTP_400_BAD_REQUEST)
    inv, created = InvitacionPendiente.objects.get_or_create(
        espacio=espacio,
        email=email,
        defaults={'invitador': usuario},
    )
    if not created:
        return Response(
            {'error': 'Ya existe una invitación pendiente para ese correo.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(
        {
            'id': inv.id,
            'email': inv.email,
            'fecha_envio': inv.created_at.date().isoformat(),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(['GET', 'HEAD'])
@permission_classes([AllowAny])
def configuracion_global(request):
    """
    Retorna la configuración global de la app: zona horaria, moneda, formato.
    No requiere autenticación — se consume antes del login.

    Si el cliente envía un Bearer válido, zona_horaria refleja ``Usuario.zona_horaria``
    (preferencia IANA del modelo); si no, se usa ``TIME_ZONE`` del proyecto.

    En el futuro este endpoint puede incluir el tipo de cambio
    obtenido de una API externa (ej: mindicador.cl para CLP/USD).
    """
    zona_horaria = settings.TIME_ZONE
    usuario_opt = utils_auth.obtener_usuario_opcional(request)
    if usuario_opt is not None and (usuario_opt.zona_horaria or '').strip():
        zona_horaria = usuario_opt.zona_horaria.strip()

    return Response({
        'zona_horaria': zona_horaria,
        'es_demo': getattr(settings, 'DEMO', False),
        'moneda': {
            'codigo':              settings.MONEDA_BASE,
            'simbolo':             settings.MONEDA_SIMBOLO,
            'decimales':           settings.MONEDA_DECIMALES,
            'separador_miles':     settings.MONEDA_SEPARADOR_MILES,
            'separador_decimales': settings.MONEDA_SEPARADOR_DECIMALES,
        },
    })


@api_view(['DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def familia_invitacion_eliminar(request, pk):
    if getattr(settings, 'DEMO', False):
        return respuesta_demo_no_disponible()
    usuario, err = utils_auth.get_usuario_autenticado(request)
    if err:
        return err
    if usuario.rol != 'ADMIN':
        return Response(
            {'error': 'Solo un administrador puede revocar invitaciones.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    espacio = obtener_espacio_familiar_activo(usuario)
    if espacio is None:
        return Response({'error': 'Invitación no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
    try:
        inv = InvitacionPendiente.objects.get(pk=pk, espacio=espacio)
    except InvitacionPendiente.DoesNotExist:
        return Response({'error': 'Invitación no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
    inv.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def invitaciones_recibidas_list(request):
    """
    Invitaciones pendientes dirigidas al correo del usuario autenticado.
    Solo relevante mientras el usuario no tiene espacio familiar activo.
    """
    usuario, err = utils_auth.get_usuario_autenticado(request)
    if err:
        return err
    if obtener_espacio_familiar_activo(usuario) is not None:
        return Response([])
    qs = (
        InvitacionPendiente.objects.filter(email__iexact=usuario.email)
        .select_related('espacio', 'invitador')
        .order_by('-created_at')
    )
    return Response([
        {
            'id': i.id,
            'familia': {'id': i.espacio.id, 'nombre': i.espacio.nombre},
            'fecha_envio': i.created_at.date().isoformat(),
            'invitador_nombre': i.invitador.get_full_name() or i.invitador.username,
        }
        for i in qs
    ])


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def invitacion_recibida_aceptar(request, pk):
    if getattr(settings, 'DEMO', False):
        return respuesta_demo_no_disponible()
    usuario, err = utils_auth.get_usuario_autenticado(request)
    if err:
        return err
    if obtener_espacio_familiar_activo(usuario) is not None:
        return Response(
            {'error': 'Ya perteneces a una familia.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        inv = InvitacionPendiente.objects.select_related('espacio').get(
            pk=pk,
            email__iexact=usuario.email,
        )
    except InvitacionPendiente.DoesNotExist:
        return Response(
            {'error': 'Invitación no encontrada.'},
            status=status.HTTP_404_NOT_FOUND,
        )
    n_familiares = PertenenciaEspacio.objects.filter(
        usuario=usuario,
        activo=True,
        espacio__tipo=Espacio.TIPO_FAMILIAR,
    ).count()
    if n_familiares >= MAX_ESPACIOS_FAMILIARES_POR_USUARIO:
        return Response(
            {'error': f'Límite de {MAX_ESPACIOS_FAMILIARES_POR_USUARIO} espacios familiares alcanzado.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    PertenenciaEspacio.objects.get_or_create(
        usuario=usuario,
        espacio=inv.espacio,
        defaults={'rol': PertenenciaEspacio.ROL_MIEMBRO},
    )
    if usuario.rol != 'MIEMBRO':
        usuario.rol = 'MIEMBRO'
        usuario.save(update_fields=['rol'])
    InvitacionPendiente.objects.filter(email__iexact=usuario.email).delete()
    return Response(_payload_me(usuario, None))


@api_view(['DELETE'])
@authentication_classes([])
@permission_classes([AllowAny])
def invitacion_recibida_rechazar(request, pk):
    if getattr(settings, 'DEMO', False):
        return respuesta_demo_no_disponible()
    usuario, err = utils_auth.get_usuario_autenticado(request)
    if err:
        return err
    if obtener_espacio_familiar_activo(usuario) is not None:
        return Response(
            {'error': 'Ya perteneces a una familia.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        inv = InvitacionPendiente.objects.get(pk=pk, email__iexact=usuario.email)
    except InvitacionPendiente.DoesNotExist:
        return Response(
            {'error': 'Invitación no encontrada.'},
            status=status.HTTP_404_NOT_FOUND,
        )
    inv.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
