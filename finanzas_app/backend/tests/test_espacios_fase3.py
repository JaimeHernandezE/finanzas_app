# Tests post-cutover: espacios personales, backfill y validación por espacio.

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from applications.espacios.models import Espacio, PertenenciaEspacio
from applications.espacios.services import espacio_para_familia, obtener_espacio_personal
from applications.usuarios.models import Familia, Usuario


class TestEspacioParaFamilia:
    def test_espacio_para_familia_idempotente(self, familia):
        e1 = espacio_para_familia(familia)
        e2 = espacio_para_familia(familia)
        assert e1.id == e2.id
        assert e1.tipo == Espacio.TIPO_FAMILIAR


class TestEspacioPersonal:
    def test_usuario_nuevo_tiene_espacio_personal(self, usuario):
        personal = obtener_espacio_personal(usuario)
        assert personal is not None
        assert personal.tipo == Espacio.TIPO_PERSONAL

    def test_usuario_tiene_pertenencia_familiar(self, usuario, espacio_familiar):
        assert PertenenciaEspacio.objects.filter(
            usuario=usuario, espacio=espacio_familiar, activo=True,
        ).exists()


class TestBackfillYValidacion:
    def test_backfill_asigna_espacio_personal(self, db):
        u = Usuario.objects.create_user(
            username='solo@test.com',
            email='solo@test.com',
            password='x',
            firebase_uid='uid-solo',
        )
        PertenenciaEspacio.objects.filter(usuario=u, espacio__tipo=Espacio.TIPO_PERSONAL).delete()
        call_command('backfill_espacios', verbosity=0)
        assert PertenenciaEspacio.objects.filter(
            usuario=u, espacio__tipo=Espacio.TIPO_PERSONAL, activo=True,
        ).exists()

    def test_backfill_es_idempotente(self, familia, usuario, categoria_familiar):
        call_command('backfill_espacios', verbosity=0)
        call_command('backfill_espacios', verbosity=0)
        assert espacio_para_familia(familia).id == espacio_para_familia(familia).id

    def test_validar_ok_tras_backfill(self, familia, usuario, categoria_familiar, capsys):
        call_command('backfill_espacios', verbosity=0)
        call_command('validar_espacios')
        out = capsys.readouterr().out
        assert 'validar_espacios OK' in out

    def test_validar_falla_con_fila_sin_espacio(
        self, familia, usuario, espacio_familiar, categoria_personal,
    ):
        type(categoria_personal).objects.filter(pk=categoria_personal.pk).update(espacio=None)
        with pytest.raises(CommandError):
            call_command('validar_espacios')

    def test_familia_nueva_queda_cubierta(self, db):
        familia = Familia.objects.create(nombre='Familia Runtime')
        espacio = espacio_para_familia(familia)
        Usuario.objects.create_user(
            username='runtime@test.com',
            email='runtime@test.com',
            password='test1234',
            firebase_uid='uid-runtime',
            rol='ADMIN',
        )
        PertenenciaEspacio.objects.create(
            usuario=Usuario.objects.get(email='runtime@test.com'),
            espacio=espacio,
            rol=PertenenciaEspacio.ROL_ADMIN,
        )
        call_command('backfill_espacios', verbosity=0)
        call_command('validar_espacios')
