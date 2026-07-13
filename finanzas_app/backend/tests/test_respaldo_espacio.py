# Tests Fase 5 V1 — Export/import lógico por espacio (DISPOSITIVO).

import io
import json

import pytest
from datetime import date
from decimal import Decimal

from rest_framework import status
from rest_framework.test import APIClient

from applications.espacios.exportar_espacio import exportar_espacio
from applications.espacios.importar_espacio import importar_espacio, validar_formato, ImportError
from applications.espacios.models import Espacio, PertenenciaEspacio
from applications.espacios.services import espacio_para_familia, obtener_espacio_personal
from applications.finanzas.models import (
    Categoria, CuentaPersonal, Cuota, IngresoComun, MetodoPago,
    Movimiento, Presupuesto, Tarjeta,
)
from applications.inversiones.models import Aporte, Fondo, RegistroValor
from applications.usuarios.models import Usuario, Familia
from applications.viajes.models import PresupuestoViaje, Viaje


@pytest.fixture
def client():
    return APIClient()


def _espejo(familia):
    return espacio_para_familia(familia)


def _poblar_espacio(espacio, usuario, familia=None):
    """Crea un conjunto completo de datos en un espacio para test."""
    metodo = MetodoPago.objects.get_or_create(nombre='Efectivo', tipo='EFECTIVO')[0]
    metodo_cred = MetodoPago.objects.get_or_create(nombre='Crédito', tipo='CREDITO')[0]

    cat = Categoria.objects.create(
        nombre='Test Cat', tipo='EGRESO', espacio=espacio, usuario=usuario,
    )
    cat_padre = Categoria.objects.create(
        nombre='Padre', tipo='EGRESO', espacio=espacio, usuario=None,
    )
    cat_hija = Categoria.objects.create(
        nombre='Hija', tipo='EGRESO', espacio=espacio,
        usuario=None, categoria_padre=cat_padre,
    )

    tarjeta = Tarjeta.objects.create(
        usuario=usuario, nombre='Visa Test', banco='BCI',
        dia_facturacion=15, dia_vencimiento=25,
    )

    cuenta = CuentaPersonal.objects.create(
        usuario=usuario, nombre='Cuenta Test', descripcion='desc',
    )

    viaje_kwargs = {'espacio': espacio, 'nombre': 'Vacaciones',
                    'fecha_inicio': date(2026, 1, 10), 'fecha_fin': date(2026, 1, 20)}
    if familia is not None:
        viaje_kwargs['familia'] = familia
    viaje = Viaje.objects.create(**viaje_kwargs)
    PresupuestoViaje.objects.create(
        viaje=viaje, categoria=cat, monto_planificado=500000,
    )

    mov = Movimiento.objects.create(
        espacio=espacio, usuario=usuario,
        tipo='EGRESO', ambito='PERSONAL', categoria=cat,
        fecha=date(2026, 3, 15), monto=45000, comentario='Bencina',
        metodo_pago=metodo, tarjeta=None, viaje=viaje, cuenta=cuenta,
    )

    mov_cred = Movimiento.objects.create(
        espacio=espacio, usuario=usuario,
        tipo='EGRESO', ambito='PERSONAL', categoria=cat,
        fecha=date(2026, 3, 1), monto=120000, comentario='Compra',
        metodo_pago=metodo_cred, tarjeta=tarjeta,
        num_cuotas=3, monto_cuota=40000,
    )

    Presupuesto.objects.create(
        espacio=espacio, usuario=usuario,
        categoria=cat, mes=date(2026, 3, 1), monto=100000,
    )

    IngresoComun.objects.create(
        espacio=espacio, usuario=usuario,
        mes=date(2026, 3, 1), monto=500000, origen='Sueldo',
    )

    fondo_kwargs = {
        'espacio': espacio, 'usuario': usuario,
        'nombre': 'Mi Fondo', 'descripcion': 'Test',
    }
    if familia is not None:
        fondo_kwargs['familia'] = familia
    fondo = Fondo.objects.create(**fondo_kwargs)
    Aporte.objects.create(fondo=fondo, fecha=date(2026, 1, 15), monto=100000)
    RegistroValor.objects.create(fondo=fondo, fecha=date(2026, 2, 1), valor_cuota=Decimal('1.05'))

    return {
        'cat': cat, 'cat_padre': cat_padre, 'cat_hija': cat_hija,
        'tarjeta': tarjeta, 'cuenta': cuenta, 'viaje': viaje,
        'mov': mov, 'mov_cred': mov_cred, 'fondo': fondo, 'metodo': metodo,
    }


# ── Export ───────────────────────────────────────────────────────────────────

class TestExportar:
    def test_export_contiene_todos_los_tipos(self, usuario, familia):
        espejo = _espejo(familia)
        _poblar_espacio(espejo, usuario, familia)

        data = exportar_espacio(espejo)

        assert data['formato'] == 'finanzas_app_export_v1'
        assert data['version'] == 1
        assert data['espacio']['tipo'] == 'FAMILIAR'
        assert 'modo_reparto' in data['espacio']
        assert 'archivado' in data['espacio']

        d = data['datos']
        assert len(d['categorias']) == 3
        assert len(d['movimientos']) >= 2
        assert len(d['cuotas']) == 3
        assert len(d['presupuestos']) == 1
        assert len(d['ingresos_comunes']) == 1
        assert len(d['fondos']) == 1
        assert len(d['aportes']) == 1
        assert len(d['registros_valor']) == 1
        assert len(d['viajes']) == 1
        assert len(d['presupuestos_viaje']) == 1
        assert len(d['tarjetas']) == 1
        assert len(d['metodos_pago']) >= 1
        assert len(d['cuentas_personales']) >= 1

    def test_export_espacio_vacio(self, usuario, familia):
        espejo = _espejo(familia)
        data = exportar_espacio(espejo)

        d = data['datos']
        assert d['movimientos'] == []
        assert d['categorias'] == []
        assert d['fondos'] == []

    def test_export_preserva_jerarquia_categorias(self, usuario, familia):
        espejo = _espejo(familia)
        datos = _poblar_espacio(espejo, usuario, familia)

        data = exportar_espacio(espejo)
        cats = {c['_id']: c for c in data['datos']['categorias']}
        hija = next(c for c in data['datos']['categorias'] if c['nombre'] == 'Hija')
        assert hija['categoria_padre_id'] == datos['cat_padre'].pk

    def test_export_incluye_email_usuario(self, usuario, familia):
        espejo = _espejo(familia)
        _poblar_espacio(espejo, usuario, familia)

        data = exportar_espacio(espejo)
        mov = data['datos']['movimientos'][0]
        assert mov['usuario_email'] == usuario.email

    def test_export_espacio_personal(self, usuario, familia):
        personal = obtener_espacio_personal(usuario)
        cat = Categoria.objects.create(
            nombre='Personal Cat', tipo='EGRESO',
            espacio=personal, usuario=usuario,
        )
        metodo = MetodoPago.objects.get_or_create(nombre='Efectivo', tipo='EFECTIVO')[0]
        Movimiento.objects.create(
            espacio=personal, usuario=usuario,
            tipo='EGRESO', ambito='PERSONAL', categoria=cat,
            fecha=date(2026, 5, 1), monto=10000,
            metodo_pago=metodo,
        )

        data = exportar_espacio(personal)
        assert data['espacio']['tipo'] == 'PERSONAL'
        assert len(data['datos']['movimientos']) == 1
        assert len(data['datos']['categorias']) == 1


# ── Import ───────────────────────────────────────────────────────────────────

class TestImportar:
    def test_roundtrip_export_import(self, usuario, familia):
        espejo = _espejo(familia)
        _poblar_espacio(espejo, usuario, familia)

        data = exportar_espacio(espejo)

        personal = obtener_espacio_personal(usuario)
        conteos = importar_espacio(data, personal, usuario)

        assert conteos['categorias'] == 3
        assert conteos['movimientos'] >= 2
        assert conteos['cuotas'] == 3
        assert conteos['presupuestos'] == 1
        assert conteos['ingresos_comunes'] == 1
        assert conteos['fondos'] == 1
        assert conteos['aportes'] == 1
        assert conteos['registros_valor'] == 1
        assert conteos['viajes'] == 1
        assert conteos['presupuestos_viaje'] == 1

    def test_import_crea_nuevos_ids(self, usuario, familia):
        espejo = _espejo(familia)
        datos_orig = _poblar_espacio(espejo, usuario, familia)

        data = exportar_espacio(espejo)
        personal = obtener_espacio_personal(usuario)
        importar_espacio(data, personal, usuario)

        movs_personal = Movimiento.objects.filter(espacio=personal)
        ids_orig = {datos_orig['mov'].pk, datos_orig['mov_cred'].pk}
        ids_nuevo = {m.pk for m in movs_personal}
        assert ids_orig.isdisjoint(ids_nuevo)

    def test_import_remapea_fks_categorias(self, usuario, familia):
        espejo = _espejo(familia)
        _poblar_espacio(espejo, usuario, familia)

        data = exportar_espacio(espejo)
        personal = obtener_espacio_personal(usuario)
        importar_espacio(data, personal, usuario)

        cats_importadas = Categoria.objects.filter(espacio=personal)
        assert cats_importadas.count() == 3
        movs = Movimiento.objects.filter(espacio=personal)
        for mov in movs:
            cat = mov.categoria
            assert cat.espacio_id == personal.id or cat.espacio_id is None

    def test_import_remapea_fks_cuotas(self, usuario, familia):
        espejo = _espejo(familia)
        _poblar_espacio(espejo, usuario, familia)

        data = exportar_espacio(espejo)
        personal = obtener_espacio_personal(usuario)
        importar_espacio(data, personal, usuario)

        movs_cred = Movimiento.objects.filter(espacio=personal, num_cuotas__isnull=False)
        assert movs_cred.count() == 1
        assert Cuota.objects.filter(movimiento=movs_cred.first()).count() == 3

    def test_import_remapea_fondos_y_aportes(self, usuario, familia):
        espejo = _espejo(familia)
        _poblar_espacio(espejo, usuario, familia)

        data = exportar_espacio(espejo)
        personal = obtener_espacio_personal(usuario)
        importar_espacio(data, personal, usuario)

        fondos = Fondo.objects.filter(espacio=personal)
        assert fondos.count() == 1
        fondo = fondos.first()
        assert Aporte.objects.filter(fondo=fondo).count() == 1
        assert RegistroValor.objects.filter(fondo=fondo).count() == 1

    def test_import_remapea_viajes_y_presupuestos(self, usuario, familia):
        espejo = _espejo(familia)
        _poblar_espacio(espejo, usuario, familia)

        data = exportar_espacio(espejo)
        personal = obtener_espacio_personal(usuario)
        importar_espacio(data, personal, usuario)

        viajes = Viaje.objects.filter(espacio=personal)
        assert viajes.count() == 1
        assert PresupuestoViaje.objects.filter(viaje=viajes.first()).count() == 1

    def test_import_no_modifica_originales(self, usuario, familia):
        espejo = _espejo(familia)
        datos_orig = _poblar_espacio(espejo, usuario, familia)

        data = exportar_espacio(espejo)
        personal = obtener_espacio_personal(usuario)
        importar_espacio(data, personal, usuario)

        datos_orig['mov'].refresh_from_db()
        assert datos_orig['mov'].espacio_id == espejo.id

    def test_import_resuelve_metodo_pago_por_nombre(self, usuario, familia):
        espejo = _espejo(familia)
        _poblar_espacio(espejo, usuario, familia)

        data = exportar_espacio(espejo)
        personal = obtener_espacio_personal(usuario)
        importar_espacio(data, personal, usuario)

        movs = Movimiento.objects.filter(espacio=personal)
        for mov in movs:
            assert MetodoPago.objects.filter(pk=mov.metodo_pago_id).exists()

    def test_import_no_genera_cuotas_por_signal(self, usuario, familia):
        """Las cuotas se importan explícitamente — el signal no debe duplicarlas."""
        espejo = _espejo(familia)
        _poblar_espacio(espejo, usuario, familia)

        data = exportar_espacio(espejo)
        personal = obtener_espacio_personal(usuario)
        importar_espacio(data, personal, usuario)

        movs_cred = Movimiento.objects.filter(
            espacio=personal, num_cuotas__isnull=False,
        )
        for mov in movs_cred:
            assert Cuota.objects.filter(movimiento=mov).count() == 3

    def test_import_jerarquia_categorias(self, usuario, familia):
        espejo = _espejo(familia)
        _poblar_espacio(espejo, usuario, familia)

        data = exportar_espacio(espejo)
        personal = obtener_espacio_personal(usuario)
        importar_espacio(data, personal, usuario)

        hija = Categoria.objects.filter(espacio=personal, nombre='Hija').first()
        assert hija is not None
        assert hija.categoria_padre is not None
        assert hija.categoria_padre.nombre == 'Padre'
        assert hija.categoria_padre.espacio_id == personal.id


# ── Validación de formato ────────────────────────────────────────────────────

class TestValidarFormato:
    def test_formato_valido(self):
        validar_formato({
            'formato': 'finanzas_app_export_v1',
            'version': 1,
            'datos': {},
        })

    def test_formato_invalido(self):
        with pytest.raises(ImportError, match='no reconocido'):
            validar_formato({'formato': 'otro'})

    def test_version_futura(self):
        with pytest.raises(ImportError, match='no soportada'):
            validar_formato({
                'formato': 'finanzas_app_export_v1',
                'version': 999,
                'datos': {},
            })

    def test_sin_datos(self):
        with pytest.raises(ImportError, match='datos'):
            validar_formato({
                'formato': 'finanzas_app_export_v1',
                'version': 1,
            })

    def test_no_es_dict(self):
        with pytest.raises(ImportError, match='JSON válido'):
            validar_formato([])


# ── Endpoints API ────────────────────────────────────────────────────────────

class TestEndpointExportar:
    def test_get_descarga_json(self, client, usuario, familia, auth_header):
        espejo = _espejo(familia)
        MetodoPago.objects.get_or_create(nombre='Efectivo', tipo='EFECTIVO')
        cat = Categoria.objects.create(
            nombre='E Cat', tipo='EGRESO', espacio=espejo, usuario=usuario,
        )
        metodo = MetodoPago.objects.get(nombre='Efectivo')
        Movimiento.objects.create(
            espacio=espejo, usuario=usuario,
            tipo='EGRESO', ambito='PERSONAL', categoria=cat,
            fecha=date(2026, 6, 1), monto=5000, metodo_pago=metodo,
        )

        resp = client.get(f'/api/espacios/{espejo.id}/exportar/', **auth_header)
        assert resp.status_code == status.HTTP_200_OK
        assert 'attachment' in resp['Content-Disposition']

        data = json.loads(resp.content)
        assert data['formato'] == 'finanzas_app_export_v1'
        assert len(data['datos']['movimientos']) == 1

    def test_export_espacio_ajeno_403(self, client, usuario, familia, auth_header):
        otra = Familia.objects.create(nombre='Otra')
        espejo_otra = espacio_para_familia(otra)
        resp = client.get(f'/api/espacios/{espejo_otra.id}/exportar/', **auth_header)
        assert resp.status_code == status.HTTP_403_FORBIDDEN


class TestEndpointImportar:
    def test_post_importa_json(self, client, usuario, familia, auth_header):
        espejo = _espejo(familia)
        _poblar_espacio(espejo, usuario, familia)

        data = exportar_espacio(espejo)
        personal = obtener_espacio_personal(usuario)

        archivo = io.BytesIO(json.dumps(data).encode('utf-8'))
        archivo.name = 'respaldo.json'

        resp = client.post(
            f'/api/espacios/{personal.id}/importar/',
            {'archivo': archivo},
            format='multipart',
            **auth_header,
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['conteos']['movimientos'] >= 2
        assert resp.data['conteos']['categorias'] == 3

    def test_import_sin_archivo_400(self, client, usuario, familia, auth_header):
        personal = obtener_espacio_personal(usuario)
        resp = client.post(
            f'/api/espacios/{personal.id}/importar/',
            {},
            **auth_header,
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_import_json_invalido_400(self, client, usuario, familia, auth_header):
        personal = obtener_espacio_personal(usuario)
        archivo = io.BytesIO(b'esto no es json')
        archivo.name = 'malo.json'
        resp = client.post(
            f'/api/espacios/{personal.id}/importar/',
            {'archivo': archivo},
            format='multipart',
            **auth_header,
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_import_formato_invalido_400(self, client, usuario, familia, auth_header):
        personal = obtener_espacio_personal(usuario)
        archivo = io.BytesIO(json.dumps({'formato': 'otro'}).encode('utf-8'))
        archivo.name = 'otro.json'
        resp = client.post(
            f'/api/espacios/{personal.id}/importar/',
            {'archivo': archivo},
            format='multipart',
            **auth_header,
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_import_espacio_archivado_400(self, client, usuario, familia, auth_header):
        espejo = _espejo(familia)
        espejo.archivado = True
        espejo.save(update_fields=['archivado'])

        archivo = io.BytesIO(json.dumps({
            'formato': 'finanzas_app_export_v1',
            'version': 1,
            'datos': {},
        }).encode('utf-8'))
        archivo.name = 'respaldo.json'

        resp = client.post(
            f'/api/espacios/{espejo.id}/importar/',
            {'archivo': archivo},
            format='multipart',
            **auth_header,
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert 'archivado' in resp.data['error']

    def test_import_espacio_ajeno_403(self, client, usuario, familia, auth_header):
        otra = Familia.objects.create(nombre='Otra')
        espejo_otra = espacio_para_familia(otra)

        archivo = io.BytesIO(json.dumps({
            'formato': 'finanzas_app_export_v1',
            'version': 1,
            'datos': {},
        }).encode('utf-8'))
        archivo.name = 'respaldo.json'

        resp = client.post(
            f'/api/espacios/{espejo_otra.id}/importar/',
            {'archivo': archivo},
            format='multipart',
            **auth_header,
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN
