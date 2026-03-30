# backend/tests/test_sueldos_liquidacion.py

import pytest
from decimal import Decimal
from applications.finanzas.models import IngresoComun


# ── Tests de ingresos comunes ─────────────────────────────────────────────────

@pytest.mark.django_db
class TestIngresosComunes:

    def test_lista_ingresos_de_la_familia(
        self, client, auth_header, ingreso_jaime, ingreso_glori
    ):
        """Lista todos los ingresos de la familia."""
        res = client.get('/api/finanzas/ingresos-comunes/', **auth_header)
        assert res.status_code == 200
        assert len(res.json()) == 2

    def test_filtro_por_mes(
        self, client, auth_header, ingreso_jaime, usuario, familia
    ):
        """Filtra ingresos por mes y año."""
        IngresoComun.objects.create(
            usuario=usuario,
            familia=familia,
            mes='2026-02-01',
            monto='1800000.00',
            origen='Sueldo',
        )
        res = client.get(
            '/api/finanzas/ingresos-comunes/?mes=3&anio=2026', **auth_header
        )
        assert res.status_code == 200
        assert len(res.json()) == 1

    def test_no_retorna_ingresos_de_otra_familia(
        self, client, auth_header_otra_familia, ingreso_jaime
    ):
        """Un usuario de otra familia no ve estos ingresos."""
        res = client.get(
            '/api/finanzas/ingresos-comunes/', **auth_header_otra_familia
        )
        assert res.status_code == 200
        assert len(res.json()) == 0

    def test_crear_ingreso(self, client, auth_header):
        """Puede crear un ingreso común."""
        res = client.post(
            '/api/finanzas/ingresos-comunes/',
            data={
                'mes': '2026-03-01',
                'monto': '1800000.00',
                'origen': 'Sueldo',
            },
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 201
        assert res.json()['origen'] == 'Sueldo'

    def test_crear_multiples_ingresos_mismo_mes(
        self, client, auth_header, ingreso_jaime
    ):
        """Puede tener múltiples ingresos en el mismo mes."""
        res = client.post(
            '/api/finanzas/ingresos-comunes/',
            data={
                'mes': '2026-03-01',
                'monto': '300000.00',
                'origen': 'Honorarios',
            },
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 201
        total = IngresoComun.objects.filter(
            usuario=ingreso_jaime.usuario,
            mes__month=3,
        ).count()
        assert total == 2

    def test_editar_ingreso_propio(
        self, client, auth_header, ingreso_jaime
    ):
        """Puede editar su propio ingreso."""
        res = client.put(
            f'/api/finanzas/ingresos-comunes/{ingreso_jaime.id}/',
            data={'monto': '2000000.00'},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 200
        assert res.json()['monto'] == '2000000.00'

    def test_no_puede_editar_ingreso_ajeno(
        self, client, auth_header, ingreso_glori
    ):
        """No puede editar el ingreso de otro miembro."""
        res = client.put(
            f'/api/finanzas/ingresos-comunes/{ingreso_glori.id}/',
            data={'monto': '999.00'},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 403

    def test_eliminar_ingreso_propio(
        self, client, auth_header, ingreso_jaime
    ):
        """Puede eliminar su propio ingreso."""
        res = client.delete(
            f'/api/finanzas/ingresos-comunes/{ingreso_jaime.id}/',
            **auth_header,
        )
        assert res.status_code == 204

    def test_no_puede_eliminar_ingreso_ajeno(
        self, client, auth_header, ingreso_glori
    ):
        """No puede eliminar el ingreso de otro miembro."""
        res = client.delete(
            f'/api/finanzas/ingresos-comunes/{ingreso_glori.id}/',
            **auth_header,
        )
        assert res.status_code == 403

    def test_sin_token_retorna_401(self, client):
        res = client.get('/api/finanzas/ingresos-comunes/')
        assert res.status_code == 401


# ── Tests de liquidación ──────────────────────────────────────────────────────

@pytest.mark.django_db
class TestLiquidacion:

    def test_retorna_estructura_correcta(
        self, client, auth_header,
        ingreso_jaime, ingreso_glori,
        gasto_comun_jaime, gasto_comun_glori,
    ):
        """Retorna la estructura con periodo, ingresos y gastos_comunes."""
        res = client.get(
            '/api/finanzas/liquidacion/?mes=3&anio=2026', **auth_header
        )
        assert res.status_code == 200
        data = res.json()
        assert 'periodo' in data
        assert 'ingresos' in data
        assert 'gastos_comunes' in data
        assert data['periodo']['mes'] == 3
        assert data['periodo']['anio'] == 2026
        assert 'recalculo' in data
        assert 'pendiente' in data['recalculo']

    def test_retorna_ingresos_agrupados_por_usuario(
        self, client, auth_header, ingreso_jaime, ingreso_glori
    ):
        """Los ingresos vienen agrupados y sumados por usuario."""
        res = client.get(
            '/api/finanzas/liquidacion/?mes=3&anio=2026', **auth_header
        )
        assert res.status_code == 200
        ingresos = res.json()['ingresos']
        assert len(ingresos) == 2
        totales = {i['nombre']: Decimal(i['total']) for i in ingresos}
        assert totales['Jaime'] == Decimal('1800000.00')
        assert totales['Glori'] == Decimal('1000000.00')

    def test_suma_multiples_ingresos_del_mismo_usuario(
        self, client, auth_header, ingreso_jaime, usuario, familia
    ):
        """Si un usuario tiene múltiples ingresos, los suma correctamente."""
        IngresoComun.objects.create(
            usuario=usuario,
            familia=familia,
            mes='2026-03-01',
            monto='300000.00',
            origen='Honorarios',
        )
        res = client.get(
            '/api/finanzas/liquidacion/?mes=3&anio=2026', **auth_header
        )
        ingresos = {i['nombre']: Decimal(i['total']) for i in res.json()['ingresos']}
        assert ingresos['Jaime'] == Decimal('2100000.00')

    def test_retorna_gastos_comunes_agrupados_por_usuario(
        self, client, auth_header,
        ingreso_jaime, gasto_comun_jaime, gasto_comun_glori
    ):
        """Los gastos comunes vienen agrupados y sumados por usuario."""
        res = client.get(
            '/api/finanzas/liquidacion/?mes=3&anio=2026', **auth_header
        )
        gastos = res.json()['gastos_comunes']
        assert len(gastos) == 2
        totales = {g['nombre']: Decimal(g['total']) for g in gastos}
        assert totales['Jaime'] == Decimal('320000.00')
        assert totales['Glori'] == Decimal('180000.00')

    def test_no_incluye_gastos_personales(
        self, client, auth_header, ingreso_jaime,
        movimiento_efectivo,
    ):
        """Los gastos personales no aparecen en gastos_comunes."""
        res = client.get(
            '/api/finanzas/liquidacion/?mes=3&anio=2026', **auth_header
        )
        gastos = res.json()['gastos_comunes']
        assert len(gastos) == 0

    def test_mes_sin_datos_retorna_listas_vacias(
        self, client, auth_header
    ):
        """Un mes sin ingresos ni gastos retorna listas vacías."""
        res = client.get(
            '/api/finanzas/liquidacion/?mes=1&anio=2025', **auth_header
        )
        assert res.status_code == 200
        assert res.json()['ingresos'] == []
        assert res.json()['gastos_comunes'] == []

    def test_sin_mes_retorna_400(self, client, auth_header):
        """Sin parámetros mes y anio retorna 400."""
        res = client.get('/api/finanzas/liquidacion/', **auth_header)
        assert res.status_code == 400

    def test_no_retorna_datos_de_otra_familia(
        self, client, auth_header_otra_familia,
        ingreso_jaime, gasto_comun_jaime
    ):
        """Un usuario de otra familia no ve estos datos."""
        res = client.get(
            '/api/finanzas/liquidacion/?mes=3&anio=2026',
            **auth_header_otra_familia
        )
        assert res.status_code == 200
        assert res.json()['ingresos'] == []
        assert res.json()['gastos_comunes'] == []

    def test_sin_token_retorna_401(self, client):
        res = client.get('/api/finanzas/liquidacion/?mes=3&anio=2026')
        assert res.status_code == 401
