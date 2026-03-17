# backend/tests/test_inversiones.py

import pytest
from decimal import Decimal
from applications.inversiones.models import Fondo, Aporte, RegistroValor


@pytest.fixture
def fondo(db, usuario, familia):
    return Fondo.objects.create(
        nombre='Fondo Mutuo BCI', descripcion='Renta variable',
        familia=familia, usuario=usuario,
    )


@pytest.fixture
def fondo_compartido(db, familia):
    return Fondo.objects.create(
        nombre='Fondo Familiar', descripcion='Compartido',
        familia=familia, usuario=None,
    )


@pytest.fixture
def aporte(db, fondo):
    return Aporte.objects.create(
        fondo=fondo, fecha='2026-01-10', monto='5000000.00', nota='Aporte inicial'
    )


@pytest.fixture
def registro_valor(db, fondo):
    return RegistroValor.objects.create(
        fondo=fondo, fecha='2026-03-01', valor_cuota='5980000.00'
    )


@pytest.mark.django_db
class TestFondosListado:

    def test_lista_fondos_propios_y_compartidos(
        self, client, auth_header, fondo, fondo_compartido
    ):
        """Lista fondos propios y compartidos de la familia."""
        res = client.get('/api/inversiones/fondos/', **auth_header)
        assert res.status_code == 200
        assert len(res.json()) == 2

    def test_metricas_calculadas_correctamente(
        self, client, auth_header, fondo, aporte, registro_valor
    ):
        """Las métricas se calculan correctamente en el listado."""
        res = client.get('/api/inversiones/fondos/', **auth_header)
        assert res.status_code == 200
        datos = res.json()[0]
        assert Decimal(datos['capital_total']) == Decimal('5000000.00')
        assert Decimal(datos['valor_actual'])  == Decimal('5980000.00')
        assert Decimal(datos['ganancia'])      == Decimal('980000.00')
        assert Decimal(datos['rentabilidad'])  == Decimal('19.60')

    def test_fondo_sin_registros_valor_usa_capital_como_valor_actual(
        self, client, auth_header, fondo, aporte
    ):
        """Si no hay registros de valor, el valor actual es el capital invertido."""
        res = client.get('/api/inversiones/fondos/', **auth_header)
        datos = res.json()[0]
        assert Decimal(datos['valor_actual']) == Decimal(datos['capital_total'])
        assert Decimal(datos['ganancia'])     == Decimal('0.00')

    def test_no_retorna_fondos_de_otra_familia(
        self, client, auth_header_otra_familia, fondo
    ):
        res = client.get('/api/inversiones/fondos/', **auth_header_otra_familia)
        assert res.status_code == 200
        assert len(res.json()) == 0


@pytest.mark.django_db
class TestFondosCreacion:

    def test_crear_fondo_personal(self, client, auth_header):
        res = client.post(
            '/api/inversiones/fondos/',
            data={'nombre': 'Depósito Plazo', 'descripcion': 'BCI', 'es_compartido': False},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 201
        assert res.json()['nombre'] == 'Depósito Plazo'

    def test_crear_fondo_compartido(self, client, auth_header):
        res = client.post(
            '/api/inversiones/fondos/',
            data={'nombre': 'Fondo Dólar', 'descripcion': '', 'es_compartido': True},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 201
        fondo = Fondo.objects.get(nombre='Fondo Dólar')
        assert fondo.usuario is None


@pytest.mark.django_db
class TestAportesYValores:

    def test_agregar_aporte(self, client, auth_header, fondo):
        res = client.post(
            f'/api/inversiones/fondos/{fondo.id}/aportes/',
            data={'fecha': '2026-03-10', 'monto': '500000.00', 'nota': 'Aporte marzo'},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 201
        assert Aporte.objects.filter(fondo=fondo).count() == 1

    def test_agregar_valor(self, client, auth_header, fondo):
        res = client.post(
            f'/api/inversiones/fondos/{fondo.id}/valores/',
            data={'fecha': '2026-03-15', 'valor_cuota': '5980000.00'},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 201

    def test_eliminar_aporte(self, client, auth_header, aporte):
        res = client.delete(
            f'/api/inversiones/aportes/{aporte.id}/',
            **auth_header,
        )
        assert res.status_code == 204
        assert not Aporte.objects.filter(id=aporte.id).exists()

    def test_historial_mezclado_ordenado(
        self, client, auth_header, fondo, aporte, registro_valor
    ):
        """El historial mezcla aportes y valores ordenados de más reciente a más antiguo."""
        res = client.get(f'/api/inversiones/fondos/{fondo.id}/', **auth_header)
        assert res.status_code == 200
        historial = res.json()['historial']
        assert len(historial) == 2
        # El más reciente primero
        assert historial[0]['fecha'] > historial[1]['fecha']
        tipos = {h['tipo'] for h in historial}
        assert 'APORTE' in tipos
        assert 'VALOR'  in tipos
