# Tests Fase 4 — Salida de familia: copia de datos al espacio personal,
# disolución cuando quedan ≤1 miembros, validaciones de salida.

import pytest
from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APIClient

from applications.espacios.models import Espacio, PertenenciaEspacio
from applications.espacios.services import obtener_espacio_personal
from applications.finanzas.models import (
    Categoria, Movimiento, Cuota, MetodoPago, Presupuesto,
    IngresoComun, Tarjeta,
)
from applications.inversiones.models import Fondo, Aporte
from applications.usuarios.models import Usuario, Familia, InvitacionPendiente
from applications.usuarios.salida_familia import (
    puede_salir_de_familia,
    salir_de_familia,
    copiar_datos_familia_a_personal,
)
from applications.viajes.models import Viaje


@pytest.fixture
def client():
    return APIClient()


def _espejo(familia):
    return Espacio.objects.get(familia_origen=familia)


# ── Validaciones ─────────────────────────────────────────────────────────────

class TestPuedeSalir:
    def test_usuario_sin_familia_no_puede(self, db):
        u = Usuario.objects.create_user(
            username='solo@test.com', email='solo@test.com',
            password='test1234', firebase_uid='uid-solo',
        )
        ok, msg = puede_salir_de_familia(u)
        assert not ok
        assert 'no pertenece' in msg

    def test_admin_unico_con_otros_miembros_no_puede(self, usuario, familia):
        otro = Usuario.objects.create_user(
            username='otro@test.com', email='otro@test.com',
            password='test1234', firebase_uid='uid-otro',
            familia=familia, rol='MIEMBRO',
        )
        ok, msg = puede_salir_de_familia(usuario)
        assert not ok
        assert 'administrador' in msg.lower()

    def test_admin_unico_sin_otros_puede(self, usuario, familia):
        ok, msg = puede_salir_de_familia(usuario)
        assert ok

    def test_admin_con_otro_admin_puede(self, usuario, familia):
        Usuario.objects.create_user(
            username='admin2@test.com', email='admin2@test.com',
            password='test1234', firebase_uid='uid-admin2',
            familia=familia, rol='ADMIN',
        )
        ok, msg = puede_salir_de_familia(usuario)
        assert ok

    def test_miembro_puede_salir(self, familia):
        Usuario.objects.create_user(
            username='admin@test.com', email='admin@test.com',
            password='test1234', firebase_uid='uid-adm',
            familia=familia, rol='ADMIN',
        )
        miembro = Usuario.objects.create_user(
            username='miembro@test.com', email='miembro@test.com',
            password='test1234', firebase_uid='uid-miembro',
            familia=familia, rol='MIEMBRO',
        )
        ok, _ = puede_salir_de_familia(miembro)
        assert ok


# ── Copia de datos ───────────────────────────────────────────────────────────

class TestCopiaDatos:
    def test_movimientos_se_copian_al_personal(
        self, usuario, familia, movimiento_efectivo
    ):
        personal = obtener_espacio_personal(usuario)
        assert Movimiento.objects.filter(espacio=personal).count() == 0

        copiar_datos_familia_a_personal(usuario, familia.id)

        copias = Movimiento.objects.filter(espacio=personal)
        assert copias.count() == 1
        copia = copias.first()
        assert copia.pk != movimiento_efectivo.pk
        movimiento_efectivo.refresh_from_db()
        assert copia.monto == movimiento_efectivo.monto
        assert copia.familia_id is None

    def test_categorias_personales_se_copian(self, usuario, familia, categoria_personal):
        personal = obtener_espacio_personal(usuario)
        copiar_datos_familia_a_personal(usuario, familia.id)

        copia = Categoria.objects.filter(
            espacio=personal, usuario=usuario
        ).exclude(pk=categoria_personal.pk)
        assert copia.count() == 1
        assert copia.first().nombre == categoria_personal.nombre
        assert copia.first().familia_id is None

    def test_fondos_se_copian_con_aportes(self, usuario, familia):
        fondo = Fondo.objects.create(
            familia=familia, usuario=usuario, nombre='Mi Fondo'
        )
        Aporte.objects.create(fondo=fondo, monto=100000, fecha=date(2026, 1, 15))

        personal = obtener_espacio_personal(usuario)
        copiar_datos_familia_a_personal(usuario, familia.id)

        copia_fondo = Fondo.objects.filter(espacio=personal).first()
        assert copia_fondo is not None
        assert copia_fondo.pk != fondo.pk
        assert copia_fondo.nombre == 'Mi Fondo'
        assert copia_fondo.aportes.count() == 1

    def test_viajes_se_copian_completos(self, usuario, familia):
        viaje = Viaje.objects.create(
            familia=familia, nombre='Vacaciones',
            fecha_inicio=date(2026, 1, 10), fecha_fin=date(2026, 1, 20),
        )
        personal = obtener_espacio_personal(usuario)
        copiar_datos_familia_a_personal(usuario, familia.id)

        copia = Viaje.objects.filter(espacio=personal).first()
        assert copia is not None
        assert copia.pk != viaje.pk
        assert copia.nombre == 'Vacaciones'
        assert copia.familia_id is None

    def test_datos_originales_no_se_modifican(
        self, usuario, familia, movimiento_efectivo
    ):
        espejo = _espejo(familia)
        copiar_datos_familia_a_personal(usuario, familia.id)

        movimiento_efectivo.refresh_from_db()
        assert movimiento_efectivo.familia_id == familia.id
        assert movimiento_efectivo.espacio_id == espejo.id


# ── Salida completa ──────────────────────────────────────────────────────────

class TestSalidaFamilia:
    def test_salida_unico_miembro_disuelve(
        self, usuario, familia, movimiento_efectivo
    ):
        resultado = salir_de_familia(usuario)

        usuario.refresh_from_db()
        assert usuario.familia_id is None
        assert resultado['disolucion'] is True

        personal = obtener_espacio_personal(usuario)
        assert Movimiento.objects.filter(espacio=personal).count() == 1

        espejo = Espacio.objects.get(familia_origen=familia)
        assert espejo.archivado is True

    def test_salida_2_miembros_ambos_reciben_copia(self, familia, metodo_efectivo):
        admin = Usuario.objects.create_user(
            username='a@test.com', email='a@test.com',
            password='test1234', firebase_uid='uid-a',
            familia=familia, rol='ADMIN',
        )
        miembro = Usuario.objects.create_user(
            username='b@test.com', email='b@test.com',
            password='test1234', firebase_uid='uid-b',
            familia=familia, rol='ADMIN',
        )
        cat = Categoria.objects.create(nombre='Comida', tipo='EGRESO')
        Movimiento.objects.create(
            usuario=admin, familia=familia, fecha=date(2026, 3, 1),
            tipo='EGRESO', ambito='COMUN', categoria=cat,
            monto=50000, metodo_pago=metodo_efectivo,
        )
        Movimiento.objects.create(
            usuario=miembro, familia=familia, fecha=date(2026, 3, 2),
            tipo='EGRESO', ambito='PERSONAL', categoria=cat,
            monto=30000, metodo_pago=metodo_efectivo,
        )

        resultado = salir_de_familia(admin)

        assert resultado['disolucion'] is True
        assert set(resultado['miembros_con_copia']) == {admin.pk, miembro.pk}

        admin.refresh_from_db()
        miembro.refresh_from_db()
        assert admin.familia_id is None
        assert miembro.familia_id is None

        personal_admin = obtener_espacio_personal(admin)
        personal_miembro = obtener_espacio_personal(miembro)
        assert Movimiento.objects.filter(espacio=personal_admin).count() == 1
        assert Movimiento.objects.filter(espacio=personal_miembro).count() == 1

    def test_salida_3_miembros_no_disuelve(self, familia, metodo_efectivo):
        admin = Usuario.objects.create_user(
            username='a@test.com', email='a@test.com',
            password='test1234', firebase_uid='uid-a',
            familia=familia, rol='ADMIN',
        )
        otro_admin = Usuario.objects.create_user(
            username='b@test.com', email='b@test.com',
            password='test1234', firebase_uid='uid-b',
            familia=familia, rol='ADMIN',
        )
        sale = Usuario.objects.create_user(
            username='c@test.com', email='c@test.com',
            password='test1234', firebase_uid='uid-c',
            familia=familia, rol='MIEMBRO',
        )
        cat = Categoria.objects.create(nombre='Varios', tipo='EGRESO')
        Movimiento.objects.create(
            usuario=sale, familia=familia, fecha=date(2026, 4, 1),
            tipo='EGRESO', ambito='PERSONAL', categoria=cat,
            monto=20000, metodo_pago=metodo_efectivo,
        )

        resultado = salir_de_familia(sale)

        assert resultado['disolucion'] is False
        assert resultado['miembros_con_copia'] == [sale.pk]

        sale.refresh_from_db()
        otro_admin.refresh_from_db()
        assert sale.familia_id is None
        assert otro_admin.familia_id == familia.id

        personal_sale = obtener_espacio_personal(sale)
        assert Movimiento.objects.filter(espacio=personal_sale).count() == 1

        espejo = Espacio.objects.get(familia_origen=familia)
        assert espejo.archivado is False

    def test_pertenencia_espacio_desactivada_tras_salida(
        self, usuario, familia, movimiento_efectivo
    ):
        espejo = _espejo(familia)
        salir_de_familia(usuario)

        pertenencia = PertenenciaEspacio.objects.get(
            usuario=usuario, espacio=espejo,
        )
        assert not pertenencia.activo

    def test_invitaciones_del_saliente_se_eliminan(self, usuario, familia):
        InvitacionPendiente.objects.create(
            familia=familia, invitador=usuario, email='x@test.com',
        )
        salir_de_familia(usuario)
        assert not InvitacionPendiente.objects.filter(
            invitador=usuario, familia=familia,
        ).exists()


# ── Endpoint API ─────────────────────────────────────────────────────────────

class TestEndpointSalir:
    def test_get_pre_check(self, client, usuario, familia, auth_header):
        resp = client.get('/api/usuarios/familia/salir/', **auth_header)
        assert resp.status_code == status.HTTP_200_OK
        assert 'puede_salir' in resp.data

    def test_post_ejecuta_salida(
        self, client, usuario, familia, movimiento_efectivo, auth_header
    ):
        resp = client.post('/api/usuarios/familia/salir/', **auth_header)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['disolucion'] is True
        usuario.refresh_from_db()
        assert usuario.familia_id is None

    def test_post_sin_familia_400(self, client, usuario, auth_header):
        usuario.familia = None
        usuario.save(update_fields=['familia'])
        resp = client.post('/api/usuarios/familia/salir/', **auth_header)
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_post_admin_unico_con_otros_400(
        self, client, usuario, familia, auth_header
    ):
        Usuario.objects.create_user(
            username='otro@test.com', email='otro@test.com',
            password='test1234', firebase_uid='uid-otro-ep',
            familia=familia, rol='MIEMBRO',
        )
        resp = client.post('/api/usuarios/familia/salir/', **auth_header)
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert 'administrador' in resp.data['error'].lower()
