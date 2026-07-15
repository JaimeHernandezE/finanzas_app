"""Vista POST /api/finanzas/asistente/consulta/."""

from __future__ import annotations

from django.conf import settings
from django.core.cache import cache
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from applications.espacios.contexto import usuario_y_espacio
from applications.finanzas.asistente.llm import LLMClient, LLMUnavailableError
from applications.finanzas.asistente.orquestador import consultar


def _contexto_espacio_asistente(request):
    """Auth + espacio; archivados permiten POST de solo lectura del asistente."""
    usuario, espacio, err = usuario_y_espacio(request)
    if err is not None:
        return None, None, err
    return usuario, espacio, None


def _asistente_listo() -> tuple[bool, str | None]:
    if not settings.ASISTENTE_HABILITADO:
        return False, 'El asistente financiero no está habilitado.'
    if not (settings.ASISTENTE_LLM_API_KEY or '').strip():
        return False, 'El asistente no tiene API key configurada.'
    return True, None


def _rate_limit_ok(usuario_id: int) -> bool:
    limite = int(getattr(settings, 'ASISTENTE_RATE_LIMIT_POR_HORA', 30) or 30)
    if limite <= 0:
        return True
    key = f'asistente_rl:{usuario_id}'
    n = cache.get(key)
    if n is None:
        cache.set(key, 1, timeout=3600)
        return True
    if int(n) >= limite:
        return False
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, int(n) + 1, timeout=3600)
    return True


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def asistente_consulta(request):
    """
    Chat del asistente: body `{mensaje, historial?}`.
    Requiere ASISTENTE_HABILITADO y ASISTENTE_LLM_API_KEY.
    Auth vía Firebase/JWT demo en `usuario_y_espacio` (mismo patrón que finanzas).
    """
    usuario, espacio, err = _contexto_espacio_asistente(request)
    if err is not None:
        return err

    ok, motivo = _asistente_listo()
    if not ok:
        return Response({'error': motivo}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    if not _rate_limit_ok(usuario.pk):
        return Response(
            {'error': 'Demasiadas consultas al asistente. Intenta más tarde.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    body = request.data if isinstance(request.data, dict) else {}
    mensaje = (body.get('mensaje') or '').strip()
    max_chars = int(getattr(settings, 'ASISTENTE_MAX_CHARS_MENSAJE', 2000) or 2000)
    if not mensaje:
        return Response(
            {'error': 'mensaje es obligatorio.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if len(mensaje) > max_chars:
        return Response(
            {'error': f'mensaje supera el máximo de {max_chars} caracteres.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    historial = body.get('historial')
    if historial is not None and not isinstance(historial, list):
        return Response(
            {'error': 'historial debe ser una lista.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        payload = consultar(
            usuario=usuario,
            espacio=espacio,
            mensaje=mensaje,
            historial=historial,
            llm=LLMClient(),
        )
    except LLMUnavailableError as exc:
        return Response(
            {'error': f'Asistente no disponible: {exc}'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    return Response(payload, status=status.HTTP_200_OK)
