"""Formateo de montos según la moneda de visualización del usuario."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.contrib.auth import get_user_model

User = get_user_model()

_SIMBOLOS = {
    'CLP': '$',
    'USD': 'US$',
    'EUR': '€',
    'ARS': '$',
    'PEN': 'S/',
    'MXN': 'MX$',
    'COP': '$',
}


def _decimales_moneda(codigo: str) -> int:
    return 0 if codigo == 'CLP' else 2


def _agrupar_miles(entero: str, separador: str = '.') -> str:
    if len(entero) <= 3:
        return entero
    partes: list[str] = []
    resto = entero
    while resto:
        partes.insert(0, resto[-3:])
        resto = resto[:-3]
    return separador.join(partes)


def formatear_monto_codigo(monto, codigo: str) -> str:
    """
    Formatea un monto con el estilo de la app (es-CL).
    Los datos siguen en moneda base; solo cambia la presentación.
    """
    codigo = (codigo or settings.MONEDA_BASE).upper()
    decimales = _decimales_moneda(codigo)
    valor = Decimal(str(monto)).quantize(
        Decimal('10') ** -decimales,
        rounding=ROUND_HALF_UP,
    )
    negativo = valor < 0
    valor = abs(valor)

    if decimales:
        entero, _, fraccion = f'{valor:.{decimales}f}'.partition('.')
        cuerpo = f'{_agrupar_miles(entero)},{fraccion}'
    else:
        cuerpo = _agrupar_miles(str(int(valor)))

    simbolo = _SIMBOLOS.get(codigo, f'{codigo} ')
    texto = f'{simbolo}{cuerpo}'
    return f'-{texto}' if negativo else texto


def codigo_moneda_usuario(usuario) -> str:
    if usuario is None:
        return settings.MONEDA_BASE
    codigo = getattr(usuario, 'moneda_display', None)
    return (codigo or settings.MONEDA_BASE).upper()


def formatear_monto_usuario_id(monto, usuario_id: int) -> str:
    u = User.objects.filter(pk=usuario_id).only('moneda_display').first()
    return formatear_monto_codigo(monto, codigo_moneda_usuario(u))
