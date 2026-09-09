"""
Parsers de correos bancarios, uno por remitente.

Cada banco vive en su propio módulo y declara sus particularidades ahí; en
`comunes.py` queda solo lo transversal y en `generico.py` el andamiaje que los
bancos parametrizan. Así, sumar un remitente no obliga a tocar regex que otros
bancos ya usan —que era la fuente de las regresiones cruzadas.

Para agregar un banco:
  1. Crear `<banco>.py` con `parse_compra` y, si aplica, `parse_transferencia`.
  2. Registrarlo en `_REMITENTES`.
  3. Agregar un test con un cuerpo de correo real en
     `tests/test_captura_pendientes.py`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable

from . import bancoestado, bci, comunes, generico, santander
from .comunes import GastoParseado, TipoTarjeta

Parser = Callable[[str, str], "GastoParseado | None"]


@dataclass(frozen=True)
class Remitente:
    """Un banco reconocido y sus parsers."""
    patron: re.Pattern
    banco: str
    compra: Parser
    transferencia: Parser | None = None


_REMITENTES: tuple[Remitente, ...] = (
    Remitente(
        re.compile(r'bci\.cl|banco\s*bci', re.I),
        bci.BANCO, bci.parse_compra, bci.parse_transferencia,
    ),
    Remitente(
        re.compile(r'bancoestado\.cl|banco\s*estado|correo\.bancoestado', re.I),
        bancoestado.BANCO, bancoestado.parse_compra, bancoestado.parse_transferencia,
    ),
    Remitente(
        re.compile(r'santander\.cl|banco\s*santander', re.I),
        santander.BANCO, santander.parse_compra, santander.parse_transferencia,
    ),
)


def _remitente_para(from_addr: str, subject: str) -> Remitente | None:
    blob = f'{from_addr} {subject}'
    for remitente in _REMITENTES:
        if remitente.patron.search(blob):
            return remitente
    return None


def parse_email(*, subject: str, body: str, from_addr: str = '') -> GastoParseado | None:
    """
    Punto de entrada único: resuelve el remitente y delega en su parser.

    Compras y transferencias se separan antes de elegir el parser porque son
    formatos distintos dentro de un mismo banco.
    """
    remitente = _remitente_para(from_addr, subject)
    es_tef = comunes.parece_transferencia(subject, body)

    if remitente is not None:
        if es_tef:
            parser = remitente.transferencia or generico.parse_transferencia
            parsed = parser(subject, body)
            if parsed:
                parsed.banco = remitente.banco
                return parsed
        parsed = remitente.compra(subject, body)
        if parsed:
            return parsed

    if es_tef:
        parsed = generico.parse_transferencia(subject, body)
        if parsed:
            return parsed
    return generico.parse_compra(subject, body)


def banco_desde_remitente(from_addr: str, subject: str = '') -> str:
    remitente = _remitente_para(from_addr, subject)
    return remitente.banco if remitente else 'GENERICO'


# Compatibilidad con los nombres previos a la separación por banco.
parse_bci = bci.parse_compra
parse_santander = santander.parse_compra
parse_bancoestado = bancoestado.parse_compra
parse_generico = generico.parse_compra
parse_transferencia_generico = generico.parse_transferencia

__all__ = [
    'GastoParseado',
    'TipoTarjeta',
    'Remitente',
    'parse_email',
    'banco_desde_remitente',
    'parse_bci',
    'parse_santander',
    'parse_bancoestado',
    'parse_generico',
    'parse_transferencia_generico',
    'comunes',
]
