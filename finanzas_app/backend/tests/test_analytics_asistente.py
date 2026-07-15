# tests/test_analytics_asistente.py
"""Paridad y aislamiento tenant de la capa analytics (Etapa A)."""

from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.utils import timezone

from applications.finanzas.models import Movimiento, NotificacionUsuario, Presupuesto
from applications.finanzas.services import analytics as analytics_svc
from applications.finanzas.services.presupuesto_mes import (
    build_presupuesto_mes_payload,
    gasto_categoria_mes,
)
from applications.finanzas.services_recalculo import calcular_resumen_mes


@pytest.fixture
def categoria_egreso_familiar(db, espacio_familiar):
    from applications.finanzas.models import Categoria

    return Categoria.objects.create(
        nombre='Alimentación',
        tipo='EGRESO',
        es_inversion=False,
        espacio=espacio_familiar,
        usuario=None,
    )


@pytest.mark.django_db
class TestGastoYAvanceParidad:
    def test_gasto_categoria_paridad_con_presupuesto_mes(
        self,
        usuario,
        espacio_familiar,
        categoria_egreso_familiar,
        metodo_efectivo,
    ):
        Movimiento.objects.create(
            espacio=espacio_familiar,
            usuario=usuario,
            fecha=date(2026, 7, 10),
            tipo='EGRESO',
            ambito='COMUN',
            categoria=categoria_egreso_familiar,
            monto=Decimal('165000'),
            metodo_pago=metodo_efectivo,
        )

        esperado = gasto_categoria_mes(
            usuario,
            categoria_egreso_familiar.pk,
            7,
            2026,
            'FAMILIAR',
            espacio=espacio_familiar,
        )
        out = analytics_svc.gasto_categoria_por_mes(
            usuario,
            espacio_familiar,
            categoria_id=categoria_egreso_familiar.pk,
            mes=7,
            anio=2026,
            ambito='FAMILIAR',
        )
        assert out['gastado'] == esperado == 165000
        assert out['categoria_nombre'] == 'Alimentación'
        assert out['ambito'] == 'FAMILIAR'

    def test_avance_presupuesto_paridad_payload(
        self,
        usuario,
        espacio_familiar,
        categoria_egreso_familiar,
        metodo_efectivo,
    ):
        mes_pd = date(2026, 7, 1)
        Presupuesto.objects.create(
            espacio=espacio_familiar,
            usuario=None,
            categoria=categoria_egreso_familiar,
            mes=mes_pd,
            monto=Decimal('200000'),
        )
        Movimiento.objects.create(
            espacio=espacio_familiar,
            usuario=usuario,
            fecha=date(2026, 7, 10),
            tipo='EGRESO',
            ambito='COMUN',
            categoria=categoria_egreso_familiar,
            monto=Decimal('80000'),
            metodo_pago=metodo_efectivo,
        )

        directo = build_presupuesto_mes_payload(
            usuario, 7, 2026, 'FAMILIAR', None, espacio=espacio_familiar
        )
        via_analytics = analytics_svc.avance_presupuesto_mes(
            usuario,
            espacio_familiar,
            mes=7,
            anio=2026,
            ambito='FAMILIAR',
        )
        assert via_analytics == directo
        assert via_analytics['resumen']['total_gastado'] == 80000


@pytest.mark.django_db
class TestAlertasRecientes:
    def test_lista_scoped_usuario_espacio(
        self,
        usuario,
        usuario_2,
        espacio_familiar,
        espacio_otra_familia,
    ):
        NotificacionUsuario.objects.create(
            usuario=usuario,
            espacio=espacio_familiar,
            tipo=NotificacionUsuario.TIPO_PRESUPUESTO_UMBRAL,
            titulo='Umbral',
            mensaje='Alimentación al 80%',
            payload={'categoria_id': 1},
        )
        NotificacionUsuario.objects.create(
            usuario=usuario_2,
            espacio=espacio_familiar,
            tipo=NotificacionUsuario.TIPO_PRESUPUESTO_UMBRAL,
            titulo='Otro usuario',
            mensaje='No debería verla el primero',
            payload={},
        )
        NotificacionUsuario.objects.create(
            usuario=usuario,
            espacio=espacio_otra_familia,
            tipo=NotificacionUsuario.TIPO_PRESUPUESTO_UMBRAL,
            titulo='Otro espacio',
            mensaje='Tampoco',
            payload={},
        )

        out = analytics_svc.listar_alertas_recientes(usuario, espacio_familiar)
        assert out['total'] == 1
        assert len(out['alertas']) == 1
        assert out['alertas'][0]['titulo'] == 'Umbral'
        assert out['alertas'][0]['tipo'] == NotificacionUsuario.TIPO_PRESUPUESTO_UMBRAL

    def test_espacio_ajeno_sin_pertenencia_vacio(
        self,
        usuario,
        espacio_otra_familia,
    ):
        NotificacionUsuario.objects.create(
            usuario=usuario,
            espacio=espacio_otra_familia,
            tipo=NotificacionUsuario.TIPO_PRESUPUESTO_UMBRAL,
            titulo='Huérfana',
            mensaje='Usuario sin pertenencia activa en ese espacio',
            payload={},
        )
        out = analytics_svc.listar_alertas_recientes(usuario, espacio_otra_familia)
        assert out == {'alertas': [], 'total': 0}


@pytest.mark.django_db
class TestResumenMesCerrado:
    def test_mes_en_curso_no_cerrado(
        self,
        usuario,
        espacio_familiar,
    ):
        hoy = timezone.localdate()
        out = analytics_svc.resumen_mes_cerrado(
            usuario,
            espacio_familiar,
            mes=hoy.month,
            anio=hoy.year,
        )
        assert out['mes_cerrado'] is False
        assert out['resumen'] is None

    def test_mes_cerrado_con_datos(
        self,
        usuario,
        usuario_2,
        espacio_familiar,
        categoria_egreso_familiar,
        metodo_efectivo,
    ):
        from applications.finanzas.models import IngresoComun

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
            fecha=date(2026, 3, 10),
            tipo='EGRESO',
            ambito='COMUN',
            categoria=categoria_egreso_familiar,
            monto=Decimal('320000'),
            metodo_pago=metodo_efectivo,
        )

        esperado = calcular_resumen_mes(espacio_familiar.pk, mes_pd)
        fake_hoy = date(2026, 7, 15)
        with patch(
            'applications.finanzas.services.analytics.resumen.timezone.localdate',
            return_value=fake_hoy,
        ):
            out = analytics_svc.resumen_mes_cerrado(
                usuario,
                espacio_familiar,
                mes=3,
                anio=2026,
            )
        assert out['mes_cerrado'] is True
        assert out['resumen'] is not None
        assert out['resumen']['gasto_comun_total'] == esperado['gasto_comun_total']


@pytest.mark.django_db
class TestTenantAnalytics:
    def test_gasto_espacio_ajeno_no_filtra_datos_propios(
        self,
        usuario,
        espacio_familiar,
        espacio_otra_familia,
        categoria_egreso_familiar,
        metodo_efectivo,
    ):
        Movimiento.objects.create(
            espacio=espacio_familiar,
            usuario=usuario,
            fecha=date(2026, 7, 10),
            tipo='EGRESO',
            ambito='COMUN',
            categoria=categoria_egreso_familiar,
            monto=Decimal('99000'),
            metodo_pago=metodo_efectivo,
        )
        out = analytics_svc.gasto_categoria_por_mes(
            usuario,
            espacio_otra_familia,
            categoria_id=categoria_egreso_familiar.pk,
            mes=7,
            anio=2026,
            ambito='FAMILIAR',
        )
        assert out['gastado'] == 0

    def test_avance_espacio_ajeno_vacio(
        self,
        usuario,
        espacio_familiar,
        espacio_otra_familia,
        categoria_egreso_familiar,
        metodo_efectivo,
    ):
        Presupuesto.objects.create(
            espacio=espacio_familiar,
            usuario=None,
            categoria=categoria_egreso_familiar,
            mes=date(2026, 7, 1),
            monto=Decimal('200000'),
        )
        Movimiento.objects.create(
            espacio=espacio_familiar,
            usuario=usuario,
            fecha=date(2026, 7, 10),
            tipo='EGRESO',
            ambito='COMUN',
            categoria=categoria_egreso_familiar,
            monto=Decimal('50000'),
            metodo_pago=metodo_efectivo,
        )
        out = analytics_svc.avance_presupuesto_mes(
            usuario,
            espacio_otra_familia,
            mes=7,
            anio=2026,
            ambito='FAMILIAR',
        )
        assert out['filas'] == []
        assert out['resumen']['total_gastado'] == 0

    def test_resumen_espacio_ajeno_sin_pertenencia(
        self,
        usuario,
        espacio_otra_familia,
    ):
        out = analytics_svc.resumen_mes_cerrado(
            usuario,
            espacio_otra_familia,
            mes=3,
            anio=2026,
        )
        assert out['resumen'] is None
        assert out['mes_cerrado'] is False
