# Tests del cutover multitenant en viajes e inversiones: lecturas y escrituras
# por espacio activo, dual-write espacio+familia, y aislamiento entre tenants.

import pytest
from datetime import date

from rest_framework import status
from rest_framework.test import APIClient

from applications.espacios.models import Espacio
from applications.espacios.services import obtener_espacio_personal
from applications.inversiones.models import Fondo
from applications.viajes.models import Viaje


@pytest.fixture
def client():
    return APIClient()


def _crear_viaje(familia, nombre='Viaje Test'):
    return Viaje.objects.create(
        familia=familia,
        nombre=nombre,
        fecha_inicio=date(2026, 1, 10),
        fecha_fin=date(2026, 1, 20),
    )


def _espejo(familia):
    return Espacio.objects.get(familia_origen=familia)


# ── Dual-write ────────────────────────────────────────────────────────────────

class TestDualWrite:
    def test_fila_nueva_con_familia_recibe_espacio(self, familia):
        viaje = _crear_viaje(familia)
        assert viaje.espacio_id == _espejo(familia).id

    def test_fondo_nuevo_recibe_espacio(self, familia, usuario):
        fondo = Fondo.objects.create(familia=familia, usuario=usuario, nombre='FFMM')
        assert fondo.espacio_id == _espejo(familia).id

    def test_espacio_ya_asignado_no_se_pisa(self, familia):
        otro = Espacio.objects.create(tipo=Espacio.TIPO_FAMILIAR, nombre='Otro')
        viaje = Viaje.objects.create(
            familia=familia,
            espacio=otro,
            nombre='Con espacio explícito',
            fecha_inicio=date(2026, 2, 1),
            fecha_fin=date(2026, 2, 5),
        )
        assert viaje.espacio_id == otro.id


# ── Viajes por espacio ────────────────────────────────────────────────────────

class TestViajesEspacio:
    def test_lista_sin_header_muestra_viajes_familiares(self, client, usuario, familia, auth_header):
        # Regresión de compatibilidad: cliente desplegado (sin header) sigue viendo sus datos.
        viaje = _crear_viaje(familia)
        resp = client.get('/api/viajes/', **auth_header)
        assert resp.status_code == status.HTTP_200_OK
        assert viaje.id in {v['id'] for v in resp.data}

    def test_lista_en_espacio_personal_vacia(self, client, usuario, familia, auth_header):
        _crear_viaje(familia)
        personal = obtener_espacio_personal(usuario)
        resp = client.get('/api/viajes/', **auth_header, HTTP_X_ESPACIO_ID=str(personal.id))
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data == []

    def test_viaje_de_otra_familia_invisible(self, client, usuario, familia, usuario_otra_familia, otra_familia, auth_header):
        ajeno = _crear_viaje(otra_familia, nombre='Viaje Ajeno')
        resp = client.get('/api/viajes/', **auth_header)
        assert ajeno.id not in {v['id'] for v in resp.data}
        detalle = client.get(f'/api/viajes/{ajeno.id}/', **auth_header)
        assert detalle.status_code == status.HTTP_404_NOT_FOUND

    def test_header_de_espacio_ajeno_403(self, client, usuario, familia, otra_familia, auth_header):
        espejo_ajeno = _espejo(otra_familia)
        resp = client.get('/api/viajes/', **auth_header, HTTP_X_ESPACIO_ID=str(espejo_ajeno.id))
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_crear_asigna_espacio_y_familia(self, client, usuario, familia, auth_header):
        resp = client.post(
            '/api/viajes/',
            {'nombre': 'Nuevo Viaje', 'fecha_inicio': '2026-03-01', 'fecha_fin': '2026-03-10'},
            format='json',
            **auth_header,
        )
        assert resp.status_code == status.HTTP_201_CREATED
        viaje = Viaje.objects.get(pk=resp.data['id'])
        assert viaje.espacio_id == _espejo(familia).id
        assert viaje.familia_id == familia.id

    def test_crear_viaje_en_espacio_personal_ok(self, client, usuario, familia, auth_header):
        personal = obtener_espacio_personal(usuario)
        resp = client.post(
            '/api/viajes/',
            {'nombre': 'Personal', 'fecha_inicio': '2026-03-01', 'fecha_fin': '2026-03-10'},
            format='json',
            **auth_header,
            HTTP_X_ESPACIO_ID=str(personal.id),
        )
        assert resp.status_code == status.HTTP_201_CREATED
        viaje = Viaje.objects.get(pk=resp.data['id'])
        assert viaje.espacio_id == personal.id
        assert viaje.familia_id is None

    def test_espacio_archivado_es_solo_lectura(self, client, usuario, familia, auth_header):
        viaje = _crear_viaje(familia)
        espejo = _espejo(familia)
        Espacio.objects.filter(pk=espejo.pk).update(archivado=True)
        # Un espacio archivado deja de ser el default (sin header cae al personal);
        # se accede explícitamente con el header como registro histórico.
        header_espejo = {'HTTP_X_ESPACIO_ID': str(espejo.id)}
        resp = client.put(
            f'/api/viajes/{viaje.id}/',
            {'nombre': 'Editado'},
            format='json',
            **auth_header,
            **header_espejo,
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        # La lectura del histórico sigue disponible.
        lectura = client.get(f'/api/viajes/{viaje.id}/', **auth_header, **header_espejo)
        assert lectura.status_code == status.HTTP_200_OK


# ── Inversiones por espacio ───────────────────────────────────────────────────

class TestInversionesEspacio:
    def test_lista_sin_header_muestra_fondos_familiares(self, client, usuario, familia, auth_header):
        fondo = Fondo.objects.create(familia=familia, usuario=None, nombre='Compartido')
        resp = client.get('/api/inversiones/fondos/', **auth_header)
        assert resp.status_code == status.HTTP_200_OK
        assert fondo.id in {f['id'] for f in resp.data}

    def test_lista_en_espacio_personal_vacia(self, client, usuario, familia, auth_header):
        Fondo.objects.create(familia=familia, usuario=usuario, nombre='Mío')
        personal = obtener_espacio_personal(usuario)
        resp = client.get(
            '/api/inversiones/fondos/', **auth_header, HTTP_X_ESPACIO_ID=str(personal.id)
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data == []

    def test_fondo_de_otra_familia_invisible(self, client, usuario, familia, usuario_otra_familia, otra_familia, auth_header):
        ajeno = Fondo.objects.create(familia=otra_familia, usuario=None, nombre='Ajeno')
        resp = client.get('/api/inversiones/fondos/', **auth_header)
        assert ajeno.id not in {f['id'] for f in resp.data}
        detalle = client.get(f'/api/inversiones/fondos/{ajeno.id}/', **auth_header)
        assert detalle.status_code == status.HTTP_404_NOT_FOUND

    def test_crear_fondo_asigna_espacio_y_familia(self, client, usuario, familia, auth_header):
        resp = client.post(
            '/api/inversiones/fondos/',
            {'nombre': 'Fondo Nuevo', 'es_compartido': True},
            format='json',
            **auth_header,
        )
        assert resp.status_code == status.HTTP_201_CREATED
        fondo = Fondo.objects.get(pk=resp.data['id'])
        assert fondo.espacio_id == _espejo(familia).id
        assert fondo.familia_id == familia.id

    def test_aporte_a_fondo_ajeno_404(self, client, usuario, familia, usuario_otra_familia, otra_familia, auth_header):
        ajeno = Fondo.objects.create(familia=otra_familia, usuario=None, nombre='Ajeno')
        resp = client.post(
            f'/api/inversiones/fondos/{ajeno.id}/aportes/',
            {'monto': 100000, 'fecha': '2026-03-01'},
            format='json',
            **auth_header,
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_crear_fondo_en_personal_ok(self, client, usuario, familia, auth_header):
        personal = obtener_espacio_personal(usuario)
        resp = client.post(
            '/api/inversiones/fondos/',
            {'nombre': 'Personal', 'es_compartido': False},
            format='json',
            **auth_header,
            HTTP_X_ESPACIO_ID=str(personal.id),
        )
        assert resp.status_code == status.HTTP_201_CREATED
        fondo = Fondo.objects.get(pk=resp.data['id'])
        assert fondo.espacio_id == personal.id
        assert fondo.familia_id is None
