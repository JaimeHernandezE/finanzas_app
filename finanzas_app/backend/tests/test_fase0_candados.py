# Tests de los candados de seguridad de la Fase 0 multitenant:
# - Export global a Sheets bloqueado sin ALLOW_GLOBAL_EXPORT.
# - Dump/subida de BD completa bloqueados sin ALLOW_DB_EXPORT.
# - Registro con throttle y con REQUIRE_VERIFIED_EMAIL opcional.
#
# pytest-django fuerza DEBUG=False, por lo que los candados están cerrados
# por defecto en los tests; el camino abierto se prueba con monkeypatch.setenv.

from unittest.mock import patch

import pytest
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APIClient

from applications.usuarios.models import InvitacionAcceso


@pytest.fixture(autouse=True)
def limpiar_cache_throttle():
    """El estado del throttle DRF vive en el cache; evitar contaminación entre tests."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def client():
    return APIClient()


# ── Export global a Sheets ────────────────────────────────────────────────────

class TestCandadoExportGlobal:
    def test_export_sheets_bloqueado_sin_flag(self, client, monkeypatch):
        monkeypatch.setenv('EXPORT_SECRET_TOKEN', 'token-correcto')
        resp = client.post(
            '/api/export/sheets/',
            HTTP_X_EXPORT_TOKEN='token-correcto',
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert 'ALLOW_GLOBAL_EXPORT' in resp.data['error']

    def test_export_sheets_con_flag_valida_token(self, client, monkeypatch):
        monkeypatch.setenv('ALLOW_GLOBAL_EXPORT', 'true')
        monkeypatch.setenv('EXPORT_SECRET_TOKEN', 'token-correcto')
        resp = client.post(
            '/api/export/sheets/',
            HTTP_X_EXPORT_TOKEN='token-incorrecto',
        )
        # Con el candado abierto, la validación del token vuelve a operar.
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_sincronizar_app_retirado(self, client, db, usuario, auth_header):
        """La sync Sheets desde la app ya no existe; el global de instancia es el dump PG."""
        resp = client.post('/api/export/sincronizar/', **auth_header)
        assert resp.status_code == status.HTTP_404_NOT_FOUND


# ── Dump de BD completa ──────────────────────────────────────────────────────

class TestCandadoDumpBd:
    def test_descargar_dump_bloqueado_sin_flag(self, client):
        resp = client.get('/api/backup-bd/descargar/')
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert 'ALLOW_DB_EXPORT' in resp.data['error']

    def test_subir_drive_bloqueado_sin_flag(self, client):
        resp = client.post('/api/backup-bd/subir-drive/')
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert 'ALLOW_DB_EXPORT' in resp.data['error']

    def test_descargar_dump_con_flag_exige_auth(self, client, monkeypatch):
        monkeypatch.setenv('ALLOW_DB_EXPORT', 'true')
        resp = client.get('/api/backup-bd/descargar/')
        # Con el candado abierto vuelve a operar la autenticación Firebase.
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED


# ── Registro: throttle y verificación de email ───────────────────────────────

def _decoded_firebase(email_verified: bool):
    return (
        {
            'email': 'nuevo@test.com',
            'uid': 'uid-nuevo-test',
            'name': 'Nuevo Usuario',
            'email_verified': email_verified,
        },
        None,
    )


class TestCandadoRegistro:
    def test_registro_exige_email_verificado_con_flag(self, client, db, monkeypatch):
        monkeypatch.setenv('REQUIRE_VERIFIED_EMAIL', 'true')
        with patch(
            'applications.usuarios.views.obtener_usuario_desde_token',
            return_value=_decoded_firebase(email_verified=False),
        ):
            resp = client.post('/api/usuarios/registro/', HTTP_AUTHORIZATION='Bearer x')
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert 'verificar tu correo' in resp.data['error']

    def test_registro_sin_flag_no_exige_verificacion(self, client, db, monkeypatch):
        monkeypatch.delenv('REQUIRE_VERIFIED_EMAIL', raising=False)
        InvitacionAcceso.objects.create(email='nuevo@test.com')
        with patch(
            'applications.usuarios.views.obtener_usuario_desde_token',
            return_value=_decoded_firebase(email_verified=False),
        ):
            resp = client.post('/api/usuarios/registro/', HTTP_AUTHORIZATION='Bearer x')
        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.data['creado'] is True

    def test_registro_throttle_10_por_hora(self, client, db):
        # Sin token válido cada intento devuelve 401, pero el throttle cuenta igual.
        for _ in range(10):
            resp = client.post('/api/usuarios/registro/')
            assert resp.status_code == status.HTTP_401_UNAUTHORIZED
        resp = client.post('/api/usuarios/registro/')
        assert resp.status_code == status.HTTP_429_TOO_MANY_REQUESTS
