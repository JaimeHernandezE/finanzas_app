# Tests de modo_reparto del espacio familiar en calcular_resumen_mes.

from datetime import date
from decimal import Decimal

import pytest

from applications.espacios.models import Espacio
from applications.espacios.services import espacio_para_familia
from applications.finanzas import services_recalculo
from applications.finanzas.models import IngresoComun, Movimiento


def _setup_gastos_comunes(usuario, usuario_2, espacio_familiar, categoria_egreso, metodo_efectivo):
    mes_pd = date(2026, 3, 1)
    IngresoComun.objects.create(
        usuario=usuario,
        espacio=espacio_familiar,
        mes=mes_pd,
        monto='1800000.00',
        origen='Sueldo',
    )
    IngresoComun.objects.create(
        usuario=usuario_2,
        espacio=espacio_familiar,
        mes=mes_pd,
        monto='1000000.00',
        origen='Sueldo',
    )
    Movimiento.objects.create(
        usuario=usuario,
        espacio=espacio_familiar,
        fecha='2026-03-10',
        tipo='EGRESO',
        ambito='COMUN',
        categoria=categoria_egreso,
        monto='320000.00',
        metodo_pago=metodo_efectivo,
    )
    Movimiento.objects.create(
        usuario=usuario_2,
        espacio=espacio_familiar,
        fecha='2026-03-12',
        tipo='EGRESO',
        ambito='COMUN',
        categoria=categoria_egreso,
        monto='180000.00',
        metodo_pago=metodo_efectivo,
    )
    return mes_pd


@pytest.mark.django_db
class TestModoReparto:
    def test_proporcional_con_espacio(
        self, usuario, usuario_2, familia, categoria_egreso, metodo_efectivo, espacio_familiar,
    ):
        mes_pd = _setup_gastos_comunes(
            usuario, usuario_2, espacio_familiar, categoria_egreso, metodo_efectivo,
        )
        espacio = espacio_para_familia(familia)
        espacio.modo_reparto = Espacio.REPARTO_PROPORCIONAL
        espacio.save(update_fields=['modo_reparto'])

        row = services_recalculo.calcular_resumen_mes(
            espacio.pk, mes_pd, espacio=espacio,
        )
        assert row is not None
        tot_ing = Decimal('2800000')
        neto_fam = Decimal('-500000')
        esp_jaime = (Decimal('1800000') / tot_ing) * neto_fam
        esp_glori = (Decimal('1000000') / tot_ing) * neto_fam
        por_usr = {p['usuario_id']: p for p in row['gasto_comun_prorrateado_por_usuario']}
        assert Decimal(por_usr[usuario.pk]['total']) == esp_jaime.quantize(Decimal('0.01'))
        assert Decimal(por_usr[usuario_2.pk]['total']) == esp_glori.quantize(Decimal('0.01'))

    def test_partes_iguales_con_espacio(
        self, usuario, usuario_2, familia, categoria_egreso, metodo_efectivo, espacio_familiar,
    ):
        mes_pd = _setup_gastos_comunes(
            usuario, usuario_2, espacio_familiar, categoria_egreso, metodo_efectivo,
        )
        espacio = espacio_para_familia(familia)
        espacio.modo_reparto = Espacio.REPARTO_PARTES_IGUALES
        espacio.save(update_fields=['modo_reparto'])

        row = services_recalculo.calcular_resumen_mes(
            espacio.pk, mes_pd, espacio=espacio,
        )
        assert row is not None
        esperado = (Decimal('-500000') / Decimal('2')).quantize(Decimal('0.01'))
        por_usr = {p['usuario_id']: p for p in row['gasto_comun_prorrateado_por_usuario']}
        assert Decimal(por_usr[usuario.pk]['total']) == esperado
        assert Decimal(por_usr[usuario_2.pk]['total']) == esperado

    def test_sin_reparto_con_espacio(
        self, usuario, usuario_2, familia, categoria_egreso, metodo_efectivo, espacio_familiar,
    ):
        mes_pd = _setup_gastos_comunes(
            usuario, usuario_2, espacio_familiar, categoria_egreso, metodo_efectivo,
        )
        espacio = espacio_para_familia(familia)
        espacio.modo_reparto = Espacio.REPARTO_SIN
        espacio.save(update_fields=['modo_reparto'])

        row = services_recalculo.calcular_resumen_mes(
            espacio.pk, mes_pd, espacio=espacio,
        )
        assert row is not None
        por_usr = {p['usuario_id']: p for p in row['gasto_comun_prorrateado_por_usuario']}
        assert Decimal(por_usr[usuario.pk]['total']) == Decimal('0')
        assert Decimal(por_usr[usuario_2.pk]['total']) == Decimal('0')
