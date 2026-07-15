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
        from applications.finanzas.asistente.tool_call_text import (
            enriquecer_resultado_con_rescate,
        )
        from applications.finanzas.asistente.tools import nombres_tools

        if self.calls >= len(self.script):
            return {
                'content': 'Fin.',
                'tool_calls': [],
                'raw_message': {'role': 'assistant', 'content': 'Fin.'},
            }
        step = self.script[self.calls]
        self.calls += 1
        if callable(step):
            result = step(messages, tools, tool_choice)
        else:
            result = step
        if tools and tool_choice != 'none' and not (result.get('tool_calls') or []):
            result = enriquecer_resultado_con_rescate(result, nombres_tools())
        return result


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


class TestDefaultsMesAnio:
    def test_corrige_anio_lejanos_a_hoy(self):
        from applications.finanzas.asistente.tools import _defaults_mes_anio

        with patch(
            'applications.finanzas.asistente.tools._hoy',
            return_value=date(2026, 7, 14),
        ):
            out = _defaults_mes_anio({'mes': 7, 'anio': 2024})
        assert out == {'mes': 7, 'anio': 2026}

    def test_permite_anio_anterior(self):
        from applications.finanzas.asistente.tools import _defaults_mes_anio

        with patch(
            'applications.finanzas.asistente.tools._hoy',
            return_value=date(2026, 7, 14),
        ):
            out = _defaults_mes_anio({'mes': 6, 'anio': 2025})
        assert out == {'mes': 6, 'anio': 2025}

    def test_prompt_incluye_fecha_hoy(self):
        from applications.finanzas.asistente.prompts import system_prompt_para_espacio

        with patch(
            'applications.finanzas.asistente.prompts.timezone.localdate',
            return_value=date(2026, 7, 14),
        ):
            prompt = system_prompt_para_espacio(tipo_espacio='FAMILIAR', nombre_espacio='Casa')
        assert 'anio=2026' in prompt
        assert 'mes=7' in prompt
        assert '2026-07-14' in prompt


@pytest.mark.django_db
class TestResumenMesEnCurso:
    def test_resumen_mes_actual_devuelve_error_orientativo(self, usuario, espacio_familiar):
        with patch(
            'applications.finanzas.asistente.tools._hoy',
            return_value=date(2026, 7, 14),
        ):
            out = ejecutar_tool(
                'resumen_mes_cerrado',
                json.dumps({'mes': 7, 'anio': 2026}),
                usuario,
                espacio_familiar,
            )
        assert out.get('mes_cerrado') is False
        assert 'avance_presupuesto_mes' in (out.get('error') or '')
        assert out.get('periodo') == {'mes': 7, 'anio': 2026}


class TestRescateToolCallTexto:
    def test_formato_name_parameters(self):
        from applications.finanzas.asistente.tool_call_text import (
            rescatar_tool_calls_desde_texto,
        )

        text = json.dumps(
            {
                'name': 'gasto_categoria_por_mes',
                'parameters': {
                    'anio': 2024,
                    'ambito': 'FAMILIAR',
                    'categoria_id': 'comida',
                    'cuenta_id': None,
                    'mes': 7,
                },
            }
        )
        calls = rescatar_tool_calls_desde_texto(text, ['gasto_categoria_por_mes'])
        assert len(calls) == 1
        assert calls[0]['name'] == 'gasto_categoria_por_mes'
        args = json.loads(calls[0]['arguments_json'])
        assert args['categoria_id'] == 'comida'
        assert args['ambito'] == 'FAMILIAR'
        assert 'cuenta_id' not in args  # None descartado


@pytest.mark.django_db
class TestResolverCategoriaYGasto:
    def test_comida_resuelve_a_alimentacion(
        self, usuario, espacio_familiar, categoria_egreso_familiar
    ):
        from applications.finanzas.asistente.categorias import resolver_categoria

        out = resolver_categoria(
            usuario,
            espacio_familiar,
            categoria_id='comida',
            ambito='FAMILIAR',
        )
        assert out['categoria_id'] == categoria_egreso_familiar.pk
        assert out['categoria_nombre'] == 'Alimentación'

    def test_ambiguo_incluye_nombres_y_chips(self, usuario, espacio_familiar):
        from applications.finanzas.models import Categoria
        from applications.finanzas.asistente.categorias import resolver_categoria

        Categoria.objects.create(
            nombre='Alimentación casa',
            tipo='EGRESO',
            espacio=espacio_familiar,
            usuario=None,
        )
        Categoria.objects.create(
            nombre='Alimentación trabajo',
            tipo='EGRESO',
            espacio=espacio_familiar,
            usuario=None,
        )
        out = resolver_categoria(
            usuario,
            espacio_familiar,
            categoria_nombre='Alimentación',
            ambito='FAMILIAR',
        )
        assert out.get('error') == 'varias_categorias'
        nombres = [c['categoria_nombre'] for c in out['candidatos']]
        assert 'Alimentación casa' in nombres
        assert 'Alimentación trabajo' in nombres
        assert 'Alimentación casa' in out['mensaje']
        assert any('Alimentación casa' in s for s in out['sugerencias_seguimiento'])

    def test_gasto_por_nombre_comida(
        self, usuario, espacio_familiar, presupuesto_y_gasto
    ):
        with patch(
            'applications.finanzas.asistente.tools._hoy',
            return_value=date(2026, 7, 14),
        ):
            out = ejecutar_tool(
                'gasto_categoria_por_mes',
                json.dumps(
                    {
                        'categoria_id': 'comida',
                        'mes': 7,
                        'anio': 2024,
                        'ambito': 'FAMILIAR',
                    }
                ),
                usuario,
                espacio_familiar,
            )
        assert out.get('error') is None
        assert out['categoria_nombre'] == 'Alimentación'
        assert out['gastado'] == 80000
        assert out['periodo'] == {'mes': 7, 'anio': 2026}

    def test_endpoint_rescata_json_en_texto(
        self,
        client,
        auth_header,
        presupuesto_y_gasto,
    ):
        """Reproduce el bug: el modelo pega la tool como JSON en content."""
        texto_falso = json.dumps(
            {
                'name': 'gasto_categoria_por_mes',
                'parameters': {
                    'anio': 2024,
                    'ambito': 'FAMILIAR',
                    'categoria_id': 'comida',
                    'cuenta_id': None,
                    'mes': 7,
                },
            }
        )
        fake = FakeLLM(
            [
                {
                    'content': texto_falso,
                    'tool_calls': [],
                    'raw_message': {'role': 'assistant', 'content': texto_falso},
                },
                _assistant_text('En Alimentación llevas $80.000 este mes.'),
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
                    data={
                        'mensaje': 'Y en comida en gastos comunes familiares, cómo voy?',
                    },
                    format='json',
                    **auth_header,
                )

        assert res.status_code == 200
        body = res.json()
        assert 'gasto_categoria_por_mes' in body['herramientas_usadas']
        assert body['datos']['gasto_categoria_por_mes']['gastado'] == 80000
        assert '{' not in body['respuesta'] or 'Alimentación' in body['respuesta']
        assert body['respuesta'] != texto_falso

    def test_endpoint_ambiguo_devuelve_chips_categorias(
        self,
        client,
        auth_header,
        usuario,
        espacio_familiar,
    ):
        from applications.finanzas.models import Categoria

        Categoria.objects.create(
            nombre='Alimentación casa',
            tipo='EGRESO',
            espacio=espacio_familiar,
            usuario=None,
        )
        Categoria.objects.create(
            nombre='Alimentación trabajo',
            tipo='EGRESO',
            espacio=espacio_familiar,
            usuario=None,
        )
        fake = FakeLLM(
            [
                _assistant_tools(
                    'gasto_categoria_por_mes',
                    {
                        'categoria_nombre': 'Alimentación',
                        'mes': 7,
                        'anio': 2026,
                        'ambito': 'FAMILIAR',
                    },
                ),
                _assistant_text(
                    'Hay varias: «Alimentación casa» y «Alimentación trabajo». ¿Cuál quieres?'
                ),
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
                    data={'mensaje': 'presupuesto alimentación familiares'},
                    format='json',
                    **auth_header,
                )
        assert res.status_code == 200
        body = res.json()
        chips = body['sugerencias_seguimiento']
        assert any('Alimentación casa' in c for c in chips)
        assert any('Alimentación trabajo' in c for c in chips)
