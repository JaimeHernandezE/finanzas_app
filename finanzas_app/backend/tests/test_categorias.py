# backend/tests/test_categorias.py

import pytest


@pytest.mark.django_db
class TestCategoriasListado:

    def test_retorna_categorias_globales(
        self, client, auth_header, categoria_global
    ):
        """El usuario ve las categorías globales del sistema."""
        res = client.get('/api/finanzas/categorias/', **auth_header)
        assert res.status_code == 200
        nombres = [c['nombre'] for c in res.json()]
        assert 'Alimentación' in nombres

    def test_retorna_categorias_de_su_familia(
        self, client, auth_header, categoria_familiar
    ):
        """El usuario ve las categorías de su familia."""
        res = client.get('/api/finanzas/categorias/', **auth_header)
        assert res.status_code == 200
        nombres = [c['nombre'] for c in res.json()]
        assert 'Gastos Casa' in nombres

    def test_retorna_categorias_personales(
        self, client, auth_header, categoria_personal
    ):
        """El usuario ve sus categorías personales."""
        res = client.get('/api/finanzas/categorias/', **auth_header)
        assert res.status_code == 200
        nombres = [c['nombre'] for c in res.json()]
        assert 'Honorarios' in nombres

    def test_no_retorna_categorias_de_otra_familia(
        self, client, auth_header_otra_familia, categoria_familiar
    ):
        """Un usuario de otra familia NO ve las categorías de esta familia."""
        res = client.get('/api/finanzas/categorias/', **auth_header_otra_familia)
        assert res.status_code == 200
        nombres = [c['nombre'] for c in res.json()]
        assert 'Gastos Casa' not in nombres

    def test_sin_token_retorna_401(self, client):
        """Sin token de autenticación retorna 401."""
        res = client.get('/api/finanzas/categorias/')
        assert res.status_code == 401


@pytest.mark.django_db
class TestCategoriasCreacion:

    def test_crear_categoria_familiar(self, client, auth_header, familia):
        """Puede crear una categoría familiar."""
        res = client.post(
            '/api/finanzas/categorias/',
            data={'nombre': 'Mascotas', 'tipo': 'EGRESO', 'ambito': 'FAMILIAR'},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 201
        assert res.json()['nombre'] == 'Mascotas'

    def test_crear_categoria_personal(self, client, auth_header):
        """Puede crear una categoría personal."""
        res = client.post(
            '/api/finanzas/categorias/',
            data={'nombre': 'Consultoría', 'tipo': 'INGRESO', 'ambito': 'PERSONAL'},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 201

    def test_crear_categoria_sin_nombre_falla(self, client, auth_header):
        """No puede crear una categoría sin nombre."""
        res = client.post(
            '/api/finanzas/categorias/',
            data={'tipo': 'EGRESO', 'ambito': 'FAMILIAR'},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 400


@pytest.mark.django_db
class TestCategoriasEdicion:

    def test_editar_categoria_familiar(
        self, client, auth_header, categoria_familiar
    ):
        """Puede editar el nombre de una categoría familiar."""
        res = client.put(
            f'/api/finanzas/categorias/{categoria_familiar.id}/',
            data={'nombre': 'Gastos del Hogar'},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 200
        assert res.json()['nombre'] == 'Gastos del Hogar'

    def test_editar_categoria_global(
        self, client, auth_header, categoria_global
    ):
        """Puede editar el nombre de una categoría global."""
        res = client.put(
            f'/api/finanzas/categorias/{categoria_global.id}/',
            data={'nombre': 'Comida'},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 200

    def test_no_puede_editar_categoria_de_otra_familia(
        self, client, auth_header_otra_familia, categoria_familiar
    ):
        """Un usuario de otra familia no puede editar categorías de esta familia."""
        res = client.put(
            f'/api/finanzas/categorias/{categoria_familiar.id}/',
            data={'nombre': 'Hackeada'},
            content_type='application/json',
            **auth_header_otra_familia,
        )
        assert res.status_code == 403


@pytest.mark.django_db
class TestCategoriasEliminacion:

    def test_eliminar_categoria_familiar(
        self, client, auth_header, categoria_familiar
    ):
        """Puede eliminar una categoría familiar."""
        res = client.delete(
            f'/api/finanzas/categorias/{categoria_familiar.id}/',
            **auth_header,
        )
        assert res.status_code == 204

    def test_no_puede_eliminar_categoria_global(
        self, client, auth_header, categoria_global
    ):
        """No puede eliminar categorías globales del sistema."""
        res = client.delete(
            f'/api/finanzas/categorias/{categoria_global.id}/',
            **auth_header,
        )
        assert res.status_code == 403

    def test_no_puede_eliminar_categoria_de_otra_familia(
        self, client, auth_header_otra_familia, categoria_familiar
    ):
        """Un usuario de otra familia no puede eliminar categorías de esta familia."""
        res = client.delete(
            f'/api/finanzas/categorias/{categoria_familiar.id}/',
            **auth_header_otra_familia,
        )
        assert res.status_code == 403
