# tests/test_presupuesto_alertas.py

from datetime import date
from decimal import Decimal

import pytest

from applications.finanzas import services_presupuesto_alertas
from applications.finanzas.models import Cuota, Movimiento, NotificacionUsuario, Presupuesto
from applications.finanzas.recalculo_context import RecalculoContext, recalculo_context


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


@pytest.fixture
def categoria_egreso_personal(db, espacio_familiar, usuario):
    from applications.finanzas.models import Categoria

    return Categoria.objects.create(
        nombre='Gastos personales',
        tipo='EGRESO',
        es_inversion=False,
        espacio=espacio_familiar,
        usuario=usuario,
    )


def _presupuesto_familiar(espacio, categoria, mes_pd, monto='200000'):
    return Presupuesto.objects.create(
        espacio=espacio,
        usuario=None,
        categoria=categoria,
        mes=mes_pd,
        monto=Decimal(monto),
    )


def _notifs_presupuesto(usuario=None, espacio=None):
    qs = NotificacionUsuario.objects.filter(
        tipo=NotificacionUsuario.TIPO_PRESUPUESTO_UMBRAL,
    )
    if usuario is not None:
        qs = qs.filter(usuario=usuario)
    if espacio is not None:
        qs = qs.filter(espacio=espacio)
    return qs


@pytest.mark.django_db
class TestPresupuestoAlertas:
    def test_umbral_80_crea_notificacion_familiar(
        self,
        espacio_familiar,
        usuario,
        usuario_2,
        categoria_egreso_familiar,
        metodo_efectivo,
    ):
        mes_pd = date(2026, 7, 1)
        _presupuesto_familiar(espacio_familiar, categoria_egreso_familiar, mes_pd)

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

        notifs_u1 = _notifs_presupuesto(usuario=usuario, espacio=espacio_familiar)
        notifs_u2 = _notifs_presupuesto(usuario=usuario_2, espacio=espacio_familiar)
        assert notifs_u1.count() == 1
        assert notifs_u2.count() == 1

        notif = notifs_u1.first()
        assert notif.payload['categoria_id'] == categoria_egreso_familiar.pk
        assert notif.payload['umbral_disparado'] == 80
        assert notif.payload['ambito'] == 'FAMILIAR'
        assert 'Alimentación' in notif.mensaje

    def test_segunda_notificacion_al_100(
        self,
        espacio_familiar,
        usuario,
        categoria_egreso_familiar,
        metodo_efectivo,
    ):
        mes_pd = date(2026, 7, 1)
        _presupuesto_familiar(espacio_familiar, categoria_egreso_familiar, mes_pd)

        Movimiento.objects.create(
            espacio=espacio_familiar,
            usuario=usuario,
            fecha=date(2026, 7, 5),
            tipo='EGRESO',
            ambito='COMUN',
            categoria=categoria_egreso_familiar,
            monto=Decimal('165000'),
            metodo_pago=metodo_efectivo,
        )
        assert _notifs_presupuesto(usuario=usuario).count() == 1

        Movimiento.objects.create(
            espacio=espacio_familiar,
            usuario=usuario,
            fecha=date(2026, 7, 12),
            tipo='EGRESO',
            ambito='COMUN',
            categoria=categoria_egreso_familiar,
            monto=Decimal('50000'),
            metodo_pago=metodo_efectivo,
        )
        notifs = _notifs_presupuesto(usuario=usuario).order_by('pk')
        assert notifs.count() == 2
        assert notifs.filter(payload__umbral_disparado=80).count() == 1
        assert notifs.filter(payload__umbral_disparado=100).count() == 1

    def test_salto_directo_pasa_85_y_100_solo_una_notificacion(
        self,
        espacio_familiar,
        usuario,
        categoria_egreso_familiar,
        metodo_efectivo,
    ):
        usuario.notif_presupuesto_umbral_pct = 85
        usuario.save(update_fields=['notif_presupuesto_umbral_pct'])

        mes_pd = date(2026, 7, 1)
        _presupuesto_familiar(espacio_familiar, categoria_egreso_familiar, mes_pd)

        Movimiento.objects.create(
            espacio=espacio_familiar,
            usuario=usuario,
            fecha=date(2026, 7, 10),
            tipo='EGRESO',
            ambito='COMUN',
            categoria=categoria_egreso_familiar,
            monto=Decimal('210000'),
            metodo_pago=metodo_efectivo,
        )

        notifs = _notifs_presupuesto(usuario=usuario)
        assert notifs.count() == 1
        assert notifs.first().payload['umbral_disparado'] == 100
        assert 'superó' in notifs.first().mensaje.lower() or 'superado' in notifs.first().titulo.lower()

    def test_no_duplica_mismo_umbral(
        self,
        espacio_familiar,
        usuario,
        categoria_egreso_familiar,
        metodo_efectivo,
    ):
        mes_pd = date(2026, 7, 1)
        _presupuesto_familiar(espacio_familiar, categoria_egreso_familiar, mes_pd)

        for dia in (5, 8):
            Movimiento.objects.create(
                espacio=espacio_familiar,
                usuario=usuario,
                fecha=date(2026, 7, dia),
                tipo='EGRESO',
                ambito='COMUN',
                categoria=categoria_egreso_familiar,
                monto=Decimal('85000'),
                metodo_pago=metodo_efectivo,
            )

        assert _notifs_presupuesto(usuario=usuario).filter(
            payload__umbral_disparado=80,
        ).count() == 1

    def test_presupuesto_personal_solo_dueno(
        self,
        espacio_familiar,
        usuario,
        usuario_2,
        categoria_egreso_personal,
        metodo_efectivo,
    ):
        mes_pd = date(2026, 7, 1)
        Presupuesto.objects.create(
            espacio=espacio_familiar,
            usuario=usuario,
            categoria=categoria_egreso_personal,
            mes=mes_pd,
            monto=Decimal('100000'),
        )

        Movimiento.objects.create(
            espacio=espacio_familiar,
            usuario=usuario,
            fecha=date(2026, 7, 10),
            tipo='EGRESO',
            ambito='PERSONAL',
            categoria=categoria_egreso_personal,
            monto=Decimal('85000'),
            metodo_pago=metodo_efectivo,
        )

        assert _notifs_presupuesto(usuario=usuario).count() == 1
        assert _notifs_presupuesto(usuario=usuario_2).count() == 0
        assert _notifs_presupuesto(usuario=usuario).first().payload['ambito'] == 'PERSONAL'

    def test_usuario_con_alertas_desactivadas_no_recibe(
        self,
        espacio_familiar,
        usuario,
        usuario_2,
        categoria_egreso_familiar,
        metodo_efectivo,
    ):
        usuario_2.notif_presupuesto_activa = False
        usuario_2.save(update_fields=['notif_presupuesto_activa'])

        mes_pd = date(2026, 7, 1)
        _presupuesto_familiar(espacio_familiar, categoria_egreso_familiar, mes_pd)

        Movimiento.objects.create(
            espacio=espacio_familiar,
            usuario=usuario,
            fecha=date(2026, 7, 10),
            tipo='EGRESO',
            ambito='COMUN',
            categoria=categoria_egreso_familiar,
            monto=Decimal('170000'),
            metodo_pago=metodo_efectivo,
        )

        assert _notifs_presupuesto(usuario=usuario_2).count() == 0
        assert _notifs_presupuesto(usuario=usuario).count() == 1

    def test_credito_cuenta_cuotas_no_monto_total(
        self,
        espacio_familiar,
        usuario,
        categoria_egreso_familiar,
        metodo_credito,
        tarjeta,
    ):
        mes_pd = date(2026, 7, 1)
        _presupuesto_familiar(espacio_familiar, categoria_egreso_familiar, mes_pd, monto='150000')

        Movimiento.objects.create(
            espacio=espacio_familiar,
            usuario=usuario,
            fecha=date(2026, 7, 3),
            tipo='EGRESO',
            ambito='COMUN',
            categoria=categoria_egreso_familiar,
            monto=Decimal('300000'),
            metodo_pago=metodo_credito,
            tarjeta=tarjeta,
            num_cuotas=3,
        )

        assert _notifs_presupuesto(usuario=usuario).count() == 0

        cuota = Cuota.objects.filter(movimiento__categoria=categoria_egreso_familiar).first()
        cuota.monto = Decimal('130000')
        cuota.save(update_fields=['monto'])

        assert _notifs_presupuesto(usuario=usuario).filter(
            payload__umbral_disparado=80,
        ).count() == 1

    def test_suprimir_notificaciones_no_crea_alertas(
        self,
        espacio_familiar,
        categoria_egreso_familiar,
    ):
        mes_pd = date(2026, 7, 1)
        _presupuesto_familiar(espacio_familiar, categoria_egreso_familiar, mes_pd)

        with recalculo_context(RecalculoContext(suprimir_notificaciones=True)):
            services_presupuesto_alertas.evaluar_alertas_categoria(
                espacio_familiar.pk,
                categoria_egreso_familiar.pk,
                7,
                2026,
                'FAMILIAR',
                None,
            )

        assert _notifs_presupuesto().count() == 0

    def test_umbrales_a_evaluar(self):
        assert services_presupuesto_alertas.umbrales_a_evaluar(80) == [80, 100]
        assert services_presupuesto_alertas.umbrales_a_evaluar(100) == [100]

    def test_umbral_pendiente_mas_alto_salto_directo(self):
        umbrales = services_presupuesto_alertas.umbrales_a_evaluar(85)
        assert services_presupuesto_alertas.umbral_pendiente_mas_alto(
            umbrales, 105.0, 1, 1, 10, 7, 2026,
        ) == 100

    def test_umbral_personalizado_usuario(
        self,
        espacio_familiar,
        usuario,
        categoria_egreso_familiar,
        metodo_efectivo,
    ):
        usuario.notif_presupuesto_umbral_pct = 90
        usuario.save(update_fields=['notif_presupuesto_umbral_pct'])

        mes_pd = date(2026, 7, 1)
        _presupuesto_familiar(espacio_familiar, categoria_egreso_familiar, mes_pd)

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

        assert _notifs_presupuesto(usuario=usuario).count() == 0

        Movimiento.objects.create(
            espacio=espacio_familiar,
            usuario=usuario,
            fecha=date(2026, 7, 11),
            tipo='EGRESO',
            ambito='COMUN',
            categoria=categoria_egreso_familiar,
            monto=Decimal('20000'),
            metodo_pago=metodo_efectivo,
        )

        notifs = _notifs_presupuesto(usuario=usuario)
        assert notifs.filter(payload__umbral_disparado=90).count() == 1
