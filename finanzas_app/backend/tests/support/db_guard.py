"""Verificación de que los tests no escriben en la BD de desarrollo."""

TEST_DB_PREFIX = 'test_'

MENSAJE_BD_DESARROLLO = (
    'Los tests deben ejecutarse contra una base de datos test_* (pytest-django la crea '
    'automáticamente). No ejecutes código de prueba con python -c ni manage.py shell '
    'contra finanzas_db. Usa: docker-compose exec web pytest tests/ -v'
)


def es_base_de_prueba(nombre: str) -> bool:
    return nombre.startswith(TEST_DB_PREFIX)


def exigir_base_de_prueba(nombre: str) -> None:
    if not es_base_de_prueba(nombre):
        raise RuntimeError(f'{MENSAJE_BD_DESARROLLO} Base actual: "{nombre}".')
