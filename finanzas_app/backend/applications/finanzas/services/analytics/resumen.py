"""
Resumen histórico de un mes cerrado (Etapa A del asistente).
"""

from __future__ import annotations

from datetime import date

from django.utils import timezone

from applications.finanzas.services.analytics._common import (
    asegurar_pertenencia,
    validar_mes_anio,
)
from applications.finanzas.services_recalculo import (
    _obtener_payload_resumen_mes,
    primer_dia_mes,
    ultimo_mes_cerrado,
)


def resumen_mes_cerrado(
    usuario,
    espacio,
    *,
    mes: int,
    anio: int,
) -> dict:
    """
    Payload del resumen familiar para un mes calendario ya cerrado.

    Si el mes está en curso (o es futuro), `mes_cerrado` es False y `resumen` es None.
    Si está cerrado pero no hay datos, `mes_cerrado` es True y `resumen` es None.
    """
    validar_mes_anio(mes, anio)
    mes_pd = date(anio, mes, 1)

    if not asegurar_pertenencia(usuario, espacio):
        return {
            'mes': mes,
            'anio': anio,
            'mes_cerrado': False,
            'resumen': None,
        }

    hoy = timezone.localdate()
    cerrado_hasta = ultimo_mes_cerrado(hoy)
    if primer_dia_mes(mes_pd) > cerrado_hasta:
        return {
            'mes': mes,
            'anio': anio,
            'mes_cerrado': False,
            'resumen': None,
        }

    payload = _obtener_payload_resumen_mes(
        espacio.pk,
        mes_pd,
        persistir_si_falta=True,
    )
    return {
        'mes': mes,
        'anio': anio,
        'mes_cerrado': True,
        'resumen': payload,
    }
