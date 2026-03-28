# backend/tests/test_movimientos.py

import pytest
from decimal import Decimal

from applications.finanzas.models import Movimiento, Cuota, IngresoComun


@pytest.mark.django_db
class TestMovimientosListado:

    def test_lista_movimientos_de_la_familia(
        self, client, auth_header, movimiento_efectivo
    ):
        """Retorna movimientos de la familia del usuario."""
        res = client.get('/api/finanzas/movimientos/', **auth_header)
        assert res.status_code == 200
        assert len(res.json()) == 1

    def test_no_retorna_movimientos_de_otra_familia(
        self, client, auth_header_otra_familia, movimiento_efectivo
    ):
        """Un usuario de otra familia no ve estos movimientos."""
        res = client.get('/api/finanzas/movimientos/', **auth_header_otra_familia)
        assert res.status_code == 200
        assert len(res.json()) == 0

    def test_filtro_por_ambito_comun(
        self, client, auth_header, movimiento_efectivo, movimiento_comun
    ):
        """Filtra movimientos por ámbito COMUN."""
        res = client.get('/api/finanzas/movimientos/?ambito=COMUN', **auth_header)
        assert res.status_code == 200
        assert len(res.json()) == 1
        assert res.json()[0]['ambito'] == 'COMUN'

    def test_filtro_por_tipo_egreso(
        self, client, auth_header, movimiento_efectivo,
        usuario, familia, categoria_ingreso, metodo_efectivo
    ):
        """Filtra movimientos por tipo EGRESO."""
        Movimiento.objects.create(
            usuario=usuario, familia=familia,
            fecha='2026-03-15', tipo='INGRESO', ambito='PERSONAL',
            categoria=categoria_ingreso, monto='1500000.00',
            comentario='Sueldo', metodo_pago=metodo_efectivo,
        )
        res = client.get('/api/finanzas/movimientos/?tipo=EGRESO', **auth_header)
        assert res.status_code == 200
        assert all(m['tipo'] == 'EGRESO' for m in res.json())

    def test_filtro_por_mes_y_anio(
        self, client, auth_header, movimiento_efectivo,
        usuario, familia, categoria_egreso, metodo_efectivo
    ):
        """Filtra movimientos por mes y año."""
        # Crear movimiento en mes diferente
        Movimiento.objects.create(
            usuario=usuario, familia=familia,
            fecha='2026-02-10', tipo='EGRESO', ambito='PERSONAL',
            categoria=categoria_egreso, monto='20000.00',
            comentario='Febrero', metodo_pago=metodo_efectivo,
        )
        res = client.get(
            '/api/finanzas/movimientos/?mes=3&anio=2026', **auth_header
        )
        assert res.status_code == 200
        assert all('2026-03' in m['fecha'] for m in res.json())

    def test_busqueda_por_texto(
        self, client, auth_header, movimiento_efectivo
    ):
        """Busca movimientos por texto en el comentario."""
        res = client.get(
            '/api/finanzas/movimientos/?q=bencina', **auth_header
        )
        assert res.status_code == 200
        assert len(res.json()) == 1

    def test_busqueda_por_nombre_categoria(
        self, client, auth_header, movimiento_efectivo
    ):
        """Busca por palabras que aparecen solo en el nombre de la categoría."""
        res = client.get(
            '/api/finanzas/movimientos/?q=alimen', **auth_header
        )
        assert res.status_code == 200
        assert len(res.json()) == 1

    def test_busqueda_varias_palabras_en_comentario(
        self, client, auth_header, movimiento_efectivo
    ):
        """Varias palabras: deben cumplirse todas (comentario y/o categoría)."""
        movimiento_efectivo.comentario = 'Bencina estación Copec'
        movimiento_efectivo.save(update_fields=['comentario'])
        res = client.get(
            '/api/finanzas/movimientos/?q=bencina+copec', **auth_header
        )
        assert res.status_code == 200
        assert len(res.json()) == 1

    def test_busqueda_sin_resultados(
        self, client, auth_header, movimiento_efectivo
    ):
        """Búsqueda sin resultados retorna lista vacía."""
        res = client.get(
            '/api/finanzas/movimientos/?q=inexistente', **auth_header
        )
        assert res.status_code == 200
        assert len(res.json()) == 0

    def test_sin_token_retorna_401(self, client):
        res = client.get('/api/finanzas/movimientos/')
        assert res.status_code == 401


@pytest.mark.django_db
class TestMovimientosCreacion:

    def test_crear_movimiento_efectivo(
        self, client, auth_header, categoria_egreso, metodo_efectivo
    ):
        """Crea un movimiento de efectivo correctamente."""
        res = client.post(
            '/api/finanzas/movimientos/',
            data={
                'fecha':       '2026-03-17',
                'tipo':        'EGRESO',
                'ambito':      'PERSONAL',
                'categoria':   categoria_egreso.id,
                'monto':       '45000.00',
                'comentario':  'Bencina',
                'metodo_pago': metodo_efectivo.id,
            },
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 201
        assert res.json()['monto'] == '45000.00'

    def test_crear_movimiento_credito_genera_cuotas(
        self, client, auth_header, categoria_egreso, metodo_credito, tarjeta
    ):
        """Crear un movimiento con crédito genera cuotas automáticamente."""
        res = client.post(
            '/api/finanzas/movimientos/',
            data={
                'fecha':       '2026-03-01',
                'tipo':        'EGRESO',
                'ambito':      'PERSONAL',
                'categoria':   categoria_egreso.id,
                'monto':       '180000.00',
                'comentario':  'Televisor',
                'metodo_pago': metodo_credito.id,
                'tarjeta':     tarjeta.id,
                'num_cuotas':  6,
            },
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 201
        mov_id = res.json()['id']
        assert Cuota.objects.filter(movimiento_id=mov_id).count() == 6

    def test_crear_movimiento_credito_sin_tarjeta_falla(
        self, client, auth_header, categoria_egreso, metodo_credito
    ):
        """No puede crear movimiento de crédito sin tarjeta."""
        res = client.post(
            '/api/finanzas/movimientos/',
            data={
                'fecha':       '2026-03-01',
                'tipo':        'EGRESO',
                'ambito':      'PERSONAL',
                'categoria':   categoria_egreso.id,
                'monto':       '50000.00',
                'metodo_pago': metodo_credito.id,
                'num_cuotas':  3,
            },
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 400
        assert 'tarjeta' in res.json()

    def test_crear_movimiento_credito_sin_cuotas_falla(
        self, client, auth_header, categoria_egreso, metodo_credito, tarjeta
    ):
        """No puede crear movimiento de crédito sin número de cuotas."""
        res = client.post(
            '/api/finanzas/movimientos/',
            data={
                'fecha':       '2026-03-01',
                'tipo':        'EGRESO',
                'ambito':      'PERSONAL',
                'categoria':   categoria_egreso.id,
                'monto':       '50000.00',
                'metodo_pago': metodo_credito.id,
                'tarjeta':     tarjeta.id,
            },
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 400
        assert 'num_cuotas' in res.json()


@pytest.mark.django_db
class TestMovimientosEdicionEliminacion:

    def test_editar_movimiento_propio(
        self, client, auth_header, movimiento_efectivo
    ):
        """El autor puede editar su propio movimiento."""
        res = client.put(
            f'/api/finanzas/movimientos/{movimiento_efectivo.id}/',
            data={'comentario': 'Bencina editada'},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 200
        assert res.json()['comentario'] == 'Bencina editada'

    def test_no_puede_editar_movimiento_ajeno(
        self, client, auth_header_2, movimiento_efectivo
    ):
        """Un usuario no puede editar movimientos de otro."""
        res = client.put(
            f'/api/finanzas/movimientos/{movimiento_efectivo.id}/',
            data={'comentario': 'Hackeado'},
            content_type='application/json',
            **auth_header_2,
        )
        assert res.status_code == 403

    def test_eliminar_movimiento_propio(
        self, client, auth_header, movimiento_efectivo
    ):
        """El autor puede eliminar su propio movimiento."""
        res = client.delete(
            f'/api/finanzas/movimientos/{movimiento_efectivo.id}/',
            **auth_header,
        )
        assert res.status_code == 204
        assert not Movimiento.objects.filter(id=movimiento_efectivo.id).exists()

    def test_eliminar_movimiento_elimina_cuotas(
        self, client, auth_header, movimiento_credito
    ):
        """Eliminar un movimiento con crédito elimina sus cuotas en cascada."""
        mov_id = movimiento_credito.id
        assert Cuota.objects.filter(movimiento_id=mov_id).count() == 6

        client.delete(
            f'/api/finanzas/movimientos/{mov_id}/',
            **auth_header,
        )
        assert Cuota.objects.filter(movimiento_id=mov_id).count() == 0

    def test_no_puede_eliminar_movimiento_ajeno(
        self, client, auth_header_2, movimiento_efectivo
    ):
        """Un usuario no puede eliminar movimientos de otro."""
        res = client.delete(
            f'/api/finanzas/movimientos/{movimiento_efectivo.id}/',
            **auth_header_2,
        )
        assert res.status_code == 403

    def test_patch_movimiento_vinculado_ingreso_sincroniza_ingreso_comun(
        self, client, auth_header, usuario, familia
    ):
        """PATCH en movimiento generado por IngresoComun actualiza mes/monto/origen."""
        ing = IngresoComun.objects.create(
            usuario=usuario,
            familia=familia,
            mes='2026-03-01',
            monto='1000000.00',
            origen='Sueldo',
        )
        ing.refresh_from_db()
        mid = ing.movimiento_id
        res = client.patch(
            f'/api/finanzas/movimientos/{mid}/',
            data={
                'monto': '1200000.00',
                'comentario': 'Sueldo + bono',
                'fecha': '2026-04-01',
            },
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 200
        assert res.json()['ingreso_comun'] == ing.id
        ing.refresh_from_db()
        assert ing.monto == Decimal('1200000.00')
        assert ing.origen == 'Sueldo + bono'
        assert ing.mes.isoformat() == '2026-04-01'

    def test_patch_movimiento_vinculado_no_permite_cambiar_tipo(
        self, client, auth_header, usuario, familia, categoria_egreso
    ):
        ing = IngresoComun.objects.create(
            usuario=usuario,
            familia=familia,
            mes='2026-03-01',
            monto='500000.00',
            origen='X',
        )
        ing.refresh_from_db()
        res = client.patch(
            f'/api/finanzas/movimientos/{ing.movimiento_id}/',
            data={'tipo': 'EGRESO', 'categoria': categoria_egreso.id},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 400
        assert 'tipo' in res.json()

    def test_delete_movimiento_vinculado_ingreso_retorna_400(
        self, client, auth_header, usuario, familia
    ):
        ing = IngresoComun.objects.create(
            usuario=usuario,
            familia=familia,
            mes='2026-03-01',
            monto='100.00',
        )
        ing.refresh_from_db()
        res = client.delete(
            f'/api/finanzas/movimientos/{ing.movimiento_id}/',
            **auth_header,
        )
        assert res.status_code == 400
        assert Movimiento.objects.filter(pk=ing.movimiento_id).exists()


@pytest.mark.django_db
class TestCuotasEndpoint:

    def test_lista_cuotas_de_la_familia(
        self, client, auth_header, movimiento_credito
    ):
        """Lista las cuotas de la familia."""
        res = client.get('/api/finanzas/cuotas/', **auth_header)
        assert res.status_code == 200
        assert len(res.json()) == 6

    def test_filtro_cuotas_por_tarjeta(
        self, client, auth_header, movimiento_credito, tarjeta
    ):
        """Filtra cuotas por tarjeta."""
        res = client.get(
            f'/api/finanzas/cuotas/?tarjeta={tarjeta.id}', **auth_header
        )
        assert res.status_code == 200
        assert len(res.json()) == 6

    def test_filtro_cuotas_por_mes(
        self, client, auth_header, movimiento_credito
    ):
        """Filtra cuotas por mes de facturación."""
        res = client.get(
            '/api/finanzas/cuotas/?mes=3&anio=2026', **auth_header
        )
        assert res.status_code == 200
        # Solo la primera cuota cae en marzo
        assert len(res.json()) == 1

    def test_marcar_cuota_excluida_mueve_mes(
        self, client, auth_header, movimiento_credito
    ):
        """Marcar incluir=False mueve la cuota al mes siguiente."""
        from applications.finanzas.models import Cuota
        from datetime import date

        cuota = Cuota.objects.filter(
            movimiento=movimiento_credito, numero=1
        ).first()
        mes_original = cuota.mes_facturacion

        res = client.put(
            f'/api/finanzas/cuotas/{cuota.id}/',
            data={'incluir': False},
            content_type='application/json',
            **auth_header,
        )
        assert res.status_code == 200

        cuota.refresh_from_db()
        assert cuota.incluir is False
        assert cuota.mes_facturacion.month == (mes_original.month % 12) + 1

    def test_no_retorna_cuotas_de_otra_familia(
        self, client, auth_header_otra_familia, movimiento_credito
    ):
        """Un usuario de otra familia no ve estas cuotas."""
        res = client.get('/api/finanzas/cuotas/', **auth_header_otra_familia)
        assert res.status_code == 200
        assert len(res.json()) == 0
