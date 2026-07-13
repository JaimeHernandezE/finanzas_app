"""
Helpers de tenant para servicios de finanzas (espacio activo).
"""

from __future__ import annotations

from decimal import Decimal

from applications.espacios.models import Espacio
from applications.espacios.services import familia_id_de_espacio, miembros_activos_espacio, obtener_espacio_personal


def resolver_espacio_id(usuario, espacio: Espacio | None) -> int | None:
    """ID del espacio activo para queries tenant."""
    if espacio is not None:
        return espacio.pk
    personal = obtener_espacio_personal(usuario)
    return personal.pk if personal is not None else None


def resolver_familia_id(usuario, espacio: Espacio | None) -> int | None:
    """familia_id efectivo para queries legacy durante la transición."""
    if espacio is not None:
        fid = familia_id_de_espacio(espacio)
        if fid is not None:
            return fid
        if espacio.es_personal:
            return None
    return getattr(usuario, 'familia_id', None)


def miembros_prorrateo(usuario, espacio: Espacio | None, mes_pd):
    """Miembros para prorrateo según espacio activo."""
    if espacio is not None and espacio.tipo == Espacio.TIPO_FAMILIAR:
        return miembros_activos_espacio(espacio, mes_pd)
    return []


def calcular_esperado_prorrateo(
    espacio: Espacio | None,
    uid: int,
    miembros_ids: list[int],
    tot_ing: Decimal,
    neto_familiar: Decimal,
    ing_mes: Decimal,
) -> tuple[Decimal, Decimal]:
    """
    Retorna (porcentaje, monto_esperado) según modo_reparto del espacio.
    """
    n = len(miembros_ids)
    if n == 0:
        return Decimal('0'), Decimal('0')

    modo = Espacio.REPARTO_PROPORCIONAL
    if espacio is not None and espacio.tipo == Espacio.TIPO_FAMILIAR:
        modo = espacio.modo_reparto

    if modo == Espacio.REPARTO_SIN:
        return Decimal('0'), Decimal('0')

    if modo == Espacio.REPARTO_PARTES_IGUALES:
        pct = (Decimal('100') / Decimal(n)) if n else Decimal('0')
        esperado = (
            (neto_familiar / Decimal(n)).quantize(Decimal('0.01'))
            if n
            else Decimal('0')
        )
        return pct, esperado

    # PROPORCIONAL (default)
    if tot_ing > 0:
        pct = (ing_mes / tot_ing) * Decimal('100')
        esperado = (ing_mes / tot_ing) * neto_familiar
    else:
        pct = (Decimal('100') / Decimal(n)) if n else Decimal('0')
        esperado = (
            (neto_familiar / Decimal(n)).quantize(Decimal('0.01'))
            if n
            else Decimal('0')
        )
    return pct, esperado


def calcular_proporcion_usuario(
    usuario,
    espacio: Espacio | None,
    mes_pd,
    bases: dict[int, Decimal],
) -> tuple[Decimal, Decimal]:
    """(proporción 0..1, base del usuario) para dashboard."""
    miembros = miembros_prorrateo(usuario, espacio, mes_pd)
    if not miembros:
        return Decimal('0'), Decimal('0')

    modo = Espacio.REPARTO_PROPORCIONAL
    if espacio is not None and espacio.tipo == Espacio.TIPO_FAMILIAR:
        modo = espacio.modo_reparto

    if modo == Espacio.REPARTO_SIN:
        return Decimal('0'), bases.get(usuario.pk, Decimal('0'))

    n = len(miembros)
    meu = bases.get(usuario.pk, Decimal('0'))

    if modo == Espacio.REPARTO_PARTES_IGUALES:
        prop = (Decimal('1') / Decimal(n)).quantize(Decimal('0.000001')) if n else Decimal('0')
        return prop, meu

    tot_est = sum((bases.get(u.pk, Decimal('0')) for u in miembros), start=Decimal('0'))
    if tot_est > Decimal('0.005'):
        prop = (meu / tot_est).quantize(Decimal('0.000001'))
    else:
        prop = (Decimal('1') / Decimal(n)).quantize(Decimal('0.000001')) if n else Decimal('0')
    return prop, meu
