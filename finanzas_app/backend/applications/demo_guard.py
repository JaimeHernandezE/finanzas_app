"""Utilidades para restringir endpoints cuando DEMO=True."""

from rest_framework import status
from rest_framework.response import Response

MSG_DEMO_NO_DISPONIBLE = 'No disponible en modo demo.'


def respuesta_demo_no_disponible() -> Response:
    return Response({'error': MSG_DEMO_NO_DISPONIBLE}, status=status.HTTP_403_FORBIDDEN)
