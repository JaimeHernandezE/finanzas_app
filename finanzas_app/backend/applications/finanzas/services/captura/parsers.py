"""Parsers de correos bancarios."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, time
from decimal import Decimal, InvalidOperation
from typing import Callable, Literal


_COMERCIOS_GENERICOS = frozenset({
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
_SIMBOLO_MONEDA = r'(?:US\$|U\$S|USD|CLP|EUR|€|\$)'


def _normalizar_numero(raw: str) -> Decimal | None:
    """
    Convierte un número escrito en formato chileno (1.234.567,89) o
    estadounidense (1,234,567.89) a Decimal.

    Se decide por el último separador presente: si lo siguen una o dos cifras
    es el decimal; si lo siguen tres, es separador de miles. Antes se hacía
    `.replace('.', '')` incondicional, lo que convertía un `49.99` en 4999.
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


def _monto_desde_texto(texto: str) -> Decimal | None:
    # Preferir fila etiquetada "Monto"
    m = re.search(
        rf'(?:^|\n|\r)\s*monto\s*:?\s*{_SIMBOLO_MONEDA}?\s*(\d[\d.,]*)',
        texto,
        re.IGNORECASE | re.MULTILINE,
    )
    if m:
        monto = _normalizar_numero(m.group(1))
        if monto is not None:
            return monto
    patterns = [
        rf'{_SIMBOLO_MONEDA}\s*(\d[\d.,]*)',
        rf'(?:monto|por)\s*:?\s*{_SIMBOLO_MONEDA}?\s*(\d[\d.,]*)',
    ]
    for pat in patterns:
        m = re.search(pat, texto, re.IGNORECASE)
        if m:
            monto = _normalizar_numero(m.group(1))
            if monto is not None:
                return monto
    return None


def _moneda_desde_texto(texto: str) -> str:
    """
    Detecta la moneda del monto. CLP por defecto: los correos nacionales
    escriben `$` sin prefijo.
    """
    m = re.search(
        rf'(?:^|\n|\r)\s*monto\s*:?\s*({_SIMBOLO_MONEDA})',
        texto,
        re.IGNORECASE | re.MULTILINE,
    )
    if not m:
        # Sin fila etiquetada, buscar un código explícito en el cuerpo. No se
        # busca `$` suelto: en Chile denota pesos.
        m = re.search(r'(US\$|U\$S|USD|EUR|€)', texto, re.IGNORECASE)
    token = (m.group(1) if m else '').upper().replace(' ', '')
    if token in ('US$', 'U$S', 'USD'):
        return 'USD'
    if token in ('EUR', '€'):
        return 'EUR'
    return 'CLP'


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
        # Fila etiquetada en su propia línea: se toma el resto de la línea sin
        # filtrar caracteres. Los descriptores de tarjeta traen símbolos
        # (RAILWAY +14157077675 US, DL*GOOGLE) que una lista blanca corta.
        r'(?:^|\n|\r)\s*(?:comercio|establecimiento|merchant)\s*:?\s*'
        r'([^\n\r]{2,80}?)(?=\s*(?:\n|\r|$))',
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

    # `*` es habitual en el identificador del procesador (DL*GOOGLE, SQ *CAFE,
    # PAYPAL *STEAM); sin él la captura se cortaba antes del nombre real.
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


def _solo_digitos(valor: str) -> str:
    return re.sub(r'\D', '', valor or '')


def _parece_compra_tarjeta(texto: str) -> bool:
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


def _parece_transferencia(subject: str, body: str) -> bool:
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
    if _parece_compra_tarjeta(texto) and not re.search(
        r'\btransferencia\b|\btransferiste\b|\bTEF\b|\bhas\s+transferido\b',
        texto,
        re.I,
    ):
        return False
    return True


def _valor_etiquetado(texto: str, etiquetas: tuple[str, ...]) -> str:
    for etiqueta in etiquetas:
        # El valor debe ir en la MISMA línea que la etiqueta: con `\s*` el
        # salto de línea se consumía y una fila vacía ("Comentario :") tomaba
        # la línea siguiente, que suele ser el pie del correo.
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


def _destinatario_desde_texto(texto: str) -> str:
    return _valor_etiquetado(
        texto,
        (
            r'nombre\s+del\s+destinatario',
            r'destinatario',
            r'beneficiario',
            r'transferencia\s+a',
            r'transferido\s+a',
            r'a\s+nombre\s+de',
            # BancoEstado rotula la fila solo como "Nombre", bajo "Hacia:".
            # Va al final para no ganarle a las etiquetas inequívocas.
            r'nombre',
        ),
    )


#: Marcadores que los bancos escriben cuando el campo viene vacío. Sin esto el
#: comentario terminaba como "Jaime Calderón - Sin mensaje".
_VALORES_VACIOS = frozenset({
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


def _mensaje_transferencia_desde_texto(texto: str) -> str:
    valor = _valor_etiquetado(
        texto,
        (
            r'mensaje',
            r'glosa',
            r'comentario',
            r'motivo',
        ),
    )
    if valor.strip().lower() in _VALORES_VACIOS:
        return ''
    return valor


#: Contexto que delata que un número de cuenta es el del receptor.
_CONTEXTO_CUENTA_DESTINO = re.compile(
    r'destino|destinatari|beneficiari|abono\s+a', re.IGNORECASE,
)


def _numero_cuenta_desde_texto(texto: str) -> str:
    """
    Número de la cuenta de ORIGEN, es decir la del propio usuario.

    Nunca debe devolver la cuenta de destino: es la del receptor, y usarla para
    resolver la tarjeta asociaría el movimiento a la cuenta equivocada. Por eso
    primero se prueban etiquetas inequívocas de origen y recién después una
    genérica, descartando la que venga precedida de contexto de destino.
    """
    numero = r'(\d[\d\s.\-]{3,39})'
    especificos = [
        # BCI: "Realizaste una transferencia ... desde tu cuenta N° 79834843"
        rf'desde\s+(?:tu|la|mi|su)\s+cuenta\s*(?:corriente\s*)?'
        rf'(?:n[°º]\s*|n[uú]mero\s*)?:?\s*{numero}',
        rf'cuenta\s+(?:de\s+)?origen\s*:?\s*{numero}',
        rf'cuenta\s+cargada\s*:?\s*{numero}',
        # BancoEstado TEF: bloque "Desde:" con la fila "N° de cuenta : ...".
        # El mismo rótulo se repite en el bloque "Hacia:", así que se toma la
        # primera aparición, que es la de origen.
        rf'n[°º]\s*de\s+cuenta\s*:?\s*{numero}',
        rf'n[uú]mero\s+de\s+cuenta\s*:?\s*{numero}',
        rf'n[uú]mero\s+cuenta\s*:?\s*{numero}',
    ]
    for pat in especificos:
        m = re.search(pat, texto, re.IGNORECASE | re.MULTILINE)
        if not m:
            continue
        digits = _solo_digitos(m.group(1))
        if len(digits) >= 4:
            return digits

    for m in re.finditer(rf'cuenta\s*:?\s*{numero}', texto, re.IGNORECASE):
        previo = texto[max(0, m.start() - 40):m.start()]
        if _CONTEXTO_CUENTA_DESTINO.search(previo):
            continue
        digits = _solo_digitos(m.group(1))
        if len(digits) >= 4:
            return digits
    return ''


def _comercio_transferencia(destinatario: str, mensaje: str) -> str:
    dest = (destinatario or '').strip()
    msg = (mensaje or '').strip()
    if dest and msg:
        return f'{dest} - {msg}'[:255]
    return (dest or msg)[:255]


def parse_transferencia_generico(subject: str, body: str) -> GastoParseado | None:
    texto = f'{subject}\n{body}'
    monto = _monto_desde_texto(texto)
    if monto is None:
        return None
    destinatario = _destinatario_desde_texto(texto)
    mensaje = _mensaje_transferencia_desde_texto(texto)
    comercio = _comercio_transferencia(destinatario, mensaje)
    if not comercio:
        # Fallback suave: primera línea útil del subject si no es genérica.
        sub = re.sub(
            r'^(?:alerta|aviso|notificaci[oó]n|transferencia)\s*[:\-]?\s*',
            '',
            (subject or '').strip(),
            flags=re.I,
        )
        comercio = _limpiar_comercio(sub) if sub and len(sub) >= 3 else ''
    return GastoParseado(
        monto=monto,
        comercio=comercio,
        fecha=_fecha_desde_texto(texto),
        hora=_hora_desde_texto(texto),
        ultimos_4='',
        banco='GENERICO',
        tipo_tarjeta='DEBITO',
        raw_subject=subject,
        confianza=0.6,
        numero_cuenta=_numero_cuenta_desde_texto(texto),
        es_transferencia=True,
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
        moneda=_moneda_desde_texto(texto),
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
    # BancoEstado no usa tabla sino prosa: "Se ha realizado compra e-commerce
    # por $ 5.500 en DL*GOOGLE YOUTUBE SANTIAGO CL asociado a su tarjeta de
    # Débito terminada en **** 2569 el día ... a las ... hrs.". El comercio va
    # entre "en" y "asociado", delimitado con precisión para no depender de la
    # clase de caracteres genérica.
    comercio = ''
    m = re.search(
        r'\ben\s+(.+?)\s+asociad[oa]\s+a\s+su\s+tarjeta',
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
        banco='BANCOESTADO',
        raw_subject=subject,
        confianza=0.75,
    )


#: (patrón de remitente, banco, parser de compras). El banco se declara aquí
#: para poder etiquetar también las transferencias, que se desvían antes del
#: dispatch por banco y quedaban siempre como GENERICO.
_PARSERS_POR_REMITENTE: list[tuple[re.Pattern, str, Callable[[str, str], GastoParseado | None]]] = [
    (re.compile(r'bci\.cl|banco\s*bci', re.I), 'BCI', parse_bci),
    (re.compile(r'santander\.cl|banco\s*santander', re.I), 'SANTANDER', parse_santander),
    (
        re.compile(r'bancoestado\.cl|banco\s*estado|correo\.bancoestado', re.I),
        'BANCOESTADO',
        parse_bancoestado,
    ),
]


def _banco_desde_remitente(from_addr: str, subject: str = '') -> str:
    blob = f'{from_addr} {subject}'
    for pattern, banco, _parser in _PARSERS_POR_REMITENTE:
        if pattern.search(blob):
            return banco
    return 'GENERICO'


def parse_email(*, subject: str, body: str, from_addr: str = '') -> GastoParseado | None:
    if _parece_transferencia(subject, body):
        parsed_tef = parse_transferencia_generico(subject, body)
        if parsed_tef:
            parsed_tef.banco = _banco_desde_remitente(from_addr, subject)
            return parsed_tef
    blob = f'{from_addr} {subject}'
    for pattern, _banco, parser in _PARSERS_POR_REMITENTE:
        if pattern.search(blob):
            parsed = parser(subject, body)
            if parsed:
                return parsed
    if re.search(r'compra|cargo|consumo|abono', f'{subject} {body}', re.I):
        return parse_generico(subject, body)
    return parse_generico(subject, body)
