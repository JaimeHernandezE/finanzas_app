# Tests recálculo incremental y snapshots mensuales

import pytest
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.db.models import Sum

from applications.finanzas import services_recalculo
from applications.finanzas.models import (
    CuentaPersonal,
    IngresoComun,
    LiquidacionComunMensualSnapshot,
    Movimiento,
    RecalculoPendiente,
    SaldoMensualSnapshot,
)

# Fecha fija para que recalcular_familia_desde incluya marzo 2026 en cualquier año de CI
FAKE_TODAY = date(2026, 3, 15)


@pytest.fixture
def hoy_marzo_2026():
    path = 'applications.finanzas.services_recalculo.timezone.localdate'
    with patch(path, return_value=FAKE_TODAY):
        yield


@pytest.mark.django_db
class TestRecalculoSnapshots:
    def test_recalculo_crea_snapshot_liquidacion(
        self,
        hoy_marzo_2026,
        familia,
        ingreso_jaime,
        ingreso_glori,
        gasto_comun_jaime,
        gasto_comun_glori,
    ):
        services_recalculo.recalcular_familia_desde(familia.id, date(2026, 3, 1))
        qs = LiquidacionComunMensualSnapshot.objects.filter(
            familia=familia,
            mes=date(2026, 3, 1),
        )
        assert qs.filter(tipo_linea='INGRESO_COMUN').count() == 2
        assert qs.filter(tipo_linea='GASTO_COMUN_NO_CREDITO').count() == 2

    def test_liquidacion_snapshot_igual_totales_declarados(
        self, hoy_marzo_2026, familia, ingreso_jaime, ingreso_glori
    ):
        services_recalculo.recalcular_familia_desde(familia.id, date(2026, 3, 1))
        snap = services_recalculo.liquidacion_datos_desde_snapshot_o_query(
            familia.id, 3, 2026
        )
        assert snap is not None
        ingresos, _ = snap
        total = sum(Decimal(x['total']) for x in ingresos)
        assert total == Decimal('2800000.00')

    def test_liquidacion_snapshot_coincide_con_suma_bd(
        self,
        hoy_marzo_2026,
        familia,
        ingreso_jaime,
        ingreso_glori,
        gasto_comun_jaime,
    ):
        services_recalculo.recalcular_familia_desde(familia.id, date(2026, 3, 1))
        snap = services_recalculo.liquidacion_datos_desde_snapshot_o_query(
            familia.id, 3, 2026
        )
        assert snap is not None
        ingresos, gastos = snap
        tot_ing_snap = sum(Decimal(x['total']) for x in ingresos)
        tot_gas_snap = sum(Decimal(x['total']) for x in gastos)
        tot_ing_db = IngresoComun.objects.filter(
            familia=familia, mes__year=2026, mes__month=3
        ).aggregate(s=Sum('monto'))['s'] or Decimal('0')
        tot_gas_db = (
            Movimiento.objects.filter(
                familia=familia,
                ambito='COMUN',
                tipo='EGRESO',
                fecha__year=2026,
                fecha__month=3,
                oculto=False,
            )
            .exclude(metodo_pago__tipo='CREDITO')
            .aggregate(s=Sum('monto'))['s']
            or Decimal('0')
        )
        assert tot_ing_snap == tot_ing_db
        assert tot_gas_snap == tot_gas_db

    def test_liquidacion_api_incluye_recalculo(
        self, client, auth_header, ingreso_jaime, gasto_comun_jaime
    ):
        res = client.get(
            '/api/finanzas/liquidacion/?mes=3&anio=2026', **auth_header
        )
        assert res.status_code == 200
        data = res.json()
        assert 'recalculo' in data
        assert 'pendiente' in data['recalculo']

    def test_saldo_mensual_snapshot_personal(
        self, hoy_marzo_2026, familia, usuario, categoria_egreso, metodo_efectivo
    ):
        Movimiento.objects.create(
            usuario=usuario,
            familia=familia,
            fecha='2026-03-15',
            tipo='EGRESO',
            ambito='PERSONAL',
            categoria=categoria_egreso,
            monto='10000.00',
            comentario='Test',
            metodo_pago=metodo_efectivo,
        )
        services_recalculo.recalcular_familia_desde(familia.id, date(2026, 3, 1))
        row = SaldoMensualSnapshot.objects.filter(
            familia=familia,
            usuario=usuario,
            mes=date(2026, 3, 1),
            cuenta_id=0,
        ).first()
        assert row is not None
        assert row.ingresos_efectivo == Decimal('0')
        assert row.egresos_efectivo == Decimal('10000.00')
        assert row.efectivo_neto == Decimal('-10000.00')

    def test_resumen_cuenta_mensual_excluye_mes_en_curso(
        self,
        client,
        auth_header,
        familia,
        usuario,
        categoria_egreso,
        metodo_efectivo,
    ):
        """Con «hoy» en marzo, el resumen por cuenta no lista marzo (mes abierto)."""
        cuenta = CuentaPersonal.objects.filter(usuario=usuario).first()
        assert cuenta is not None
        Movimiento.objects.create(
            usuario=usuario,
            familia=familia,
            cuenta=cuenta,
            fecha='2026-03-15',
            tipo='EGRESO',
            ambito='PERSONAL',
            categoria=categoria_egreso,
            monto='1000.00',
            comentario='x',
            metodo_pago=metodo_efectivo,
        )
        path = 'applications.finanzas.services_recalculo.timezone.localdate'
        with patch(path, return_value=date(2026, 3, 20)):
            r = client.get(
                f'/api/finanzas/cuenta-resumen-mensual/?cuenta={cuenta.pk}',
                **auth_header,
            )
        assert r.status_code == 200
        assert r.json()['meses'] == []

        with patch(path, return_value=date(2026, 4, 5)):
            r2 = client.get(
                f'/api/finanzas/cuenta-resumen-mensual/?cuenta={cuenta.pk}',
                **auth_header,
            )
        assert r2.status_code == 200
        meses = r2.json()['meses']
        assert any(m['mes'] == 3 and m['anio'] == 2026 for m in meses)

    def test_post_movimiento_mes_antiguo_marca_recalculo_pendiente(
        self,
        hoy_marzo_2026,
        client,
        auth_header,
        familia,
        categoria_egreso,
        metodo_efectivo,
    ):
        payload = {
            'fecha': '2024-06-01',
            'tipo': 'EGRESO',
            'ambito': 'PERSONAL',
            'categoria': categoria_egreso.id,
            'monto': '100.00',
            'comentario': 'histórico',
            'metodo_pago': metodo_efectivo.id,
        }
        res = client.post(
            '/api/finanzas/movimientos/', payload, format='json', **auth_header
        )
        assert res.status_code == 201
        rp = RecalculoPendiente.objects.get(familia=familia)
        assert rp.dirty_from == date(2024, 6, 1)

    def test_post_movimiento_mes_actual_no_deja_pendiente(
        self,
        hoy_marzo_2026,
        client,
        auth_header,
        familia,
        categoria_egreso,
        metodo_efectivo,
    ):
        payload = {
            'fecha': '2026-03-10',
            'tipo': 'EGRESO',
            'ambito': 'PERSONAL',
            'categoria': categoria_egreso.id,
            'monto': '50.00',
            'comentario': 'reciente',
            'metodo_pago': metodo_efectivo.id,
        }
        res = client.post(
            '/api/finanzas/movimientos/', payload, format='json', **auth_header
        )
        assert res.status_code == 201
        assert not RecalculoPendiente.objects.filter(familia=familia).exists()

    def test_procesar_recalculos_pendientes_limpia_y_recalcula(
        self, hoy_marzo_2026, familia, ingreso_jaime
    ):
        RecalculoPendiente.objects.create(
            familia=familia, dirty_from=date(2026, 3, 1)
        )
        n = services_recalculo.procesar_recalculos_pendientes()
        assert n == 1
        assert not RecalculoPendiente.objects.filter(familia=familia).exists()
        assert LiquidacionComunMensualSnapshot.objects.filter(
            familia=familia, mes=date(2026, 3, 1)
        ).exists()
