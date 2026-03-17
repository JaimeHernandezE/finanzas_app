# backend/tests/test_metodos_pago.py

import pytest


@pytest.mark.django_db
class TestMetodosPago:

    def test_retorna_metodos_de_pago(self, client, auth_header, metodos_pago):
        """Retorna los tres métodos de pago estándar."""
        res = client.get('/api/finanzas/metodos-pago/', **auth_header)
        assert res.status_code == 200
        assert len(res.json()) == 3
        tipos = [m['tipo'] for m in res.json()]
        assert 'EFECTIVO' in tipos
        assert 'DEBITO' in tipos
        assert 'CREDITO' in tipos

    def test_seed_automatico_si_tabla_vacia(self, client, auth_header):
        """Si no hay métodos de pago, los crea automáticamente."""
        res = client.get('/api/finanzas/metodos-pago/', **auth_header)
        assert res.status_code == 200
        assert len(res.json()) == 3

    def test_sin_token_retorna_401(self, client):
        res = client.get('/api/finanzas/metodos-pago/')
        assert res.status_code == 401
