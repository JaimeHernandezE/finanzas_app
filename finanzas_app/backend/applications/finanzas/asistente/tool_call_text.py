"""Rescate de tool calls cuando el LLM las escribe como texto JSON (modelos pequeños)."""

from __future__ import annotations

import json
import re
import uuid
from typing import Any


def _nuevo_call_id() -> str:
    return f'call_text_{uuid.uuid4().hex[:12]}'


def _normalizar_params(obj: dict) -> dict:
    """Acepta parameters / arguments / kwargs; convierte None string."""
    params = obj.get('parameters')
    if params is None:
        params = obj.get('arguments')
    if params is None:
        params = obj.get('kwargs')
    if isinstance(params, str):
        try:
            params = json.loads(params)
        except json.JSONDecodeError:
            params = {}
    if not isinstance(params, dict):
        params = {}
    out = {}
    for k, v in params.items():
        if v is None or v == 'None' or v == 'null':
            continue
        out[k] = v
    return out


def _como_tool_call(nombre: str, params: dict, *, call_id: str | None = None) -> dict:
    return {
        'id': call_id or _nuevo_call_id(),
        'name': nombre,
        'arguments_json': json.dumps(params, ensure_ascii=False),
    }


def _desde_dict(obj: Any, permitidos: set[str]) -> list[dict] | None:
    if not isinstance(obj, dict):
        return None

    # {"tool_calls": [{"function": {"name", "arguments"}}]} o lista simplificada
    if 'tool_calls' in obj and isinstance(obj['tool_calls'], list):
        out = []
        for item in obj['tool_calls']:
            if not isinstance(item, dict):
                continue
            fn = item.get('function') if isinstance(item.get('function'), dict) else item
            nombre = fn.get('name') or item.get('name')
            if nombre not in permitidos:
                continue
            params = _normalizar_params(fn if 'parameters' in fn or 'arguments' in fn else item)
            if 'arguments' in fn and not params:
                params = _normalizar_params({'arguments': fn.get('arguments')})
            out.append(_como_tool_call(str(nombre), params, call_id=item.get('id')))
        return out or None

    nombre = obj.get('name') or obj.get('tool') or obj.get('function')
    if isinstance(nombre, dict):
        # {"function": {"name": "...", "arguments": ...}}
        nested = nombre
        nombre = nested.get('name')
        params = _normalizar_params(nested)
        if nombre in permitidos:
            return [_como_tool_call(str(nombre), params)]
        return None

    if nombre in permitidos:
        return [_como_tool_call(str(nombre), _normalizar_params(obj))]

    return None


def _extraer_json_blobs(texto: str) -> list[str]:
    """Extrae candidatos JSON (objeto completo o bloques ```json)."""
    t = (texto or '').strip()
    if not t:
        return []

    blobs: list[str] = []

    for m in re.finditer(r'```(?:json)?\s*([\s\S]*?)```', t, re.I):
        blobs.append(m.group(1).strip())

    for m in re.finditer(
        r'<(?:tool_call|function_call)>\s*([\s\S]*?)</(?:tool_call|function_call)>',
        t,
        re.I,
    ):
        blobs.append(m.group(1).strip())

    # Objeto JSON principal si el mensaje es casi solo JSON
    if t.startswith('{'):
        blobs.append(t)

    # Primer {...} balanceado en el texto
    start = t.find('{')
    if start >= 0 and t not in blobs:
        depth = 0
        for i, ch in enumerate(t[start:], start):
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    blobs.append(t[start : i + 1])
                    break

    # Dedup preservando orden
    seen: set[str] = set()
    out = []
    for b in blobs:
        if b and b not in seen:
            seen.add(b)
            out.append(b)
    return out


def rescatar_tool_calls_desde_texto(
    content: str | None,
    nombres_permitidos: list[str] | set[str],
) -> list[dict]:
    """
    Si el modelo pegó una llamada como texto, la convierte al formato del orquestador:
    [{id, name, arguments_json}, ...]
    """
    permitidos = set(nombres_permitidos)
    if not content or not permitidos:
        return []

    for blob in _extraer_json_blobs(content):
        try:
            parsed = json.loads(blob)
        except json.JSONDecodeError:
            continue
        calls = _desde_dict(parsed, permitidos)
        if calls:
            return calls
        if isinstance(parsed, list):
            out = []
            for item in parsed:
                c = _desde_dict(item, permitidos)
                if c:
                    out.extend(c)
            if out:
                return out

    return []


def enriquecer_resultado_con_rescate(
    result: dict,
    nombres_permitidos: list[str] | set[str],
) -> dict:
    """
    Si no hay tool_calls API pero el content parece una llamada, la rescuea
    y reconstruye raw_message compatible con el loop del orquestador.
    """
    if result.get('tool_calls'):
        return result

    content = result.get('content')
    rescued = rescatar_tool_calls_desde_texto(content, nombres_permitidos)
    if not rescued:
        return result

    raw = {
        'role': 'assistant',
        'content': None,
        'tool_calls': [
            {
                'id': tc['id'],
                'type': 'function',
                'function': {
                    'name': tc['name'],
                    'arguments': tc['arguments_json'],
                },
            }
            for tc in rescued
        ],
    }
    return {
        'content': None,
        'tool_calls': rescued,
        'raw_message': raw,
        'rescued_from_text': True,
    }
