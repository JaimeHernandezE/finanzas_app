# Tests del cutover multitenant en finanzas: el módulo completo resuelve el
# espacio activo vía _contexto_espacio y deriva familia desde el espacio.
# Cubre: regresión de compatibilidad (sin header), aislamiento entre tenants,
# semántica del espacio personal (lecturas vacías/globales, escrituras
# bloqueadas) y espacios archivados de solo lectura.

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from applications.espacios.models import Espacio
from applications.espacios.services import obtener_espacio_personal
from applications.finanzas.models import Movimiento


@pytest.fixture
def client():
    return APIClient()


def _espejo(familia):
    return Espacio.objects.get(familia_origen=familia)


def _header_espacio(espacio):
    return {'HTTP_X_ESPACIO_ID': str(espacio.id)}


class TestLecturasPorEspacio:
    def test_movimientos_sin_header_muestra_familiares(
        self, client, usuario, familia, movimiento_efectivo, auth_header
    ):
        resp = client.get('/api/finanzas/movimientos/', **auth_header)
        assert resp.status_code == status.HTTP_200_OK
        ids = {m['id'] for m in resp.data}
        assert movimiento_efectivo.id in ids

    def test_movimientos_en_espacio_personal_vacio(
        self, client, usuario, familia, movimiento_efectivo, auth_header
    ):
        personal = obtener_espacio_personal(usuario)
        resp = client.get(
            '/api/finanzas/movimientos/', **auth_header, **_header_espacio(personal)
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data == []

    def test_movimiento_dual_write_espacio(self, movimiento_efectivo, familia):
        # Toda fila creada con familia recibe el espacio espejo (pre_save).
        movimiento_efectivo.refresh_from_db()
        assert movimiento_efectivo.espacio_id == _espejo(familia).id

    def test_categorias_en_personal_solo_globales(
        self, client, usuario, familia, categoria_global, categoria_familiar, auth_header
    ):
        personal = obtener_espacio_personal(usuario)
        resp = client.get(
            '/api/finanzas/categorias/', **auth_header, **_header_espacio(personal)
        )
        assert resp.status_code == status.HTTP_200_OK
        ids = {c['id'] for c in resp.data}
        assert categoria_global.id in ids
        assert categoria_familiar.id not in ids

    def test_header_espacio_ajeno_403(
        self, client, usuario, familia, usuario_otra_familia, otra_familia, auth_header
    ):
        espejo_ajeno = _espejo(otra_familia)
        resp = client.get(
            '/api/finanzas/movimientos/', **auth_header, **_header_espacio(espejo_ajeno)
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_dashboard_en_personal_no_falla(self, client, usuario, familia, auth_header):
        # En espacio personal (familia derivada = None) el dashboard responde un
        # 400 controlado ("sin familia"), no un 500. Cambiará al habilitar la
        # operación personal de finanzas.
        personal = obtener_espacio_personal(usuario)
        resp = client.get(
            '/api/finanzas/dashboard-resumen/', **auth_header, **_header_espacio(personal)
        )
        assert resp.status_code in (status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST)
        assert resp.status_code != status.HTTP_500_INTERNAL_SERVER_ERROR


class TestEscriturasPorEspacio:
    def test_crear_movimiento_en_personal_bloqueado(
        self, client, usuario, familia, categoria_egreso, metodo_efectivo, auth_header
    ):
        personal = obtener_espacio_personal(usuario)
        resp = client.post(
            '/api/finanzas/movimientos/',
            {
                'monto': 10000,
                'fecha': '2026-03-01',
                'descripcion': 'Test personal',
                'categoria': categoria_egreso.id,
                'metodo_pago': metodo_efectivo.id,
                'tipo': 'EGRESO',
            },
            format='json',
            **auth_header,
            **_header_espacio(personal),
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert 'multitenant' in resp.data['error']

    def test_crear_movimiento_familiar_asigna_espacio(
        self, client, usuario, familia, categoria_egreso, metodo_efectivo, auth_header
    ):
        resp = client.post(
            '/api/finanzas/movimientos/',
            {
                'monto': 12345,
                'fecha': '2026-03-02',
                'descripcion': 'Test familiar',
                'categoria': categoria_egreso.id,
                'metodo_pago': metodo_efectivo.id,
                'tipo': 'EGRESO',
                'ambito': 'COMUN',
            },
            format='json',
            **auth_header,
        )
        assert resp.status_code == status.HTTP_201_CREATED, resp.data
        movimiento = Movimiento.objects.get(pk=resp.data['id'])
        assert movimiento.familia_id == familia.id
        assert movimiento.espacio_id == _espejo(familia).id

    def test_escritura_en_espacio_archivado_403(
        self, client, usuario, familia, categoria_egreso, metodo_efectivo, auth_header
    ):
        espejo = _espejo(familia)
        Espacio.objects.filter(pk=espejo.pk).update(archivado=True)
        resp = client.post(
            '/api/finanzas/movimientos/',
            {
                'monto': 1000,
                'fecha': '2026-03-03',
                'descripcion': 'En archivado',
                'categoria': categoria_egreso.id,
                'metodo_pago': metodo_efectivo.id,
                'tipo': 'EGRESO',
            },
            format='json',
            **auth_header,
            **_header_espacio(espejo),
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_presupuesto_create_en_personal_bloqueado(
        self, client, usuario, familia, categoria_familiar, auth_header
    ):
        personal = obtener_espacio_personal(usuario)
        resp = client.post(
            '/api/finanzas/presupuestos/',
            {'categoria': categoria_familiar.id, 'monto': 100000, 'mes': '2026-03-01'},
            format='json',
            **auth_header,
            **_header_espacio(personal),
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST


class TestAislamientoEntreFamilias:
    def test_movimiento_ajeno_invisible(
        self, client, usuario, familia, movimiento_efectivo,
        usuario_otra_familia, otra_familia, auth_header_otra_familia
    ):
        resp = client.get('/api/finanzas/movimientos/', **auth_header_otra_familia)
        assert resp.status_code == status.HTTP_200_OK
        assert movimiento_efectivo.id not in {m['id'] for m in resp.data}

    def test_detalle_movimiento_ajeno_404(
        self, client, usuario, familia, movimiento_efectivo,
        usuario_otra_familia, otra_familia, auth_header_otra_familia
    ):
        resp = client.get(
            f'/api/finanzas/movimientos/{movimiento_efectivo.id}/',
            **auth_header_otra_familia,
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND
