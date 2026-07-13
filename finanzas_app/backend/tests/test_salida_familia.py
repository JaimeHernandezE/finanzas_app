# Tests Fase 4 — Salida de familia: copia de datos al espacio personal,
# disolución cuando quedan ≤1 miembros, validaciones de salida.

import pytest
from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APIClient

from applications.espacios.models import Espacio, PertenenciaEspacio
from applications.espacios.services import espacio_para_familia, obtener_espacio_personal
from applications.finanzas.models import (
    Categoria, Movimiento, Cuota, MetodoPago, Presupuesto,
    IngresoComun, Tarjeta, CuentaPersonal,
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
    return espacio_para_familia(familia)


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

    def test_admin_unico_con_otros_miembros_no_puede(self, usuario, espacio_familiar):
        otro = Usuario.objects.create_user(
            username='otro@test.com', email='otro@test.com',
            password='test1234', firebase_uid='uid-otro',
            rol='MIEMBRO',
        )
        PertenenciaEspacio.objects.create(
            usuario=otro, espacio=espacio_familiar, rol=PertenenciaEspacio.ROL_MIEMBRO,
        )
        ok, msg = puede_salir_de_familia(usuario)
        assert not ok
        assert 'administrador' in msg.lower()

    def test_admin_unico_sin_otros_puede(self, usuario, familia):
        ok, msg = puede_salir_de_familia(usuario)
        assert ok

    def test_admin_con_otro_admin_puede(self, usuario, espacio_familiar):
        otro = Usuario.objects.create_user(
            username='admin2@test.com', email='admin2@test.com',
            password='test1234', firebase_uid='uid-admin2',
            rol='ADMIN',
        )
        PertenenciaEspacio.objects.create(
            usuario=otro, espacio=espacio_familiar, rol=PertenenciaEspacio.ROL_ADMIN,
        )
        ok, msg = puede_salir_de_familia(usuario)
        assert ok

    def test_miembro_puede_salir(self, familia, espacio_familiar):
        Usuario.objects.create_user(
            username='admin@test.com', email='admin@test.com',
            password='test1234', firebase_uid='uid-adm',
            rol='ADMIN',
        )
        PertenenciaEspacio.objects.create(
            usuario=Usuario.objects.get(username='admin@test.com'),
            espacio=espacio_familiar,
            rol=PertenenciaEspacio.ROL_ADMIN,
        )
        miembro = Usuario.objects.create_user(
            username='miembro@test.com', email='miembro@test.com',
            password='test1234', firebase_uid='uid-miembro',
            rol='MIEMBRO',
        )
        PertenenciaEspacio.objects.create(
            usuario=miembro, espacio=espacio_familiar, rol=PertenenciaEspacio.ROL_MIEMBRO,
        )
        ok, _ = puede_salir_de_familia(miembro)
        assert ok


# ── Copia de datos ───────────────────────────────────────────────────────────

class TestCopiaDatos:
    def test_movimientos_se_copian_al_personal(
        self, usuario, familia, movimiento_efectivo, espacio_familiar
    ):
        personal = obtener_espacio_personal(usuario)
        assert Movimiento.objects.filter(espacio=personal).count() == 0

        copiar_datos_familia_a_personal(usuario, espacio_familiar.id)

        copias = Movimiento.objects.filter(espacio=personal)
        assert copias.count() == 1
        copia = copias.first()
        assert copia.pk != movimiento_efectivo.pk
        movimiento_efectivo.refresh_from_db()
        assert copia.monto == movimiento_efectivo.monto
        assert copia.origen_familia_id == espacio_familiar.id

    def test_categorias_personales_se_copian(self, usuario, familia, categoria_personal, espacio_familiar):
        personal = obtener_espacio_personal(usuario)
        copiar_datos_familia_a_personal(usuario, espacio_familiar.id)

        copia = Categoria.objects.filter(
            espacio=personal, usuario=usuario
        ).exclude(pk=categoria_personal.pk)
        assert copia.count() == 1
        assert copia.first().nombre == categoria_personal.nombre
        assert copia.first().origen_familia_id == espacio_familiar.id

    def test_categorias_familiares_se_copian(self, usuario, familia, categoria_familiar, espacio_familiar):
        personal = obtener_espacio_personal(usuario)
        copiar_datos_familia_a_personal(usuario, espacio_familiar.id)

        copia = Categoria.objects.filter(
            espacio=personal, usuario=None, nombre=categoria_familiar.nombre,
        ).exclude(pk=categoria_familiar.pk)
        assert copia.count() == 1
        assert copia.first().origen_familia_id == espacio_familiar.id

    def test_tarjetas_se_copian_con_remap(
        self, usuario, familia, metodo_credito, tarjeta, categoria_egreso, espacio_familiar,
    ):
        mov = Movimiento.objects.create(
            usuario=usuario,
            espacio=espacio_familiar,
            fecha=date(2026, 3, 5),
            tipo='EGRESO',
            ambito='PERSONAL',
            categoria=categoria_egreso,
            monto=Decimal('50000'),
            metodo_pago=metodo_credito,
            tarjeta=tarjeta,
            num_cuotas=3,
        )
        personal = obtener_espacio_personal(usuario)
        n_tarjetas_antes = Tarjeta.objects.filter(usuario=usuario).count()

        copiar_datos_familia_a_personal(usuario, espacio_familiar.id)

        assert Tarjeta.objects.filter(usuario=usuario).count() == n_tarjetas_antes + 1
        copia_mov = Movimiento.objects.get(espacio=personal, comentario=mov.comentario)
        assert copia_mov.tarjeta_id != tarjeta.pk
        assert copia_mov.tarjeta.usuario_id == usuario.pk

    def test_cuentas_se_copian_con_remap(
        self, usuario, familia, metodo_efectivo, categoria_egreso, espacio_familiar,
    ):
        cuenta = CuentaPersonal.objects.create(
            usuario=usuario, nombre='Arquitecto',
        )
        mov = Movimiento.objects.create(
            usuario=usuario,
            espacio=espacio_familiar,
            cuenta=cuenta,
            fecha=date(2026, 3, 6),
            tipo='EGRESO',
            ambito='PERSONAL',
            categoria=categoria_egreso,
            monto=Decimal('12000'),
            metodo_pago=metodo_efectivo,
        )
        personal = obtener_espacio_personal(usuario)

        copiar_datos_familia_a_personal(usuario, espacio_familiar.id)

        copia_cuenta = CuentaPersonal.objects.filter(
            usuario=usuario, nombre='Arquitecto',
        ).exclude(pk=cuenta.pk)
        assert copia_cuenta.count() == 1
        copia_mov = Movimiento.objects.get(espacio=personal, monto=mov.monto)
        assert copia_mov.cuenta_id == copia_cuenta.first().pk

    def test_origen_familia_en_copias(self, usuario, familia, movimiento_efectivo, espacio_familiar):
        personal = obtener_espacio_personal(usuario)
        copiar_datos_familia_a_personal(usuario, espacio_familiar.id)

        copia = Movimiento.objects.filter(espacio=personal).first()
        assert copia.origen_familia_id == espacio_familiar.id

    def test_fondos_se_copian_con_aportes(self, usuario, familia, espacio_familiar):
        fondo = Fondo.objects.create(
            espacio=espacio_familiar, usuario=usuario, nombre='Mi Fondo'
        )
        Aporte.objects.create(fondo=fondo, monto=100000, fecha=date(2026, 1, 15))

        personal = obtener_espacio_personal(usuario)
        copiar_datos_familia_a_personal(usuario, espacio_familiar.id)

        copia_fondo = Fondo.objects.filter(espacio=personal).first()
        assert copia_fondo is not None
        assert copia_fondo.pk != fondo.pk
        assert copia_fondo.nombre == 'Mi Fondo'
        assert copia_fondo.aportes.count() == 1

    def test_viajes_solo_participante(self, usuario, familia, espacio_familiar, metodo_efectivo, categoria_egreso):
        viaje_mio = Viaje.objects.create(
            espacio=espacio_familiar, nombre='Mi viaje',
            fecha_inicio=date(2026, 1, 10), fecha_fin=date(2026, 1, 20),
        )
        Viaje.objects.create(
            espacio=espacio_familiar, nombre='Otro viaje',
            fecha_inicio=date(2026, 2, 1), fecha_fin=date(2026, 2, 10),
        )
        Movimiento.objects.create(
            usuario=usuario,
            espacio=espacio_familiar,
            viaje=viaje_mio,
            fecha=date(2026, 1, 12),
            tipo='EGRESO',
            ambito='PERSONAL',
            categoria=categoria_egreso,
            monto=Decimal('30000'),
            metodo_pago=metodo_efectivo,
        )
        personal = obtener_espacio_personal(usuario)
        copiar_datos_familia_a_personal(usuario, espacio_familiar.id)

        copias = Viaje.objects.filter(espacio=personal)
        assert copias.count() == 1
        assert copias.first().nombre == 'Mi viaje'

    def test_datos_originales_no_se_modifican(
        self, usuario, familia, movimiento_efectivo, espacio_familiar
    ):
        copiar_datos_familia_a_personal(usuario, espacio_familiar.id)

        movimiento_efectivo.refresh_from_db()
        assert movimiento_efectivo.espacio_id == espacio_familiar.id
        assert movimiento_efectivo.origen_familia_id is None


# ── Salida completa ──────────────────────────────────────────────────────────

class TestSalidaFamilia:
    def test_salida_unico_miembro_disuelve(
        self, usuario, familia, movimiento_efectivo, espacio_familiar
    ):
        resultado = salir_de_familia(usuario)

        assert resultado['disolucion'] is True
        assert not PertenenciaEspacio.objects.get(
            usuario=usuario, espacio=espacio_familiar,
        ).activo

        personal = obtener_espacio_personal(usuario)
        assert Movimiento.objects.filter(espacio=personal).count() == 1

        espacio_familiar.refresh_from_db()
        assert espacio_familiar.archivado is True

    def test_salida_2_miembros_ambos_reciben_copia(self, familia, metodo_efectivo, espacio_familiar):
        admin = Usuario.objects.create_user(
            username='a@test.com', email='a@test.com',
            password='test1234', firebase_uid='uid-a',
            rol='ADMIN',
        )
        miembro = Usuario.objects.create_user(
            username='b@test.com', email='b@test.com',
            password='test1234', firebase_uid='uid-b',
            rol='ADMIN',
        )
        PertenenciaEspacio.objects.create(
            usuario=admin, espacio=espacio_familiar, rol=PertenenciaEspacio.ROL_ADMIN,
        )
        PertenenciaEspacio.objects.create(
            usuario=miembro, espacio=espacio_familiar, rol=PertenenciaEspacio.ROL_ADMIN,
        )
        cat = Categoria.objects.create(nombre='Comida', tipo='EGRESO', espacio=espacio_familiar)
        Movimiento.objects.create(
            usuario=admin, espacio=espacio_familiar, fecha=date(2026, 3, 1),
            tipo='EGRESO', ambito='COMUN', categoria=cat,
            monto=50000, metodo_pago=metodo_efectivo,
        )
        Movimiento.objects.create(
            usuario=miembro, espacio=espacio_familiar, fecha=date(2026, 3, 2),
            tipo='EGRESO', ambito='PERSONAL', categoria=cat,
            monto=30000, metodo_pago=metodo_efectivo,
        )

        resultado = salir_de_familia(admin)

        assert resultado['disolucion'] is True
        assert set(resultado['miembros_con_copia']) == {admin.pk, miembro.pk}

        admin.refresh_from_db()
        miembro.refresh_from_db()
        assert not PertenenciaEspacio.objects.get(
            usuario=admin, espacio=espacio_familiar,
        ).activo
        assert not PertenenciaEspacio.objects.get(
            usuario=miembro, espacio=espacio_familiar,
        ).activo

        personal_admin = obtener_espacio_personal(admin)
        personal_miembro = obtener_espacio_personal(miembro)
        assert Movimiento.objects.filter(espacio=personal_admin).count() == 1
        assert Movimiento.objects.filter(espacio=personal_miembro).count() == 1

    def test_salida_3_miembros_no_disuelve(self, familia, metodo_efectivo, espacio_familiar):
        admin = Usuario.objects.create_user(
            username='a@test.com', email='a@test.com',
            password='test1234', firebase_uid='uid-a',
            rol='ADMIN',
        )
        otro_admin = Usuario.objects.create_user(
            username='b@test.com', email='b@test.com',
            password='test1234', firebase_uid='uid-b',
            rol='ADMIN',
        )
        sale = Usuario.objects.create_user(
            username='c@test.com', email='c@test.com',
            password='test1234', firebase_uid='uid-c',
            rol='MIEMBRO',
        )
        for u, rol in (
            (admin, PertenenciaEspacio.ROL_ADMIN),
            (otro_admin, PertenenciaEspacio.ROL_ADMIN),
            (sale, PertenenciaEspacio.ROL_MIEMBRO),
        ):
            PertenenciaEspacio.objects.create(
                usuario=u, espacio=espacio_familiar, rol=rol,
            )
        cat = Categoria.objects.create(nombre='Varios', tipo='EGRESO', espacio=espacio_familiar)
        Movimiento.objects.create(
            usuario=sale, espacio=espacio_familiar, fecha=date(2026, 4, 1),
            tipo='EGRESO', ambito='PERSONAL', categoria=cat,
            monto=20000, metodo_pago=metodo_efectivo,
        )

        resultado = salir_de_familia(sale)

        assert resultado['disolucion'] is False
        assert resultado['miembros_con_copia'] == [sale.pk]

        sale.refresh_from_db()
        otro_admin.refresh_from_db()
        assert not PertenenciaEspacio.objects.get(
            usuario=sale, espacio=espacio_familiar,
        ).activo
        assert PertenenciaEspacio.objects.get(
            usuario=otro_admin, espacio=espacio_familiar,
        ).activo

        personal_sale = obtener_espacio_personal(sale)
        assert Movimiento.objects.filter(espacio=personal_sale).count() == 1

        espacio_familiar.refresh_from_db()
        assert espacio_familiar.archivado is False

    def test_pertenencia_espacio_desactivada_tras_salida(
        self, usuario, familia, movimiento_efectivo, espacio_familiar
    ):
        salir_de_familia(usuario)

        pertenencia = PertenenciaEspacio.objects.get(
            usuario=usuario, espacio=espacio_familiar,
        )
        assert not pertenencia.activo

    def test_invitaciones_del_saliente_se_eliminan(self, usuario, espacio_familiar):
        InvitacionPendiente.objects.create(
            espacio=espacio_familiar, invitador=usuario, email='x@test.com',
        )
        salir_de_familia(usuario)
        assert not InvitacionPendiente.objects.filter(
            invitador=usuario, espacio=espacio_familiar,
        ).exists()


# ── Endpoint API ─────────────────────────────────────────────────────────────

class TestEndpointSalir:
    def test_get_pre_check(self, client, usuario, familia, auth_header):
        resp = client.get('/api/usuarios/familia/salir/', **auth_header)
        assert resp.status_code == status.HTTP_200_OK
        assert 'puede_salir' in resp.data

    def test_post_ejecuta_salida(
        self, client, usuario, familia, movimiento_efectivo, auth_header, espacio_familiar
    ):
        resp = client.post('/api/usuarios/familia/salir/', **auth_header)
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['disolucion'] is True
        assert not PertenenciaEspacio.objects.get(
            usuario=usuario, espacio=espacio_familiar,
        ).activo

    def test_post_sin_familia_400(self, client, usuario, auth_header, espacio_familiar):
        PertenenciaEspacio.objects.filter(
            usuario=usuario, espacio=espacio_familiar,
        ).update(activo=False)
        resp = client.post('/api/usuarios/familia/salir/', **auth_header)
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_post_admin_unico_con_otros_400(
        self, client, usuario, familia, auth_header, espacio_familiar
    ):
        otro = Usuario.objects.create_user(
            username='otro@test.com', email='otro@test.com',
            password='test1234', firebase_uid='uid-otro-ep',
            rol='MIEMBRO',
        )
        PertenenciaEspacio.objects.create(
            usuario=otro, espacio=espacio_familiar, rol=PertenenciaEspacio.ROL_MIEMBRO,
        )
        resp = client.post('/api/usuarios/familia/salir/', **auth_header)
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert 'administrador' in resp.data['error'].lower()
