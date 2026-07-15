"""Cliente LLM OpenAI-compatible (NVIDIA NIM u otros)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.conf import settings

from applications.finanzas.asistente.tool_call_text import enriquecer_resultado_con_rescate


class LLMUnavailableError(Exception):
    """Proveedor no disponible o mal configurado."""


@dataclass
class LLMMessage:
    role: str
    content: str | None = None
    tool_calls: list[dict] | None = None
    tool_call_id: str | None = None
    name: str | None = None

    def to_api(self) -> dict:
        msg: dict[str, Any] = {'role': self.role}
        if self.content is not None:
            msg['content'] = self.content
        if self.tool_calls is not None:
            msg['tool_calls'] = self.tool_calls
        if self.tool_call_id is not None:
            msg['tool_call_id'] = self.tool_call_id
        if self.name is not None:
            msg['name'] = self.name
        return msg


class LLMClient:
    """Wrapper del SDK OpenAI apuntando a NIM (u otro base_url compatible)."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        provider: str | None = None,
    ):
        self.api_key = (api_key if api_key is not None else settings.ASISTENTE_LLM_API_KEY) or ''
        self.base_url = (
            base_url if base_url is not None else settings.ASISTENTE_LLM_BASE_URL
        ) or 'https://integrate.api.nvidia.com/v1'
        self.model = (model if model is not None else settings.ASISTENTE_LLM_MODEL) or ''
        self.provider = (
            provider if provider is not None else settings.ASISTENTE_LLM_PROVIDER
        ) or 'nvidia'

    def disponible(self) -> bool:
        return bool(self.api_key and self.model)

    def chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        *,
        tool_choice: str | dict = 'auto',
    ) -> dict:
        """
        Retorna un dict normalizado:
        {content, tool_calls: [{id, name, arguments_json}], raw_message}
        """
        if not self.disponible():
            raise LLMUnavailableError('ASISTENTE_LLM_API_KEY o modelo no configurados.')

        try:
            from openai import OpenAI
        except ImportError as exc:
            raise LLMUnavailableError(
                'Paquete openai no instalado. Añádelo a requirements e instala dependencias.'
            ) from exc

        timeout_s = float(getattr(settings, 'ASISTENTE_LLM_TIMEOUT_S', 60) or 60)
        max_tokens = int(getattr(settings, 'ASISTENTE_LLM_MAX_TOKENS', 1024) or 1024)
        client = OpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
            timeout=timeout_s,
            max_retries=0,
        )
        kwargs: dict[str, Any] = {
            'model': self.model,
            'messages': messages,
            'max_tokens': max_tokens,
            'temperature': 0.2,
        }
        if tools:
            kwargs['tools'] = tools
            kwargs['tool_choice'] = tool_choice

        try:
            resp = client.chat.completions.create(**kwargs)
        except Exception as exc:  # noqa: BLE001 — mapear a unavailable
            raise LLMUnavailableError(str(exc) or 'Error del proveedor LLM') from exc

        choice = resp.choices[0].message
        tool_calls = []
        if getattr(choice, 'tool_calls', None):
            for tc in choice.tool_calls:
                tool_calls.append(
                    {
                        'id': tc.id,
                        'name': tc.function.name,
                        'arguments_json': tc.function.arguments or '{}',
                    }
                )

        raw = {
            'role': 'assistant',
            'content': choice.content,
        }
        if tool_calls:
            raw['tool_calls'] = [
                {
                    'id': tc['id'],
                    'type': 'function',
                    'function': {
                        'name': tc['name'],
                        'arguments': tc['arguments_json'],
                    },
                }
                for tc in tool_calls
            ]

        result = {
            'content': choice.content,
            'tool_calls': tool_calls,
            'raw_message': raw,
        }

        # Modelos pequeños a veces pegan la llamada en texto en vez de tool_calls.
        if tools and tool_choice != 'none' and not tool_calls:
            nombres = []
            for t in tools:
                fn = (t.get('function') or {}) if isinstance(t, dict) else {}
                n = fn.get('name')
                if n:
                    nombres.append(n)
            if nombres:
                result = enriquecer_resultado_con_rescate(result, nombres)

        return result
