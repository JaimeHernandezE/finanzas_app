"""
Tests para los campos de preferencias del usuario (idioma_ui, moneda_display, zona_horaria)
en el endpoint GET/PATCH /api/usuarios/me/.
"""
import pytest
from unittest.mock import patch
from django.test import Client

from applications.usuarios.models import Usuario


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _me_get(client, token):
    return client.get(
        '/api/usuarios/me/',
        HTTP_AUTHORIZATION=f'Bearer {token}',
    )


def _me_patch(client, token, data):
    import json
    return client.patch(
        '/api/usuarios/me/',
        data=json.dumps(data),
        content_type='application/json',
        HTTP_AUTHORIZATION=f'Bearer {token}',
    )


def _make_decoded(usuario):
    return {
        'uid': usuario.firebase_uid,
        'email': usuario.email,
        'picture': None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Tests GET /me/ — nuevos campos en respuesta
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_me_get_incluye_preferencias(usuario):
    client = Client()
    decoded = _make_decoded(usuario)
    with patch('applications.usuarios.views.obtener_usuario_desde_token', return_value=(decoded, None)):
        res = _me_get(client, 'tok')
    assert res.status_code == 200
    data = res.json()
    assert 'idioma_ui' in data
    assert 'moneda_display' in data
    assert 'zona_horaria' in data
    assert data['idioma_ui'] == 'es'
    assert data['moneda_display'] == 'CLP'
    assert data['zona_horaria'] == 'America/Santiago'


# ─────────────────────────────────────────────────────────────────────────────
# Tests PATCH /me/ — preferencias válidas
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_me_patch_idioma_valido(usuario):
    client = Client()
    decoded = _make_decoded(usuario)
    with patch('applications.usuarios.views.obtener_usuario_desde_token', return_value=(decoded, None)):
        res = _me_patch(client, 'tok', {'idioma_ui': 'en'})
    assert res.status_code == 200
    usuario.refresh_from_db()
    assert usuario.idioma_ui == 'en'


@pytest.mark.django_db
def test_me_patch_moneda_valida(usuario):
    client = Client()
    decoded = _make_decoded(usuario)
    with patch('applications.usuarios.views.obtener_usuario_desde_token', return_value=(decoded, None)):
        res = _me_patch(client, 'tok', {'moneda_display': 'USD'})
    assert res.status_code == 200
    usuario.refresh_from_db()
    assert usuario.moneda_display == 'USD'


@pytest.mark.django_db
def test_me_patch_zona_horaria_valida(usuario):
    client = Client()
    decoded = _make_decoded(usuario)
    with patch('applications.usuarios.views.obtener_usuario_desde_token', return_value=(decoded, None)):
        res = _me_patch(client, 'tok', {'zona_horaria': 'Europe/Madrid'})
    assert res.status_code == 200
    usuario.refresh_from_db()
    assert usuario.zona_horaria == 'Europe/Madrid'


@pytest.mark.django_db
def test_me_patch_multiples_preferencias(usuario):
    """Puede actualizar varias preferencias en una sola llamada."""
    client = Client()
    decoded = _make_decoded(usuario)
    with patch('applications.usuarios.views.obtener_usuario_desde_token', return_value=(decoded, None)):
        res = _me_patch(client, 'tok', {
            'idioma_ui': 'en',
            'moneda_display': 'EUR',
            'zona_horaria': 'America/New_York',
        })
    assert res.status_code == 200
    usuario.refresh_from_db()
    assert usuario.idioma_ui == 'en'
    assert usuario.moneda_display == 'EUR'
    assert usuario.zona_horaria == 'America/New_York'


# ─────────────────────────────────────────────────────────────────────────────
# Tests PATCH /me/ — validaciones de errores
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_me_patch_idioma_invalido(usuario):
    client = Client()
    decoded = _make_decoded(usuario)
    with patch('applications.usuarios.views.obtener_usuario_desde_token', return_value=(decoded, None)):
        res = _me_patch(client, 'tok', {'idioma_ui': 'fr'})
    assert res.status_code == 400
    assert 'error' in res.json()


@pytest.mark.django_db
def test_me_patch_moneda_invalida(usuario):
    client = Client()
    decoded = _make_decoded(usuario)
    with patch('applications.usuarios.views.obtener_usuario_desde_token', return_value=(decoded, None)):
        res = _me_patch(client, 'tok', {'moneda_display': 'XYZ'})
    assert res.status_code == 400
    assert 'error' in res.json()


@pytest.mark.django_db
def test_me_patch_zona_horaria_invalida(usuario):
    client = Client()
    decoded = _make_decoded(usuario)
    with patch('applications.usuarios.views.obtener_usuario_desde_token', return_value=(decoded, None)):
        res = _me_patch(client, 'tok', {'zona_horaria': 'Marte/Olympus'})
    assert res.status_code == 400
    assert 'error' in res.json()


@pytest.mark.django_db
def test_me_patch_sin_campos(usuario):
    """PATCH sin ningún campo reconocido → 400."""
    client = Client()
    decoded = _make_decoded(usuario)
    with patch('applications.usuarios.views.obtener_usuario_desde_token', return_value=(decoded, None)):
        res = _me_patch(client, 'tok', {})
    assert res.status_code == 400


# ─────────────────────────────────────────────────────────────────────────────
# Tests modo DEMO
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_me_patch_nombre_bloqueado_en_demo(usuario, settings):
    settings.DEMO = True
    client = Client()
    decoded = _make_decoded(usuario)
    with patch('applications.usuarios.views.obtener_usuario_desde_token', return_value=(decoded, None)):
        res = _me_patch(client, 'tok', {'nombre': 'Nombre Nuevo'})
    assert res.status_code == 403


@pytest.mark.django_db
def test_me_patch_preferencias_permitidas_en_demo(usuario, settings):
    settings.DEMO = True
    client = Client()
    decoded = _make_decoded(usuario)
    with patch('applications.usuarios.views.obtener_usuario_desde_token', return_value=(decoded, None)):
        res = _me_patch(client, 'tok', {'idioma_ui': 'en', 'moneda_display': 'USD'})
    assert res.status_code == 200
    usuario.refresh_from_db()
    assert usuario.idioma_ui == 'en'
    assert usuario.moneda_display == 'USD'
