"""Parser de mensajes de captura (regex primero; LLM opcional)."""

from __future__ import annotations

import json
import re
from decimal import Decimal, InvalidOperation
from typing import Any

from django.conf import settings


_MONTO_RE = re.compile(
    r'(?P<monto>\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*'
    r'(?:lucas|lks|mil)?',
    re.IGNORECASE,
)
_LUCAS_RE = re.compile(
    r'(?P<n>\d+(?:[.,]\d+)?)\s*(?:lucas|lks)\b',
    re.IGNORECASE,
)


def _parse_monto_chileno(raw: str) -> Decimal | None:
    s = raw.strip().replace(' ', '').replace('.', '').replace(',', '.')
    try:
        return Decimal(s).quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError):
        return None


def parsear_mensaje_heuristico(texto: str) -> dict[str, Any]:
    """
    Extrae monto/comercio sin LLM.
    Ej: "2 lucas café", "12500 lider", "$8.990 Falabella"
    """
    texto = (texto or '').strip()
    result: dict[str, Any] = {
        'monto': None,
        'comercio': '',
        'confianza': 0.0,
        'raw': texto,
    }
    if not texto:
        return result

    m_lucas = _LUCAS_RE.search(texto)
    if m_lucas:
        n = Decimal(m_lucas.group('n').replace(',', '.'))
        result['monto'] = (n * Decimal('1000')).quantize(Decimal('0.01'))
        resto = (texto[: m_lucas.start()] + texto[m_lucas.end() :]).strip(' -,:')
        result['comercio'] = resto
        result['confianza'] = 0.75 if resto else 0.55
        return result

    m = _MONTO_RE.search(texto)
    if m:
        monto = _parse_monto_chileno(m.group('monto'))
        if monto is not None:
            result['monto'] = monto
            resto = (texto[: m.start()] + texto[m.end() :]).strip(' -$:,')
            # quitar símbolos de moneda sueltos
            resto = re.sub(r'^\$+\s*', '', resto).strip()
            result['comercio'] = resto
            result['confianza'] = 0.7 if resto else 0.5
    return result


def parsear_mensaje_llm(texto: str) -> dict[str, Any] | None:
    """Usa el cliente LLM del asistente si está configurado."""
    if not (getattr(settings, 'ASISTENTE_LLM_API_KEY', '') or '').strip():
        return None
    try:
        from applications.finanzas.asistente.llm import LLMClient, LLMUnavailableError
    except ImportError:
        return None

    system = (
        'Extrae un gasto en JSON estricto con claves: monto (number), comercio (string). '
        'montos en CLP. Si no hay monto, monto=null. Sin markdown.'
    )
    client = LLMClient()
    if not client.disponible():
        return None
    try:
        raw = client.chat(
            messages=[
                {'role': 'system', 'content': system},
                {'role': 'user', 'content': texto},
            ],
            tools=None,
        )
    except LLMUnavailableError:
        return None
    except Exception:
        return None

    content = (raw.get('content') or '') if isinstance(raw, dict) else ''
    content = (content or '').strip()
    if content.startswith('```'):
        content = re.sub(r'^```(?:json)?\s*', '', content)
        content = re.sub(r'\s*```$', '', content)
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return None
    monto = data.get('monto')
    try:
        monto_d = Decimal(str(monto)).quantize(Decimal('0.01')) if monto is not None else None
    except (InvalidOperation, ValueError, TypeError):
        monto_d = None
    return {
        'monto': monto_d,
        'comercio': (data.get('comercio') or '')[:255],
        'confianza': 0.85 if monto_d is not None else 0.3,
        'raw': texto,
    }


def parsear_mensaje(texto: str) -> dict[str, Any]:
    heur = parsear_mensaje_heuristico(texto)
    if heur.get('monto') is not None and heur.get('confianza', 0) >= 0.7:
        return heur
    llm = parsear_mensaje_llm(texto)
    if llm and llm.get('monto') is not None:
        return llm
    return heur
