# backend/tests/test_tarjetas.py

import pytest


@pytest.mark.django_db
class TestTarjetasListado:

    def test_retorna_tarjetas_del_usuario(self, client, auth_header, tarjeta):
        """El usuario ve solo sus propias tarjetas."""
        res = client.get('/api/finanzas/tarjetas/', **auth_header)
        assert res.status_code == 200
        assert len(res.json()) == 1
        assert res.json()[0]['nombre'] == 'Visa BCI'

    def test_no_retorna_tarjetas_de_otro_usuario(
        self, client, auth_header_2, tarjeta
    ):
        """Un usuario no ve las tarjetas de otro usuario."""
        res = client.get('/api/finanzas/tarjetas/', **auth_header_2)
        assert res.status_code == 200
        assert len(res.json()) == 0

    def test_sin_token_retorna_401(self, client):
        res = client.get('/api/finanzas/tarjetas/')
        assert res.status_code == 401


@pytest.mark.django_db
class TestTarjetasCreacion:

    def test_crear_tarjeta(self, client, auth_header):
        """Puede crear una tarjeta nueva."""
        res = client.post(
            '/api/finanzas/tarjetas/',
            data={'nombre': 'Mastercard Santander', 'banco': 'Santander'},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 201
        assert res.json()['nombre'] == 'Mastercard Santander'

    def test_crear_tarjeta_sin_nombre_falla(self, client, auth_header):
        res = client.post(
            '/api/finanzas/tarjetas/',
            data={'banco': 'BCI'},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 400


@pytest.mark.django_db
class TestTarjetasEdicionEliminacion:

    def test_editar_tarjeta_propia(self, client, auth_header, tarjeta):
        """Puede editar su propia tarjeta."""
        res = client.put(
            f'/api/finanzas/tarjetas/{tarjeta.id}/',
            data={'nombre': 'Visa BCI Platinum'},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 200
        assert res.json()['nombre'] == 'Visa BCI Platinum'

    def test_no_puede_editar_tarjeta_ajena(
        self, client, auth_header_2, tarjeta
    ):
        """Un usuario no puede editar la tarjeta de otro."""
        res = client.put(
            f'/api/finanzas/tarjetas/{tarjeta.id}/',
            data={'nombre': 'Hackeada'},
            content_type='application/json',
            **auth_header_2,
        )
        assert res.status_code == 404

    def test_eliminar_tarjeta_propia(self, client, auth_header, tarjeta):
        """Puede eliminar su propia tarjeta."""
        res = client.delete(
            f'/api/finanzas/tarjetas/{tarjeta.id}/',
            **auth_header,
        )
        assert res.status_code == 204

    def test_no_puede_eliminar_tarjeta_ajena(
        self, client, auth_header_2, tarjeta
    ):
        """Un usuario no puede eliminar la tarjeta de otro."""
        res = client.delete(
            f'/api/finanzas/tarjetas/{tarjeta.id}/',
            **auth_header_2,
        )
        assert res.status_code == 404
