# Tests del gate de registro con InvitacionAcceso (Django Admin).

from unittest.mock import patch

import pytest
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APIClient

from applications.espacios.models import Espacio, PertenenciaEspacio
from applications.usuarios.models import Familia, InvitacionAcceso, InvitacionPendiente, Usuario


@pytest.fixture(autouse=True)
def limpiar_cache_throttle():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def client():
    return APIClient()


def _decoded_firebase(email='nuevo@test.com', uid='uid-nuevo-test', email_verified=True):
    return (
        {
            'email': email,
            'uid': uid,
            'name': 'Nuevo Usuario',
            'email_verified': email_verified,
        },
        None,
    )


class TestInvitacionAccesoRegistro:
    def test_registro_sin_invitacion_acceso_403(self, client, db, usuario):
        with patch(
            'applications.usuarios.views.obtener_usuario_desde_token',
            return_value=_decoded_firebase(),
        ):
            resp = client.post('/api/usuarios/registro/', HTTP_AUTHORIZATION='Bearer x')
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert 'invitación de acceso' in resp.data['error']
        assert not Usuario.objects.filter(email='nuevo@test.com').exists()

    def test_registro_con_invitacion_acceso_crea_usuario_sin_familia(
        self, client, db, usuario, espacio_familiar,
    ):
        InvitacionAcceso.objects.create(email='nuevo@test.com', creado_por=usuario)
        with patch(
            'applications.usuarios.views.obtener_usuario_desde_token',
            return_value=_decoded_firebase(),
        ):
            resp = client.post('/api/usuarios/registro/', HTTP_AUTHORIZATION='Bearer x')
        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.data['creado'] is True

        nuevo = Usuario.objects.get(email='nuevo@test.com')
        assert nuevo.rol == 'MIEMBRO'
        assert not InvitacionAcceso.objects.filter(email__iexact='nuevo@test.com').exists()
        assert PertenenciaEspacio.objects.filter(
            usuario=nuevo,
            espacio__tipo=Espacio.TIPO_PERSONAL,
            activo=True,
        ).exists()
        assert not PertenenciaEspacio.objects.filter(
            usuario=nuevo,
            espacio__tipo=Espacio.TIPO_FAMILIAR,
        ).exists()

    def test_invitacion_familiar_sola_no_permite_registro(
        self, client, db, usuario, espacio_familiar,
    ):
        InvitacionPendiente.objects.create(
            espacio=espacio_familiar,
            email='nuevo@test.com',
            invitador=usuario,
        )
        with patch(
            'applications.usuarios.views.obtener_usuario_desde_token',
            return_value=_decoded_firebase(),
        ):
            resp = client.post('/api/usuarios/registro/', HTTP_AUTHORIZATION='Bearer x')
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert not Usuario.objects.filter(email='nuevo@test.com').exists()
        assert InvitacionPendiente.objects.filter(email__iexact='nuevo@test.com').exists()

    def test_primer_usuario_invitado_bootstrap_familia_admin(self, client, db):
        InvitacionAcceso.objects.create(email='fundador@test.com')
        with patch(
            'applications.usuarios.views.obtener_usuario_desde_token',
            return_value=_decoded_firebase(email='fundador@test.com', uid='uid-fundador'),
        ):
            resp = client.post('/api/usuarios/registro/', HTTP_AUTHORIZATION='Bearer x')
        assert resp.status_code == status.HTTP_201_CREATED

        nuevo = Usuario.objects.get(email='fundador@test.com')
        assert nuevo.rol == 'ADMIN'
        assert Familia.objects.count() == 1
        assert PertenenciaEspacio.objects.filter(
            usuario=nuevo,
            espacio__tipo=Espacio.TIPO_FAMILIAR,
            rol=PertenenciaEspacio.ROL_ADMIN,
        ).exists()

    def test_registro_email_existente_no_consume_invitacion(self, client, db, usuario):
        InvitacionAcceso.objects.create(email='otro@test.com')
        with patch(
            'applications.usuarios.views.obtener_usuario_desde_token',
            return_value=_decoded_firebase(email=usuario.email, uid=usuario.firebase_uid),
        ):
            resp = client.post('/api/usuarios/registro/', HTTP_AUTHORIZATION='Bearer x')
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['creado'] is False
        assert InvitacionAcceso.objects.filter(email__iexact='otro@test.com').exists()
