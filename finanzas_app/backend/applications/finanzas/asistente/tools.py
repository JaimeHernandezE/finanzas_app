"""Schemas OpenAI y ejecución de tools del asistente (tenant inyectado)."""

from __future__ import annotations

import json
from datetime import date
from typing import Any, Callable

from django.utils import timezone

from applications.finanzas.asistente.categorias import resolver_categoria
from applications.finanzas.services import analytics as analytics_svc

# Args que el LLM no puede usar para cambiar de tenant.
_ARGS_PROHIBIDOS = frozenset({'espacio_id', 'espacio', 'usuario_id', 'usuario', 'familia_id'})


def _hoy() -> date:
    return timezone.localdate()


def _schemas_tools() -> list[dict]:
    """Schemas con mes/anio actuales en las descripciones (evita sesgo 2023/2024 del LLM)."""
    hoy = _hoy()
    mes_desc = f'Mes 1-12. Para «este mes» usa {hoy.month}.'
    anio_desc = (
        f'Año YYYY. Para «este mes» o si el usuario no precisa año, usa {hoy.year} '
        '(no inventes 2023/2024).'
    )
    return [
        {
            'type': 'function',
            'function': {
                'name': 'avance_presupuesto_mes',
                'description': (
                    'Avance de presupuestos vs gasto del mes en curso o de un mes concreto '
                    '(filas por categoría + resumen). Usar para «cómo voy», «este mes», '
                    'presupuesto actual. Ámbito FAMILIAR (gastos comunes) o PERSONAL. '
                    f'Hoy: mes={hoy.month}, anio={hoy.year}.'
                ),
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'mes': {'type': 'integer', 'description': mes_desc},
                        'anio': {'type': 'integer', 'description': anio_desc},
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
                'description': (
                    'Gasto de una categoría en un mes (efectivo + cuotas crédito). '
                    'Prefiere categoria_nombre con el nombre que dijo el usuario '
                    '(ej. «comida», «Bencina»). Solo usa categoria_id si conoces el entero. '
                    f'Hoy: mes={hoy.month}, anio={hoy.year}.'
                ),
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'categoria_id': {
                            'type': 'integer',
                            'description': 'ID numérico de categoría (opcional si das categoria_nombre)',
                        },
                        'categoria_nombre': {
                            'type': 'string',
                            'description': (
                                'Nombre o fragmento de categoría como lo dice el usuario '
                                '(ej. comida, supermercado, bencina).'
                            ),
                        },
                        'mes': {'type': 'integer', 'description': mes_desc},
                        'anio': {'type': 'integer', 'description': anio_desc},
                        'ambito': {
                            'type': 'string',
                            'enum': ['FAMILIAR', 'PERSONAL'],
                        },
                        'cuenta_id': {'type': 'integer'},
                    },
                    'required': ['mes', 'anio', 'ambito'],
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
                    'Resumen familiar de un mes calendario YA CERRADO (prorrateo, compensación). '
                    'NO usar para el mes en curso ni para «cómo voy con el presupuesto». '
                    f'El mes en curso es {hoy.month}/{hoy.year}; el último mes cerrado es anterior a ese.'
                ),
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'mes': {'type': 'integer', 'description': mes_desc},
                        'anio': {'type': 'integer', 'description': anio_desc},
                    },
                    'required': ['mes', 'anio'],
                },
            },
        },
    ]


# Compat: imports que lean TOOL_SCHEMAS al import time.
TOOL_SCHEMAS: list[dict] = _schemas_tools()


def get_tool_schemas() -> list[dict]:
    return _schemas_tools()


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
    """Rellena mes/anio y corrige años absurdos (sesgo típico 2023/2024 del LLM)."""
    hoy = _hoy()
    out = dict(args)
    try:
        mes = int(out['mes']) if 'mes' in out and out['mes'] is not None else hoy.month
    except (TypeError, ValueError):
        mes = hoy.month
    try:
        anio = int(out['anio']) if 'anio' in out and out['anio'] is not None else hoy.year
    except (TypeError, ValueError):
        anio = hoy.year

    if not 1 <= mes <= 12:
        mes = hoy.month
    # Futuro, o más de 1 año atrás → año actual (hallucination típica en «este mes»).
    if anio > hoy.year or anio < hoy.year - 1:
        anio = hoy.year
    if anio == hoy.year and mes > hoy.month:
        mes = hoy.month
    out['mes'] = mes
    out['anio'] = anio
    return out


def _con_periodo(payload: dict, mes: int, anio: int) -> dict:
    """Añade periodo explícito para que el LLM no invente la fecha al redactar."""
    out = dict(payload)
    out['periodo'] = {'mes': mes, 'anio': anio}
    return out


def _run_avance(usuario, espacio, args: dict) -> dict:
    a = _defaults_mes_anio(args)
    mes, anio = int(a['mes']), int(a['anio'])
    payload = analytics_svc.avance_presupuesto_mes(
        usuario,
        espacio,
        mes=mes,
        anio=anio,
        ambito=str(a.get('ambito', 'FAMILIAR')).upper(),
        cuenta_id=int(a['cuenta_id']) if a.get('cuenta_id') is not None else None,
    )
    return _con_periodo(payload, mes, anio)


def _run_gasto(usuario, espacio, args: dict) -> dict:
    a = _defaults_mes_anio(args)
    mes, anio = int(a['mes']), int(a['anio'])
    ambito = str(a.get('ambito', 'FAMILIAR')).upper()
    resuelto = resolver_categoria(
        usuario,
        espacio,
        categoria_id=a.get('categoria_id'),
        categoria_nombre=a.get('categoria_nombre'),
        ambito=ambito,
    )
    if resuelto.get('error'):
        return {**resuelto, 'periodo': {'mes': mes, 'anio': anio}}
    payload = analytics_svc.gasto_categoria_por_mes(
        usuario,
        espacio,
        categoria_id=int(resuelto['categoria_id']),
        mes=mes,
        anio=anio,
        ambito=ambito,
        cuenta_id=int(a['cuenta_id']) if a.get('cuenta_id') is not None else None,
    )
    return _con_periodo(payload, mes, anio)


def _run_alertas(usuario, espacio, args: dict) -> dict:
    limite = args.get('limite')
    return analytics_svc.listar_alertas_recientes(
        usuario,
        espacio,
        limite=int(limite) if limite is not None else None,
    )


def _run_resumen(usuario, espacio, args: dict) -> dict:
    a = _defaults_mes_anio(args)
    mes, anio = int(a['mes']), int(a['anio'])
    hoy = _hoy()
    if mes == hoy.month and anio == hoy.year:
        return {
            'periodo': {'mes': mes, 'anio': anio},
            'mes_cerrado': False,
            'resumen': None,
            'error': (
                'Ese mes aún está en curso. Para «cómo voy este mes» usa '
                'avance_presupuesto_mes con el mismo mes/anio.'
            ),
        }
    payload = analytics_svc.resumen_mes_cerrado(
        usuario,
        espacio,
        mes=mes,
        anio=anio,
    )
    return _con_periodo(payload, mes, anio)


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
        # Mes en curso rechazado: el LLM debe reintentar con avance; no es “sin datos”.
        if nombre == 'resumen_mes_cerrado' and resultado.get('mes_cerrado') is False:
            return False
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
