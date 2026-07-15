"""Orquestador: mensaje → LLM (function-calling) → tools analytics → respuesta."""

from __future__ import annotations

import json
from typing import Any

from django.conf import settings

from applications.finanzas.asistente import brechas as brechas_svc
from applications.finanzas.asistente.llm import LLMClient, LLMUnavailableError
from applications.finanzas.asistente.prompts import system_prompt_para_espacio
from applications.finanzas.asistente.tools import (
    TOOL_SCHEMAS,
    ejecutar_tool,
    tool_resultado_vacio,
)
from applications.finanzas.models import BrechaConsultaAsistente

_MAX_RONDAS_TOOLS = 2

_SUGERENCIAS_DEFAULT = [
    '¿Cómo voy con mis presupuestos este mes?',
    '¿Me avisaste alguna alerta de presupuesto?',
]


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

    for _ in range(_MAX_RONDAS_TOOLS):
        result = client.chat(messages, tools=TOOL_SCHEMAS, tool_choice='auto')
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
            return {
                'respuesta': contenido
                or 'No pude generar una respuesta con los datos disponibles.',
                'herramientas_usadas': herramientas_usadas,
                'datos': datos,
                'sugerencias_seguimiento': list(_SUGERENCIAS_DEFAULT),
            }

        messages.append(result['raw_message'])
        for tc in tool_calls:
            nombre = tc['name']
            payload = ejecutar_tool(
                nombre,
                tc.get('arguments_json') or '{}',
                usuario,
                espacio,
            )
            if nombre not in herramientas_usadas:
                herramientas_usadas.append(nombre)
            datos[nombre] = payload
            if tool_resultado_vacio(nombre, payload):
                hubo_tool_vacia = True
                if nombre not in tools_vacias:
                    tools_vacias.append(nombre)
            messages.append(
                {
                    'role': 'tool',
                    'tool_call_id': tc['id'],
                    'name': nombre,
                    'content': json.dumps(payload, ensure_ascii=False, default=str),
                }
            )

    # Última pasada sin pedir más tools (o con tools aún disponibles).
    final = client.chat(messages, tools=TOOL_SCHEMAS, tool_choice='none')
    contenido = (final.get('content') or '').strip()
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
    return {
        'respuesta': contenido
        or 'Consulté los datos pero no pude redactar una respuesta. Revisa los totales en la app.',
        'herramientas_usadas': herramientas_usadas,
        'datos': datos,
        'sugerencias_seguimiento': list(_SUGERENCIAS_DEFAULT),
    }
