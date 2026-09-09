"""
Parsers de respaldo y andamiaje reutilizable por los módulos de banco.

`construir_transferencia` es el esqueleto que comparten todas las
transferencias; cada banco lo invoca con sus propios rótulos y patrones de
cuenta en vez de sumar alternativas a un regex compartido.
"""

from __future__ import annotations

import re
from typing import Sequence

from . import comunes
from .comunes import GastoParseado

#: Rótulos de destinatario que aparecen en varios bancos. Los inequívocos van
#: primero; un banco puede anteponer o añadir los suyos.
ETIQUETAS_DESTINATARIO = (
    r'nombre\s+del\s+destinatario',
    r'destinatario',
    r'beneficiario',
    r'transferencia\s+a',
    r'transferido\s+a',
    r'a\s+nombre\s+de',
)

ETIQUETAS_MENSAJE = (
    r'mensaje',
    r'glosa',
    r'comentario',
    r'motivo',
)

#: Fragmento reutilizable para capturar un número de cuenta.
NUMERO = r'(\d[\d\s.\-]{3,39})'

#: Rótulos de cuenta de origen comunes a varios bancos.
PATRONES_CUENTA = (
    rf'cuenta\s+(?:de\s+)?origen\s*:?\s*{NUMERO}',
    rf'cuenta\s+cargada\s*:?\s*{NUMERO}',
    rf'n[uú]mero\s+de\s+cuenta\s*:?\s*{NUMERO}',
    rf'n[uú]mero\s+cuenta\s*:?\s*{NUMERO}',
)

#: Contexto que delata que un número de cuenta es el del receptor.
_CONTEXTO_DESTINO = re.compile(r'destino|destinatari|beneficiari|abono\s+a', re.IGNORECASE)


def cuenta_generica(texto: str) -> str:
    """
    Último recurso: una fila 'Cuenta: 123456' sin rótulo de origen explícito.

    Descarta las precedidas de contexto de destino para no devolver la cuenta
    del receptor.
    """
    for m in re.finditer(rf'cuenta\s*:?\s*{NUMERO}', texto, re.IGNORECASE):
        previo = texto[max(0, m.start() - 40):m.start()]
        if _CONTEXTO_DESTINO.search(previo):
            continue
        digits = comunes.solo_digitos(m.group(1))
        if len(digits) >= 4:
            return digits
    return ''


def construir_transferencia(
    subject: str,
    body: str,
    *,
    banco: str,
    etiquetas_destinatario: Sequence[str] = ETIQUETAS_DESTINATARIO,
    etiquetas_mensaje: Sequence[str] = ETIQUETAS_MENSAJE,
    patrones_cuenta: Sequence[str] = PATRONES_CUENTA,
    usar_cuenta_generica: bool = True,
    confianza: float = 0.6,
) -> GastoParseado | None:
    """Esqueleto común de una transferencia; los banco-específicos lo parametrizan."""
    texto = f'{subject}\n{body}'
    monto = comunes.monto_desde_texto(texto)
    if monto is None:
        return None

    destinatario = comunes.valor_etiquetado(texto, etiquetas_destinatario)
    mensaje = comunes.mensaje_transferencia(texto, etiquetas_mensaje)
    comercio = comunes.comercio_transferencia(destinatario, mensaje)
    if not comercio:
        # Fallback suave: el subject, si no es puramente una notificación.
        sub = re.sub(
            r'^(?:alerta|aviso|notificaci[oó]n|transferencia)\s*[:\-]?\s*',
            '',
            (subject or '').strip(),
            flags=re.I,
        )
        comercio = comunes.limpiar_comercio(sub) if sub and len(sub) >= 3 else ''

    cuenta = comunes.numero_cuenta_desde_texto(texto, patrones_cuenta)
    if not cuenta and usar_cuenta_generica:
        cuenta = cuenta_generica(texto)

    return GastoParseado(
        monto=monto,
        comercio=comercio,
        fecha=comunes.fecha_desde_texto(texto),
        hora=comunes.hora_desde_texto(texto),
        ultimos_4='',
        banco=banco,
        tipo_tarjeta='DEBITO',
        raw_subject=subject,
        confianza=confianza,
        numero_cuenta=cuenta,
        es_transferencia=True,
    )


def construir_compra(
    subject: str,
    body: str,
    *,
    banco: str,
    comercio: str = '',
    corte_pie: str = '',
    confianza: float = 0.55,
) -> GastoParseado | None:
    """Esqueleto común de una compra con tarjeta."""
    texto = f'{subject}\n{body}'
    monto = comunes.monto_desde_texto(texto)
    if monto is None:
        return None
    generico, fecha, hora, ultimos, tipo = comunes.campos_comunes(
        subject, body, corte_pie=corte_pie,
    )
    return GastoParseado(
        monto=monto,
        comercio=comercio or generico,
        fecha=fecha,
        hora=hora,
        ultimos_4=ultimos,
        tipo_tarjeta=tipo,
        banco=banco,
        moneda=comunes.moneda_desde_texto(texto),
        raw_subject=subject,
        confianza=confianza,
    )


def parse_compra(subject: str, body: str) -> GastoParseado | None:
    return construir_compra(subject, body, banco='GENERICO', confianza=0.55)


def parse_transferencia(subject: str, body: str) -> GastoParseado | None:
    return construir_transferencia(subject, body, banco='GENERICO', confianza=0.6)
