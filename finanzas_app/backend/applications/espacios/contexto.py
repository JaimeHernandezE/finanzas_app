# Resolución del espacio activo por request (Fases 1–2 del plan).
#
# Reglas (ver docs/PLAN-MULTITENANT-Y-ENTORNO-A-B.md, Fase 2):
# - Sin header X-Espacio-Id → espacio por defecto del usuario: su espacio
#   FAMILIAR activo si tiene membresía, sino su espacio personal. Esto mantiene
#   compatibles a los clientes ya desplegados (móvil/web) que no envían el
#   header: para un usuario con familia el comportamiento es idéntico al actual.
# - Header inválido o sin membresía activa → 403 explícito. NUNCA degradar
#   silenciosamente a otro espacio: una escritura que cae al tenant equivocado
#   es corrupción de datos.

from rest_framework import status
from rest_framework.response import Response

from applications import utils as utils_auth

from .models import Espacio, PertenenciaEspacio
from .services import obtener_espacio_personal

HEADER_ESPACIO = 'X-Espacio-Id'


def _espacio_por_defecto(usuario):
    """Espacio FAMILIAR activo si el usuario tiene membresía; sino el personal."""
    pertenencia = (
        PertenenciaEspacio.objects
        .select_related('espacio')
        .filter(
            usuario=usuario,
            activo=True,
            espacio__activo=True,
            espacio__archivado=False,
            espacio__tipo=Espacio.TIPO_FAMILIAR,
        )
        .order_by('-created_at')
        .first()
    )
    if pertenencia is not None:
        return pertenencia.espacio
    return obtener_espacio_personal(usuario)


def usuario_y_espacio(request):
    """
    Punto de entrada único para vistas multitenant (Fase 2): autentica al
    usuario (Firebase o JWT demo) y resuelve su espacio activo en un solo paso.

    Retorna (usuario, espacio, None) o (None, None, Response 4xx).
    """
    usuario, err = utils_auth.get_usuario_autenticado(request)
    if err is not None:
        return None, None, err
    espacio, err = resolver_espacio_activo(request, usuario)
    if err is not None:
        return None, None, err
    return usuario, espacio, None


def resolver_espacio_activo(request, usuario):
    """
    Retorna (espacio, None) si se resolvió, o (None, Response 4xx) si no.
    Usar SIEMPRE después de autenticar al usuario.
    """
    raw = request.headers.get(HEADER_ESPACIO)

    if raw is None or not str(raw).strip():
        espacio = _espacio_por_defecto(usuario)
        if espacio is None:
            return None, Response(
                {
                    'error': (
                        'No tienes espacio asignado. Si la instancia está en migración '
                        'multitenant, ejecuta python manage.py backfill_espacios.'
                    ),
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        return espacio, None

    try:
        espacio_id = int(str(raw).strip())
    except (TypeError, ValueError):
        return None, Response(
            {'error': f'Header {HEADER_ESPACIO} inválido: se espera un id numérico.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    pertenencia = (
        PertenenciaEspacio.objects
        .select_related('espacio')
        .filter(
            usuario=usuario,
            espacio_id=espacio_id,
            activo=True,
            espacio__activo=True,
        )
        .first()
    )
    if pertenencia is None:
        return None, Response(
            {'error': 'No perteneces al espacio indicado o no está disponible.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    return pertenencia.espacio, None
