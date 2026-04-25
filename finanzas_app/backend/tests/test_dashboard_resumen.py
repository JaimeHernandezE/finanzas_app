# backend/tests/test_dashboard_resumen.py

from decimal import Decimal

import pytest

from applications.finanzas.models import (
    CATEGORIA_INGRESO_DECLARADO_FONDO_COMUN,
    Categoria,
    IngresoComun,
    Movimiento,
)


@pytest.mark.django_db
class TestDashboardResumen:
    def test_get_requiere_mes_y_anio(self, client, auth_header):
        res = client.get('/api/finanzas/dashboard-resumen/', **auth_header)
        assert res.status_code == 400

    def test_get_ok_estructura(self, client, auth_header):
        res = client.get(
            '/api/finanzas/dashboard-resumen/?mes=3&anio=2026',
            **auth_header,
        )
        assert res.status_code == 200
        body = res.json()
        assert body['periodo'] == {'mes': 3, 'anio': 2026}
        assert 'es_mes_calendario_actual' in body
        assert 'efectivo' in body and 'desglose' in body['efectivo']
        assert 'saldo_proyectado' in body
        assert 'desglose_saldo' in body
        assert isinstance(body['desglose_saldo'], list)

    def test_ingresos_mes_excluye_espejo_ingreso_comun(
        self, client, auth_header, usuario, familia, metodo_efectivo
    ):
        cat_otro = Categoria.objects.create(
            nombre='Bonus',
            tipo='INGRESO',
            es_inversion=False,
            familia=familia,
            usuario=usuario,
        )
        Movimiento.objects.create(
            usuario=usuario,
            familia=familia,
            fecha='2026-03-15',
            tipo='INGRESO',
            ambito='PERSONAL',
            categoria=cat_otro,
            monto='100000.00',
            comentario='',
            metodo_pago=metodo_efectivo,
        )
        IngresoComun.objects.create(
            usuario=usuario,
            familia=familia,
            mes='2026-03-01',
            monto='500000.00',
            origen='Sueldo',
        )
        mov_espejo = Movimiento.objects.filter(
            usuario=usuario,
            fecha__year=2026,
            fecha__month=3,
            tipo='INGRESO',
            categoria__nombre=CATEGORIA_INGRESO_DECLARADO_FONDO_COMUN,
        ).first()
        assert mov_espejo is not None

        res = client.get(
            '/api/finanzas/dashboard-resumen/?mes=3&anio=2026',
            **auth_header,
        )
        assert res.status_code == 200
        ing = Decimal(res.json()['ingresos_mes_actual'])
        assert ing == Decimal('100000.00')
