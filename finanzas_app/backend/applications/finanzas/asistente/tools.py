"""Schemas OpenAI y ejecución de tools del asistente (tenant inyectado)."""

from __future__ import annotations

import json
from datetime import date
from typing import Any, Callable

from django.utils import timezone

from applications.finanzas.services import analytics as analytics_svc

# Args que el LLM no puede usar para cambiar de tenant.
_ARGS_PROHIBIDOS = frozenset({'espacio_id', 'espacio', 'usuario_id', 'usuario', 'familia_id'})


def _hoy() -> date:
    return timezone.localdate()


TOOL_SCHEMAS: list[dict] = [
    {
        'type': 'function',
        'function': {
            'name': 'avance_presupuesto_mes',
            'description': (
                'Avance de presupuestos vs gasto del mes (filas por categoría + resumen). '
                'Ámbito FAMILIAR (gastos comunes) o PERSONAL.'
            ),
            'parameters': {
                'type': 'object',
                'properties': {
                    'mes': {'type': 'integer', 'description': 'Mes 1-12'},
                    'anio': {'type': 'integer', 'description': 'Año YYYY'},
                    'ambito': {
                        'type': 'string',
                        'enum': ['FAMILIAR', 'PERSONAL'],
                    },
                    'cuenta_id': {
                        'type': 'integer',
                        'description': 'Opcional; solo ámbito PERSONAL',
                    },
                },
                'required': ['mes', 'anio', 'ambito'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'gasto_categoria_por_mes',
            'description': 'Gasto de una categoría en un mes (efectivo + cuotas crédito).',
            'parameters': {
                'type': 'object',
                'properties': {
                    'categoria_id': {'type': 'integer'},
                    'mes': {'type': 'integer'},
                    'anio': {'type': 'integer'},
                    'ambito': {
                        'type': 'string',
                        'enum': ['FAMILIAR', 'PERSONAL'],
                    },
                    'cuenta_id': {'type': 'integer'},
                },
                'required': ['categoria_id', 'mes', 'anio', 'ambito'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'listar_alertas_recientes',
            'description': (
                'Notificaciones recientes del usuario en el espacio '
                '(presupuesto umbral y cambios de compensación).'
            ),
            'parameters': {
                'type': 'object',
                'properties': {
                    'limite': {
                        'type': 'integer',
                        'description': 'Máximo de filas (default 20, max 50)',
                    },
                },
                'required': [],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'resumen_mes_cerrado',
            'description': (
                'Resumen familiar de un mes calendario ya cerrado '
                '(prorrateo, compensación). No incluye el mes en curso.'
            ),
            'parameters': {
                'type': 'object',
                'properties': {
                    'mes': {'type': 'integer'},
                    'anio': {'type': 'integer'},
                },
                'required': ['mes', 'anio'],
            },
        },
    },
]


def _limpiar_args(raw: dict) -> dict:
    return {k: v for k, v in raw.items() if k not in _ARGS_PROHIBIDOS}


def _parse_args(arguments_json: str) -> dict:
    try:
        raw = json.loads(arguments_json or '{}')
    except json.JSONDecodeError:
        return {}
    if not isinstance(raw, dict):
        return {}
    return _limpiar_args(raw)


def _defaults_mes_anio(args: dict) -> dict:
    hoy = _hoy()
    out = dict(args)
    if 'mes' not in out:
        out['mes'] = hoy.month
    if 'anio' not in out:
        out['anio'] = hoy.year
    return out


def _run_avance(usuario, espacio, args: dict) -> dict:
    a = _defaults_mes_anio(args)
    return analytics_svc.avance_presupuesto_mes(
        usuario,
        espacio,
        mes=int(a['mes']),
        anio=int(a['anio']),
        ambito=str(a.get('ambito', 'FAMILIAR')).upper(),
        cuenta_id=int(a['cuenta_id']) if a.get('cuenta_id') is not None else None,
    )


def _run_gasto(usuario, espacio, args: dict) -> dict:
    a = _defaults_mes_anio(args)
    if a.get('categoria_id') is None:
        return {'error': 'categoria_id es obligatorio'}
    return analytics_svc.gasto_categoria_por_mes(
        usuario,
        espacio,
        categoria_id=int(a['categoria_id']),
        mes=int(a['mes']),
        anio=int(a['anio']),
        ambito=str(a.get('ambito', 'FAMILIAR')).upper(),
        cuenta_id=int(a['cuenta_id']) if a.get('cuenta_id') is not None else None,
    )


def _run_alertas(usuario, espacio, args: dict) -> dict:
    limite = args.get('limite')
    return analytics_svc.listar_alertas_recientes(
        usuario,
        espacio,
        limite=int(limite) if limite is not None else None,
    )


def _run_resumen(usuario, espacio, args: dict) -> dict:
    a = _defaults_mes_anio(args)
    return analytics_svc.resumen_mes_cerrado(
        usuario,
        espacio,
        mes=int(a['mes']),
        anio=int(a['anio']),
    )


_HANDLERS: dict[str, Callable[..., dict]] = {
    'avance_presupuesto_mes': _run_avance,
    'gasto_categoria_por_mes': _run_gasto,
    'listar_alertas_recientes': _run_alertas,
    'resumen_mes_cerrado': _run_resumen,
}


def nombres_tools() -> list[str]:
    return list(_HANDLERS.keys())


def ejecutar_tool(
    nombre: str,
    arguments_json: str,
    usuario,
    espacio,
) -> dict[str, Any]:
    """
    Ejecuta una tool con usuario/espacio del request.
    Ignora cualquier espacio_id/usuario_id en los argumentos del modelo.
    """
    if nombre not in _HANDLERS:
        return {'error': f'tool desconocida: {nombre}'}
    args = _parse_args(arguments_json)
    try:
        return _HANDLERS[nombre](usuario, espacio, args)
    except ValueError as exc:
        return {'error': str(exc)}
    except Exception:  # noqa: BLE001
        return {'error': 'No se pudo ejecutar la consulta'}


def tool_resultado_vacio(nombre: str, resultado: dict) -> bool:
    """Heurística: el payload no alcanza para responder."""
    if not isinstance(resultado, dict):
        return True
    if resultado.get('error'):
        return True
    if nombre == 'avance_presupuesto_mes':
        resumen = resultado.get('resumen') or {}
        filas = resultado.get('filas') or []
        return not filas and int(resumen.get('total_gastado') or 0) == 0
    if nombre == 'gasto_categoria_por_mes':
        return int(resultado.get('gastado') or 0) == 0 and resultado.get('categoria_nombre') is None
    if nombre == 'listar_alertas_recientes':
        return int(resultado.get('total') or 0) == 0
    if nombre == 'resumen_mes_cerrado':
        return resultado.get('resumen') is None
    return False
