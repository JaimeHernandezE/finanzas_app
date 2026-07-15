"""Orquestador: mensaje → LLM (function-calling) → tools analytics → respuesta."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from django.conf import settings

from applications.finanzas.asistente import brechas as brechas_svc
from applications.finanzas.asistente.llm import LLMClient, LLMUnavailableError
from applications.finanzas.asistente.prompts import system_prompt_para_espacio
from applications.finanzas.asistente.tools import (
    ejecutar_tool,
    get_tool_schemas,
    nombres_tools,
    tool_resultado_vacio,
)
from applications.finanzas.models import BrechaConsultaAsistente

logger = logging.getLogger(__name__)

_MAX_RONDAS_TOOLS = 2

_SUGERENCIAS_DEFAULT = [
    '¿Cómo voy con mis presupuestos este mes?',
    '¿Me avisaste alguna alerta de presupuesto?',
]


def _sugerencias_desde_datos(datos: dict[str, Any]) -> list[str]:
    """Si una tool devolvió candidatos de categoría, priorizar chips con esos nombres."""
    for payload in datos.values():
        if not isinstance(payload, dict):
            continue
        chips = payload.get('sugerencias_seguimiento')
        if isinstance(chips, list) and chips:
            return [str(c) for c in chips if c][:6]
        candidatos = payload.get('candidatos')
        if isinstance(candidatos, list) and candidatos:
            nombres = []
            for c in candidatos:
                if not isinstance(c, dict):
                    continue
                n = c.get('categoria_nombre')
                if n and n not in nombres:
                    nombres.append(str(n))
            if nombres:
                return [f'¿Cómo voy en {n} en gastos comunes este mes?' for n in nombres[:6]]
    return list(_SUGERENCIAS_DEFAULT)


def _truncar_historial(historial: list | None, max_turnos: int) -> list[dict]:
    if not historial:
        return []
    limpios = []
    for item in historial:
        if not isinstance(item, dict):
            continue
        role = item.get('role')
        content = item.get('content')
        if role not in ('user', 'assistant') or content is None:
            continue
        limpios.append({'role': role, 'content': str(content)[:2000]})
    if max_turnos > 0 and len(limpios) > max_turnos:
        limpios = limpios[-max_turnos:]
    return limpios


def _log_turno(
    *,
    usuario,
    espacio,
    herramientas_usadas: list[str],
    latencia_ms: int,
    senal_brecha: str | None,
) -> None:
    logger.info(
        'asistente_turno usuario_id=%s espacio_id=%s tools=%s latencia_ms=%s brecha=%s',
        getattr(usuario, 'pk', None),
        getattr(espacio, 'pk', None),
        ','.join(herramientas_usadas) or '-',
        latencia_ms,
        senal_brecha or '-',
    )


def consultar(
    *,
    usuario,
    espacio,
    mensaje: str,
    historial: list | None = None,
    llm: LLMClient | None = None,
) -> dict[str, Any]:
    """
    Ejecuta el flujo de chat y retorna el payload de la API.

    Raises:
        LLMUnavailableError: proveedor caído / sin key.
    """
    t0 = time.perf_counter()
    client = llm or LLMClient()
    messages: list[dict] = [
        {
            'role': 'system',
            'content': system_prompt_para_espacio(
                tipo_espacio=getattr(espacio, 'tipo', ''),
                nombre_espacio=getattr(espacio, 'nombre', None),
            ),
        }
    ]
    messages.extend(
        _truncar_historial(historial, settings.ASISTENTE_MAX_TURNOS_HISTORIAL)
    )
    messages.append({'role': 'user', 'content': mensaje})

    herramientas_usadas: list[str] = []
    datos: dict[str, Any] = {}
    hubo_tool_vacia = False
    tools_vacias: list[str] = []
    senal_brecha: str | None = None

    def _latencia_ms() -> int:
        return int((time.perf_counter() - t0) * 1000)

    for _ in range(_MAX_RONDAS_TOOLS):
        result = client.chat(messages, tools=get_tool_schemas(), tool_choice='auto')
        tool_calls = result.get('tool_calls') or []
        if not tool_calls:
            contenido = (result.get('content') or '').strip()
            if not herramientas_usadas:
                brechas_svc.registrar_brecha(
                    usuario=usuario,
                    espacio=espacio,
                    senal=BrechaConsultaAsistente.SENAL_SIN_TOOL,
                    mensaje=mensaje,
                    tools_intentadas=[],
                    modelo=client.model,
                    provider=client.provider,
                )
                senal_brecha = BrechaConsultaAsistente.SENAL_SIN_TOOL
            elif hubo_tool_vacia:
                brechas_svc.registrar_brecha(
                    usuario=usuario,
                    espacio=espacio,
                    senal=BrechaConsultaAsistente.SENAL_TOOL_VACIA,
                    mensaje=mensaje,
                    tools_intentadas=tools_vacias,
                    modelo=client.model,
                    provider=client.provider,
                )
                senal_brecha = BrechaConsultaAsistente.SENAL_TOOL_VACIA
            payload = {
                'respuesta': contenido
                or 'No pude generar una respuesta con los datos disponibles.',
                'herramientas_usadas': herramientas_usadas,
                'datos': datos,
                'sugerencias_seguimiento': _sugerencias_desde_datos(datos),
            }
            _log_turno(
                usuario=usuario,
                espacio=espacio,
                herramientas_usadas=herramientas_usadas,
                latencia_ms=_latencia_ms(),
                senal_brecha=senal_brecha,
            )
            return payload

        messages.append(result['raw_message'])
        for tc in tool_calls:
            nombre = tc['name']
            payload_tool = ejecutar_tool(
                nombre,
                tc.get('arguments_json') or '{}',
                usuario,
                espacio,
            )
            if nombre not in herramientas_usadas:
                herramientas_usadas.append(nombre)
            datos[nombre] = payload_tool
            if tool_resultado_vacio(nombre, payload_tool):
                hubo_tool_vacia = True
                if nombre not in tools_vacias:
                    tools_vacias.append(nombre)
            messages.append(
                {
                    'role': 'tool',
                    'tool_call_id': tc['id'],
                    'name': nombre,
                    'content': json.dumps(payload_tool, ensure_ascii=False, default=str),
                }
            )

    # Última pasada: pedir texto; si el modelo vuelve a pegar JSON de tool, rescatar
    # ejecutando la tool (una ronda extra) en vez de mostrarlo al usuario.
    final = client.chat(messages, tools=get_tool_schemas(), tool_choice='none')
    contenido = (final.get('content') or '').strip()

    from applications.finanzas.asistente.tool_call_text import (
        enriquecer_resultado_con_rescate,
    )

    rescued_final = enriquecer_resultado_con_rescate(
        {'content': contenido, 'tool_calls': [], 'raw_message': final.get('raw_message')},
        nombres_tools(),
    )
    if rescued_final.get('tool_calls') and len(herramientas_usadas) < 4:
        messages.append(rescued_final['raw_message'])
        for tc in rescued_final['tool_calls']:
            nombre = tc['name']
            payload_tool = ejecutar_tool(
                nombre,
                tc.get('arguments_json') or '{}',
                usuario,
                espacio,
            )
            if nombre not in herramientas_usadas:
                herramientas_usadas.append(nombre)
            datos[nombre] = payload_tool
            if tool_resultado_vacio(nombre, payload_tool):
                hubo_tool_vacia = True
                if nombre not in tools_vacias:
                    tools_vacias.append(nombre)
            messages.append(
                {
                    'role': 'tool',
                    'tool_call_id': tc['id'],
                    'name': nombre,
                    'content': json.dumps(payload_tool, ensure_ascii=False, default=str),
                }
            )
        final = client.chat(messages, tools=get_tool_schemas(), tool_choice='none')
        contenido = (final.get('content') or '').strip()
        # Si aún pega JSON, no lo mostremos como respuesta.
        if enriquecer_resultado_con_rescate(
            {'content': contenido, 'tool_calls': [], 'raw_message': {}},
            nombres_tools(),
        ).get('tool_calls'):
            contenido = ''

    if hubo_tool_vacia and not contenido:
        brechas_svc.registrar_brecha(
            usuario=usuario,
            espacio=espacio,
            senal=BrechaConsultaAsistente.SENAL_TOOL_VACIA,
            mensaje=mensaje,
            tools_intentadas=tools_vacias or herramientas_usadas,
            modelo=client.model,
            provider=client.provider,
        )
        senal_brecha = BrechaConsultaAsistente.SENAL_TOOL_VACIA
    payload = {
        'respuesta': contenido
        or 'Consulté los datos pero no pude redactar una respuesta. Revisa los totales en la app.',
        'herramientas_usadas': herramientas_usadas,
        'datos': datos,
        'sugerencias_seguimiento': _sugerencias_desde_datos(datos),
    }
    _log_turno(
        usuario=usuario,
        espacio=espacio,
        herramientas_usadas=herramientas_usadas,
        latencia_ms=_latencia_ms(),
        senal_brecha=senal_brecha,
    )
    return payload
