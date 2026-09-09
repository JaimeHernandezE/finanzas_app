"""
Correos de Santander.

Todavía sin particularidades observadas: usa el andamiaje común. Cuando
aparezca un formato propio, se agrega aquí sin tocar los demás bancos.
"""

from __future__ import annotations

from . import generico
from .comunes import GastoParseado

BANCO = 'SANTANDER'


def parse_compra(subject: str, body: str) -> GastoParseado | None:
    return generico.construir_compra(subject, body, banco=BANCO, confianza=0.75)


def parse_transferencia(subject: str, body: str) -> GastoParseado | None:
    return generico.construir_transferencia(subject, body, banco=BANCO, confianza=0.65)
