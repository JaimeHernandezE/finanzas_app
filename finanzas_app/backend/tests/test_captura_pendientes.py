# backend/tests/test_captura_pendientes.py

from decimal import Decimal
from datetime import date

import pytest

from applications.finanzas.models import Movimiento, MovimientoPendiente, NotificacionUsuario
from applications.finanzas.services.captura import (
    CapturaError,
    confirmar_pendiente,
    crear_pendiente,
    descartar_pendiente,
)
from applications.finanzas.captura_bot.parser_mensaje import parsear_mensaje_heuristico
from applications.finanzas.services.captura.parsers import parse_bci, parse_email
from applications.finanzas.captura_bot.flujo_conversacion import manejar_texto


@pytest.mark.django_db
class TestCapturaServicio:

    def test_crear_y_confirmar_pendiente(
        self, usuario, espacio_familiar, categoria_egreso, metodo_efectivo,
    ):
        pendiente = crear_pendiente(
            usuario=usuario,
            espacio=espacio_familiar,
            origen=MovimientoPendiente.ORIGEN_MANUAL,
            monto='12500.00',
            fecha=date(2026, 7, 10),
            comercio='Lider',
            categoria_sugerida=categoria_egreso,
            ambito_sugerido='COMUN',
            metodo_pago_sugerido=metodo_efectivo,
            confianza=0.9,
        )
        assert pendiente.estado == MovimientoPendiente.ESTADO_PENDIENTE
        mov = confirmar_pendiente(pendiente)
        pendiente.refresh_from_db()
        assert pendiente.estado == MovimientoPendiente.ESTADO_CONFIRMADO
        assert mov.monto == Decimal('12500.00')
        assert mov.ambito == 'COMUN'
        assert mov.comentario == 'Lider'
        assert Movimiento.objects.filter(pk=mov.pk).exists()

    def test_confirmar_requiere_campos(
        self, usuario, espacio_familiar, metodo_efectivo,
    ):
        pendiente = crear_pendiente(
            usuario=usuario,
            espacio=espacio_familiar,
            origen=MovimientoPendiente.ORIGEN_TELEGRAM,
            monto='1000',
            metodo_pago_sugerido=metodo_efectivo,
        )
        with pytest.raises(CapturaError) as exc:
            confirmar_pendiente(pendiente)
        assert exc.value.code == 'campos_requeridos'

    def test_descartar(self, usuario, espacio_familiar):
        pendiente = crear_pendiente(
            usuario=usuario,
            espacio=espacio_familiar,
            origen=MovimientoPendiente.ORIGEN_MANUAL,
            monto='500',
        )
        descartar_pendiente(pendiente)
        pendiente.refresh_from_db()
        assert pendiente.estado == MovimientoPendiente.ESTADO_DESCARTADO

    def test_dedup_con_movimiento_existente(
        self, usuario, espacio_familiar, movimiento_efectivo,
    ):
        pendiente = crear_pendiente(
            usuario=usuario,
            espacio=espacio_familiar,
            origen=MovimientoPendiente.ORIGEN_EMAIL_BANCO,
            monto=movimiento_efectivo.monto,
            fecha=movimiento_efectivo.fecha,
            comercio='Bencina dup',
        )
        assert pendiente.estado == MovimientoPendiente.ESTADO_DUPLICADO
        assert pendiente.movimiento_id == movimiento_efectivo.id

    def test_notificar(self, usuario, espacio_familiar):
        pendiente = crear_pendiente(
            usuario=usuario,
            espacio=espacio_familiar,
            origen=MovimientoPendiente.ORIGEN_EMAIL_BANCO,
            monto='8990',
            comercio='Falabella',
            notificar=True,
        )
        assert NotificacionUsuario.objects.filter(
            usuario=usuario,
            tipo=NotificacionUsuario.TIPO_MOVIMIENTO_PENDIENTE,
            payload__pendiente_id=pendiente.id,
        ).exists()


@pytest.mark.django_db
class TestCapturaAPI:

    def test_lista_y_contador(
        self, client, auth_header, usuario, espacio_familiar, categoria_egreso, metodo_efectivo,
    ):
        crear_pendiente(
            usuario=usuario,
            espacio=espacio_familiar,
            origen=MovimientoPendiente.ORIGEN_MANUAL,
            monto='1000',
            categoria_sugerida=categoria_egreso,
            ambito_sugerido='PERSONAL',
            metodo_pago_sugerido=metodo_efectivo,
        )
        res = client.get('/api/finanzas/pendientes/', **auth_header)
        assert res.status_code == 200
        assert len(res.json()) == 1
        res_c = client.get('/api/finanzas/pendientes/contador/', **auth_header)
        assert res_c.status_code == 200
        assert res_c.json()['count'] == 1

    def test_confirmar_via_api(
        self, client, auth_header, usuario, espacio_familiar, categoria_egreso, metodo_efectivo,
    ):
        pendiente = crear_pendiente(
            usuario=usuario,
            espacio=espacio_familiar,
            origen=MovimientoPendiente.ORIGEN_MANUAL,
            monto='2500',
            comercio='Café',
            categoria_sugerida=categoria_egreso,
            ambito_sugerido='PERSONAL',
            metodo_pago_sugerido=metodo_efectivo,
        )
        res = client.post(
            f'/api/finanzas/pendientes/{pendiente.id}/confirmar/',
            data={},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 200
        assert res.json()['movimiento']['monto'] == '2500.00'

    def test_generar_vinculo(self, client, auth_header):
        res = client.post(
            '/api/finanzas/captura/vinculo/',
            data={'canal': 'TELEGRAM'},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 201
        assert 'codigo' in res.json()


@pytest.mark.django_db
class TestCapturaBot:

    def test_parser_heuristico_lucas(self):
        r = parsear_mensaje_heuristico('2 lucas café')
        assert r['monto'] == Decimal('2000.00')
        assert 'café' in r['comercio'].lower() or 'cafe' in r['comercio'].lower()

    def test_parser_bci(self):
        body = 'Compra por $8.990 en Falabella con tarjeta terminada en 1234 el 10/07/2026'
        p = parse_bci('Alerta BCI', body)
        assert p is not None
        assert p.monto == Decimal('8990.00')
        assert p.ultimos_4 == '1234'

    def test_flujo_telegram_sin_vinculo(self):
        reply = manejar_texto(canal='TELEGRAM', chat_id='999', texto='2 lucas café')
        assert 'vincul' in reply.text.lower()

    def test_flujo_telegram_vinculado(
        self, usuario, espacio_familiar, metodo_efectivo,
    ):
        usuario.telegram_chat_id = '111'
        usuario.telegram_vinculado = True
        usuario.save()
        # metodo_efectivo fixture ensures MetodoPago exists
        _ = metodo_efectivo
        reply = manejar_texto(canal='TELEGRAM', chat_id='111', texto='2 lucas café')
        assert 'borrador' in reply.text.lower() or 'ámbito' in reply.text.lower()
        assert MovimientoPendiente.objects.filter(usuario=usuario).exists()
        assert reply.buttons
