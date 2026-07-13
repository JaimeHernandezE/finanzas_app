"""Tests para Fase 5 V2: Google Drive por usuario — OAuth, cifrado, backup."""

import json
from unittest.mock import MagicMock, patch

import pytest
from django.test import TestCase, override_settings

from applications.espacios.drive_usuario import (
    decrypt_token,
    encrypt_token,
    generar_state_token,
    validar_state_token,
)
from applications.espacios.models import ConfiguracionRespaldoUsuario, Espacio

pytestmark = pytest.mark.django_db


# ── Tests unitarios (sin DB) ─────────────────────────────────────────────────

class TestCifradoTokens(TestCase):
    def test_encrypt_decrypt_roundtrip(self):
        original = 'my-secret-refresh-token-12345'
        encrypted = encrypt_token(original)
        self.assertNotEqual(encrypted, original)
        self.assertEqual(decrypt_token(encrypted), original)

    def test_decrypt_corrupto_falla(self):
        with self.assertRaises(ValueError):
            decrypt_token('not-a-valid-fernet-token')

    @override_settings(SECRET_KEY='different-key-for-test')
    def test_decrypt_con_otra_key_falla(self):
        encrypted = encrypt_token('token')
        with override_settings(SECRET_KEY='another-different-key'):
            with self.assertRaises(ValueError):
                decrypt_token(encrypted)


class TestStateToken(TestCase):
    def test_generar_y_validar(self):
        state = generar_state_token(42)
        uid = validar_state_token(state)
        self.assertEqual(uid, 42)

    def test_state_invalido(self):
        self.assertIsNone(validar_state_token('garbage'))

    def test_state_vacio(self):
        self.assertIsNone(validar_state_token(''))


# ── Tests de endpoints (pytest + conftest fixtures) ──────────────────────────

@pytest.mark.django_db
class TestDriveStatus:
    def test_status_sin_config(self, client, usuario, auth_header):
        resp = client.get('/api/espacios/drive/status/', **auth_header)
        assert resp.status_code == 200
        assert resp.data['connected'] is False
        assert resp.data['email'] == ''

    def test_status_con_drive_conectado(self, client, usuario, auth_header):
        ConfiguracionRespaldoUsuario.objects.create(
            usuario=usuario, drive_connected=True, drive_email='g@gmail.com',
            drive_folder_id='folder123', sheet_id='sheet456',
        )
        resp = client.get('/api/espacios/drive/status/', **auth_header)
        assert resp.status_code == 200
        assert resp.data['connected'] is True
        assert resp.data['email'] == 'g@gmail.com'
        assert resp.data['folder_id'] == 'folder123'
        assert resp.data['sheet_id'] == 'sheet456'


@pytest.mark.django_db
class TestDriveConfig:
    def test_config_sin_conexion(self, client, usuario, auth_header):
        resp = client.patch(
            '/api/espacios/drive/config/',
            data={'folder_id': 'abc', 'sheet_id': 'xyz'},
            content_type='application/json',
            **auth_header,
        )
        assert resp.status_code == 400

    def test_config_actualiza_ids(self, client, usuario, auth_header):
        ConfiguracionRespaldoUsuario.objects.create(
            usuario=usuario, drive_connected=True, drive_email='g@gmail.com',
        )
        resp = client.patch(
            '/api/espacios/drive/config/',
            data={'folder_id': 'folder-manual', 'sheet_id': 'sheet-manual'},
            content_type='application/json',
            **auth_header,
        )
        assert resp.status_code == 200
        assert resp.data['folder_id'] == 'folder-manual'
        assert resp.data['sheet_id'] == 'sheet-manual'
        cfg = ConfiguracionRespaldoUsuario.objects.get(usuario=usuario)
        assert cfg.drive_folder_id == 'folder-manual'
        assert cfg.sheet_id == 'sheet-manual'

    def test_connect_devuelve_auth_url(self, client, usuario, auth_header):
        with patch.dict('os.environ', {
            'GOOGLE_DRIVE_OAUTH_CLIENT_ID': 'test-client-id',
            'GOOGLE_DRIVE_OAUTH_CLIENT_SECRET': 'test-secret',
        }):
            resp = client.post('/api/espacios/drive/connect/', **auth_header)
            assert resp.status_code == 200
            assert 'auth_url' in resp.data
            assert 'https://accounts.google.com/o/oauth2/v2/auth' in resp.data['auth_url']
            assert 'accounts.googleapis.com' not in resp.data['auth_url']
            assert 'drive.file' in resp.data['auth_url']

    def test_connect_sin_credenciales_falla(self, client, usuario, auth_header):
        with patch.dict('os.environ', {
            'GOOGLE_DRIVE_OAUTH_CLIENT_ID': '',
            'GOOGLE_DRIVE_OAUTH_CLIENT_SECRET': '',
        }, clear=False):
            resp = client.post('/api/espacios/drive/connect/', **auth_header)
            assert resp.status_code == 500


@pytest.mark.django_db
class TestDriveDisconnect:
    def test_disconnect_sin_conexion(self, client, usuario, auth_header):
        resp = client.post('/api/espacios/drive/disconnect/', **auth_header)
        assert resp.status_code == 400

    def test_disconnect_con_conexion(self, client, usuario, auth_header):
        ConfiguracionRespaldoUsuario.objects.create(
            usuario=usuario, drive_connected=True, drive_email='g@gmail.com',
            drive_refresh_token_enc=encrypt_token('fake-refresh'),
        )
        with patch('applications.espacios.drive_usuario.revocar_token') as mock_rev:
            def _revoke(cfg):
                cfg.drive_connected = False
                cfg.drive_email = ''
                cfg.drive_refresh_token_enc = ''
                cfg.save(update_fields=['drive_connected', 'drive_email', 'drive_refresh_token_enc', 'updated_at'])
            mock_rev.side_effect = _revoke
            resp = client.post('/api/espacios/drive/disconnect/', **auth_header)
            assert resp.status_code == 200
            assert resp.data['ok'] is True


@pytest.mark.django_db
class TestDriveCallback:
    def test_callback_error_redirige(self, client, usuario):
        resp = client.get('/api/espacios/drive/callback/', {'error': 'access_denied'})
        assert resp.status_code == 302
        assert 'drive_error=access_denied' in resp.url

    def test_callback_sin_code(self, client, usuario):
        resp = client.get('/api/espacios/drive/callback/')
        assert resp.status_code == 302
        assert 'drive_error=no_code' in resp.url

    def test_callback_state_invalido(self, client, usuario):
        resp = client.get('/api/espacios/drive/callback/', {'code': 'abc', 'state': 'bad'})
        assert resp.status_code == 302
        assert 'drive_error=invalid_state' in resp.url

    def test_callback_exitoso(self, client, usuario):
        state = generar_state_token(usuario.id)
        with patch.dict('os.environ', {
            'GOOGLE_DRIVE_OAUTH_CLIENT_ID': 'cid',
            'GOOGLE_DRIVE_OAUTH_CLIENT_SECRET': 'cs',
        }):
            with patch(
                'applications.espacios.drive_usuario.intercambiar_codigo',
                return_value={'access_token': 'at', 'refresh_token': 'rt'},
            ), patch(
                'applications.espacios.drive_usuario.obtener_email_google',
                return_value='g@gmail.com',
            ):
                resp = client.get('/api/espacios/drive/callback/', {
                    'code': 'auth-code-123', 'state': state,
                })
        assert resp.status_code == 302
        assert 'drive_connected=1' in resp.url

        config = ConfiguracionRespaldoUsuario.objects.get(usuario=usuario)
        assert config.drive_connected is True
        assert config.drive_email == 'g@gmail.com'
        assert decrypt_token(config.drive_refresh_token_enc) == 'rt'


def _espacio_personal(usuario):
    return Espacio.objects.filter(
        tipo='PERSONAL', pertenencias__usuario=usuario, pertenencias__activo=True,
    ).first()


@pytest.mark.django_db
class TestDriveBackup:
    def test_backup_sin_drive_conectado(self, client, usuario, auth_header):
        ep = _espacio_personal(usuario)
        resp = client.post(f'/api/espacios/{ep.id}/backup-drive/', **auth_header)
        assert resp.status_code == 400
        assert 'Conecta' in resp.data['error']

    def test_backup_exitoso(self, client, usuario, auth_header):
        ep = _espacio_personal(usuario)
        ConfiguracionRespaldoUsuario.objects.create(
            usuario=usuario, drive_connected=True, drive_email='g@gmail.com',
            drive_refresh_token_enc=encrypt_token('fake-refresh'),
            drive_folder_id='folder123',
        )
        with patch(
            'applications.espacios.drive_usuario.build_drive_service_usuario',
            return_value=MagicMock(),
        ), patch(
            'applications.espacios.drive_usuario.subir_backup_espacio',
            return_value={'id': 'file1', 'nombre': 'backup.json', 'tamaño': '1234'},
        ), patch(
            'applications.espacios.drive_usuario.limpiar_backups_antiguos',
            return_value=[],
        ):
            resp = client.post(f'/api/espacios/{ep.id}/backup-drive/', **auth_header)
        assert resp.status_code == 200
        assert resp.data['ok'] is True
        assert resp.data['archivo']['nombre'] == 'backup.json'
        assert resp.data['folder_id'] == 'folder123'

    def test_backup_espacio_ajeno(self, client, usuario, usuario_otra_familia, auth_header_otra_familia):
        ep = _espacio_personal(usuario)
        ConfiguracionRespaldoUsuario.objects.create(
            usuario=usuario_otra_familia, drive_connected=True,
            drive_refresh_token_enc=encrypt_token('x'),
        )
        resp = client.post(f'/api/espacios/{ep.id}/backup-drive/', **auth_header_otra_familia)
        assert resp.status_code == 403

    def test_backup_crea_carpeta_si_no_existe(self, client, usuario, auth_header):
        ep = _espacio_personal(usuario)
        config = ConfiguracionRespaldoUsuario.objects.create(
            usuario=usuario, drive_connected=True, drive_email='g@gmail.com',
            drive_refresh_token_enc=encrypt_token('fake-refresh'),
            drive_folder_id='',
        )
        with patch(
            'applications.espacios.drive_usuario.build_drive_service_usuario',
            return_value=MagicMock(),
        ), patch(
            'applications.espacios.drive_usuario.asegurar_carpeta_backup',
            return_value='new-folder-id',
        ), patch(
            'applications.espacios.drive_usuario.subir_backup_espacio',
            return_value={'id': 'f1', 'nombre': 'b.json', 'tamaño': '100'},
        ), patch(
            'applications.espacios.drive_usuario.limpiar_backups_antiguos',
            return_value=['old1'],
        ):
            resp = client.post(f'/api/espacios/{ep.id}/backup-drive/', **auth_header)
        assert resp.status_code == 200
        assert resp.data['eliminados'] == 1
        config.refresh_from_db()
        assert config.drive_folder_id == 'new-folder-id'
