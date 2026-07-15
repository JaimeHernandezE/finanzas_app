"""Webhooks públicos de captura (Telegram / WhatsApp)."""

from __future__ import annotations

import hmac
import logging

from django.http import HttpResponse
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from applications.finanzas.captura_bot.adapters import telegram as tg
from applications.finanzas.captura_bot.adapters import whatsapp as wa

logger = logging.getLogger(__name__)


@csrf_exempt
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def webhook_telegram(request):
    if not getattr(settings, 'CAPTURA_TELEGRAM_HABILITADO', False):
        return Response({'ok': False, 'error': 'Telegram deshabilitado.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    secret = (getattr(settings, 'CAPTURA_TELEGRAM_WEBHOOK_SECRET', '') or '').strip()
    if secret:
        header = request.headers.get('X-Telegram-Bot-Api-Secret-Token', '')
        if not hmac.compare_digest(header, secret):
            return Response({'ok': False}, status=status.HTTP_403_FORBIDDEN)

    try:
        tg.procesar_update(request.data if isinstance(request.data, dict) else {})
    except Exception:
        logger.exception('Error procesando webhook Telegram')
    return Response({'ok': True})


@csrf_exempt
@api_view(['GET', 'POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def webhook_whatsapp(request):
    if request.method == 'GET':
        mode = request.GET.get('hub.mode')
        token = request.GET.get('hub.verify_token')
        challenge = request.GET.get('hub.challenge', '')
        expected = (getattr(settings, 'CAPTURA_WHATSAPP_VERIFY_TOKEN', '') or '').strip()
        if mode == 'subscribe' and expected and token == expected:
            return HttpResponse(challenge, content_type='text/plain')
        return Response({'error': 'Verificación fallida.'}, status=status.HTTP_403_FORBIDDEN)

    if not getattr(settings, 'CAPTURA_WHATSAPP_HABILITADO', False):
        return Response({'ok': False}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    try:
        wa.procesar_payload(request.data if isinstance(request.data, dict) else {})
    except Exception:
        logger.exception('Error procesando webhook WhatsApp')
    return Response({'ok': True})
