"""Comprueba que pytest usa una base aislada y no finanzas_db."""

from django.db import connection

from tests.support.db_guard import es_base_de_prueba, exigir_base_de_prueba


def test_nombres_base_de_prueba():
    assert es_base_de_prueba('test_finanzas_db')
    assert not es_base_de_prueba('finanzas_db')


def test_sesion_usa_base_test():
    nombre = connection.settings_dict['NAME']
    exigir_base_de_prueba(nombre)
