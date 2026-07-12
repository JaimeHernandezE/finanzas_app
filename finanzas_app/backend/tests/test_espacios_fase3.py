# Tests de la Fase 3 multitenant: espejo Familia ↔ Espacio, sincronización de
# membresías vía señales, backfill del FK espacio y comando de validación.

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from applications.espacios.models import Espacio, PertenenciaEspacio
from applications.espacios.services import espacio_para_familia
from applications.usuarios.models import Familia


def _espejo(familia):
    return Espacio.objects.filter(familia_origen=familia).first()


# ── Señales: espejo Familia → Espacio ────────────────────────────────────────

class TestEspejoFamilia:
    def test_crear_familia_crea_espacio_espejo(self, familia):
        espejo = _espejo(familia)
        assert espejo is not None
        assert espejo.tipo == Espacio.TIPO_FAMILIAR
        assert espejo.nombre == familia.nombre

    def test_renombrar_familia_sincroniza_espacio(self, familia):
        familia.nombre = 'Familia Renombrada'
        familia.save()
        assert _espejo(familia).nombre == 'Familia Renombrada'

    def test_espacio_para_familia_idempotente(self, familia):
        e1 = espacio_para_familia(familia)
        e2 = espacio_para_familia(familia)
        assert e1.id == e2.id
        assert Espacio.objects.filter(familia_origen=familia).count() == 1


# ── Señales: membresía Usuario.familia → PertenenciaEspacio ──────────────────

class TestSincronizacionMembresia:
    def test_usuario_con_familia_tiene_pertenencia_al_espejo(self, usuario, familia):
        espejo = _espejo(familia)
        pertenencia = PertenenciaEspacio.objects.get(usuario=usuario, espacio=espejo)
        assert pertenencia.activo
        assert pertenencia.rol == PertenenciaEspacio.ROL_ADMIN  # usuario fixture es ADMIN

    def test_cambio_de_rol_se_espeja(self, usuario, familia):
        usuario.rol = 'MIEMBRO'
        usuario.save(update_fields=['rol'])
        pertenencia = PertenenciaEspacio.objects.get(
            usuario=usuario, espacio=_espejo(familia)
        )
        assert pertenencia.rol == PertenenciaEspacio.ROL_MIEMBRO

    def test_salir_de_familia_desactiva_pertenencia(self, usuario, familia):
        espejo = _espejo(familia)
        usuario.familia = None
        usuario.save(update_fields=['familia'])
        pertenencia = PertenenciaEspacio.objects.get(usuario=usuario, espacio=espejo)
        assert not pertenencia.activo
        # El espacio familiar persiste (registro histórico).
        assert Espacio.objects.filter(pk=espejo.pk).exists()

    def test_cambiar_de_familia_desactiva_la_anterior(self, usuario, familia, otra_familia):
        espejo_original = _espejo(familia)
        usuario.familia = otra_familia
        usuario.save(update_fields=['familia'])
        assert not PertenenciaEspacio.objects.get(
            usuario=usuario, espacio=espejo_original
        ).activo
        assert PertenenciaEspacio.objects.get(
            usuario=usuario, espacio=_espejo(otra_familia)
        ).activo

    def test_deshabilitar_usuario_espeja_activo(self, usuario, familia):
        usuario.activo = False
        usuario.save(update_fields=['activo'])
        pertenencia = PertenenciaEspacio.objects.get(
            usuario=usuario, espacio=_espejo(familia)
        )
        assert not pertenencia.activo


# ── Backfill y validación ─────────────────────────────────────────────────────

class TestBackfillYValidacion:
    def test_backfill_asigna_espacio_desde_familia(
        self, familia, usuario, categoria_familiar, categoria_global
    ):
        # Simular fila legacy (pre dual-write): .update() no pasa por señales.
        type(categoria_familiar).objects.filter(pk=categoria_familiar.pk).update(espacio=None)
        categoria_familiar.refresh_from_db()
        assert categoria_familiar.espacio_id is None
        call_command('backfill_espacios', verbosity=0)
        categoria_familiar.refresh_from_db()
        categoria_global.refresh_from_db()
        assert categoria_familiar.espacio_id == _espejo(familia).id
        # Las categorías globales (familia NULL) siguen globales.
        assert categoria_global.espacio_id is None

    def test_backfill_no_pisa_espacio_ya_asignado(self, familia, usuario, categoria_familiar):
        otro = Espacio.objects.create(tipo=Espacio.TIPO_FAMILIAR, nombre='Otro espacio')
        categoria_familiar.espacio = otro
        categoria_familiar.save(update_fields=['espacio'])
        call_command('backfill_espacios', verbosity=0)
        categoria_familiar.refresh_from_db()
        assert categoria_familiar.espacio_id == otro.id

    def test_backfill_es_idempotente(self, familia, usuario, categoria_familiar):
        call_command('backfill_espacios', verbosity=0)
        call_command('backfill_espacios', verbosity=0)
        assert Espacio.objects.filter(familia_origen=familia).count() == 1

    def test_validar_ok_tras_backfill(self, familia, usuario, categoria_familiar, capsys):
        call_command('backfill_espacios', verbosity=0)
        call_command('validar_espacios')
        out = capsys.readouterr().out
        assert 'validar_espacios OK' in out

    def test_validar_falla_con_fila_sin_espacio(self, familia, usuario, categoria_familiar):
        # Fila legacy sin espacio (creada antes del dual-write) → validar debe fallar.
        type(categoria_familiar).objects.filter(pk=categoria_familiar.pk).update(espacio=None)
        with pytest.raises(CommandError):
            call_command('validar_espacios')

    def test_validar_falla_con_fila_desalineada(self, familia, usuario, categoria_familiar):
        call_command('backfill_espacios', verbosity=0)
        intruso = Espacio.objects.create(tipo=Espacio.TIPO_FAMILIAR, nombre='Intruso')
        categoria_familiar.espacio = intruso
        categoria_familiar.save(update_fields=['espacio'])
        with pytest.raises(CommandError):
            call_command('validar_espacios')

    def test_familia_nueva_post_migracion_queda_cubierta(self, db):
        # Simula el flujo de registro: Familia + primer usuario creados en runtime.
        from applications.usuarios.models import Usuario

        familia = Familia.objects.create(nombre='Familia Runtime')
        Usuario.objects.create_user(
            username='runtime@test.com',
            email='runtime@test.com',
            password='test1234',
            firebase_uid='uid-runtime',
            familia=familia,
            rol='ADMIN',
        )
        call_command('backfill_espacios', verbosity=0)
        call_command('validar_espacios')
