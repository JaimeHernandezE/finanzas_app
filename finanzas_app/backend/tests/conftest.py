# backend/tests/conftest.py

import pytest
from unittest.mock import patch
from applications.usuarios.models import Usuario, Familia
from applications.finanzas.models import Categoria, MetodoPago, Tarjeta


# ── Fixtures de base de datos ─────────────────────────────────────────────────

@pytest.fixture
def familia(db):
    """Familia de prueba reutilizable en todos los tests."""
    return Familia.objects.create(nombre='Familia Test')


@pytest.fixture
def usuario(db, familia):
    """Usuario admin de prueba asociado a la familia."""
    return Usuario.objects.create_user(
        username='jaime@test.com',
        email='jaime@test.com',
        password='test1234',
        firebase_uid='uid-jaime-test',
        familia=familia,
        rol='ADMIN',
        first_name='Jaime',
    )


@pytest.fixture
def usuario_2(db, familia):
    """Segundo usuario de la misma familia (para tests de permisos)."""
    return Usuario.objects.create_user(
        username='glori@test.com',
        email='glori@test.com',
        password='test1234',
        firebase_uid='uid-glori-test',
        familia=familia,
        rol='MIEMBRO',
        first_name='Glori',
    )


@pytest.fixture
def otra_familia(db):
    """Familia distinta para verificar aislamiento de datos."""
    return Familia.objects.create(nombre='Otra Familia')


@pytest.fixture
def usuario_otra_familia(db, otra_familia):
    """Usuario de otra familia — no debe ver datos de 'familia'."""
    return Usuario.objects.create_user(
        username='externo@test.com',
        email='externo@test.com',
        password='test1234',
        firebase_uid='uid-externo-test',
        familia=otra_familia,
        rol='ADMIN',
    )


# ── Fixture de autenticación ──────────────────────────────────────────────────

# Usado por el mock de get_usuario_autenticado para devolver el usuario del test actual.
_current_usuario = None


def _mock_get_usuario(request):
    return (_current_usuario, None)


def _make_auth_header_fixture(usuario_fixture_name, header_value):
    """Genera un fixture que mockea get_usuario_autenticado para devolver el usuario del fixture."""

    @pytest.fixture
    def _fixture(request):
        global _current_usuario
        usuario = request.getfixturevalue(usuario_fixture_name)
        _current_usuario = usuario
        try:
            with patch('applications.utils.get_usuario_autenticado', side_effect=_mock_get_usuario):
                yield {'HTTP_AUTHORIZATION': header_value}
        finally:
            _current_usuario = None

    return _fixture


auth_header = _make_auth_header_fixture('usuario', 'Bearer token-de-prueba')
auth_header_2 = _make_auth_header_fixture('usuario_2', 'Bearer token-de-prueba-2')
auth_header_otra_familia = _make_auth_header_fixture('usuario_otra_familia', 'Bearer token-otra-familia')


# ── Fixtures de catálogos ─────────────────────────────────────────────────────

@pytest.fixture
def categoria_global(db):
    """Categoría global del sistema (sin familia ni usuario)."""
    return Categoria.objects.create(
        nombre='Alimentación',
        tipo='EGRESO',
        es_inversion=False,
        familia=None,
        usuario=None,
    )


@pytest.fixture
def categoria_familiar(db, familia):
    """Categoría perteneciente a la familia de prueba."""
    return Categoria.objects.create(
        nombre='Gastos Casa',
        tipo='EGRESO',
        es_inversion=False,
        familia=familia,
        usuario=None,
    )


@pytest.fixture
def categoria_personal(db, familia, usuario):
    """Categoría personal del usuario de prueba."""
    return Categoria.objects.create(
        nombre='Honorarios',
        tipo='INGRESO',
        es_inversion=False,
        familia=familia,
        usuario=usuario,
    )


@pytest.fixture
def metodos_pago(db):
    """Crea los tres métodos de pago estándar."""
    return MetodoPago.objects.bulk_create([
        MetodoPago(nombre='Efectivo', tipo='EFECTIVO'),
        MetodoPago(nombre='Débito', tipo='DEBITO'),
        MetodoPago(nombre='Crédito', tipo='CREDITO'),
    ])


@pytest.fixture
def tarjeta(db, usuario):
    """Tarjeta de crédito del usuario de prueba."""
    return Tarjeta.objects.create(
        nombre='Visa BCI',
        banco='BCI',
        usuario=usuario,
    )


# ── Fixtures de movimientos ───────────────────────────────────────────────────

@pytest.fixture
def metodo_efectivo(db):
    return MetodoPago.objects.create(nombre='Efectivo', tipo='EFECTIVO')


@pytest.fixture
def metodo_debito(db):
    return MetodoPago.objects.create(nombre='Débito', tipo='DEBITO')


@pytest.fixture
def metodo_credito(db):
    return MetodoPago.objects.create(nombre='Crédito', tipo='CREDITO')


@pytest.fixture
def categoria_egreso(db):
    return Categoria.objects.create(
        nombre='Alimentación', tipo='EGRESO', es_inversion=False
    )


@pytest.fixture
def categoria_ingreso(db):
    return Categoria.objects.create(
        nombre='Sueldo', tipo='INGRESO', es_inversion=False
    )


@pytest.fixture
def movimiento_efectivo(db, usuario, familia, categoria_egreso, metodo_efectivo):
    """Movimiento simple de efectivo sin cuotas."""
    from applications.finanzas.models import Movimiento
    return Movimiento.objects.create(
        usuario=usuario,
        familia=familia,
        fecha='2026-03-15',
        tipo='EGRESO',
        ambito='PERSONAL',
        categoria=categoria_egreso,
        monto='45000.00',
        comentario='Bencina',
        metodo_pago=metodo_efectivo,
    )


@pytest.fixture
def movimiento_credito(db, usuario, familia, categoria_egreso, metodo_credito, tarjeta):
    """Movimiento con crédito — el signal genera cuotas automáticamente."""
    from applications.finanzas.models import Movimiento
    return Movimiento.objects.create(
        usuario=usuario,
        familia=familia,
        fecha='2026-03-01',
        tipo='EGRESO',
        ambito='PERSONAL',
        categoria=categoria_egreso,
        monto='180000.00',
        comentario='Televisor',
        metodo_pago=metodo_credito,
        tarjeta=tarjeta,
        num_cuotas=6,
    )


@pytest.fixture
def movimiento_comun(db, usuario, familia, categoria_egreso, metodo_efectivo):
    """Movimiento de ámbito común."""
    from applications.finanzas.models import Movimiento
    return Movimiento.objects.create(
        usuario=usuario,
        familia=familia,
        fecha='2026-03-10',
        tipo='EGRESO',
        ambito='COMUN',
        categoria=categoria_egreso,
        monto='62300.00',
        comentario='Agua + Luz',
        metodo_pago=metodo_efectivo,
    )
