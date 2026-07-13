# Matriz de aislamiento multitenant (Fase 7): usuario B no ve datos del espacio de A.

import pytest
from datetime import date
from rest_framework import status
from rest_framework.test import APIClient

from applications.espacios.models import PertenenciaEspacio
from applications.espacios.services import espacio_para_familia, obtener_espacio_personal
from applications.finanzas.models import Categoria, MetodoPago, Movimiento


@pytest.fixture
def client():
    return APIClient()


def _header(espacio):
    return {'HTTP_X_ESPACIO_ID': str(espacio.id)}


ENDPOINTS_LECTURA = [
    '/api/finanzas/movimientos/',
    '/api/finanzas/categorias/',
    '/api/finanzas/presupuesto-mes/?mes=3&anio=2026',
    '/api/viajes/',
    '/api/inversiones/fondos/',
]


@pytest.mark.parametrize('path', ENDPOINTS_LECTURA)
class TestAislamientoEntreEspacios:
    def test_usuario_b_no_ve_datos_espacio_a(
        self, path, client, usuario, usuario_otra_familia,
        auth_header_otra_familia, familia, otra_familia,
        metodo_efectivo, categoria_egreso,
    ):
        espacio_a = espacio_para_familia(familia)
        espacio_b = espacio_para_familia(otra_familia)

        cat_a = Categoria.objects.create(
            nombre='Secreto A', tipo='EGRESO', espacio=espacio_a, usuario=None,
        )
        Movimiento.objects.create(
            espacio=espacio_a,
            usuario=usuario,
            fecha=date(2026, 3, 1),
            tipo='EGRESO',
            ambito='COMUN',
            categoria=cat_a,
            monto='99999.00',
            metodo_pago=metodo_efectivo,
        )

        headers = {**auth_header_otra_familia, **_header(espacio_b)}
        resp = client.get(path, **headers)
        assert resp.status_code == status.HTTP_200_OK
        payload = resp.data
        if isinstance(payload, list):
            text = str(payload)
        else:
            text = str(payload)
        assert 'Secreto A' not in text
        assert '99999' not in text


class TestEspacioPersonalAislado:
    def test_movimiento_personal_no_visible_en_espacio_familiar(
        self, client, usuario, auth_header, espacio_familiar, metodo_efectivo, categoria_egreso,
    ):
        personal = obtener_espacio_personal(usuario)
        Movimiento.objects.create(
            espacio=personal,
            usuario=usuario,
            fecha=date(2026, 4, 1),
            tipo='EGRESO',
            ambito='PERSONAL',
            categoria=categoria_egreso,
            monto='12345.00',
            metodo_pago=metodo_efectivo,
            comentario='Solo personal',
        )
        resp = client.get(
            '/api/finanzas/movimientos/',
            **auth_header,
        )
        ids = {m['id'] for m in resp.data}
        movs_personal = Movimiento.objects.filter(espacio=personal, comentario='Solo personal')
        assert movs_personal.exists()
        assert movs_personal.first().id not in ids
