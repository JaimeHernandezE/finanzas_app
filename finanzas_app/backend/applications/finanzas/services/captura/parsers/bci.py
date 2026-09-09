"""
Correos de BCI.

Remitentes conocidos: `contacto@bci.cl` (compras) y `transferencias@bci.cl`.

Particularidades:
- Compras en tabla rotulada: "Número tarjeta débito / Monto / Fecha / Hora /
  Comercio". El pie ("Si no quieres recibir notificaciones ... Bci.cl") queda
  pegado al último valor cuando el correo se aplana a texto.
- Las compras internacionales traen el monto en USD.
- En transferencias la cuenta propia va en la frase de apertura,
  "desde tu cuenta N° 79834843", no en una fila de la tabla.
"""

from __future__ import annotations

import re

from . import comunes, generico
from .comunes import GastoParseado

BANCO = 'BCI'

#: Inicio del pie de página, para que no se cuele en el nombre del comercio.
CORTE_PIE = r'si no quieres|bci\.cl'

PATRONES_CUENTA = (
    # "Realizaste una transferencia de fondos desde tu cuenta N° 79834843"
    rf'desde\s+(?:tu|la|mi|su)\s+cuenta\s*(?:corriente\s*)?'
    rf'(?:n[°º]\s*|n[uú]mero\s*)?:?\s*{generico.NUMERO}',
    *generico.PATRONES_CUENTA,
)


def parse_compra(subject: str, body: str) -> GastoParseado | None:
    texto = f'{subject}\n{body}'
    if comunes.monto_desde_texto(texto) is None:
        return None

    # Primero la tabla rotulada; luego la redacción en prosa.
    comercio = comunes.comercio_etiquetado(texto, corte_pie=CORTE_PIE)
    if not comercio:
        m = re.search(
            r'(?:Compra|consumo)\s+(?:por\s+\$[\d.]+(?:,\d{1,2})?\s+)?(?:en\s+)?(.+?)'
            r'(?:\s+con\s+tarjeta|\s+el\s+\d|\s+a\s+las|$)',
            texto,
            re.IGNORECASE | re.DOTALL,
        )
        if m:
            candidato = comunes.limpiar_comercio(m.group(1))
            if not comunes.es_comercio_generico(candidato):
                comercio = candidato

    return generico.construir_compra(
        subject, body,
        banco=BANCO,
        comercio=comercio,
        corte_pie=CORTE_PIE,
        confianza=0.8,
    )


def parse_transferencia(subject: str, body: str) -> GastoParseado | None:
    return generico.construir_transferencia(
        subject, body,
        banco=BANCO,
        patrones_cuenta=PATRONES_CUENTA,
        confianza=0.7,
    )
