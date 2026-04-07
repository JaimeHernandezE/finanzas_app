# applications/utils.py

import hashlib
import logging

from django.conf import settings
from django.core.cache import cache
from firebase_admin import auth as firebase_auth
from rest_framework import status
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

from applications.usuarios.models import Usuario

logger = logging.getLogger(__name__)

# Cache corta para evitar revalidar el mismo Firebase ID token en ráfagas
# (pantalla que dispara varias llamadas al cargar). Reduce latencia y presión
# sobre el worker único en Render free.
_FIREBASE_VERIFY_CACHE_SECONDS = 120


def _usuario_desde_jwt_demo(token: str):
    access = AccessToken(token)
    uid = access['user_id']
    return Usuario.objects.select_related('familia').get(pk=uid)


def _cache_key_firebase_token(token: str) -> str:
    digest = hashlib.sha256(token.encode('utf-8')).hexdigest()
    return f'firebase_verified:{digest}'


def _verify_id_token_cached(token: str) -> dict:
    key = _cache_key_firebase_token(token)
    cached = cache.get(key)
    if cached:
        return cached
    decoded = firebase_auth.verify_id_token(token, clock_skew_seconds=60)
    cache.set(key, decoded, timeout=_FIREBASE_VERIFY_CACHE_SECONDS)
    return decoded


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
        decoded = _verify_id_token_cached(token)
        email = decoded.get('email')
        usuario = Usuario.objects.select_related('familia').get(email=email)
    except Usuario.DoesNotExist:
        return None, Response(
            {'error': 'Usuario no registrado.'},
            status=status.HTTP_404_NOT_FOUND,
        )
    except Exception as e:
        logger.warning('Error verificando token Firebase: %s', e)
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
