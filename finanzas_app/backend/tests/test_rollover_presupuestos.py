from datetime import date
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

import pytest
from django.core.management import call_command

from applications.espacios.services import crear_espacio_personal
from applications.finanzas.models import Categoria, Presupuesto


MES_ORIGEN = date(2026, 8, 1)
MES_DESTINO = date(2026, 9, 1)


def _presupuesto(*, espacio, categoria, mes, usuario=None, monto='100000'):
    return Presupuesto.objects.create(
        espacio=espacio,
        usuario=usuario,
        categoria=categoria,
        mes=mes,
        monto=Decimal(monto),
    )


@pytest.mark.django_db
class TestRolloverPresupuestos:
    def test_copia_presupuesto_familiar_y_personal_en_espacio_familiar(
        self, espacio_familiar, usuario, categoria_familiar, categoria_personal,
    ):
        _presupuesto(
            espacio=espacio_familiar, categoria=categoria_familiar,
            mes=MES_ORIGEN, usuario=None, monto='200000',
        )
        _presupuesto(
            espacio=espacio_familiar, categoria=categoria_personal,
            mes=MES_ORIGEN, usuario=usuario, monto='50000',
        )

        call_command('rollover_presupuestos_mensuales', mes='2026-09-01')

        familiar = Presupuesto.objects.get(
            espacio=espacio_familiar, categoria=categoria_familiar,
            usuario=None, mes=MES_DESTINO,
        )
        personal = Presupuesto.objects.get(
            espacio=espacio_familiar, categoria=categoria_personal,
            usuario=usuario, mes=MES_DESTINO,
        )
        assert familiar.monto == Decimal('200000')
        assert personal.monto == Decimal('50000')
        assert Presupuesto.objects.filter(mes=MES_ORIGEN).count() == 2
        assert Presupuesto.objects.filter(mes=MES_DESTINO).count() == 2

    def test_copia_presupuesto_de_espacio_personal(self, usuario):
        espacio_personal = crear_espacio_personal(usuario)
        cat = Categoria.objects.create(
            nombre='Gastos personales',
            tipo='EGRESO',
            espacio=espacio_personal,
            usuario=usuario,
        )
        _presupuesto(
            espacio=espacio_personal, categoria=cat,
            mes=MES_ORIGEN, usuario=usuario, monto='75000',
        )

        call_command('rollover_presupuestos_mensuales', mes='2026-09-01')

        copiado = Presupuesto.objects.get(
            espacio=espacio_personal, categoria=cat, usuario=usuario, mes=MES_DESTINO,
        )
        assert copiado.monto == Decimal('75000')

    def test_no_sobrescribe_si_ya_existe(
        self, espacio_familiar, categoria_familiar,
    ):
        _presupuesto(
            espacio=espacio_familiar, categoria=categoria_familiar,
            mes=MES_ORIGEN, usuario=None, monto='200000',
        )
        existente = _presupuesto(
            espacio=espacio_familiar, categoria=categoria_familiar,
            mes=MES_DESTINO, usuario=None, monto='99999',
        )

        call_command('rollover_presupuestos_mensuales', mes='2026-09-01')

        existente.refresh_from_db()
        assert existente.monto == Decimal('99999')
        assert Presupuesto.objects.filter(
            espacio=espacio_familiar, categoria=categoria_familiar, mes=MES_DESTINO,
        ).count() == 1

    def test_omite_espacio_archivado(self, espacio_familiar, categoria_familiar):
        _presupuesto(
            espacio=espacio_familiar, categoria=categoria_familiar,
            mes=MES_ORIGEN, usuario=None, monto='200000',
        )
        espacio_familiar.archivado = True
        espacio_familiar.save(update_fields=['archivado'])

        call_command('rollover_presupuestos_mensuales', mes='2026-09-01')

        assert not Presupuesto.objects.filter(
            espacio=espacio_familiar, mes=MES_DESTINO,
        ).exists()

    def test_no_copia_entre_espacios(
        self, espacio_familiar, espacio_otra_familia, categoria_familiar,
    ):
        _presupuesto(
            espacio=espacio_familiar, categoria=categoria_familiar,
            mes=MES_ORIGEN, usuario=None, monto='200000',
        )

        call_command(
            'rollover_presupuestos_mensuales',
            mes='2026-09-01',
            espacio_id=espacio_otra_familia.id,
        )

        assert not Presupuesto.objects.filter(espacio=espacio_otra_familia).exists()
        assert not Presupuesto.objects.filter(
            espacio=espacio_familiar, mes=MES_DESTINO,
        ).exists()

    def test_comando_inicio_mes_solo_hace_rollover(
        self, espacio_familiar, categoria_familiar,
    ):
        _presupuesto(
            espacio=espacio_familiar, categoria=categoria_familiar,
            mes=MES_ORIGEN, usuario=None, monto='150000',
        )
        out = StringIO()
        with patch(
            'applications.finanzas.management.commands.recalculo_mensual_admin_tz.mes_civil_actual',
            return_value=MES_DESTINO,
        ):
            call_command('recalculo_mensual_admin_tz', stdout=out)

        assert Presupuesto.objects.filter(
            espacio=espacio_familiar, mes=MES_DESTINO, monto=Decimal('150000'),
        ).exists()
        texto = out.getvalue()
        assert 'solo rollover de presupuestos' in texto
        assert 'recalculo_meses' not in texto
