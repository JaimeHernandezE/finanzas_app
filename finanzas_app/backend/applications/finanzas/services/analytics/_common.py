"""Helpers compartidos de la capa analytics (validación y tenant)."""

from __future__ import annotations

from applications.espacios.models import PertenenciaEspacio

AMBITOS_VALIDOS = frozenset({'FAMILIAR', 'PERSONAL'})
LIMITE_ALERTAS_DEFAULT = 20
LIMITE_ALERTAS_MAX = 50


def validar_mes_anio(mes: int, anio: int) -> None:
    if not isinstance(mes, int) or not 1 <= mes <= 12:
        raise ValueError(f'mes inválido: {mes!r}')
    if not isinstance(anio, int) or not 2000 <= anio <= 2100:
        raise ValueError(f'anio inválido: {anio!r}')


def asegurar_pertenencia(usuario, espacio) -> bool:
    """True si el usuario tiene membresía activa en el espacio."""
    if usuario is None or espacio is None:
        return False
    return PertenenciaEspacio.objects.filter(
        usuario=usuario,
        espacio_id=espacio.pk,
        activo=True,
        espacio__activo=True,
    ).exists()


def acotar_limite(limite: int | None, default: int = LIMITE_ALERTAS_DEFAULT) -> int:
    if limite is None:
        return default
    try:
        n = int(limite)
    except (TypeError, ValueError) as exc:
        raise ValueError(f'limite inválido: {limite!r}') from exc
    if n < 1:
        return 1
    return min(n, LIMITE_ALERTAS_MAX)
