"""
Vistas mínimas a nivel de proyecto (p. ej. raíz pública de la API).
"""

from django.conf import settings
from django.http import JsonResponse


def raiz_api(request):
    """
    La API no sirve la SPA en /. Evita 404 cuando alguien abre el dominio del backend en el navegador.
    """
    data = {
        'servicio': 'Finanzas App — API',
        'admin': request.build_absolute_uri('/admin/'),
        'api': {
            'usuarios': request.build_absolute_uri('/api/usuarios/'),
            'finanzas': request.build_absolute_uri('/api/finanzas/'),
        },
    }
    if getattr(settings, 'DEMO', False):
        data['modo'] = 'demo'
        data['nota'] = (
            'Esta URL es solo el backend. Abre la aplicación web en la URL del Static Site '
            '(frontend en Render) configurada para este entorno demo.'
        )
    else:
        data['nota'] = (
            'Interfaz de usuario: despliega el frontend (Vite/React) aparte y apunta VITE_API_URL a este host.'
        )
    return JsonResponse(data, json_dumps_params={'indent': 2, 'ensure_ascii': False})
