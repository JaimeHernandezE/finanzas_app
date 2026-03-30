# tests/test_resumen_historico.py

from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest

from applications.finanzas import services_recalculo
from applications.finanzas.models import Movimiento, ResumenHistoricoMesSnapshot


@pytest.mark.django_db
class TestCalcularResumenMes:
    def test_prorrateo_usa_ingresos_del_mismo_mes_que_gastos(
        self,
        usuario,
        usuario_2,
        familia,
        categoria_egreso,
        metodo_efectivo,
    ):
        """Proporción = ingreso usuario / total ingresos del mes; gastos del mismo mes."""
        from applications.finanzas.models import IngresoComun

        mes_pd = date(2026, 3, 1)
        IngresoComun.objects.create(
            usuario=usuario,
            familia=familia,
            mes=mes_pd,
            monto='1800000.00',
            origen='Sueldo',
        )
        IngresoComun.objects.create(
            usuario=usuario_2,
            familia=familia,
            mes=mes_pd,
            monto='1000000.00',
            origen='Sueldo',
        )
        Movimiento.objects.create(
            usuario=usuario,
            familia=familia,
            fecha='2026-03-10',
            tipo='EGRESO',
            ambito='COMUN',
            categoria=categoria_egreso,
            monto='320000.00',
            comentario='A',
            metodo_pago=metodo_efectivo,
        )
        Movimiento.objects.create(
            usuario=usuario_2,
            familia=familia,
            fecha='2026-03-12',
            tipo='EGRESO',
            ambito='COMUN',
            categoria=categoria_egreso,
            monto='180000.00',
            comentario='B',
            metodo_pago=metodo_efectivo,
        )

        row = services_recalculo.calcular_resumen_mes(familia.pk, mes_pd)
        assert row is not None
        assert row['gasto_comun_total'] == '-500000.00'
        assert row['base_prorrateo']['mes'] == 3
        assert row['base_prorrateo']['anio'] == 2026

        tot_ing = Decimal('2800000')
        neto_fam = Decimal('-500000')
        esp_jaime = (Decimal('1800000') / tot_ing) * neto_fam
        esp_glori = (Decimal('1000000') / tot_ing) * neto_fam

        por_usr = {p['usuario_id']: p for p in row['gasto_comun_prorrateado_por_usuario']}
        assert Decimal(por_usr[usuario.pk]['total']) == esp_jaime.quantize(Decimal('0.01'))
        assert Decimal(por_usr[usuario_2.pk]['total']) == esp_glori.quantize(Decimal('0.01'))

        pr = {p['usuario_id']: p for p in row['prorrateo_por_usuario']}
        assert 'ingreso_comun_mes' in pr[usuario.pk]
        assert pr[usuario.pk]['ingreso_comun_mes'] == '1800000.00'

        # Solo egresos comunes: neto = −320000 y −180000 (ingresos − egresos)
        gc = {p['usuario_id']: p for p in row['gastos_comunes_por_usuario']}
        assert gc[usuario.pk]['total'] == '-320000.00'
        assert gc[usuario_2.pk]['total'] == '-180000.00'

    def test_gastos_comunes_por_usuario_neto_ingreso_menos_egreso(
        self,
        usuario,
        familia,
        categoria_egreso,
        categoria_ingreso,
        metodo_efectivo,
    ):
        """Ingreso COMÚN suma +; egreso resta en el neto por usuario."""
        from applications.finanzas.models import IngresoComun

        mes_pd = date(2026, 5, 1)
        IngresoComun.objects.create(
            usuario=usuario,
            familia=familia,
            mes=mes_pd,
            monto='1000000.00',
            origen='S',
        )
        Movimiento.objects.create(
            usuario=usuario,
            familia=familia,
            fecha='2026-05-05',
            tipo='INGRESO',
            ambito='COMUN',
            categoria=categoria_ingreso,
            monto='50000.00',
            comentario='Reembolso',
            metodo_pago=metodo_efectivo,
        )
        Movimiento.objects.create(
            usuario=usuario,
            familia=familia,
            fecha='2026-05-06',
            tipo='EGRESO',
            ambito='COMUN',
            categoria=categoria_egreso,
            monto='200000.00',
            comentario='Gasto',
            metodo_pago=metodo_efectivo,
        )

        row = services_recalculo.calcular_resumen_mes(familia.pk, mes_pd)
        assert row is not None
        gc = {p['usuario_id']: p for p in row['gastos_comunes_por_usuario']}
        # 50000 − 200000 = −150000
        assert gc[usuario.pk]['total'] == '-150000.00'


@pytest.mark.django_db
class TestResumenSnapshot:
    def test_movimiento_comun_borra_snapshot_del_mes(
        self,
        familia,
        usuario,
        usuario_2,
        categoria_egreso,
        metodo_efectivo,
    ):
        from applications.finanzas.models import IngresoComun

        mes_pd = date(2026, 4, 1)
        IngresoComun.objects.create(
            usuario=usuario,
            familia=familia,
            mes=mes_pd,
            monto='100.00',
            origen='S',
        )
        IngresoComun.objects.create(
            usuario=usuario_2,
            familia=familia,
            mes=mes_pd,
            monto='100.00',
            origen='S',
        )

        payload = services_recalculo.calcular_resumen_mes(familia.pk, mes_pd)
        assert payload is not None
        ResumenHistoricoMesSnapshot.objects.create(
            familia=familia,
            mes=mes_pd,
            payload=payload,
        )
        assert ResumenHistoricoMesSnapshot.objects.filter(familia=familia, mes=mes_pd).exists()

        Movimiento.objects.create(
            usuario=usuario,
            familia=familia,
            fecha='2026-04-05',
            tipo='EGRESO',
            ambito='COMUN',
            categoria=categoria_egreso,
            monto='50.00',
            comentario='x',
            metodo_pago=metodo_efectivo,
        )

        assert not ResumenHistoricoMesSnapshot.objects.filter(
            familia=familia, mes=mes_pd
        ).exists()

    @patch(
        'applications.finanzas.services_recalculo.timezone.localdate',
        return_value=date(2026, 4, 5),
    )
    def test_get_resumen_historico_persiste_snapshot(
        self,
        _mock_localdate,
        client,
        auth_header,
        ingreso_jaime,
        ingreso_glori,
        gasto_comun_jaime,
        gasto_comun_glori,
        familia,
    ):
        """GET resumen-historico calcula y guarda snapshot por mes cerrado (marzo al estar en abril)."""
        mes_pd = date(2026, 3, 1)
        assert not ResumenHistoricoMesSnapshot.objects.filter(familia=familia).exists()

        r = client.get('/api/finanzas/resumen-historico/', **auth_header)
        assert r.status_code == 200
        meses = r.json()['meses']
        m3 = next((x for x in meses if x['mes'] == 3 and x['anio'] == 2026), None)
        assert m3 is not None
        assert m3['gasto_comun_total'] == '-500000.00'

        snap = ResumenHistoricoMesSnapshot.objects.get(familia=familia, mes=mes_pd)
        assert snap.payload['gasto_comun_total'] == '-500000.00'

    @patch(
        'applications.finanzas.services_recalculo.timezone.localdate',
        return_value=date(2026, 3, 15),
    )
    def test_resumen_historico_excluye_mes_en_curso(
        self,
        _mock_localdate,
        client,
        auth_header,
        ingreso_jaime,
        ingreso_glori,
        gasto_comun_jaime,
        gasto_comun_glori,
        familia,
    ):
        """Con datos solo en marzo y «hoy» en marzo, el resumen no lista marzo (mes abierto)."""
        r = client.get('/api/finanzas/resumen-historico/', **auth_header)
        assert r.status_code == 200
        meses = r.json()['meses']
        assert not any(x['mes'] == 3 and x['anio'] == 2026 for x in meses)
