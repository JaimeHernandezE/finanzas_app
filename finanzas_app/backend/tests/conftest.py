# backend/tests/conftest.py

import pytest
from unittest.mock import patch
from rest_framework import status
from rest_framework.response import Response

from applications.usuarios.models import Usuario, Familia
from applications.finanzas.models import Categoria, IngresoComun, MetodoPago, Movimiento, Tarjeta
from applications.espacios.models import PertenenciaEspacio
from applications.espacios.services import espacio_para_familia


# ── Fixtures de base de datos ─────────────────────────────────────────────────

@pytest.fixture
def familia(db):
    """Familia de prueba reutilizable en todos los tests."""
    return Familia.objects.create(nombre='Familia Test')


@pytest.fixture
def espacio_familiar(familia):
    """Espacio FAMILIAR espejo de la familia de prueba."""
    return espacio_para_familia(familia)


@pytest.fixture
def usuario(db, familia, espacio_familiar):
    """Usuario admin de prueba asociado al espacio familiar."""
    u = Usuario.objects.create_user(
        username='jaime@test.com',
        email='jaime@test.com',
        password='test1234',
        firebase_uid='uid-jaime-test',
        rol='ADMIN',
        first_name='Jaime',
    )
    PertenenciaEspacio.objects.create(
        usuario=u, espacio=espacio_familiar, rol=PertenenciaEspacio.ROL_ADMIN,
    )
    return u


@pytest.fixture
def usuario_2(db, familia, espacio_familiar):
    """Segundo usuario del mismo espacio familiar (para tests de permisos)."""
    u = Usuario.objects.create_user(
        username='glori@test.com',
        email='glori@test.com',
        password='test1234',
        firebase_uid='uid-glori-test',
        rol='MIEMBRO',
        first_name='Glori',
    )
    PertenenciaEspacio.objects.create(
        usuario=u, espacio=espacio_familiar, rol=PertenenciaEspacio.ROL_MIEMBRO,
    )
    return u


@pytest.fixture
def otra_familia(db):
    """Familia distinta para verificar aislamiento de datos."""
    return Familia.objects.create(nombre='Otra Familia')


@pytest.fixture
def usuario_otra_familia(db, otra_familia):
    """Usuario de otra familia — no debe ver datos de 'familia'."""
    espacio = espacio_para_familia(otra_familia)
    u = Usuario.objects.create_user(
        username='externo@test.com',
        email='externo@test.com',
        password='test1234',
        firebase_uid='uid-externo-test',
        rol='ADMIN',
    )
    PertenenciaEspacio.objects.create(
        usuario=u, espacio=espacio, rol=PertenenciaEspacio.ROL_ADMIN,
    )
    return u


# ── Fixture de autenticación ──────────────────────────────────────────────────

# Bearer token (sin prefijo) → usuario. Evita el bug de un único global cuando un test
# pide auth_header y auth_header_2: el último fixture ya no pisa al usuario del primero.
_token_a_usuario: dict[str, Usuario] = {}


def _mock_get_usuario_autenticado(request):
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None, Response(
            {'error': 'Token no proporcionado.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    token = auth_header.split('Bearer ', 1)[1].strip()
    usuario = _token_a_usuario.get(token)
    if usuario is None:
        return None, Response(
            {'error': 'Usuario no registrado.'},
            status=status.HTTP_404_NOT_FOUND,
        )
    return (usuario, None)


def _make_auth_header_fixture(usuario_fixture_name, header_value, espacio_fixture_name='espacio_familiar'):
    """Genera un fixture que mockea get_usuario_autenticado para devolver el usuario del fixture."""

    @pytest.fixture
    def _fixture(request):
        usuario = request.getfixturevalue(usuario_fixture_name)
        token = header_value.split('Bearer ', 1)[1].strip()
        _token_a_usuario[token] = usuario
        headers = {'HTTP_AUTHORIZATION': header_value}
        if espacio_fixture_name:
            espacio = request.getfixturevalue(espacio_fixture_name)
            headers['HTTP_X_ESPACIO_ID'] = str(espacio.id)
        try:
            with patch(
                'applications.utils.get_usuario_autenticado',
                side_effect=_mock_get_usuario_autenticado,
            ):
                yield headers
        finally:
            _token_a_usuario.pop(token, None)

    return _fixture


auth_header = _make_auth_header_fixture('usuario', 'Bearer token-de-prueba', 'espacio_familiar')
auth_header_2 = _make_auth_header_fixture('usuario_2', 'Bearer token-de-prueba-2', 'espacio_familiar')


@pytest.fixture
def espacio_otra_familia(otra_familia):
    return espacio_para_familia(otra_familia)


auth_header_otra_familia = _make_auth_header_fixture(
    'usuario_otra_familia', 'Bearer token-otra-familia', 'espacio_otra_familia'
)

auth_header_sin_espacio = _make_auth_header_fixture(
    'usuario', 'Bearer token-de-prueba', None
)


# ── Fixtures de catálogos ─────────────────────────────────────────────────────

@pytest.fixture
def categoria_global(db):
    """Categoría global del sistema (sin familia ni usuario)."""
    return Categoria.objects.create(
        nombre='Alimentación',
        tipo='EGRESO',
        es_inversion=False,
        usuario=None,
    )


@pytest.fixture
def categoria_familiar(db, espacio_familiar):
    """Categoría perteneciente a la familia de prueba."""
    return Categoria.objects.create(
        nombre='Gastos Casa',
        tipo='EGRESO',
        es_inversion=False,
        espacio=espacio_familiar,
        usuario=None,
    )


@pytest.fixture
def categoria_personal(db, espacio_familiar, usuario):
    """Categoría personal del usuario de prueba."""
    return Categoria.objects.create(
        nombre='Honorarios',
        tipo='INGRESO',
        es_inversion=False,
        espacio=espacio_familiar,
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
def movimiento_efectivo(db, usuario, espacio_familiar, categoria_egreso, metodo_efectivo):
    """Movimiento simple de efectivo sin cuotas."""
    return Movimiento.objects.create(
        usuario=usuario,
        espacio=espacio_familiar,
        fecha='2026-03-15',
        tipo='EGRESO',
        ambito='PERSONAL',
        categoria=categoria_egreso,
        monto='45000.00',
        comentario='Bencina',
        metodo_pago=metodo_efectivo,
    )


@pytest.fixture
def movimiento_credito(db, usuario, espacio_familiar, categoria_egreso, metodo_credito, tarjeta):
    """Movimiento con crédito — el signal genera cuotas automáticamente."""
    return Movimiento.objects.create(
        usuario=usuario,
        espacio=espacio_familiar,
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
def movimiento_comun(db, usuario, espacio_familiar, categoria_egreso, metodo_efectivo):
    """Movimiento de ámbito común."""
    return Movimiento.objects.create(
        usuario=usuario,
        espacio=espacio_familiar,
        fecha='2026-03-10',
        tipo='EGRESO',
        ambito='COMUN',
        categoria=categoria_egreso,
        monto='62300.00',
        comentario='Agua + Luz',
        metodo_pago=metodo_efectivo,
    )


# ── Fixtures liquidación / ingresos comunes (compartidos con test_recalculo) ─

@pytest.fixture
def ingreso_jaime(db, usuario, espacio_familiar):
    return IngresoComun.objects.create(
        usuario=usuario,
        espacio=espacio_familiar,
        mes='2026-03-01',
        monto='1800000.00',
        origen='Sueldo',
    )


@pytest.fixture
def ingreso_glori(db, usuario_2, espacio_familiar):
    return IngresoComun.objects.create(
        usuario=usuario_2,
        espacio=espacio_familiar,
        mes='2026-03-01',
        monto='1000000.00',
        origen='Sueldo',
    )


@pytest.fixture
def gasto_comun_jaime(db, usuario, espacio_familiar, categoria_egreso, metodo_efectivo):
    return Movimiento.objects.create(
        usuario=usuario,
        espacio=espacio_familiar,
        fecha='2026-03-10',
        tipo='EGRESO',
        ambito='COMUN',
        categoria=categoria_egreso,
        monto='320000.00',
        comentario='Supermercado',
        metodo_pago=metodo_efectivo,
    )


@pytest.fixture
def gasto_comun_glori(db, usuario_2, espacio_familiar, categoria_egreso, metodo_efectivo):
    return Movimiento.objects.create(
        usuario=usuario_2,
        espacio=espacio_familiar,
        fecha='2026-03-12',
        tipo='EGRESO',
        ambito='COMUN',
        categoria=categoria_egreso,
        monto='180000.00',
        comentario='Farmacia',
        metodo_pago=metodo_efectivo,
    )
