# backend/tests/test_signal_cuotas.py

import pytest
from decimal import Decimal
from datetime import date
from applications.finanzas.models import Movimiento, Cuota


@pytest.mark.django_db
class TestSignalGeneracionCuotas:

    def test_genera_cuotas_al_crear_movimiento_credito(
        self, movimiento_credito
    ):
        """Al crear un movimiento con crédito, se generan N cuotas."""
        cuotas = Cuota.objects.filter(movimiento=movimiento_credito)
        assert cuotas.count() == 6

    def test_numeros_de_cuota_correctos(self, movimiento_credito):
        """Las cuotas se numeran de 1 a N en orden."""
        numeros = list(
            Cuota.objects.filter(movimiento=movimiento_credito)
            .order_by('numero')
            .values_list('numero', flat=True)
        )
        assert numeros == [1, 2, 3, 4, 5, 6]

    def test_suma_de_cuotas_igual_al_monto_total(self, movimiento_credito):
        """La suma de todas las cuotas debe ser igual al monto del movimiento."""
        total_cuotas = sum(
            c.monto for c in Cuota.objects.filter(movimiento=movimiento_credito)
        )
        assert total_cuotas == Decimal(str(movimiento_credito.monto))

    def test_diferencia_centavos_va_a_primera_cuota(
        self, usuario, familia, categoria_egreso, metodo_credito, tarjeta
    ):
        """Si el monto no es divisible exactamente, el resto va a la cuota 1."""
        # $100.00 / 3 cuotas = $33.33 + $33.33 + $33.34 — diferencia de $0.01 a cuota 1
        mov = Movimiento.objects.create(
            usuario=usuario, familia=familia,
            fecha='2026-03-01', tipo='EGRESO', ambito='PERSONAL',
            categoria=categoria_egreso, monto='100.00',
            metodo_pago=metodo_credito, tarjeta=tarjeta, num_cuotas=3,
        )
        cuotas = Cuota.objects.filter(movimiento=mov).order_by('numero')
        assert cuotas[0].monto == Decimal('33.34')  # primera cuota con el centavo extra
        assert cuotas[1].monto == Decimal('33.33')
        assert cuotas[2].monto == Decimal('33.33')

    def test_meses_de_facturacion_consecutivos(self, movimiento_credito):
        """Las cuotas tienen meses de facturación consecutivos desde el mes del movimiento."""
        cuotas = Cuota.objects.filter(
            movimiento=movimiento_credito
        ).order_by('numero')

        meses = [c.mes_facturacion for c in cuotas]
        assert meses[0] == date(2026, 3, 1)
        assert meses[1] == date(2026, 4, 1)
        assert meses[2] == date(2026, 5, 1)
        assert meses[5] == date(2026, 8, 1)

    def test_cuotas_creadas_con_estado_pendiente(self, movimiento_credito):
        """Todas las cuotas se crean con estado PENDIENTE."""
        estados = Cuota.objects.filter(
            movimiento=movimiento_credito
        ).values_list('estado', flat=True)
        assert all(e == 'PENDIENTE' for e in estados)

    def test_cuotas_creadas_con_incluir_true(self, movimiento_credito):
        """Todas las cuotas se crean con incluir=True por defecto."""
        incluir = Cuota.objects.filter(
            movimiento=movimiento_credito
        ).values_list('incluir', flat=True)
        assert all(i is True for i in incluir)

    def test_no_genera_cuotas_para_movimiento_efectivo(
        self, movimiento_efectivo
    ):
        """Un movimiento de efectivo no genera cuotas."""
        cuotas = Cuota.objects.filter(movimiento=movimiento_efectivo)
        assert cuotas.count() == 0

    def test_no_genera_cuotas_en_edicion(self, movimiento_credito):
        """Editar un movimiento con crédito no genera cuotas adicionales."""
        cuotas_antes = Cuota.objects.filter(movimiento=movimiento_credito).count()

        movimiento_credito.comentario = 'Televisor editado'
        movimiento_credito.save()

        cuotas_despues = Cuota.objects.filter(movimiento=movimiento_credito).count()
        assert cuotas_antes == cuotas_despues

    def test_usa_monto_cuota_manual_si_se_proporciona(
        self, usuario, familia, categoria_egreso, metodo_credito, tarjeta
    ):
        """Si se ingresa monto_cuota manualmente, lo usa en lugar de calcular."""
        mov = Movimiento.objects.create(
            usuario=usuario, familia=familia,
            fecha='2026-03-01', tipo='EGRESO', ambito='PERSONAL',
            categoria=categoria_egreso, monto='180000.00',
            metodo_pago=metodo_credito, tarjeta=tarjeta,
            num_cuotas=6, monto_cuota='30000.00',
        )
        primera_cuota = Cuota.objects.filter(
            movimiento=mov, numero=1
        ).first()
        assert primera_cuota.monto == Decimal('30000.00')

    def test_gasto_antes_del_cierre_factura_en_mes_actual(
        self, usuario, familia, categoria_egreso, metodo_credito, tarjeta
    ):
        """
        Gasto el día 10, tarjeta cierra el 15 → primera cuota en el mismo mes.
        """
        tarjeta.dia_facturacion = 15
        tarjeta.save()

        mov = Movimiento.objects.create(
            usuario=usuario, familia=familia,
            fecha='2026-03-10',
            tipo='EGRESO', ambito='PERSONAL',
            categoria=categoria_egreso, monto='90000.00',
            metodo_pago=metodo_credito, tarjeta=tarjeta, num_cuotas=3,
        )
        primera = Cuota.objects.filter(movimiento=mov, numero=1).first()
        assert primera.mes_facturacion == date(2026, 3, 1)

    def test_gasto_despues_del_cierre_factura_en_mes_siguiente(
        self, usuario, familia, categoria_egreso, metodo_credito, tarjeta
    ):
        """
        Gasto el día 20, tarjeta cierra el 15 → primera cuota en el mes siguiente.
        """
        tarjeta.dia_facturacion = 15
        tarjeta.save()

        mov = Movimiento.objects.create(
            usuario=usuario, familia=familia,
            fecha='2026-03-20',
            tipo='EGRESO', ambito='PERSONAL',
            categoria=categoria_egreso, monto='90000.00',
            metodo_pago=metodo_credito, tarjeta=tarjeta, num_cuotas=3,
        )
        primera = Cuota.objects.filter(movimiento=mov, numero=1).first()
        assert primera.mes_facturacion == date(2026, 4, 1)

    def test_gasto_exactamente_en_dia_cierre_factura_en_mes_actual(
        self, usuario, familia, categoria_egreso, metodo_credito, tarjeta
    ):
        """
        Gasto exactamente el día de cierre → entra al ciclo actual.
        """
        tarjeta.dia_facturacion = 15
        tarjeta.save()

        mov = Movimiento.objects.create(
            usuario=usuario, familia=familia,
            fecha='2026-03-15',
            tipo='EGRESO', ambito='PERSONAL',
            categoria=categoria_egreso, monto='90000.00',
            metodo_pago=metodo_credito, tarjeta=tarjeta, num_cuotas=3,
        )
        primera = Cuota.objects.filter(movimiento=mov, numero=1).first()
        assert primera.mes_facturacion == date(2026, 3, 1)

    def test_sin_dia_facturacion_usa_mes_calendario(
        self, usuario, familia, categoria_egreso, metodo_credito, tarjeta
    ):
        """
        Tarjeta sin día de facturación definido → usa mes calendario del gasto.
        """
        tarjeta.dia_facturacion = None
        tarjeta.save()

        mov = Movimiento.objects.create(
            usuario=usuario, familia=familia,
            fecha='2026-03-25',
            tipo='EGRESO', ambito='PERSONAL',
            categoria=categoria_egreso, monto='90000.00',
            metodo_pago=metodo_credito, tarjeta=tarjeta, num_cuotas=2,
        )
        primera = Cuota.objects.filter(movimiento=mov, numero=1).first()
        assert primera.mes_facturacion == date(2026, 3, 1)

    def test_cuotas_consecutivas_desde_mes_correcto(
        self, usuario, familia, categoria_egreso, metodo_credito, tarjeta
    ):
        """
        Gasto el 20 con cierre el 15 → primera cuota en abril,
        segunda en mayo, tercera en junio.
        """
        tarjeta.dia_facturacion = 15
        tarjeta.save()

        mov = Movimiento.objects.create(
            usuario=usuario, familia=familia,
            fecha='2026-03-20',
            tipo='EGRESO', ambito='PERSONAL',
            categoria=categoria_egreso, monto='90000.00',
            metodo_pago=metodo_credito, tarjeta=tarjeta, num_cuotas=3,
        )
        cuotas = Cuota.objects.filter(movimiento=mov).order_by('numero')
        assert cuotas[0].mes_facturacion == date(2026, 4, 1)
        assert cuotas[1].mes_facturacion == date(2026, 5, 1)
        assert cuotas[2].mes_facturacion == date(2026, 6, 1)
