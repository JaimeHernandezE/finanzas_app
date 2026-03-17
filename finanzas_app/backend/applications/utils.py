# applications/utils.py

from firebase_admin import auth as firebase_auth
from applications.usuarios.models import Usuario
from rest_framework.response import Response
from rest_framework import status


def get_usuario_autenticado(request):
    """
    Verifica el token Firebase del header Authorization y retorna
    el usuario Django correspondiente.

    Retorna (usuario, None) si es válido.
    Retorna (None, Response con error) si es inválido.
    """
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None, Response(
            {'error': 'Token no proporcionado.'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    token = auth_header.split('Bearer ')[1]

    try:
        decoded = firebase_auth.verify_id_token(token)
        email = decoded.get('email')
        usuario = Usuario.objects.select_related('familia').get(email=email)
        return usuario, None

    except Usuario.DoesNotExist:
        return None, Response(
            {'error': 'Usuario no registrado.'},
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        return None, Response(
            {'error': f'Token inválido: {str(e)}'},
            status=status.HTTP_401_UNAUTHORIZED
        )
