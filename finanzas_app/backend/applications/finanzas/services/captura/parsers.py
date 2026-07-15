"""Parsers de correos bancarios."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Callable


@dataclass
class GastoParseado:
    monto: Decimal
    comercio: str
    fecha: date | None
    ultimos_4: str
    banco: str
    raw_subject: str = ''
    confianza: float = 0.7


def _monto_desde_texto(texto: str) -> Decimal | None:
    # $8.990 / $8990 / 8.990,50
    patterns = [
        r'\$\s*([\d.]+(?:,\d{1,2})?)',
        r'(?:monto|por)\s*:?\s*\$?\s*([\d.]+(?:,\d{1,2})?)',
    ]
    for pat in patterns:
        m = re.search(pat, texto, re.IGNORECASE)
        if m:
            raw = m.group(1).replace('.', '').replace(',', '.')
            try:
                return Decimal(raw).quantize(Decimal('0.01'))
            except (InvalidOperation, ValueError):
                continue
    return None


def _ultimos_4(texto: str) -> str:
    m = re.search(
        r'(?:terminad[ao]\s+en|tarjeta\s+\*+|\\\*{2,}|\*{4}|••••|····)\s*(\d{4})',
        texto,
        re.IGNORECASE,
    )
    if m:
        return m.group(1)
    m = re.search(r'\b(\d{4})\b(?:\s|$|\.)', texto)
    # Too greedy — only accept near "tarjeta"
    m2 = re.search(r'tarjeta[^\d]{0,40}(\d{4})', texto, re.IGNORECASE)
    if m2:
        return m2.group(1)
    return ''


def _fecha_desde_texto(texto: str) -> date | None:
    m = re.search(r'(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})', texto)
    if not m:
        return None
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y < 100:
        y += 2000
    try:
        return date(y, mo, d)
    except ValueError:
        try:
            return date(y, d, mo)
        except ValueError:
            return None


def parse_generico(subject: str, body: str) -> GastoParseado | None:
    texto = f'{subject}\n{body}'
    monto = _monto_desde_texto(texto)
    if monto is None:
        return None
    comercio = ''
    m = re.search(
        r'(?:en|comercio|establecimiento)\s+([A-Za-z0-9ÁÉÍÓÚáéíóúÑñ .&-]{3,80})',
        texto,
        re.IGNORECASE,
    )
    if m:
        comercio = m.group(1).strip()[:255]
    return GastoParseado(
        monto=monto,
        comercio=comercio,
        fecha=_fecha_desde_texto(texto),
        ultimos_4=_ultimos_4(texto),
        banco='GENERICO',
        raw_subject=subject,
        confianza=0.55,
    )


def parse_bci(subject: str, body: str) -> GastoParseado | None:
    texto = f'{subject}\n{body}'
    if 'bci' not in texto.lower() and 'bci' not in (subject or '').lower():
        # still try if called explicitly
        pass
    monto = _monto_desde_texto(texto)
    if monto is None:
        return None
    comercio = ''
    m = re.search(
        r'(?:Compra|consumo)\s+(?:por\s+\$[\d.]+\s+)?(?:en\s+)?(.+?)(?:\s+con\s+tarjeta|\s+el\s+\d|$)',
        texto,
        re.IGNORECASE | re.DOTALL,
    )
    if m:
        comercio = re.sub(r'\s+', ' ', m.group(1)).strip()[:255]
    return GastoParseado(
        monto=monto,
        comercio=comercio,
        fecha=_fecha_desde_texto(texto),
        ultimos_4=_ultimos_4(texto),
        banco='BCI',
        raw_subject=subject,
        confianza=0.75,
    )


def parse_santander(subject: str, body: str) -> GastoParseado | None:
    texto = f'{subject}\n{body}'
    monto = _monto_desde_texto(texto)
    if monto is None:
        return None
    comercio = ''
    m = re.search(
        r'(?:comercio|en)\s*:?\s*([A-Za-z0-9ÁÉÍÓÚáéíóúÑñ .&-]{3,80})',
        texto,
        re.IGNORECASE,
    )
    if m:
        comercio = m.group(1).strip()[:255]
    return GastoParseado(
        monto=monto,
        comercio=comercio,
        fecha=_fecha_desde_texto(texto),
        ultimos_4=_ultimos_4(texto),
        banco='SANTANDER',
        raw_subject=subject,
        confianza=0.75,
    )


_PARSERS_POR_REMITENTE: list[tuple[re.Pattern, Callable[[str, str], GastoParseado | None]]] = [
    (re.compile(r'bci\.cl|banco\s*bci', re.I), parse_bci),
    (re.compile(r'santander\.cl|banco\s*santander', re.I), parse_santander),
]


def parse_email(*, subject: str, body: str, from_addr: str = '') -> GastoParseado | None:
    blob = f'{from_addr} {subject}'
    for pattern, parser in _PARSERS_POR_REMITENTE:
        if pattern.search(blob):
            parsed = parser(subject, body)
            if parsed:
                return parsed
    # Fallback genérico si parece alerta de compra
    if re.search(r'compra|cargo|consumo|abono', f'{subject} {body}', re.I):
        return parse_generico(subject, body)
    return parse_generico(subject, body)
