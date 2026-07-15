# tests/test_asistente_consulta.py
"""Etapa B: endpoint asistente con LLM mockeado (sin red)."""

from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.test import override_settings

from applications.finanzas.asistente.llm import LLMUnavailableError
from applications.finanzas.asistente.tools import ejecutar_tool
from applications.finanzas.models import BrechaConsultaAsistente, Movimiento, Presupuesto


class FakeLLM:
    """Simula LLMClient.chat según secuencia de respuestas."""

    def __init__(self, script):
        self.script = list(script)
        self.model = 'fake-model'
        self.provider = 'fake'
        self.calls = 0

    def disponible(self):
        return True

    def chat(self, messages, tools=None, tool_choice='auto'):
        if self.calls >= len(self.script):
            return {'content': 'Fin.', 'tool_calls': [], 'raw_message': {'role': 'assistant', 'content': 'Fin.'}}
        step = self.script[self.calls]
        self.calls += 1
        if callable(step):
            return step(messages, tools, tool_choice)
        return step


def _assistant_tools(nombre, args: dict, call_id='call_1'):
    args_json = json.dumps(args)
    return {
        'content': None,
        'tool_calls': [
            {
                'id': call_id,
                'name': nombre,
                'arguments_json': args_json,
            }
        ],
        'raw_message': {
            'role': 'assistant',
            'content': None,
            'tool_calls': [
                {
                    'id': call_id,
                    'type': 'function',
                    'function': {'name': nombre, 'arguments': args_json},
                }
            ],
        },
    }


def _assistant_text(text: str):
    return {
        'content': text,
        'tool_calls': [],
        'raw_message': {'role': 'assistant', 'content': text},
    }


@pytest.fixture
def client():
    from rest_framework.test import APIClient

    return APIClient()


@pytest.fixture
def categoria_egreso_familiar(db, espacio_familiar):
    from applications.finanzas.models import Categoria

    return Categoria.objects.create(
        nombre='Alimentación',
        tipo='EGRESO',
        es_inversion=False,
        espacio=espacio_familiar,
        usuario=None,
    )


@pytest.fixture
def presupuesto_y_gasto(usuario, espacio_familiar, categoria_egreso_familiar, metodo_efectivo):
    mes_pd = date(2026, 7, 1)
    Presupuesto.objects.create(
        espacio=espacio_familiar,
        usuario=None,
        categoria=categoria_egreso_familiar,
        mes=mes_pd,
        monto=Decimal('200000'),
    )
    Movimiento.objects.create(
        espacio=espacio_familiar,
        usuario=usuario,
        fecha=date(2026, 7, 10),
        tipo='EGRESO',
        ambito='COMUN',
        categoria=categoria_egreso_familiar,
        monto=Decimal('80000'),
        metodo_pago=metodo_efectivo,
    )
    return categoria_egreso_familiar


@pytest.mark.django_db
class TestAsistenteEndpoint:
    def test_flag_off_503(self, client, auth_header):
        with override_settings(ASISTENTE_HABILITADO=False, ASISTENTE_LLM_API_KEY='nvapi-x'):
            res = client.post(
                '/api/finanzas/asistente/consulta/',
                data={'mensaje': 'hola'},
                format='json',
                **auth_header,
            )
        assert res.status_code == 503

    def test_sin_auth_401(self, client):
        with override_settings(ASISTENTE_HABILITADO=True, ASISTENTE_LLM_API_KEY='nvapi-x'):
            res = client.post(
                '/api/finanzas/asistente/consulta/',
                data={'mensaje': 'hola'},
                format='json',
            )
        assert res.status_code in (401, 403)

    def test_tool_avance_presupuesto(
        self,
        client,
        auth_header,
        presupuesto_y_gasto,
    ):
        fake = FakeLLM(
            [
                _assistant_tools(
                    'avance_presupuesto_mes',
                    {'mes': 7, 'anio': 2026, 'ambito': 'FAMILIAR'},
                ),
                _assistant_text('Llevas $80000 gastados de $200000 presupuestados.'),
            ]
        )

        with override_settings(
            ASISTENTE_HABILITADO=True,
            ASISTENTE_LLM_API_KEY='nvapi-test',
            ASISTENTE_RATE_LIMIT_POR_HORA=100,
        ):
            with patch(
                'applications.finanzas.asistente.views_asistente.LLMClient',
                return_value=fake,
            ):
                res = client.post(
                    '/api/finanzas/asistente/consulta/',
                    data={'mensaje': '¿Cómo voy con el presupuesto en julio?'},
                    format='json',
                    **auth_header,
                )

        assert res.status_code == 200
        body = res.json()
        assert 'avance_presupuesto_mes' in body['herramientas_usadas']
        assert body['datos']['avance_presupuesto_mes']['resumen']['total_gastado'] == 80000
        assert '80000' in body['respuesta'] or '80000' in body['respuesta'].replace('.', '')

    def test_ignora_espacio_id_en_args_de_tool(
        self,
        client,
        auth_header,
        usuario,
        espacio_familiar,
        espacio_otra_familia,
        presupuesto_y_gasto,
        metodo_efectivo,
    ):
        """Aunque el LLM invente espacio_id ajeno, se usa el del request."""
        # Gasto solo en espacio_familiar (ya en fixture). Espacio ajeno vacío.
        out = ejecutar_tool(
            'avance_presupuesto_mes',
            json.dumps(
                {
                    'mes': 7,
                    'anio': 2026,
                    'ambito': 'FAMILIAR',
                    'espacio_id': espacio_otra_familia.pk,
                }
            ),
            usuario,
            espacio_familiar,
        )
        assert out['resumen']['total_gastado'] == 80000

        out_ajeno = ejecutar_tool(
            'avance_presupuesto_mes',
            json.dumps({'mes': 7, 'anio': 2026, 'ambito': 'FAMILIAR'}),
            usuario,
            espacio_otra_familia,
        )
        assert out_ajeno['resumen']['total_gastado'] == 0

    def test_sin_tool_registra_brecha(
        self,
        client,
        auth_header,
        usuario,
        espacio_familiar,
    ):
        BrechaConsultaAsistente.objects.all().delete()
        fake = FakeLLM([_assistant_text('No tengo una herramienta para eso.')])

        with override_settings(
            ASISTENTE_HABILITADO=True,
            ASISTENTE_LLM_API_KEY='nvapi-test',
            ASISTENTE_RATE_LIMIT_POR_HORA=100,
        ):
            with patch(
                'applications.finanzas.asistente.views_asistente.LLMClient',
                return_value=fake,
            ):
                res = client.post(
                    '/api/finanzas/asistente/consulta/',
                    data={'mensaje': '¿Cuánto gasté en el perro?'},
                    format='json',
                    **auth_header,
                )

        assert res.status_code == 200
        assert BrechaConsultaAsistente.objects.filter(
            usuario=usuario,
            espacio=espacio_familiar,
            senal=BrechaConsultaAsistente.SENAL_SIN_TOOL,
        ).exists()
        brecha = BrechaConsultaAsistente.objects.latest('pk')
        assert brecha.intento_label in ('buscar_comentario', 'gasto_categoria', 'otro')
        assert 'perro' in brecha.mensaje_normalizado.lower() or 'gast' in brecha.mensaje_normalizado.lower()

    def test_rate_limit_429(self, client, auth_header, usuario):
        cache.clear()
        fake = FakeLLM([_assistant_text('ok')])

        with override_settings(
            ASISTENTE_HABILITADO=True,
            ASISTENTE_LLM_API_KEY='nvapi-test',
            ASISTENTE_RATE_LIMIT_POR_HORA=2,
        ):
            with patch(
                'applications.finanzas.asistente.views_asistente.LLMClient',
                return_value=fake,
            ):
                for _ in range(2):
                    r = client.post(
                        '/api/finanzas/asistente/consulta/',
                        data={'mensaje': 'hola'},
                        format='json',
                        **auth_header,
                    )
                    assert r.status_code == 200
                res = client.post(
                    '/api/finanzas/asistente/consulta/',
                    data={'mensaje': 'otra'},
                    format='json',
                    **auth_header,
                )
        assert res.status_code == 429


@pytest.mark.django_db
class TestAsistenteOrquestadorDirecto:
    def test_llm_unavailable_propagado(self, usuario, espacio_familiar):
        from applications.finanzas.asistente import orquestador

        class DeadLLM:
            model = 'x'
            provider = 'x'

            def chat(self, *a, **k):
                raise LLMUnavailableError('sin cuota')

        with pytest.raises(LLMUnavailableError):
            orquestador.consultar(
                usuario=usuario,
                espacio=espacio_familiar,
                mensaje='hola',
                llm=DeadLLM(),
            )
