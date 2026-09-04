# backend/tests/test_inversiones.py

import pytest
from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from applications.inversiones.models import Fondo, Aporte, RegistroValor


@pytest.fixture
def fondo(db, usuario, espacio_familiar):
    return Fondo.objects.create(
        nombre='Fondo Mutuo BCI', descripcion='Renta variable',
        espacio=espacio_familiar, usuario=usuario,
    )


@pytest.fixture
def fondo_compartido(db, espacio_familiar):
    return Fondo.objects.create(
        nombre='Fondo Familiar', descripcion='Compartido',
        espacio=espacio_familiar, usuario=None,
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

    def test_aporte_posterior_al_ultimo_valor_suma_al_valor_actual(
        self, client, auth_header, fondo, aporte, registro_valor
    ):
        """
        Un aporte posterior al último snapshot de valor debe sumarse al valor
        actual. El snapshot es una foto de mercado a esa fecha: el dinero que
        entró después no está en él, y sin el ajuste el aporte aparecía como
        una pérdida por su monto completo.
        """
        Aporte.objects.create(
            fondo=fondo, fecha='2026-03-10', monto='1000000.00', nota='Aporte nuevo'
        )
        res = client.get('/api/inversiones/fondos/', **auth_header)
        datos = res.json()[0]
        # capital 5.000.000 + 1.000.000; valor 5.980.000 (1 mar) + 1.000.000 (10 mar)
        assert Decimal(datos['capital_total']) == Decimal('6000000.00')
        assert Decimal(datos['valor_actual']) == Decimal('6980000.00')
        assert Decimal(datos['ganancia']) == Decimal('980000.00')

    def test_retiro_posterior_al_ultimo_valor_resta_del_valor_actual(
        self, client, auth_header, fondo, aporte, registro_valor
    ):
        """Un retiro (monto negativo) posterior al snapshot descuenta del valor actual."""
        Aporte.objects.create(
            fondo=fondo, fecha='2026-03-10', monto='-500000.00', nota='Retiro'
        )
        res = client.get('/api/inversiones/fondos/', **auth_header)
        datos = res.json()[0]
        assert Decimal(datos['capital_total']) == Decimal('4500000.00')
        assert Decimal(datos['valor_actual']) == Decimal('5480000.00')
        assert Decimal(datos['ganancia']) == Decimal('980000.00')

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

    def test_reenvio_de_aporte_identico_no_duplica(self, client, auth_header, fondo):
        """
        Regresión: si el cliente aborta por timeout una petición que el servidor
        sí completó, el reintento del usuario duplicaba el movimiento. Dentro de
        la ventana corta el reenvío devuelve el existente con 200.
        """
        cuerpo = {'fecha': '2026-03-10', 'monto': '500000.00', 'nota': 'Aporte marzo'}
        primera = client.post(
            f'/api/inversiones/fondos/{fondo.id}/aportes/',
            data=cuerpo, content_type='application/json', **auth_header,
        )
        assert primera.status_code == 201

        reenvio = client.post(
            f'/api/inversiones/fondos/{fondo.id}/aportes/',
            data=cuerpo, content_type='application/json', **auth_header,
        )
        assert reenvio.status_code == 200
        assert reenvio.json()['id'] == primera.json()['id']
        assert Aporte.objects.filter(fondo=fondo).count() == 1

    def test_aporte_identico_fuera_de_ventana_si_se_registra(
        self, client, auth_header, fondo
    ):
        """Pasada la ventana, dos movimientos idénticos son dos movimientos distintos."""
        from applications.inversiones import views as vistas_inversiones

        cuerpo = {'fecha': '2026-03-10', 'monto': '500000.00', 'nota': 'Aporte marzo'}
        client.post(
            f'/api/inversiones/fondos/{fondo.id}/aportes/',
            data=cuerpo, content_type='application/json', **auth_header,
        )
        # Envejecer el registro más allá de la ventana.
        Aporte.objects.filter(fondo=fondo).update(
            created_at=timezone.now() - vistas_inversiones.VENTANA_DUPLICADO_APORTE
            - timedelta(seconds=1)
        )

        segunda = client.post(
            f'/api/inversiones/fondos/{fondo.id}/aportes/',
            data=cuerpo, content_type='application/json', **auth_header,
        )
        assert segunda.status_code == 201
        assert Aporte.objects.filter(fondo=fondo).count() == 2

    def test_aporte_con_distinto_monto_no_se_descarta(self, client, auth_header, fondo):
        """Sólo se descarta el movimiento idéntico, no cualquiera cercano en el tiempo."""
        for monto in ('500000.00', '750000.00'):
            res = client.post(
                f'/api/inversiones/fondos/{fondo.id}/aportes/',
                data={'fecha': '2026-03-10', 'monto': monto, 'nota': 'Aporte marzo'},
                content_type='application/json', **auth_header,
            )
            assert res.status_code == 201
        assert Aporte.objects.filter(fondo=fondo).count() == 2

    def test_agregar_valor(self, client, auth_header, fondo):
        res = client.post(
            f'/api/inversiones/fondos/{fondo.id}/valores/',
            data={'fecha': '2026-03-15', 'valor_cuota': '5980000.00'},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 201

    def test_agregar_valor_fecha_repetida_actualiza_sin_error(
        self, client, auth_header, fondo, registro_valor
    ):
        """
        Regresión: unique_together ['fondo', 'fecha'] reventaba con IntegrityError
        (HTTP 500) porque el serializer no expone `fondo` y DRF omite el
        UniqueTogetherValidator. Reenviar la misma fecha debe actualizar el valor.
        """
        res = client.post(
            f'/api/inversiones/fondos/{fondo.id}/valores/',
            data={'fecha': str(registro_valor.fecha), 'valor_cuota': '6100000.00'},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 200
        assert RegistroValor.objects.filter(
            fondo=fondo, fecha=registro_valor.fecha
        ).count() == 1
        registro_valor.refresh_from_db()
        assert registro_valor.valor_cuota == Decimal('6100000.00')

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
