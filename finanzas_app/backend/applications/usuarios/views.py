import logging

from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from firebase_admin import auth as firebase_auth
from .models import Usuario, Familia

logger = logging.getLogger(__name__)


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
        decoded = firebase_auth.verify_id_token(token)
        return decoded, None
    except Exception as e:
        logger.warning('Firebase token verification failed: %s', e, exc_info=True)
        return None, str(e)


@api_view(['GET'])
@authentication_classes([])  # No usar JWT de Django; esta vista valida el token de Firebase
@permission_classes([AllowAny])
def me(request):
    """
    Verifica el token Firebase y retorna el usuario registrado.
    Si el email no está registrado en ninguna familia → 404.
    Si el email existe → 200 con datos del usuario.
    """
    decoded, error = obtener_usuario_desde_token(request)
    if error:
        print(f'[Firebase] /me/ 401: {error}')
        return Response({'error': error}, status=status.HTTP_401_UNAUTHORIZED)

    email = decoded.get('email')
    uid = decoded.get('uid')

    try:
        usuario = Usuario.objects.select_related('familia').get(email=email)

        if usuario.firebase_uid != uid:
            usuario.firebase_uid = uid
            usuario.save(update_fields=['firebase_uid'])

        return Response({
            'id': usuario.id,
            'email': usuario.email,
            'nombre': usuario.get_full_name() or usuario.username,
            'rol': usuario.rol,
            'foto': decoded.get('picture'),
            'familia': {
                'id': usuario.familia.id,
                'nombre': usuario.familia.nombre,
            } if usuario.familia else None,
        })

    except Usuario.DoesNotExist:
        return Response(
            {'error': 'Usuario no registrado en ninguna familia.'},
            status=status.HTTP_404_NOT_FOUND
        )


@api_view(['POST'])
@authentication_classes([])  # No usar JWT de Django; esta vista valida el token de Firebase
@permission_classes([AllowAny])
def registrar_usuario(request):
    """
    Crea un usuario nuevo a partir de un token Firebase válido.
    Solo funciona si existe una invitación pendiente para ese email.
    Por ahora crea el usuario directamente (TODO: validar invitación).
    """
    decoded, error = obtener_usuario_desde_token(request)
    if error:
        return Response({'error': error}, status=status.HTTP_401_UNAUTHORIZED)

    email = decoded.get('email')
    uid = decoded.get('uid')
    nombre = decoded.get('name', email.split('@')[0].capitalize())

    familia = Familia.objects.first()
    if not familia:
        familia = Familia.objects.create(nombre='Mi familia')

    usuario, creado = Usuario.objects.get_or_create(
        email=email,
        defaults={
            'username': email,
            'firebase_uid': uid,
            'first_name': nombre,
            'familia': familia,
            'rol': 'ADMIN' if not Usuario.objects.filter(familia=familia).exists() else 'MIEMBRO',
        }
    )
    if not creado and usuario.firebase_uid != uid:
        usuario.firebase_uid = uid
        usuario.save(update_fields=['firebase_uid'])

    return Response({
        'id': usuario.id,
        'email': usuario.email,
        'nombre': usuario.get_full_name() or usuario.username,
        'rol': usuario.rol,
        'creado': creado,
    }, status=status.HTTP_201_CREATED if creado else status.HTTP_200_OK)
