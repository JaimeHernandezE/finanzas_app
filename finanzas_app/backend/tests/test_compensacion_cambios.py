# tests/test_compensacion_cambios.py

from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest

from applications.finanzas import services_compensacion_cambios, services_recalculo
from applications.finanzas.models import (
    CambioCompensacionMensual,
    IngresoComun,
    Movimiento,
    NotificacionUsuario,
    ResumenHistoricoMesSnapshot,
)


@pytest.mark.django_db
class TestCompensacionCambios:
    @patch('applications.finanzas.services_recalculo.timezone.localdate')
    def test_editar_gasto_comun_notifica_afectado(
        self,
        mock_hoy,
        espacio_familiar,
        usuario,
        usuario_2,
        categoria_egreso,
        metodo_efectivo,
    ):
        mock_hoy.return_value = date(2026, 5, 10)
        mes_pd = date(2026, 4, 1)

        IngresoComun.objects.create(
            espacio=espacio_familiar,
            usuario=usuario,
            mes=mes_pd,
            monto=Decimal('1000000'),
            origen='Sueldo',
        )
        IngresoComun.objects.create(
            espacio=espacio_familiar,
            usuario=usuario_2,
            mes=mes_pd,
            monto=Decimal('1000000'),
            origen='Sueldo',
        )

        snap_antes = ResumenHistoricoMesSnapshot.objects.get(
            espacio=espacio_familiar, mes=mes_pd
        )
        payload_antes = snap_antes.payload

        Movimiento.objects.create(
            espacio=espacio_familiar,
            usuario=usuario,
            fecha=date(2026, 4, 10),
            tipo='EGRESO',
            ambito='COMUN',
            categoria=categoria_egreso,
            monto=Decimal('200000'),
            metodo_pago=metodo_efectivo,
        )

        assert CambioCompensacionMensual.objects.filter(espacio=espacio_familiar).exists()
        assert NotificacionUsuario.objects.filter(usuario=usuario_2).exists()
        assert NotificacionUsuario.objects.filter(usuario=usuario).exists()
        notif = NotificacionUsuario.objects.filter(usuario=usuario_2).latest('pk')
        assert '$' in notif.mensaje
        assert '200000' not in notif.mensaje
        assert notif.payload.get('compensacion', {}).get('por_usuario')

        snap_despues = ResumenHistoricoMesSnapshot.objects.get(
            espacio=espacio_familiar, mes=mes_pd
        )
        assert snap_despues.payload != payload_antes

    @patch('applications.finanzas.services_recalculo.timezone.localdate')
    def test_efectivo_d_sin_backfill_manual_tras_edicion(
        self,
        mock_hoy,
        espacio_familiar,
        usuario,
        usuario_2,
        categoria_egreso,
        metodo_efectivo,
    ):
        mock_hoy.return_value = date(2026, 3, 15)
        mes_pd = date(2026, 2, 1)

        IngresoComun.objects.create(
            espacio=espacio_familiar,
            usuario=usuario,
            mes=mes_pd,
            monto=Decimal('1000000'),
            origen='Sueldo',
        )
        IngresoComun.objects.create(
            espacio=espacio_familiar,
            usuario=usuario_2,
            mes=mes_pd,
            monto=Decimal('1000000'),
            origen='Sueldo',
        )

        assert ResumenHistoricoMesSnapshot.objects.filter(
            espacio=espacio_familiar, mes=mes_pd
        ).exists()

        Movimiento.objects.create(
            espacio=espacio_familiar,
            usuario=usuario,
            fecha=date(2026, 2, 5),
            tipo='EGRESO',
            ambito='COMUN',
            categoria=categoria_egreso,
            monto=Decimal('100000'),
            metodo_pago=metodo_efectivo,
        )

        datos = services_recalculo.efectivo_disponible_dashboard(
            usuario, espacio=espacio_familiar
        )
        prorrateo = datos['prorrateo_gastos_comunes_acumulado']
        assert prorrateo > Decimal('0')

    @patch('applications.finanzas.services_recalculo.timezone.localdate')
    def test_editar_gasto_sin_snapshot_previo_notifica(
        self,
        mock_hoy,
        espacio_familiar,
        usuario,
        usuario_2,
        categoria_egreso,
        metodo_efectivo,
    ):
        mock_hoy.return_value = date(2026, 5, 10)
        mes_pd = date(2026, 4, 1)

        IngresoComun.objects.create(
            espacio=espacio_familiar,
            usuario=usuario,
            mes=mes_pd,
            monto=Decimal('1000000'),
            origen='Sueldo',
        )
        IngresoComun.objects.create(
            espacio=espacio_familiar,
            usuario=usuario_2,
            mes=mes_pd,
            monto=Decimal('1000000'),
            origen='Sueldo',
        )

        mov = Movimiento.objects.create(
            espacio=espacio_familiar,
            usuario=usuario,
            fecha=date(2026, 4, 10),
            tipo='EGRESO',
            ambito='COMUN',
            categoria=categoria_egreso,
            monto=Decimal('200000'),
            metodo_pago=metodo_efectivo,
        )
        NotificacionUsuario.objects.all().delete()
        CambioCompensacionMensual.objects.all().delete()
        ResumenHistoricoMesSnapshot.objects.filter(
            espacio=espacio_familiar, mes=mes_pd
        ).delete()

        mov.monto = Decimal('400000')
        mov.save()

        assert CambioCompensacionMensual.objects.filter(espacio=espacio_familiar).exists()
        assert NotificacionUsuario.objects.filter(usuario=usuario_2).exists()

    @patch('applications.finanzas.services_recalculo.timezone.localdate')
    def test_notificacion_respeta_moneda_display_destinatario(
        self,
        mock_hoy,
        espacio_familiar,
        usuario,
        usuario_2,
        categoria_egreso,
        metodo_efectivo,
    ):
        mock_hoy.return_value = date(2026, 5, 10)
        mes_pd = date(2026, 4, 1)
        usuario_2.moneda_display = 'USD'
        usuario_2.save(update_fields=['moneda_display'])

        IngresoComun.objects.create(
            espacio=espacio_familiar,
            usuario=usuario,
            mes=mes_pd,
            monto=Decimal('1000000'),
            origen='Sueldo',
        )
        IngresoComun.objects.create(
            espacio=espacio_familiar,
            usuario=usuario_2,
            mes=mes_pd,
            monto=Decimal('1000000'),
            origen='Sueldo',
        )

        Movimiento.objects.create(
            espacio=espacio_familiar,
            usuario=usuario,
            fecha=date(2026, 4, 10),
            tipo='EGRESO',
            ambito='COMUN',
            categoria=categoria_egreso,
            monto=Decimal('200000'),
            metodo_pago=metodo_efectivo,
        )

        notif = NotificacionUsuario.objects.filter(usuario=usuario_2).latest('pk')
        assert 'US$' in notif.mensaje
        assert ',00' in notif.mensaje
        comp = notif.payload.get('compensacion') or {}
        assert comp.get('transferencias_sugeridas') is not None
        assert comp.get('por_usuario')

    def test_detectar_cambios_sin_delta_si_igual(self):
        payload = {
            'mes': 4,
            'anio': 2026,
            'compensacion': {
                'por_usuario': [
                    {'usuario_id': 1, 'diferencia': '100.00'},
                ],
                'transferencias_sugeridas': [
                    {
                        'de_usuario_id': 1,
                        'a_usuario_id': 2,
                        'monto': '100.00',
                    }
                ],
            },
        }
        assert services_compensacion_cambios.detectar_cambios_compensacion(payload, payload) is None

    def test_api_notificaciones_lista(self, client, auth_header, usuario, espacio_familiar):
        NotificacionUsuario.objects.create(
            usuario=usuario,
            espacio=espacio_familiar,
            tipo=NotificacionUsuario.TIPO_CAMBIO_COMPENSACION,
            titulo='Prueba',
            mensaje='Mensaje de prueba',
        )
        r = client.get('/api/finanzas/notificaciones/', **auth_header)
        assert r.status_code == 200
        body = r.json()
        assert body['no_leidas'] == 1
        assert len(body['notificaciones']) == 1
