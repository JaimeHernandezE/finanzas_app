# backend/tests/test_miembros_quitar.py

import pytest


@pytest.mark.django_db
class TestMiembrosQuitarApi:
    def test_listado_incluye_puede_quitar(
        self, client, auth_header, auth_header_2, usuario, usuario_2
    ):
        res = client.get('/api/usuarios/familia/miembros/', **auth_header)
        assert res.status_code == 200
        data = res.json()
        by_id = {m['id']: m for m in data}
        assert by_id[usuario.id]['puede_quitar'] is False
        assert by_id[usuario_2.id]['puede_quitar'] is True

    def test_miembro_no_admin_no_ve_puede_quitar_true(
        self, client, auth_header_2, usuario, usuario_2
    ):
        res = client.get('/api/usuarios/familia/miembros/', **auth_header_2)
        assert res.status_code == 200
        for m in res.json():
            assert m['puede_quitar'] is False

    def test_admin_quita_miembro_sin_datos(self, client, auth_header, usuario_2):
        res = client.delete(
            f'/api/usuarios/familia/miembros/{usuario_2.id}/',
            **auth_header,
        )
        assert res.status_code == 204
        usuario_2.refresh_from_db()
        assert usuario_2.familia_id is None

    def test_no_quitar_a_si_mismo(self, client, auth_header, usuario):
        res = client.delete(
            f'/api/usuarios/familia/miembros/{usuario.id}/',
            **auth_header,
        )
        assert res.status_code == 400
        assert 'ti mismo' in res.json()['error'].lower()
