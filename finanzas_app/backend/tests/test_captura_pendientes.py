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
        from applications.usuarios.formato_moneda import formatear_monto_codigo

        pendiente = crear_pendiente(
            usuario=usuario,
            espacio=espacio_familiar,
            origen=MovimientoPendiente.ORIGEN_EMAIL_BANCO,
            monto='8990',
            comercio='Falabella',
            notificar=True,
        )
        notif = NotificacionUsuario.objects.get(
            usuario=usuario,
            tipo=NotificacionUsuario.TIPO_MOVIMIENTO_PENDIENTE,
            payload__pendiente_id=pendiente.id,
        )
        esperado = formatear_monto_codigo(Decimal('8990'), getattr(usuario, 'moneda_display', None) or 'CLP')
        assert notif.mensaje.startswith(esperado)
        assert 'Falabella' in notif.mensaje
        assert '$8990.00' not in notif.mensaje
        assert '8990.00' not in notif.mensaje

    def test_confirmar_marca_notificacion_leida(
        self, usuario, espacio_familiar, categoria_egreso, metodo_efectivo,
    ):
        pendiente = crear_pendiente(
            usuario=usuario,
            espacio=espacio_familiar,
            origen=MovimientoPendiente.ORIGEN_EMAIL_BANCO,
            monto='4500',
            comercio='Bip',
            categoria_sugerida=categoria_egreso,
            ambito_sugerido='COMUN',
            metodo_pago_sugerido=metodo_efectivo,
            notificar=True,
        )
        notif = NotificacionUsuario.objects.get(
            usuario=usuario,
            tipo=NotificacionUsuario.TIPO_MOVIMIENTO_PENDIENTE,
            payload__pendiente_id=pendiente.id,
        )
        assert notif.leida_at is None
        confirmar_pendiente(pendiente)
        notif.refresh_from_db()
        assert notif.leida_at is not None

    def test_descartar_marca_notificacion_leida(self, usuario, espacio_familiar):
        pendiente = crear_pendiente(
            usuario=usuario,
            espacio=espacio_familiar,
            origen=MovimientoPendiente.ORIGEN_EMAIL_BANCO,
            monto='1200',
            comercio='Test',
            notificar=True,
        )
        notif = NotificacionUsuario.objects.get(
            usuario=usuario,
            tipo=NotificacionUsuario.TIPO_MOVIMIENTO_PENDIENTE,
            payload__pendiente_id=pendiente.id,
        )
        assert notif.leida_at is None
        descartar_pendiente(pendiente)
        notif.refresh_from_db()
        assert notif.leida_at is not None


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
        body = (
            'Compra por $8.990 en Falabella con tarjeta terminada en 1234 '
            'el 10/07/2026 a las 18:45 hrs.'
        )
        p = parse_bci('Alerta BCI', body)
        assert p is not None
        assert p.monto == Decimal('8990.00')
        assert p.ultimos_4 == '1234'
        assert 'falabella' in (p.comercio or '').lower()
        assert p.hora is not None
        assert p.hora.hour == 18 and p.hora.minute == 45

    def test_parser_bci_tabla_debito_comercio(self):
        """Formato real BCI: intro genérica + tabla con Comercio / ****digitos."""
        body = (
            'Te informamos de una compra en comercio nacional con tu tarjeta de débito.\n'
            'Número tarjeta débito ****9803\n'
            'Monto $5.990\n'
            'Fecha 15/07/2026\n'
            'Hora 13:47 horas\n'
            'Comercio ALINER LTDA\n'
            'Si no quieres recibir notificaciones en tu correo electrónico '
            'puedes modificar tus preferencias en Bci.cl'
        )
        p = parse_email(
            subject='RV: Notificación de uso de tu tarjeta de débito',
            body=body,
            from_addr='contacto@bci.cl',
        )
        assert p is not None
        assert p.monto == Decimal('5990.00')
        assert p.ultimos_4 == '9803'
        assert p.tipo_tarjeta == 'DEBITO'
        assert p.hora is not None and p.hora.hour == 13 and p.hora.minute == 47
        assert 'aliner' in (p.comercio or '').lower()
        assert 'notificaci' not in (p.comercio or '').lower()
        assert 'nacional' not in (p.comercio or '').lower()

    def test_resolver_tarjeta_prefieres_tipo(self, usuario):
        from applications.finanzas.models import Tarjeta
        from applications.finanzas.services.captura import resolver_tarjeta_por_ultimos_4

        credito = Tarjeta.objects.create(
            usuario=usuario, nombre='BCI Visa', banco='BCI',
            tipo='CREDITO', ultimos_4_digitos='9803',
        )
        debito = Tarjeta.objects.create(
            usuario=usuario, nombre='BCI Débito', banco='BCI',
            tipo='DEBITO', ultimos_4_digitos='9803',
        )
        assert resolver_tarjeta_por_ultimos_4(
            usuario=usuario, ultimos_4='9803', tipo='DEBITO',
        ).pk == debito.pk
        assert resolver_tarjeta_por_ultimos_4(
            usuario=usuario, ultimos_4='9803', tipo='CREDITO',
        ).pk == credito.pk

    def test_parser_evita_comercio_nacional_generico(self):
        body = (
            'Se realizó una compra por $9.840 en comercio nacional '
            'con tarjeta terminada en 4321 el 15/07/2026 a las 14:20'
        )
        p = parse_email(
            subject='Compra Unimarc Centro',
            body=body,
            from_addr='notificaciones@correo.bancoestado.cl',
        )
        assert p is not None
        assert p.monto == Decimal('9840.00')
        assert p.ultimos_4 == '4321'
        assert p.hora is not None and p.hora.hour == 14
        # No debe quedarse en el placeholder genérico del banco
        assert 'nacional' not in (p.comercio or '').lower()
        assert 'unimarc' in (p.comercio or '').lower()

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


@pytest.mark.django_db
class TestCapturaCorreoConfig:
    def test_get_sanea_conectado_sin_token(self, client, auth_header, usuario):
        from applications.finanzas.models import ConfiguracionCapturaCorreo

        ConfiguracionCapturaCorreo.objects.create(
            usuario=usuario,
            proveedor='GMAIL',
            email='yo@gmail.com',
            refresh_token_enc='',
            conectado=True,
        )
        res = client.get('/api/finanzas/captura/correo/', **auth_header)
        assert res.status_code == 200
        assert res.json()['conectado'] is False
        assert 'OAuth' in (res.json().get('ultimo_error') or '')

    def test_put_intervalo_bajo_minimo(self, client, auth_header, settings):
        settings.CAPTURA_EMAIL_INTERVALO_MIN_MINUTOS = 5
        res = client.put(
            '/api/finanzas/captura/correo/',
            data={'intervalo_minutos': 2, 'remitentes_banco': ['@bci.cl']},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 400

    def test_put_prefs(self, client, auth_header):
        res = client.put(
            '/api/finanzas/captura/correo/',
            data={
                'remitentes_banco': ['alertas@bci.cl', '@santander.cl'],
                'intervalo_minutos': 15,
                'notificaciones_activas': False,
            },
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 200
        body = res.json()
        assert body['notificaciones_activas'] is False
        assert 'alertas@bci.cl' in body['remitentes_banco']
        assert 'password' not in body

    def test_oauth_connect_gmail_url(self, client, auth_header, settings):
        settings.GOOGLE_MAIL_OAUTH_CLIENT_ID = 'cid'
        settings.GOOGLE_MAIL_OAUTH_CLIENT_SECRET = 'csec'
        res = client.post(
            '/api/finanzas/captura/correo/oauth/connect/',
            data={'proveedor': 'GMAIL'},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 200
        assert 'accounts.google.com' in res.json()['auth_url']

    def test_oauth_connect_sin_creds(self, client, auth_header, settings):
        settings.GOOGLE_MAIL_OAUTH_CLIENT_ID = ''
        settings.GOOGLE_MAIL_OAUTH_CLIENT_SECRET = ''
        settings.GOOGLE_DRIVE_OAUTH_CLIENT_ID = ''
        settings.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET = ''
        res = client.post(
            '/api/finanzas/captura/correo/oauth/connect/',
            data={'proveedor': 'GMAIL'},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 500

    def test_desconectar(self, client, auth_header, usuario):
        from applications.espacios.drive_usuario import encrypt_token
        from applications.finanzas.models import ConfiguracionCapturaCorreo

        ConfiguracionCapturaCorreo.objects.create(
            usuario=usuario,
            proveedor='GMAIL',
            email='yo@gmail.com',
            refresh_token_enc=encrypt_token('rt'),
            conectado=True,
            remitentes_banco=['@bci.cl'],
        )
        res = client.post(
            '/api/finanzas/captura/correo/desconectar/',
            data={},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 200
        assert res.json()['conectado'] is False

    def test_sincronizar_sin_conexion(self, client, auth_header):
        res = client.post(
            '/api/finanzas/captura/correo/sincronizar/',
            data={},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 400

    def test_sincronizar_force(self, client, auth_header, usuario, monkeypatch):
        from applications.espacios.drive_usuario import encrypt_token
        from applications.finanzas.models import ConfiguracionCapturaCorreo
        from applications.finanzas.services.captura.mail_ingest import IngestStats

        ConfiguracionCapturaCorreo.objects.create(
            usuario=usuario,
            proveedor='GMAIL',
            email='yo@gmail.com',
            refresh_token_enc=encrypt_token('rt'),
            conectado=True,
            remitentes_banco=['@bci.cl'],
        )

        called = {}

        def fake_ingerir(config, *, dry_run=False, limit=50, force=False):
            called['force'] = force
            return IngestStats(creados=2, skip_remitente=3)

        monkeypatch.setattr(
            'applications.finanzas.services.captura.mail_ingest.ingerir_config',
            fake_ingerir,
        )
        res = client.post(
            '/api/finanzas/captura/correo/sincronizar/',
            data={},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 200
        body = res.json()
        assert body['ok'] is True
        assert body['creados'] == 2
        assert called.get('force') is True


@pytest.mark.django_db
class TestMailIngestHelpers:
    def test_from_calza_email_y_dominio(self):
        from applications.finanzas.services.captura.mail_ingest import from_calza_remitentes

        assert from_calza_remitentes('alertas@bci.cl', ['alertas@bci.cl'])
        assert from_calza_remitentes('foo@alertas.bci.cl', ['@bci.cl'])
        assert not from_calza_remitentes('spam@gmail.com', ['@bci.cl'])

    def test_debe_sincronizar_intervalo(self, usuario):
        from datetime import timedelta

        from django.utils import timezone

        from applications.finanzas.models import ConfiguracionCapturaCorreo
        from applications.finanzas.services.captura.mail_ingest import debe_sincronizar

        cfg = ConfiguracionCapturaCorreo.objects.create(
            usuario=usuario,
            email='a@b.cl',
            intervalo_minutos=15,
            ultimo_sync_at=timezone.now() - timedelta(minutes=5),
        )
        assert debe_sincronizar(cfg) is False
        cfg.ultimo_sync_at = timezone.now() - timedelta(minutes=20)
        assert debe_sincronizar(cfg) is True

    def test_ingerir_filtra_remitente_y_notif(
        self, usuario, espacio_familiar, monkeypatch,
    ):
        from applications.espacios.drive_usuario import encrypt_token
        from applications.finanzas.models import (
            ConfiguracionCapturaCorreo,
            NotificacionUsuario,
        )
        from applications.finanzas.services.captura import mail_ingest
        from applications.finanzas.services.captura import oauth_google_mail as gmail

        _ = espacio_familiar

        cfg = ConfiguracionCapturaCorreo.objects.create(
            usuario=usuario,
            proveedor='GMAIL',
            email='yo@gmail.com',
            refresh_token_enc=encrypt_token('rt'),
            conectado=True,
            remitentes_banco=['alertas@bci.cl'],
            notificaciones_activas=False,
            intervalo_minutos=5,
        )

        monkeypatch.setattr(gmail, 'refrescar_access_token', lambda _rt: 'access')
        monkeypatch.setattr(
            gmail,
            'listar_no_leidos',
            lambda _tok, limit=50: [
                {
                    'id': 'm1',
                    'from_addr': 'spam@gmail.com',
                    'subject': 'Hola',
                    'body': 'Compra por $1.000 en X',
                },
                {
                    'id': 'm2',
                    'from_addr': 'alertas@bci.cl',
                    'subject': 'Alerta BCI',
                    'body': (
                        'Compra por $8.990 en Falabella con tarjeta terminada en 1234'
                    ),
                },
            ],
        )
        marked = []
        monkeypatch.setattr(gmail, 'marcar_leido', lambda _t, mid: marked.append(mid))

        stats = mail_ingest.ingerir_config(cfg, force=True)
        assert stats is not None
        assert stats.skip_remitente >= 1
        assert stats.creados == 1
        assert MovimientoPendiente.objects.filter(usuario=usuario).count() == 1
        assert not NotificacionUsuario.objects.filter(
            usuario=usuario,
            tipo=NotificacionUsuario.TIPO_MOVIMIENTO_PENDIENTE,
        ).exists()
        assert 'm2' in marked
