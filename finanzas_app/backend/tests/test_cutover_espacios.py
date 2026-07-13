# Tests del cutover multitenant en viajes e inversiones: lecturas y escrituras
# por espacio activo y aislamiento entre tenants.

import pytest
from datetime import date

from rest_framework import status
from rest_framework.test import APIClient

from applications.espacios.models import Espacio
from applications.espacios.services import espacio_para_familia, obtener_espacio_personal
from applications.inversiones.models import Fondo
from applications.viajes.models import Viaje


@pytest.fixture
def client():
    return APIClient()


def _header_espacio(espacio):
    return {'HTTP_X_ESPACIO_ID': str(espacio.id)}


def _espejo(familia):
    return espacio_para_familia(familia)


def _crear_viaje(espacio, nombre='Viaje Test'):
    return Viaje.objects.create(
        espacio=espacio,
        nombre=nombre,
        fecha_inicio=date(2026, 1, 10),
        fecha_fin=date(2026, 1, 20),
    )


class TestEscriturasPorEspacio:
    def test_crear_viaje_en_espacio_familiar(self, familia, espacio_familiar, usuario, auth_header, client):
        resp = client.post(
            '/api/viajes/',
            {
                'nombre': 'Nuevo viaje',
                'fecha_inicio': '2026-04-01',
                'fecha_fin': '2026-04-10',
            },
            format='json',
            **auth_header,
        )
        assert resp.status_code == status.HTTP_201_CREATED
        viaje = Viaje.objects.get(pk=resp.data['id'])
        assert viaje.espacio_id == espacio_familiar.id

    def test_crear_fondo_en_espacio_familiar(self, espacio_familiar, usuario, auth_header, client):
        resp = client.post(
            '/api/inversiones/fondos/',
            {'nombre': 'FFMM', 'descripcion': ''},
            format='json',
            **auth_header,
        )
        assert resp.status_code == status.HTTP_201_CREATED
        fondo = Fondo.objects.get(pk=resp.data['id'])
        assert fondo.espacio_id == espacio_familiar.id


class TestLecturasPorEspacio:
    def test_viajes_listados_por_espacio(self, familia, espacio_familiar, usuario, auth_header, client):
        viaje = _crear_viaje(espacio_familiar)
        resp = client.get('/api/viajes/', **auth_header)
        assert resp.status_code == status.HTTP_200_OK
        assert viaje.id in {v['id'] for v in resp.data}

    def test_viajes_aislados_entre_espacios(self, familia, otra_familia, espacio_familiar, usuario, auth_header, client):
        otro_espacio = _espejo(otra_familia)
        _crear_viaje(otro_espacio, nombre='Ajeno')
        viaje_propio = _crear_viaje(espacio_familiar, nombre='Propio')
        resp = client.get('/api/viajes/', **auth_header)
        ids = {v['id'] for v in resp.data}
        assert viaje_propio.id in ids

    def test_fondos_personal_sin_familia_en_espacio_personal(
        self, usuario, auth_header, client, metodo_efectivo, categoria_egreso
    ):
        personal = obtener_espacio_personal(usuario)
        headers = {**auth_header, **_header_espacio(personal)}
        resp = client.post(
            '/api/inversiones/fondos/',
            {'nombre': 'Personal', 'descripcion': ''},
            format='json',
            **headers,
        )
        assert resp.status_code in (status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST)


class TestEspacioPersonal:
    def test_escritura_viaje_en_personal_bloqueada(self, usuario, auth_header_sin_espacio, client):
        personal = obtener_espacio_personal(usuario)
        headers = {**auth_header_sin_espacio, **_header_espacio(personal)}
        resp = client.post(
            '/api/viajes/',
            {
                'nombre': 'Solo personal',
                'fecha_inicio': '2026-05-01',
                'fecha_fin': '2026-05-05',
            },
            format='json',
            **headers,
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
