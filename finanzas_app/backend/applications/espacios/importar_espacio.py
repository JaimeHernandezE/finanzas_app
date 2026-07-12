"""
Fase 5 V1 — Import lógico por espacio.

Restaura datos desde un dict (generado por exportar_espacio) a un espacio
destino. Crea nuevas filas con IDs nuevos, remapeando FKs internas.

MetodoPago se resuelve por nombre (catálogo global). Tarjetas y cuentas
personales se crean nuevas para el usuario importador.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation

from django.contrib.auth import get_user_model
from django.db import transaction

from applications.finanzas.models import (
    Categoria,
    CuentaPersonal,
    Cuota,
    IngresoComun,
    MetodoPago,
    Movimiento,
    Presupuesto,
    Tarjeta,
)
from applications.inversiones.models import Aporte, Fondo, RegistroValor
from applications.viajes.models import PresupuestoViaje, Viaje

from .exportar_espacio import FORMAT_VERSION

Usuario = get_user_model()


class ImportError(Exception):
    pass


def _parse_date(val):
    if val is None:
        return None
    if isinstance(val, date):
        return val
    return date.fromisoformat(val)


def _parse_decimal(val):
    if val is None:
        return None
    try:
        return Decimal(val)
    except (InvalidOperation, TypeError, ValueError) as e:
        raise ImportError(f'Valor decimal inválido: {val}') from e


def _resolver_usuario(email, espacio, usuario_fallback, cache):
    """Resuelve un email a un Usuario. En espacio personal usa siempre el fallback."""
    if email is None:
        return usuario_fallback
    if espacio.es_personal:
        return usuario_fallback
    if email in cache:
        return cache[email]
    usuario = Usuario.objects.filter(email=email).first()
    if usuario is None:
        usuario = usuario_fallback
    cache[email] = usuario
    return usuario


def validar_formato(data: dict):
    """Valida que el dict tenga el formato correcto de export."""
    if not isinstance(data, dict):
        raise ImportError('El archivo no contiene un objeto JSON válido.')
    if data.get('formato') != 'finanzas_app_export_v1':
        raise ImportError(
            'Formato de archivo no reconocido. '
            'Se esperaba finanzas_app_export_v1.'
        )
    version = data.get('version', 0)
    if version > FORMAT_VERSION:
        raise ImportError(
            f'Versión {version} no soportada. '
            f'Máxima soportada: {FORMAT_VERSION}.'
        )
    if 'datos' not in data or not isinstance(data['datos'], dict):
        raise ImportError('El archivo no contiene la sección "datos".')


@transaction.atomic
def importar_espacio(data: dict, espacio, usuario) -> dict:
    """
    Importa datos de un export JSON a un espacio destino.

    Args:
        data: dict parseado del JSON de export.
        espacio: Espacio destino donde se importan los datos.
        usuario: Usuario que ejecuta la importación (fallback para atribución).

    Returns:
        dict con conteos de objetos importados.
    """
    validar_formato(data)
    datos = data['datos']
    familia = espacio.familia_origen if hasattr(espacio, 'familia_origen') else None

    usuario_cache = {}
    conteos = {}

    map_metodo = _importar_metodos(datos.get('metodos_pago', []))
    conteos['metodos_pago'] = len(map_metodo)

    map_tarjeta = _importar_tarjetas(
        datos.get('tarjetas', []), espacio, usuario, usuario_cache,
    )
    conteos['tarjetas'] = len(map_tarjeta)

    map_cuenta = _importar_cuentas(
        datos.get('cuentas_personales', []), espacio, usuario, usuario_cache,
    )
    conteos['cuentas_personales'] = len(map_cuenta)

    map_viaje = _importar_viajes(
        datos.get('viajes', []), espacio, familia,
    )
    conteos['viajes'] = len(map_viaje)

    map_fondo = _importar_fondos(
        datos.get('fondos', []), espacio, familia, usuario, usuario_cache,
    )
    conteos['fondos'] = len(map_fondo)

    map_categoria = _importar_categorias(
        datos.get('categorias', []), espacio, familia, usuario, usuario_cache,
        map_cuenta,
    )
    conteos['categorias'] = len(map_categoria)

    map_movimiento = _importar_movimientos(
        datos.get('movimientos', []), espacio, familia, usuario, usuario_cache,
        map_categoria, map_metodo, map_tarjeta, map_viaje, map_cuenta,
    )
    conteos['movimientos'] = len(map_movimiento)

    conteos['cuotas'] = _importar_cuotas(
        datos.get('cuotas', []), map_movimiento,
    )

    conteos['ingresos_comunes'] = _importar_ingresos(
        datos.get('ingresos_comunes', []), espacio, familia, usuario,
        usuario_cache, map_movimiento,
    )

    conteos['presupuestos'] = _importar_presupuestos(
        datos.get('presupuestos', []), espacio, familia, usuario,
        usuario_cache, map_categoria,
    )

    conteos['presupuestos_viaje'] = _importar_presupuestos_viaje(
        datos.get('presupuestos_viaje', []), map_viaje, map_categoria,
    )

    conteos['aportes'] = _importar_aportes(
        datos.get('aportes', []), map_fondo,
    )

    conteos['registros_valor'] = _importar_registros_valor(
        datos.get('registros_valor', []), map_fondo,
    )

    return conteos


def _importar_metodos(rows):
    """Resuelve métodos de pago por nombre. No crea nuevos — son catálogo global."""
    mapa = {}
    for row in rows:
        old_id = row['_id']
        metodo = MetodoPago.objects.filter(nombre=row['nombre']).first()
        if metodo is None:
            metodo = MetodoPago.objects.filter(tipo=row.get('tipo', '')).first()
        if metodo is None:
            metodo = MetodoPago.objects.first()
        if metodo:
            mapa[old_id] = metodo.pk
    return mapa


def _importar_tarjetas(rows, espacio, usuario, usuario_cache):
    mapa = {}
    for row in rows:
        old_id = row['_id']
        u = _resolver_usuario(row.get('usuario_email'), espacio, usuario, usuario_cache)
        tarjeta = Tarjeta.objects.create(
            usuario=u,
            nombre=row['nombre'],
            banco=row.get('banco', ''),
            dia_facturacion=row.get('dia_facturacion'),
            dia_vencimiento=row.get('dia_vencimiento'),
        )
        mapa[old_id] = tarjeta.pk
    return mapa


def _importar_cuentas(rows, espacio, usuario, usuario_cache):
    mapa = {}
    for row in rows:
        old_id = row['_id']
        u = _resolver_usuario(row.get('usuario_email'), espacio, usuario, usuario_cache)
        cuenta = CuentaPersonal.objects.create(
            usuario=u,
            nombre=row['nombre'],
            descripcion=row.get('descripcion', ''),
            visible_familia=row.get('visible_familia', False),
        )
        mapa[old_id] = cuenta.pk
    return mapa


def _importar_viajes(rows, espacio, familia):
    mapa = {}
    for row in rows:
        old_id = row['_id']
        viaje = Viaje.objects.create(
            espacio=espacio,
            familia=familia,
            nombre=row['nombre'],
            fecha_inicio=_parse_date(row['fecha_inicio']),
            fecha_fin=_parse_date(row['fecha_fin']),
            es_activo=row.get('es_activo', False),
            color_tema=row.get('color_tema', ''),
            archivado=row.get('archivado', False),
        )
        mapa[old_id] = viaje.pk
    return mapa


def _importar_fondos(rows, espacio, familia, usuario, usuario_cache):
    mapa = {}
    for row in rows:
        old_id = row['_id']
        u = _resolver_usuario(row.get('usuario_email'), espacio, usuario, usuario_cache)
        fondo = Fondo.objects.create(
            espacio=espacio,
            familia=familia,
            usuario=u,
            nombre=row['nombre'],
            descripcion=row.get('descripcion', ''),
        )
        mapa[old_id] = fondo.pk
    return mapa


def _importar_categorias(rows, espacio, familia, usuario, usuario_cache, map_cuenta):
    parents_first = sorted(rows, key=lambda r: (r.get('categoria_padre_id') is not None,))
    mapa = {}
    for row in parents_first:
        old_id = row['_id']
        u = _resolver_usuario(row.get('usuario_email'), espacio, usuario, usuario_cache)
        padre_id = row.get('categoria_padre_id')
        cuenta_id = row.get('cuenta_personal_id')
        cat = Categoria.objects.create(
            espacio=espacio,
            familia=familia,
            usuario=u if row.get('usuario_email') else None,
            nombre=row['nombre'],
            tipo=row['tipo'],
            es_inversion=row.get('es_inversion', False),
            categoria_padre_id=mapa.get(padre_id) if padre_id else None,
            cuenta_personal_id=map_cuenta.get(cuenta_id) if cuenta_id else None,
        )
        mapa[old_id] = cat.pk
    return mapa


def _importar_movimientos(
    rows, espacio, familia, usuario, usuario_cache,
    map_cat, map_metodo, map_tarjeta, map_viaje, map_cuenta,
):
    mapa = {}
    for row in rows:
        old_id = row['_id']
        u = _resolver_usuario(row.get('usuario_email'), espacio, usuario, usuario_cache)

        cat_id = map_cat.get(row['categoria_id'])
        if cat_id is None:
            cat_id = row['categoria_id']

        metodo_id = map_metodo.get(row['metodo_pago_id'])
        if metodo_id is None:
            metodo_id = row['metodo_pago_id']

        tarjeta_id = map_tarjeta.get(row.get('tarjeta_id')) if row.get('tarjeta_id') else None
        viaje_id = map_viaje.get(row.get('viaje_id')) if row.get('viaje_id') else None
        cuenta_id = map_cuenta.get(row.get('cuenta_id')) if row.get('cuenta_id') else None

        mov = Movimiento(
            espacio=espacio,
            familia=familia,
            usuario=u,
            tipo=row['tipo'],
            ambito=row.get('ambito', 'PERSONAL'),
            categoria_id=cat_id,
            fecha=_parse_date(row['fecha']),
            monto=_parse_decimal(row['monto']),
            comentario=row.get('comentario', ''),
            oculto=row.get('oculto', False),
            metodo_pago_id=metodo_id,
            tarjeta_id=tarjeta_id,
            num_cuotas=row.get('num_cuotas'),
            monto_cuota=_parse_decimal(row.get('monto_cuota')),
            viaje_id=viaje_id,
            cuenta_id=cuenta_id,
        )
        mov._skip_cuota_signal = True
        mov.save()
        mapa[old_id] = mov.pk
    return mapa


def _importar_cuotas(rows, map_movimiento):
    count = 0
    for row in rows:
        mov_id = map_movimiento.get(row['movimiento_id'])
        if mov_id is None:
            continue
        Cuota.objects.create(
            movimiento_id=mov_id,
            numero=row['numero'],
            monto=_parse_decimal(row['monto']),
            mes_facturacion=_parse_date(row['mes_facturacion']),
            estado=row.get('estado', 'PENDIENTE'),
            incluir=row.get('incluir', True),
        )
        count += 1
    return count


def _importar_ingresos(rows, espacio, familia, usuario, usuario_cache, map_movimiento):
    count = 0
    for row in rows:
        u = _resolver_usuario(row.get('usuario_email'), espacio, usuario, usuario_cache)
        mov_id = map_movimiento.get(row.get('movimiento_id')) if row.get('movimiento_id') else None
        ing = IngresoComun(
            espacio=espacio,
            familia=familia,
            usuario=u,
            mes=_parse_date(row['mes']),
            fecha_pago=_parse_date(row.get('fecha_pago')),
            monto=_parse_decimal(row['monto']),
            origen=row.get('origen', ''),
            movimiento_id=mov_id,
        )
        ing._skip_signal = True
        ing.save()
        count += 1
    return count


def _importar_presupuestos(rows, espacio, familia, usuario, usuario_cache, map_cat):
    count = 0
    for row in rows:
        u = _resolver_usuario(row.get('usuario_email'), espacio, usuario, usuario_cache)
        cat_id = map_cat.get(row['categoria_id'])
        if cat_id is None:
            cat_id = row['categoria_id']
        Presupuesto.objects.create(
            espacio=espacio,
            familia=familia,
            usuario=u,
            categoria_id=cat_id,
            mes=_parse_date(row['mes']),
            monto=_parse_decimal(row['monto']),
        )
        count += 1
    return count


def _importar_presupuestos_viaje(rows, map_viaje, map_cat):
    count = 0
    for row in rows:
        viaje_id = map_viaje.get(row['viaje_id'])
        if viaje_id is None:
            continue
        cat_id = map_cat.get(row['categoria_id'])
        if cat_id is None:
            cat_id = row['categoria_id']
        PresupuestoViaje.objects.create(
            viaje_id=viaje_id,
            categoria_id=cat_id,
            monto_planificado=_parse_decimal(row['monto_planificado']),
        )
        count += 1
    return count


def _importar_aportes(rows, map_fondo):
    count = 0
    for row in rows:
        fondo_id = map_fondo.get(row['fondo_id'])
        if fondo_id is None:
            continue
        Aporte.objects.create(
            fondo_id=fondo_id,
            fecha=_parse_date(row['fecha']),
            monto=_parse_decimal(row['monto']),
            nota=row.get('nota', ''),
        )
        count += 1
    return count


def _importar_registros_valor(rows, map_fondo):
    count = 0
    for row in rows:
        fondo_id = map_fondo.get(row['fondo_id'])
        if fondo_id is None:
            continue
        RegistroValor.objects.create(
            fondo_id=fondo_id,
            fecha=_parse_date(row['fecha']),
            valor_cuota=_parse_decimal(row['valor_cuota']),
        )
        count += 1
    return count
