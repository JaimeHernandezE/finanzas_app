# applications/utils.py

from django.conf import settings
from firebase_admin import auth as firebase_auth
from rest_framework import status
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from applications.usuarios.models import Usuario


def _usuario_desde_jwt_demo(token: str):
    access = AccessToken(token)
    uid = access['user_id']
    return Usuario.objects.select_related('familia').get(pk=uid)


def get_usuario_autenticado(request):
    """
    Verifica Authorization: Bearer.

    - Si DEMO=True: token SimpleJWT (AccessToken) → Usuario.
    - Si no: token Firebase ID → Usuario por email.

    Retorna (usuario, None) si es válido.
    Retorna (None, Response con error) si es inválido.
    """
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None, Response(
            {'error': 'Token no proporcionado.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    token = auth_header.split('Bearer ')[1].strip()

    if getattr(settings, 'DEMO', False):
        try:
            usuario = _usuario_desde_jwt_demo(token)
        except (TokenError, KeyError, Usuario.DoesNotExist):
            return None, Response(
                {'error': 'Token inválido o expirado.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if not usuario.activo:
            return None, Response(
                {
                    'error': (
                        'Tu cuenta está deshabilitada. Contacta al administrador de la familia '
                        'para que la vuelva a habilitar.'
                    ),
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        return usuario, None

    try:
        decoded = firebase_auth.verify_id_token(token)
        email = decoded.get('email')
        usuario = Usuario.objects.select_related('familia').get(email=email)
    except Usuario.DoesNotExist:
        return None, Response(
            {'error': 'Usuario no registrado.'},
            status=status.HTTP_404_NOT_FOUND,
        )
    except Exception as e:
        return None, Response(
            {'error': f'Token inválido: {str(e)}'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if not usuario.activo:
        return None, Response(
            {
                'error': (
                    'Tu cuenta está deshabilitada. Contacta al administrador de la familia '
                    'para que la vuelva a habilitar.'
                ),
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    return usuario, None
