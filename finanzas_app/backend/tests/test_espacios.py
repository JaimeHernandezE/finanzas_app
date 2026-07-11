# Tests de la Fase 1 multitenant: modelos de espacios, servicio de espacio
# personal, resolutor de espacio activo y base de aislamiento TenantManager.

import pytest
from rest_framework import status
from rest_framework.test import APIRequestFactory

from applications.espacios.contexto import HEADER_ESPACIO, resolver_espacio_activo
from applications.espacios.models import (
    Espacio,
    PertenenciaEspacio,
    TenantManager,
    TenantScopeError,
)
from applications.espacios.services import crear_espacio_personal, obtener_espacio_personal


@pytest.fixture
def rf():
    return APIRequestFactory()


def _request(rf, espacio_id=None):
    headers = {}
    if espacio_id is not None:
        headers[f'HTTP_{HEADER_ESPACIO.upper().replace("-", "_")}'] = str(espacio_id)
    return rf.get('/api/cualquiera/', **headers)


# ── Servicio: espacio personal ────────────────────────────────────────────────

class TestEspacioPersonal:
    def test_crear_espacio_personal(self, usuario):
        espacio = crear_espacio_personal(usuario)
        assert espacio.tipo == Espacio.TIPO_PERSONAL
        assert espacio.es_personal
        pertenencia = PertenenciaEspacio.objects.get(usuario=usuario, espacio=espacio)
        assert pertenencia.rol == PertenenciaEspacio.ROL_ADMIN
        assert pertenencia.activo

    def test_crear_es_idempotente(self, usuario):
        primero = crear_espacio_personal(usuario)
        segundo = crear_espacio_personal(usuario)
        assert primero.id == segundo.id
        assert PertenenciaEspacio.objects.filter(
            usuario=usuario, espacio__tipo=Espacio.TIPO_PERSONAL
        ).count() == 1

    def test_obtener_sin_espacio_devuelve_none(self, usuario):
        assert obtener_espacio_personal(usuario) is None

    def test_espacios_personales_de_dos_usuarios_son_distintos(self, usuario, usuario_2):
        e1 = crear_espacio_personal(usuario)
        e2 = crear_espacio_personal(usuario_2)
        assert e1.id != e2.id


# ── Resolutor de espacio activo ───────────────────────────────────────────────

class TestResolverEspacioActivo:
    def test_sin_header_usa_espacio_personal(self, rf, usuario):
        personal = crear_espacio_personal(usuario)
        espacio, err = resolver_espacio_activo(_request(rf), usuario)
        assert err is None
        assert espacio.id == personal.id

    def test_sin_header_y_sin_espacio_personal_403(self, rf, usuario):
        espacio, err = resolver_espacio_activo(_request(rf), usuario)
        assert espacio is None
        assert err.status_code == status.HTTP_403_FORBIDDEN

    def test_header_no_numerico_400(self, rf, usuario):
        espacio, err = resolver_espacio_activo(_request(rf, 'abc'), usuario)
        assert espacio is None
        assert err.status_code == status.HTTP_400_BAD_REQUEST

    def test_header_de_espacio_propio(self, rf, usuario):
        personal = crear_espacio_personal(usuario)
        espacio, err = resolver_espacio_activo(_request(rf, personal.id), usuario)
        assert err is None
        assert espacio.id == personal.id

    def test_header_de_espacio_ajeno_403_sin_fallback(self, rf, usuario, usuario_2):
        crear_espacio_personal(usuario)
        ajeno = crear_espacio_personal(usuario_2)
        espacio, err = resolver_espacio_activo(_request(rf, ajeno.id), usuario)
        # Nunca degradar al espacio personal: 403 explícito.
        assert espacio is None
        assert err.status_code == status.HTTP_403_FORBIDDEN

    def test_header_de_espacio_inexistente_403(self, rf, usuario):
        crear_espacio_personal(usuario)
        espacio, err = resolver_espacio_activo(_request(rf, 999999), usuario)
        assert espacio is None
        assert err.status_code == status.HTTP_403_FORBIDDEN

    def test_pertenencia_inactiva_403(self, rf, usuario):
        personal = crear_espacio_personal(usuario)
        PertenenciaEspacio.objects.filter(usuario=usuario, espacio=personal).update(activo=False)
        espacio, err = resolver_espacio_activo(_request(rf, personal.id), usuario)
        assert espacio is None
        assert err.status_code == status.HTTP_403_FORBIDDEN

    def test_espacio_inactivo_403(self, rf, usuario):
        personal = crear_espacio_personal(usuario)
        Espacio.objects.filter(pk=personal.pk).update(activo=False)
        espacio, err = resolver_espacio_activo(_request(rf, personal.id), usuario)
        assert espacio is None
        assert err.status_code == status.HTTP_403_FORBIDDEN


# ── Base de aislamiento: TenantManager ────────────────────────────────────────

class TestTenantManager:
    def _manager(self):
        manager = TenantManager()
        manager.model = Espacio  # cualquier modelo sirve para probar el guard
        return manager

    def test_acceso_sin_espacio_lanza_error(self):
        with pytest.raises(TenantScopeError):
            self._manager().get_queryset()

    def test_en_espacio_none_lanza_error(self):
        with pytest.raises(TenantScopeError):
            self._manager().en_espacio(None)


# ── Reglas de modelo ──────────────────────────────────────────────────────────

class TestModelos:
    def test_pertenencia_unica_por_usuario_y_espacio(self, usuario):
        espacio = crear_espacio_personal(usuario)
        with pytest.raises(Exception):  # IntegrityError (unique_usuario_espacio)
            PertenenciaEspacio.objects.create(
                usuario=usuario, espacio=espacio, rol=PertenenciaEspacio.ROL_MIEMBRO
            )

    def test_modo_reparto_default_proporcional(self, db):
        espacio = Espacio.objects.create(tipo=Espacio.TIPO_FAMILIAR, nombre='Familia X')
        assert espacio.modo_reparto == Espacio.REPARTO_PROPORCIONAL
        assert not espacio.archivado
        assert espacio.activo

    def test_config_respaldo_por_usuario(self, usuario):
        from applications.espacios.models import ConfiguracionRespaldoUsuario

        config = ConfiguracionRespaldoUsuario.objects.create(
            usuario=usuario,
            drive_folder_id='folder-123',
            sheet_id='sheet-456',
        )
        assert usuario.config_respaldo.pk == config.pk
