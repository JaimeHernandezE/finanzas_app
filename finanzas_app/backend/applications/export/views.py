# Endpoints de exportación a Google Sheets:
# - POST /api/export/sheets/ — token X-Export-Token (cron / integraciones)
# La sync desde la app (JWT ADMIN) se retiró: el respaldo global de instancia es el dump PostgreSQL.

import hmac
import os

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from applications import utils as utils_auth
from applications.usuarios.models import Familia

from .exporters import (
    exportar_cuotas,
    exportar_gasto_comun,
    exportar_ingresos_comunes,
    exportar_inversiones,
    exportar_movimientos,
    exportar_movimientos_cuenta,
    exportar_resumen_historico,
    exportar_viajes,
    listar_cuentas_familia,
    nombre_hoja_cuenta,
    nombre_hoja_fija,
    titulo_hoja_seguro,
)
from .sheets_service import (
    asegurar_hoja,
    escribir_hoja,
    get_sheets_service,
    limpiar_hoja,
    normalizar_spreadsheet_id,
)


def _construir_trabajos_exportacion(familia, multitenant: bool, titulos_usados: set) -> list:
    """Lista de (título_hoja, callable sin args -> filas)."""
    trabajos = []

    def add(nombre_base: str, exportar_fn):
        nb = nombre_hoja_fija(nombre_base, familia, multitenant)
        titulo = titulo_hoja_seguro(nb, titulos_usados)
        trabajos.append((titulo, exportar_fn))

    add('Movimientos', lambda f=familia: exportar_movimientos(f))
    add('Cuotas', lambda f=familia: exportar_cuotas(f))
    add('Ingresos comunes', lambda f=familia: exportar_ingresos_comunes(f))
    add('Inversiones', lambda f=familia: exportar_inversiones(f))
    add('Viajes', lambda f=familia: exportar_viajes(f))
    add('Gasto común', lambda f=familia: exportar_gasto_comun(f))
    add('Resumen histórico', lambda f=familia: exportar_resumen_historico(f))

    for cuenta in listar_cuentas_familia(familia):
        nb = nombre_hoja_cuenta(familia, cuenta, multitenant)
        titulo = titulo_hoja_seguro(nb, titulos_usados)
        c = cuenta
        trabajos.append((
            titulo,
            lambda f=familia, cu=c: exportar_movimientos_cuenta(f, cu),
        ))

    return trabajos


def _ejecutar_exportacion_google_sheets():
    """
    Escribe todas las familias en el Sheet configurado.
    Lanza excepción si falla la API de Google o la configuración.
    """
    sheet_id = normalizar_spreadsheet_id(os.getenv('GOOGLE_SHEET_ID'))
    if not sheet_id:
        raise ValueError('GOOGLE_SHEET_ID no configurado.')

    service = get_sheets_service()
    resumen = []
    multitenant = Familia.objects.count() > 1
    titulos_usados: set[str] = set()
    trabajos: list = []

    for familia in Familia.objects.all().order_by('id'):
        trabajos.extend(
            _construir_trabajos_exportacion(familia, multitenant, titulos_usados)
        )

    for nombre_hoja, exportar_fn in trabajos:
        asegurar_hoja(service, sheet_id, nombre_hoja)
        limpiar_hoja(service, sheet_id, nombre_hoja)
        filas = exportar_fn()
        escribir_hoja(service, sheet_id, nombre_hoja, filas)
        if 'Resumen histórico' in nombre_hoja:
            data_rows = len(filas)
        else:
            data_rows = max(0, len(filas) - 1) if filas else 0
        resumen.append({
            'hoja': nombre_hoja,
            'filas': data_rows,
        })

    return {'ok': True, 'resumen': resumen}


# Fase 0 multitenant: estos endpoints exportan datos de TODAS las familias a un
# Sheet global. Deben permanecer bloqueados en producción salvo habilitación
# explícita, hasta que exista el export por alcance (Fase 5 del plan).
def _export_global_deshabilitado():
    if settings.DEBUG or utils_auth.env_flag('ALLOW_GLOBAL_EXPORT'):
        return None
    return Response(
        {
            'error': (
                'Exportación global deshabilitada. Exporta datos de todas las familias '
                'de la instancia; define ALLOW_GLOBAL_EXPORT=true solo si todas las '
                'familias pertenecen al mismo operador.'
            ),
        },
        status=status.HTTP_403_FORBIDDEN,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def exportar_a_sheets(request):
    """
    Exporta datos de todas las familias a Google Sheets.
    Reemplaza el contenido de cada hoja completamente.

    Autenticación: header X-Export-Token con el valor de
    la variable de entorno EXPORT_SECRET_TOKEN.
    Requiere ALLOW_GLOBAL_EXPORT=true en producción (candado multitenant).
    """
    bloqueo = _export_global_deshabilitado()
    if bloqueo is not None:
        return bloqueo

    token_esperado = os.getenv('EXPORT_SECRET_TOKEN')
    token_recibido = request.headers.get('X-Export-Token') or ''

    if not token_esperado or not hmac.compare_digest(token_recibido, token_esperado):
        return Response(
            {'error': 'No autorizado.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    try:
        data = _ejecutar_exportacion_google_sheets()
        return Response(data)
    except ValueError as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
