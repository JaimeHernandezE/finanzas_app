"""
Alertas recientes para el asistente (Etapa A).

Solo lectura sobre `NotificacionUsuario` del usuario en el espacio.
"""

from __future__ import annotations

from applications.finanzas.models import NotificacionUsuario
from applications.finanzas.services.analytics._common import (
    acotar_limite,
    asegurar_pertenencia,
)
from applications.finanzas.services_compensacion_cambios import serializar_notificacion

TIPOS_DEFAULT = (
    NotificacionUsuario.TIPO_PRESUPUESTO_UMBRAL,
    NotificacionUsuario.TIPO_CAMBIO_COMPENSACION,
)


def listar_alertas_recientes(
    usuario,
    espacio,
    *,
    limite: int | None = None,
    tipos: tuple[str, ...] | list[str] | None = None,
) -> dict:
    """
    Lista notificaciones recientes del usuario en el espacio.

    Retorna `{alertas: [...], total: int}` con el mismo shape serializado
    que la API de notificaciones.
    """
    if not asegurar_pertenencia(usuario, espacio):
        return {'alertas': [], 'total': 0}

    lim = acotar_limite(limite)
    tipos_filtro = tuple(tipos) if tipos is not None else TIPOS_DEFAULT

    qs = (
        NotificacionUsuario.objects.filter(
            usuario=usuario,
            espacio_id=espacio.pk,
            tipo__in=tipos_filtro,
        )
        .order_by('-creado_at')
    )
    total = qs.count()
    filas = list(qs[:lim])
    return {
        'alertas': [serializar_notificacion(n) for n in filas],
        'total': total,
    }
