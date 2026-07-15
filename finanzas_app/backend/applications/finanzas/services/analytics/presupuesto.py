"""
Analytics de gasto y avance de presupuesto (Etapa A del asistente).

Delega en `services.presupuesto_mes` para no duplicar reglas de egreso/crédito.
"""

from __future__ import annotations

from applications.finanzas.models import Categoria
from applications.finanzas.services.analytics._common import (
    AMBITOS_VALIDOS,
    asegurar_pertenencia,
    validar_mes_anio,
)
from applications.finanzas.services.presupuesto_mes import (
    build_presupuesto_mes_payload,
    gasto_categoria_mes,
)


def gasto_categoria_por_mes(
    usuario,
    espacio,
    *,
    categoria_id: int,
    mes: int,
    anio: int,
    ambito: str,
    cuenta_id: int | None = None,
) -> dict:
    """
    Gasto de una categoría en un mes (efectivo + cuotas crédito), mismo criterio
    que presupuesto-mes.
    """
    ambito = (ambito or '').upper()
    if ambito not in AMBITOS_VALIDOS:
        raise ValueError(f'ambito inválido: {ambito!r} (use FAMILIAR o PERSONAL)')
    validar_mes_anio(mes, anio)

    if not asegurar_pertenencia(usuario, espacio):
        return {
            'categoria_id': categoria_id,
            'categoria_nombre': None,
            'mes': mes,
            'anio': anio,
            'ambito': ambito,
            'cuenta_id': cuenta_id,
            'gastado': 0,
        }

    gastado = gasto_categoria_mes(
        usuario,
        categoria_id,
        mes,
        anio,
        ambito,
        cuenta_id=cuenta_id,
        espacio=espacio,
    )
    cat = Categoria.objects.filter(pk=categoria_id).values('nombre').first()
    return {
        'categoria_id': categoria_id,
        'categoria_nombre': cat['nombre'] if cat else None,
        'mes': mes,
        'anio': anio,
        'ambito': ambito,
        'cuenta_id': cuenta_id,
        'gastado': gastado,
    }


def avance_presupuesto_mes(
    usuario,
    espacio,
    *,
    mes: int,
    anio: int,
    ambito: str,
    cuenta_id: int | None = None,
) -> dict:
    """Payload idéntico a GET presupuesto-mes (filas + resumen)."""
    ambito = (ambito or '').upper()
    if ambito not in AMBITOS_VALIDOS:
        raise ValueError(f'ambito inválido: {ambito!r} (use FAMILIAR o PERSONAL)')
    validar_mes_anio(mes, anio)

    if not asegurar_pertenencia(usuario, espacio):
        from applications.finanzas.services.presupuesto_mes import presupuesto_mes_vacio

        return presupuesto_mes_vacio()

    return build_presupuesto_mes_payload(
        usuario,
        mes,
        anio,
        ambito,
        cuenta_id,
        espacio=espacio,
    )
