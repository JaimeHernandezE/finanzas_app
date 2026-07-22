# tests/test_analytics_publico.py

from datetime import date

import pytest
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient

from applications.espacios.services import obtener_espacio_personal
from applications.finanzas.models import CuentaPersonal, Movimiento
from applications.finanzas.services import analytics_publico as svc


@pytest.fixture
def client():
    return APIClient()


def _header_espacio(espacio):
    return {'HTTP_X_ESPACIO_ID': str(espacio.id)}


@pytest.mark.django_db
class TestUsoMetodoPago:
    def test_bajo_umbral_devuelve_none(
        self, usuario, metodo_efectivo, categoria_egreso, espacio_familiar
    ):
        Movimiento.objects.create(
            usuario=usuario,
            espacio=espacio_familiar,
            fecha=date(2026, 6, 10),
            tipo='EGRESO',
            ambito='PERSONAL',
            categoria=categoria_egreso,
            monto='10000.00',
            comentario='test',
            metodo_pago=metodo_efectivo,
        )
        with override_settings(METRICAS_PUBLICAS_UMBRAL_K=10):
            assert svc.uso_metodo_pago() is None

    def test_sobre_umbral_devuelve_porcentajes(
        self, usuario, metodo_efectivo, categoria_egreso, espacio_familiar
    ):
        Movimiento.objects.create(
            usuario=usuario,
            espacio=espacio_familiar,
            fecha=date(2026, 6, 10),
            tipo='EGRESO',
            ambito='PERSONAL',
            categoria=categoria_egreso,
            monto='10000.00',
            comentario='test',
            metodo_pago=metodo_efectivo,
        )
        with override_settings(METRICAS_PUBLICAS_UMBRAL_K=1):
            result = svc.uso_metodo_pago()
        assert result is not None
        assert result['efectivo'] == 100
        assert result['debito'] == 0
        assert result['credito'] == 0


@pytest.mark.django_db
class TestCuentaResumenMensualPersonal:
    def test_espacio_personal_devuelve_meses(
        self,
        client,
        usuario,
        metodo_efectivo,
        categoria_egreso,
        auth_header_sin_espacio,
    ):
        """El resumen por cuenta debe funcionar también en espacio personal."""
        personal = obtener_espacio_personal(usuario)
        assert personal is not None
        cuenta = CuentaPersonal.objects.filter(usuario=usuario).first()
        assert cuenta is not None

        Movimiento.objects.create(
            usuario=usuario,
            espacio=personal,
            fecha=date(2026, 5, 10),
            tipo='EGRESO',
            ambito='PERSONAL',
            categoria=categoria_egreso,
            monto='25000.00',
            comentario='gasto',
            metodo_pago=metodo_efectivo,
            cuenta=cuenta,
        )

        resp = client.get(
            '/api/finanzas/cuenta-resumen-mensual/',
            {'cuenta': cuenta.pk},
            **auth_header_sin_espacio,
            **_header_espacio(personal),
        )
        assert resp.status_code == status.HTTP_200_OK
        assert len(resp.data['meses']) >= 1
        mayo = next(m for m in resp.data['meses'] if m['mes'] == 5 and m['anio'] == 2026)
        assert mayo['egresos'] == '25000.00'
