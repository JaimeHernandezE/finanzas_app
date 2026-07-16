"""Parsers de correos bancarios."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, time
from decimal import Decimal, InvalidOperation
from typing import Callable, Literal


_COMERCIOS_GENERICOS = frozenset({
    'comercio nacional',
    'compra nacional',
    'comercio',
    'nacional',
    'establecimiento',
    'compra',
    'consumo',
    'cargo',
})

TipoTarjeta = Literal['DEBITO', 'CREDITO', '']


@dataclass
class GastoParseado:
    monto: Decimal
    comercio: str
    fecha: date | None
    hora: time | None
    ultimos_4: str
    banco: str
    tipo_tarjeta: TipoTarjeta = ''
    raw_subject: str = ''
    confianza: float = 0.7


def _monto_desde_texto(texto: str) -> Decimal | None:
    # Preferir fila etiquetada "Monto"
    m = re.search(
        r'(?:^|\n|\r)\s*monto\s*:?\s*\$?\s*([\d.]+(?:,\d{1,2})?)',
        texto,
        re.IGNORECASE | re.MULTILINE,
    )
    if m:
        raw = m.group(1).replace('.', '').replace(',', '.')
        try:
            return Decimal(raw).quantize(Decimal('0.01'))
        except (InvalidOperation, ValueError):
            pass
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
    patterns = [
        r'(?:\*{2,}|\*{4}|••••|····|x{2,}|X{2,})\s*(\d{4})',
        r'(?:terminad[ao]\s+en|n[uú]mero\s+tarjeta[^\d]{0,40}|tarjeta\s+(?:de\s+)?(?:d[eé]bito|cr[eé]dito)?[^\d]{0,20})\s*(\d{4})',
        r'tarjeta[^\d]{0,40}(\d{4})',
    ]
    for pat in patterns:
        m = re.search(pat, texto, re.IGNORECASE)
        if m:
            return m.group(1)
    return ''


def _tipo_tarjeta_desde_texto(texto: str) -> TipoTarjeta:
    t = texto or ''
    # Preferencias explícitas
    if re.search(r'tarjeta\s+de\s+d[eé]bito|\bd[eé]bito\b', t, re.I):
        if not re.search(r'tarjeta\s+de\s+cr[eé]dito', t, re.I):
            return 'DEBITO'
        # Si aparecen ambos, mirar cerca de "número tarjeta"
        if re.search(r'n[uú]mero\s+tarjeta\s+d[eé]bito|tarjeta\s+d[eé]bito', t, re.I):
            return 'DEBITO'
    if re.search(r'tarjeta\s+de\s+cr[eé]dito|\bcr[eé]dito\b', t, re.I):
        return 'CREDITO'
    return ''


def _fecha_desde_texto(texto: str) -> date | None:
    m = re.search(
        r'(?:^|\n|\r)\s*fecha\s*:?\s*(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})',
        texto,
        re.IGNORECASE | re.MULTILINE,
    )
    if not m:
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


def _hora_desde_texto(texto: str) -> time | None:
    """Extrae hora tipo 18:30, 18:30:05, 6:30 pm, 18.30 hrs."""
    patterns = [
        r'(?:^|\n|\r)\s*hora\s*:?\s*(\d{1,2})[:.](\d{2})(?::(\d{2}))?\s*(?:hrs?\.?|horas)?',
        r'(?:a\s+las|hora)\s*:?\s*(\d{1,2})[:.](\d{2})(?::(\d{2}))?\s*(?:hrs?\.?|horas)?',
        r'\b(\d{1,2})[:.](\d{2})(?::(\d{2}))?\s*(?:hrs?\.?|horas)\b',
        r'\b(\d{1,2})[:.](\d{2})(?::(\d{2}))?\s*([ap]\.?\s*m\.?)',
        r'\b(\d{1,2})[:.](\d{2})(?::(\d{2}))?\b',
    ]
    for pat in patterns:
        m = re.search(pat, texto, re.IGNORECASE | re.MULTILINE)
        if not m:
            continue
        h = int(m.group(1))
        mi = int(m.group(2))
        sec = int(m.group(3) or 0) if m.lastindex and m.lastindex >= 3 else 0
        ampm = ''
        if m.lastindex and m.lastindex >= 4 and m.group(4):
            ampm = re.sub(r'[\s.]', '', (m.group(4) or '')).lower()
        if ampm.startswith('p') and h < 12:
            h += 12
        elif ampm.startswith('a') and h == 12:
            h = 0
        if h > 23 or mi > 59 or sec > 59:
            continue
        try:
            return time(h, mi, sec)
        except ValueError:
            continue
    return None


def _limpiar_comercio(raw: str) -> str:
    s = re.sub(r'\s+', ' ', (raw or '').strip())
    s = re.sub(r'^[\s:;,\-–—]+|[\s:;,\-–—]+$', '', s)
    s = re.sub(r'\s+(?:por|con|el|a\s+las|monto|tarjeta|fecha|hora)\b.*$', '', s, flags=re.I)
    s = re.sub(r'\$\s*[\d.]+(?:,\d{1,2})?', '', s).strip()
    return s[:255]


def _es_comercio_generico(comercio: str) -> bool:
    c = re.sub(r'\s+', ' ', (comercio or '').strip().lower())
    if not c or len(c) < 3:
        return True
    if c in _COMERCIOS_GENERICOS:
        return True
    if re.fullmatch(r'comercio\s+nacional', c):
        return True
    return False


def _es_subject_notificacion(subject: str) -> bool:
    s = (subject or '').strip().lower()
    if not s:
        return True
    if re.match(r'^(?:rv|re|fw|fwd)\s*:', s):
        return True
    if re.search(
        r'notificaci[oó]n|uso de tu tarjeta|alerta de|aviso de compra|compra en comercio',
        s,
    ):
        return True
    return False


def _comercio_desde_subject(subject: str) -> str:
    if _es_subject_notificacion(subject):
        return ''
    sub = (subject or '').strip()
    sub = re.sub(
        r'^(?:alerta|aviso|notificaci[oó]n|compra|consumo|cargo)\s*[:\-]?\s*',
        '',
        sub,
        flags=re.I,
    )
    sub = _limpiar_comercio(sub)
    if _es_comercio_generico(sub):
        return ''
    if re.search(r'\b(?:bci|santander|bancoestado|banco\s*estado|itau|scotiabank)\b', sub, re.I):
        if len(sub) < 40:
            return ''
    return sub


def _comercio_etiquetado(texto: str) -> str:
    """Prioriza filas tipo 'Comercio: ALINER LTDA' / 'Comercio ALINER LTDA' del cuerpo."""
    patterns = [
        r'(?:^|\n|\r)\s*(?:comercio|establecimiento|merchant)\s*:?\s*'
        r'([A-Za-z0-9ÁÉÍÓÚáéíóúÑñ .&\'\-]{2,80}?)(?=\s*(?:\n|\r|$|monto|fecha|hora|tarjeta|n[uú]mero))',
        r'(?:comercio|establecimiento|merchant)\s*:\s*([^\n\r]{2,80})',
        r'(?:comercio|establecimiento|merchant)\s+'
        r'([A-Za-z0-9ÁÉÍÓÚáéíóúÑñ .&\'\-]{2,80}?)(?=\s*(?:\n|\r|$|si no quieres|bci\.cl))',
    ]
    for pat in patterns:
        m = re.search(pat, texto, re.IGNORECASE | re.MULTILINE)
        if not m:
            continue
        comercio = _limpiar_comercio(m.group(1))
        if not _es_comercio_generico(comercio):
            return comercio
    return ''


def _comercio_desde_texto(texto: str, subject: str = '') -> str:
    etiquetado = _comercio_etiquetado(texto)
    if etiquetado:
        return etiquetado

    patterns = [
        r'(?:compra|consumo)\s+(?:realizad[ao]\s+)?(?:en|en el)\s+'
        r'([A-Za-z0-9ÁÉÍÓÚáéíóúÑñ .&\'-]{3,80})',
        r'(?:en|en el)\s+([A-Za-z0-9ÁÉÍÓÚáéíóúÑñ .&\'-]{3,80}?)\s+'
        r'(?:por|con\s+tarjeta|el\s+\d|a\s+las|monto)',
    ]
    for pat in patterns:
        m = re.search(pat, texto, re.IGNORECASE)
        if not m:
            continue
        comercio = _limpiar_comercio(m.group(1))
        if not _es_comercio_generico(comercio):
            return comercio

    from_subject = _comercio_desde_subject(subject)
    if from_subject:
        return from_subject
    return ''


def _campos_comunes(subject: str, body: str) -> tuple[str, date | None, time | None, str, TipoTarjeta]:
    texto = f'{subject}\n{body}'
    return (
        _comercio_desde_texto(texto, subject),
        _fecha_desde_texto(texto),
        _hora_desde_texto(texto),
        _ultimos_4(texto),
        _tipo_tarjeta_desde_texto(texto),
    )


def parse_generico(subject: str, body: str) -> GastoParseado | None:
    texto = f'{subject}\n{body}'
    monto = _monto_desde_texto(texto)
    if monto is None:
        return None
    comercio, fecha, hora, ultimos, tipo = _campos_comunes(subject, body)
    return GastoParseado(
        monto=monto,
        comercio=comercio,
        fecha=fecha,
        hora=hora,
        ultimos_4=ultimos,
        tipo_tarjeta=tipo,
        banco='GENERICO',
        raw_subject=subject,
        confianza=0.55,
    )


def parse_bci(subject: str, body: str) -> GastoParseado | None:
    texto = f'{subject}\n{body}'
    monto = _monto_desde_texto(texto)
    if monto is None:
        return None
    # Primero la tabla etiquetada del mail BCI; luego frases sueltas.
    comercio = _comercio_etiquetado(texto)
    if not comercio:
        m = re.search(
            r'(?:Compra|consumo)\s+(?:por\s+\$[\d.]+(?:,\d{1,2})?\s+)?(?:en\s+)?(.+?)'
            r'(?:\s+con\s+tarjeta|\s+el\s+\d|\s+a\s+las|$)',
            texto,
            re.IGNORECASE | re.DOTALL,
        )
        if m:
            candidato = _limpiar_comercio(m.group(1))
            if not _es_comercio_generico(candidato):
                comercio = candidato
    if not comercio:
        comercio = _comercio_desde_texto(texto, subject)
    _, fecha, hora, ultimos, tipo = _campos_comunes(subject, body)
    return GastoParseado(
        monto=monto,
        comercio=comercio,
        fecha=fecha,
        hora=hora,
        ultimos_4=ultimos,
        tipo_tarjeta=tipo,
        banco='BCI',
        raw_subject=subject,
        confianza=0.8,
    )


def parse_santander(subject: str, body: str) -> GastoParseado | None:
    texto = f'{subject}\n{body}'
    monto = _monto_desde_texto(texto)
    if monto is None:
        return None
    comercio, fecha, hora, ultimos, tipo = _campos_comunes(subject, body)
    return GastoParseado(
        monto=monto,
        comercio=comercio,
        fecha=fecha,
        hora=hora,
        ultimos_4=ultimos,
        tipo_tarjeta=tipo,
        banco='SANTANDER',
        raw_subject=subject,
        confianza=0.75,
    )


def parse_bancoestado(subject: str, body: str) -> GastoParseado | None:
    texto = f'{subject}\n{body}'
    monto = _monto_desde_texto(texto)
    if monto is None:
        return None
    comercio, fecha, hora, ultimos, tipo = _campos_comunes(subject, body)
    return GastoParseado(
        monto=monto,
        comercio=comercio,
        fecha=fecha,
        hora=hora,
        ultimos_4=ultimos,
        tipo_tarjeta=tipo,
        banco='BANCOESTADO',
        raw_subject=subject,
        confianza=0.75,
    )


_PARSERS_POR_REMITENTE: list[tuple[re.Pattern, Callable[[str, str], GastoParseado | None]]] = [
    (re.compile(r'bci\.cl|banco\s*bci', re.I), parse_bci),
    (re.compile(r'santander\.cl|banco\s*santander', re.I), parse_santander),
    (
        re.compile(r'bancoestado\.cl|banco\s*estado|correo\.bancoestado', re.I),
        parse_bancoestado,
    ),
]


def parse_email(*, subject: str, body: str, from_addr: str = '') -> GastoParseado | None:
    blob = f'{from_addr} {subject}'
    for pattern, parser in _PARSERS_POR_REMITENTE:
        if pattern.search(blob):
            parsed = parser(subject, body)
            if parsed:
                return parsed
    if re.search(r'compra|cargo|consumo|abono', f'{subject} {body}', re.I):
        return parse_generico(subject, body)
    return parse_generico(subject, body)
