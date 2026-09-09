"""
Primitivas compartidas por los parsers de correos bancarios.

Aquí vive solo lo que es genuinamente transversal: formatos de número, fecha,
hora, moneda y extracción de filas etiquetadas. Todo lo que sea particular de
un remitente —qué rótulos usa, cómo redacta la frase del comercio, cuál de las
cuentas es la propia— pertenece a su módulo de banco, no a este archivo.

Regla práctica: si para soportar un banco nuevo te dan ganas de agregar una
alternativa a un regex de acá, casi siempre corresponde parametrizarlo o
resolverlo en el módulo del banco. Un cambio hecho para un remitente que toca
estas funciones afecta a todos.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, time
from decimal import Decimal, InvalidOperation
from typing import Literal, Sequence

COMERCIOS_GENERICOS = frozenset({
    'comercio nacional',
    'comercio internacional',
    'compra nacional',
    'compra internacional',
    'comercio',
    'nacional',
    'internacional',
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
    numero_cuenta: str = ''
    es_transferencia: bool = False
    #: Moneda en que venía el correo. `monto` queda en esta moneda; la
    #: conversión a la moneda base ocurre más tarde, en el ingest, porque
    #: requiere consultar el tipo de cambio por red.
    moneda: str = 'CLP'


#: Símbolos/códigos de moneda que pueden preceder al monto en un correo bancario.
SIMBOLO_MONEDA = r'(?:US\$|U\$S|USD|CLP|EUR|€|\$)'

#: Marcadores que los bancos escriben cuando un campo viene vacío.
VALORES_VACIOS = frozenset({
    'sin mensaje',
    'sin comentario',
    'sin glosa',
    'sin motivo',
    'sin descripción',
    'sin descripcion',
    'no aplica',
    'n/a',
    '-',
    '--',
})


# ── Números y moneda ─────────────────────────────────────────────────────────

def normalizar_numero(raw: str) -> Decimal | None:
    """
    Convierte un número escrito en formato chileno (1.234.567,89) o
    estadounidense (1,234,567.89) a Decimal.

    Se decide por el último separador presente: si lo siguen una o dos cifras
    es el decimal; si lo siguen tres, es separador de miles.
    """
    s = (raw or '').strip()
    if not s:
        return None

    corte = max(s.rfind('.'), s.rfind(','))
    if corte == -1:
        entero, decimales = s, ''
    else:
        candidatos = s[corte + 1:]
        if len(candidatos) in (1, 2) and candidatos.isdigit():
            entero, decimales = s[:corte], candidatos
        else:
            entero, decimales = s, ''

    entero = re.sub(r'\D', '', entero)
    if not entero and not decimales:
        return None
    try:
        return Decimal(f'{entero or "0"}.{decimales or "0"}').quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError):
        return None


def monto_desde_texto(texto: str) -> Decimal | None:
    m = re.search(
        rf'(?:^|\n|\r)\s*monto\s*:?\s*{SIMBOLO_MONEDA}?\s*(\d[\d.,]*)',
        texto,
        re.IGNORECASE | re.MULTILINE,
    )
    if m:
        monto = normalizar_numero(m.group(1))
        if monto is not None:
            return monto
    patterns = [
        rf'{SIMBOLO_MONEDA}\s*(\d[\d.,]*)',
        rf'(?:monto|por)\s*:?\s*{SIMBOLO_MONEDA}?\s*(\d[\d.,]*)',
    ]
    for pat in patterns:
        m = re.search(pat, texto, re.IGNORECASE)
        if m:
            monto = normalizar_numero(m.group(1))
            if monto is not None:
                return monto
    return None


def moneda_desde_texto(texto: str) -> str:
    """
    Detecta la moneda del monto. CLP por defecto: los correos nacionales
    escriben `$` sin prefijo.
    """
    m = re.search(
        rf'(?:^|\n|\r)\s*monto\s*:?\s*({SIMBOLO_MONEDA})',
        texto,
        re.IGNORECASE | re.MULTILINE,
    )
    if not m:
        # Sin fila etiquetada, buscar un código explícito. No se busca `$`
        # suelto: en Chile denota pesos.
        m = re.search(r'(US\$|U\$S|USD|EUR|€)', texto, re.IGNORECASE)
    token = (m.group(1) if m else '').upper().replace(' ', '')
    if token in ('US$', 'U$S', 'USD'):
        return 'USD'
    if token in ('EUR', '€'):
        return 'EUR'
    return 'CLP'


def solo_digitos(valor: str) -> str:
    return re.sub(r'\D', '', valor or '')


# ── Tarjeta, fecha y hora ────────────────────────────────────────────────────

def ultimos_4(texto: str) -> str:
    patterns = [
        r'(?:\*{2,}|\*{4}|••••|····|x{2,}|X{2,})\s*(\d{4})',
        r'(?:terminad[ao]\s+en|n[uú]mero\s+tarjeta[^\d]{0,40}|'
        r'tarjeta\s+(?:de\s+)?(?:d[eé]bito|cr[eé]dito)?[^\d]{0,20})\s*(\d{4})',
        r'tarjeta[^\d]{0,40}(\d{4})',
    ]
    for pat in patterns:
        m = re.search(pat, texto, re.IGNORECASE)
        if m:
            return m.group(1)
    return ''


def tipo_tarjeta_desde_texto(texto: str) -> TipoTarjeta:
    t = texto or ''
    if re.search(r'tarjeta\s+de\s+d[eé]bito|\bd[eé]bito\b', t, re.I):
        if not re.search(r'tarjeta\s+de\s+cr[eé]dito', t, re.I):
            return 'DEBITO'
        # Si aparecen ambos, mirar cerca de "número tarjeta".
        if re.search(r'n[uú]mero\s+tarjeta\s+d[eé]bito|tarjeta\s+d[eé]bito', t, re.I):
            return 'DEBITO'
    if re.search(r'tarjeta\s+de\s+cr[eé]dito|\bcr[eé]dito\b', t, re.I):
        return 'CREDITO'
    return ''


def fecha_desde_texto(texto: str) -> date | None:
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


def hora_desde_texto(texto: str) -> time | None:
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


# ── Comercio ─────────────────────────────────────────────────────────────────

def limpiar_comercio(raw: str) -> str:
    s = re.sub(r'\s+', ' ', (raw or '').strip())
    s = re.sub(r'^[\s:;,\-–—]+|[\s:;,\-–—]+$', '', s)
    s = re.sub(r'\s+(?:por|con|el|a\s+las|monto|tarjeta|fecha|hora)\b.*$', '', s, flags=re.I)
    s = re.sub(r'\$\s*[\d.]+(?:,\d{1,2})?', '', s).strip()
    return s[:255]


def es_comercio_generico(comercio: str) -> bool:
    c = re.sub(r'\s+', ' ', (comercio or '').strip().lower())
    if not c or len(c) < 3:
        return True
    return c in COMERCIOS_GENERICOS


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


def comercio_desde_subject(subject: str) -> str:
    if _es_subject_notificacion(subject):
        return ''
    sub = (subject or '').strip()
    sub = re.sub(
        r'^(?:alerta|aviso|notificaci[oó]n|compra|consumo|cargo)\s*[:\-]?\s*',
        '',
        sub,
        flags=re.I,
    )
    sub = limpiar_comercio(sub)
    if es_comercio_generico(sub):
        return ''
    if re.search(r'\b(?:bci|santander|bancoestado|banco\s*estado|itau|scotiabank)\b', sub, re.I):
        if len(sub) < 40:
            return ''
    return sub


def comercio_etiquetado(texto: str, corte_pie: str = '') -> str:
    """
    Comercio desde una fila rotulada ('Comercio: X' / 'Comercio X').

    `corte_pie` deja que cada banco declare el texto con que arranca su pie de
    página, para que la variante sin salto de línea no lo arrastre.
    """
    fin_linea = r'(?=\s*(?:\n|\r|$))'
    fin_suelto = rf'(?=\s*(?:\n|\r|$|{corte_pie}))' if corte_pie else fin_linea
    patterns = [
        # Fila en su propia línea: se toma el resto de la línea sin filtrar
        # caracteres. Los descriptores de tarjeta traen símbolos
        # (RAILWAY +14157077675 US, DL*GOOGLE) que una lista blanca corta.
        rf'(?:^|\n|\r)\s*(?:comercio|establecimiento|merchant)\s*:?\s*'
        rf'([^\n\r]{{2,80}}?){fin_linea}',
        r'(?:comercio|establecimiento|merchant)\s*:\s*([^\n\r]{2,80})',
        rf'(?:comercio|establecimiento|merchant)\s+'
        rf'([A-Za-z0-9ÁÉÍÓÚáéíóúÑñ .&\'\-]{{2,80}}?){fin_suelto}',
    ]
    for pat in patterns:
        m = re.search(pat, texto, re.IGNORECASE | re.MULTILINE)
        if not m:
            continue
        comercio = limpiar_comercio(m.group(1))
        if not es_comercio_generico(comercio):
            return comercio
    return ''


def comercio_desde_texto(texto: str, subject: str = '', corte_pie: str = '') -> str:
    etiquetado = comercio_etiquetado(texto, corte_pie=corte_pie)
    if etiquetado:
        return etiquetado

    # `*` es habitual en el identificador del procesador (DL*GOOGLE, SQ *CAFE).
    patterns = [
        r'(?:compra|consumo)\s+(?:realizad[ao]\s+)?(?:en|en el)\s+'
        r'([A-Za-z0-9ÁÉÍÓÚáéíóúÑñ .&*\'-]{3,80})',
        r'(?:en|en el)\s+([A-Za-z0-9ÁÉÍÓÚáéíóúÑñ .&*\'-]{3,80}?)\s+'
        r'(?:por|con\s+tarjeta|asociad[oa]|el\s+\d|a\s+las|monto)',
    ]
    for pat in patterns:
        m = re.search(pat, texto, re.IGNORECASE)
        if not m:
            continue
        comercio = limpiar_comercio(m.group(1))
        if not es_comercio_generico(comercio):
            return comercio

    return comercio_desde_subject(subject)


def campos_comunes(
    subject: str, body: str, corte_pie: str = '',
) -> tuple[str, date | None, time | None, str, TipoTarjeta]:
    texto = f'{subject}\n{body}'
    return (
        comercio_desde_texto(texto, subject, corte_pie=corte_pie),
        fecha_desde_texto(texto),
        hora_desde_texto(texto),
        ultimos_4(texto),
        tipo_tarjeta_desde_texto(texto),
    )


# ── Filas etiquetadas y transferencias ───────────────────────────────────────

def valor_etiquetado(texto: str, etiquetas: Sequence[str]) -> str:
    """
    Valor de una fila 'Etiqueta : valor'.

    El valor debe ir en la MISMA línea que su etiqueta: permitir el salto haría
    que una fila vacía ('Comentario :') tomara la línea siguiente, que suele
    ser el pie del correo.
    """
    for etiqueta in etiquetas:
        pat = (
            rf'(?:^|\n|\r)[ \t]*{etiqueta}[ \t]*:?[ \t]*'
            rf'([^\n\r]{{2,120}}?)(?=[ \t]*(?:\n|\r|$))'
        )
        m = re.search(pat, texto, re.IGNORECASE | re.MULTILINE)
        if not m:
            continue
        valor = re.sub(r'\s+', ' ', (m.group(1) or '').strip())
        valor = re.sub(r'^[\s:;,\-–—]+|[\s:;,\-–—]+$', '', valor)
        if valor:
            return valor[:255]
    return ''


def mensaje_transferencia(texto: str, etiquetas: Sequence[str]) -> str:
    """Mensaje/glosa, descartando los marcadores de campo vacío del banco."""
    valor = valor_etiquetado(texto, etiquetas)
    if valor.strip().lower() in VALORES_VACIOS:
        return ''
    return valor


def comercio_transferencia(destinatario: str, mensaje: str) -> str:
    """Comentario de una transferencia: 'destinatario - mensaje'."""
    dest = (destinatario or '').strip()
    msg = (mensaje or '').strip()
    if dest and msg:
        return f'{dest} - {msg}'[:255]
    return (dest or msg)[:255]


def numero_cuenta_desde_texto(texto: str, patrones: Sequence[str]) -> str:
    """
    Número de la cuenta de ORIGEN según los patrones que declare el banco.

    Nunca debe devolver la cuenta de destino: es la del receptor, y usarla para
    resolver la tarjeta asociaría el movimiento a la cuenta equivocada. Por eso
    los patrones se prueban en orden y el llamador pone primero los rótulos
    inequívocos de origen.
    """
    for pat in patrones:
        m = re.search(pat, texto, re.IGNORECASE | re.MULTILINE)
        if not m:
            continue
        digits = solo_digitos(m.group(1))
        if len(digits) >= 4:
            return digits
    return ''


def parece_compra_tarjeta(texto: str) -> bool:
    return bool(
        re.search(
            r'tarjeta\s+de\s+(?:d[eé]bito|cr[eé]dito)|'
            r'compra\s+con\s+tarjeta|'
            r'consumo\s+con\s+tarjeta|'
            r'uso\s+de\s+tu\s+tarjeta|'
            r'notificaci[oó]n\s+de\s+uso\s+de\s+tu\s+tarjeta',
            texto,
            re.I,
        )
    )


def parece_transferencia(subject: str, body: str) -> bool:
    texto = f'{subject}\n{body}'
    es_tef = bool(
        re.search(
            r'\btransferencia\b|\btransferiste\b|\bTEF\b|\benviaste\b|'
            r'\bhas\s+transferido\b|\btransferido\s+a\b|\btransferencia\s+a\b',
            texto,
            re.I,
        )
    )
    if not es_tef:
        return False
    if parece_compra_tarjeta(texto) and not re.search(
        r'\btransferencia\b|\btransferiste\b|\bTEF\b|\bhas\s+transferido\b',
        texto,
        re.I,
    ):
        return False
    return True
