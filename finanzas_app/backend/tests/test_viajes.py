# backend/tests/test_viajes.py

import pytest
from applications.viajes.models import Viaje, PresupuestoViaje


@pytest.fixture
def viaje(db, familia):
    return Viaje.objects.create(
        nombre='Vacaciones Llanquihue 2026',
        fecha_inicio='2026-07-01',
        fecha_fin='2026-07-15',
        color_tema='#2E86AB',
        familia=familia,
        es_activo=False,
        archivado=False,
    )


@pytest.fixture
def viaje_2(db, familia):
    return Viaje.objects.create(
        nombre='Fin de semana Valdivia',
        fecha_inicio='2026-04-18',
        fecha_fin='2026-04-20',
        color_tema='#c8f060',
        familia=familia,
        es_activo=False,
        archivado=False,
    )


@pytest.mark.django_db
class TestViajes:

    def test_lista_viajes_activos(self, client, auth_header, viaje, viaje_2):
        res = client.get('/api/viajes/', **auth_header)
        assert res.status_code == 200
        assert len(res.json()) == 2

    def test_no_lista_archivados_por_defecto(self, client, auth_header, viaje):
        viaje.archivado = True
        viaje.save()
        res = client.get('/api/viajes/', **auth_header)
        assert res.status_code == 200
        assert len(res.json()) == 0

    def test_lista_archivados_con_param(self, client, auth_header, viaje):
        viaje.archivado = True
        viaje.save()
        res = client.get('/api/viajes/?archivado=true', **auth_header)
        assert res.status_code == 200
        assert len(res.json()) == 1

    def test_crear_viaje(self, client, auth_header):
        res = client.post(
            '/api/viajes/',
            data={
                'nombre':       'Nuevo viaje',
                'fecha_inicio': '2026-09-01',
                'fecha_fin':    '2026-09-07',
                'color_tema':   '#f060c8',
            },
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 201
        assert res.json()['nombre'] == 'Nuevo viaje'

    def test_activar_viaje_desactiva_los_demas(
        self, client, auth_header, viaje, viaje_2
    ):
        """Al activar un viaje, los demás quedan desactivados."""
        client.post(f'/api/viajes/{viaje.id}/activar/', **auth_header)
        viaje.refresh_from_db()
        viaje_2.refresh_from_db()
        assert viaje.es_activo is True
        assert viaje_2.es_activo is False

    def test_activar_viaje_activo_lo_desactiva(
        self, client, auth_header, viaje
    ):
        """Activar un viaje ya activo lo desactiva (toggle)."""
        viaje.es_activo = True
        viaje.save()
        client.post(f'/api/viajes/{viaje.id}/activar/', **auth_header)
        viaje.refresh_from_db()
        assert viaje.es_activo is False

    def test_archivar_viaje(self, client, auth_header, viaje):
        """DELETE archiva el viaje, no lo elimina."""
        res = client.delete(f'/api/viajes/{viaje.id}/', **auth_header)
        assert res.status_code == 204
        viaje.refresh_from_db()
        assert viaje.archivado is True
        assert Viaje.objects.filter(id=viaje.id).exists()

    def test_no_retorna_viajes_de_otra_familia(
        self, client, auth_header_otra_familia, viaje
    ):
        res = client.get('/api/viajes/', **auth_header_otra_familia)
        assert res.status_code == 200
        assert len(res.json()) == 0


@pytest.mark.django_db
class TestPresupuestosViaje:

    def test_crear_presupuesto(self, client, auth_header, viaje, categoria_egreso):
        res = client.post(
            f'/api/viajes/{viaje.id}/presupuestos/',
            data={
                'categoria':         categoria_egreso.id,
                'monto_planificado': '300000.00',
            },
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 201

    def test_total_presupuestado_en_detalle(
        self, client, auth_header, viaje, categoria_egreso
    ):
        """El total presupuestado se calcula sumando los ítems."""
        PresupuestoViaje.objects.create(
            viaje=viaje, categoria=categoria_egreso, monto_planificado='300000.00'
        )
        res = client.get(f'/api/viajes/{viaje.id}/', **auth_header)
        assert res.status_code == 200
        from decimal import Decimal
        assert Decimal(res.json()['total_presupuestado']) == Decimal('300000.00')

    def test_eliminar_presupuesto(self, client, auth_header, viaje, categoria_egreso):
        p = PresupuestoViaje.objects.create(
            viaje=viaje, categoria=categoria_egreso, monto_planificado='150000.00'
        )
        res = client.delete(f'/api/viajes/presupuestos/{p.id}/', **auth_header)
        assert res.status_code == 204
        assert not PresupuestoViaje.objects.filter(id=p.id).exists()
