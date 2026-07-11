# Resolución del espacio activo por request (Fase 1/2 del plan).
#
# Reglas (ver docs/PLAN-MULTITENANT-Y-ENTORNO-A-B.md, Fase 2):
# - Sin header X-Espacio-Id → fallback al espacio personal del usuario.
# - Header inválido o sin membresía activa → 403 explícito. NUNCA degradar
#   silenciosamente al espacio personal: una escritura que cae al tenant
#   equivocado es corrupción de datos.

from rest_framework import status
from rest_framework.response import Response

from .models import PertenenciaEspacio
from .services import obtener_espacio_personal

HEADER_ESPACIO = 'X-Espacio-Id'


def resolver_espacio_activo(request, usuario):
    """
    Retorna (espacio, None) si se resolvió, o (None, Response 4xx) si no.
    Usar SIEMPRE después de autenticar al usuario.
    """
    raw = request.headers.get(HEADER_ESPACIO)

    if raw is None or not str(raw).strip():
        espacio = obtener_espacio_personal(usuario)
        if espacio is None:
            return None, Response(
                {
                    'error': (
                        'No tienes espacio personal. Si la instancia está en migración '
                        'multitenant, ejecuta la migración de datos (Fase 3).'
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
