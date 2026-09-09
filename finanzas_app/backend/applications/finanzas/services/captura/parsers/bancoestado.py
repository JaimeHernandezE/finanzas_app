"""
Correos de BancoEstado.

Remitentes conocidos: `notificaciones@correo.bancoestado.cl` (compras) y
`noreply@correo.bancoestado.cl` (comprobantes TEF).

Particularidades:
- Las compras no vienen en tabla sino en prosa: "Se ha realizado compra
  e-commerce por $ 5.500 en DL*GOOGLE YOUTUBE SANTIAGO CL asociado a su
  tarjeta de Débito terminada en **** 2569 el día ... a las ... hrs.". El
  comercio queda entre "en" y "asociado", y trae el prefijo del procesador.
- El comprobante TEF repite el rótulo "N° de cuenta" en los bloques "Desde:" y
  "Hacia:". Hay que quedarse con el primero, que es el propio.
- En el TEF el destinatario va rotulado solo como "Nombre".
"""

from __future__ import annotations

import re

from . import comunes, generico
from .comunes import GastoParseado

BANCO = 'BANCOESTADO'

#: "N° de cuenta" aparece dos veces; `re.search` toma la primera aparición,
#: que en el comprobante es la del bloque "Desde:".
PATRONES_CUENTA = (
    rf'n[°º]\s*de\s+cuenta\s*:?\s*{generico.NUMERO}',
    *generico.PATRONES_CUENTA,
)

#: "Nombre" es ambiguo en general, así que va después de los rótulos
#: inequívocos y solo se habilita para este banco.
ETIQUETAS_DESTINATARIO = (*generico.ETIQUETAS_DESTINATARIO, r'nombre')


def parse_compra(subject: str, body: str) -> GastoParseado | None:
    texto = f'{subject}\n{body}'
    if comunes.monto_desde_texto(texto) is None:
        return None

    comercio = ''
    m = re.search(
        r'\ben\s+(.+?)\s+asociad[oa]\s+a\s+su\s+tarjeta',
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
        confianza=0.75,
    )


def parse_transferencia(subject: str, body: str) -> GastoParseado | None:
    return generico.construir_transferencia(
        subject, body,
        banco=BANCO,
        etiquetas_destinatario=ETIQUETAS_DESTINATARIO,
        patrones_cuenta=PATRONES_CUENTA,
        # El comprobante siempre rotula la cuenta; el barrido genérico solo
        # podría confundirse con la del receptor.
        usar_cuenta_generica=False,
        confianza=0.7,
    )
