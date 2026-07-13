# tests/test_formato_moneda.py

from decimal import Decimal

from applications.usuarios.formato_moneda import formatear_monto_codigo


def test_formatear_clp_sin_decimales():
    assert formatear_monto_codigo(Decimal('1500000'), 'CLP') == '$1.500.000'


def test_formatear_usd_con_decimales():
    assert formatear_monto_codigo(Decimal('200000'), 'USD') == 'US$200.000,00'
