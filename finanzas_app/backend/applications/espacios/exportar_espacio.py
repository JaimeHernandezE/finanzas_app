"""
Fase 5 V1 — Export lógico por espacio.

Serializa todos los datos de un espacio a un dict JSON-compatible.
Incluye datos de referencia (tarjetas, cuentas personales, métodos de pago)
necesarios para una restauración completa.
"""

from __future__ import annotations

from django.utils import timezone

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


FORMAT_VERSION = 1


def _str(val):
    return str(val) if val is not None else None


def _ser_metodo(m):
    return {'_id': m.pk, 'nombre': m.nombre, 'tipo': m.tipo}


def _ser_tarjeta(t):
    return {
        '_id': t.pk,
        'usuario_email': t.usuario.email,
        'nombre': t.nombre,
        'banco': t.banco,
        'dia_facturacion': t.dia_facturacion,
        'dia_vencimiento': t.dia_vencimiento,
    }


def _ser_cuenta(c):
    return {
        '_id': c.pk,
        'usuario_email': c.usuario.email,
        'nombre': c.nombre,
        'descripcion': c.descripcion,
        'visible_familia': c.visible_familia,
    }


def _ser_categoria(cat):
    return {
        '_id': cat.pk,
        'nombre': cat.nombre,
        'tipo': cat.tipo,
        'es_inversion': cat.es_inversion,
        'usuario_email': cat.usuario.email if cat.usuario_id else None,
        'cuenta_personal_id': cat.cuenta_personal_id,
        'categoria_padre_id': cat.categoria_padre_id,
    }


def _ser_movimiento(mov):
    return {
        '_id': mov.pk,
        'usuario_email': mov.usuario.email,
        'tipo': mov.tipo,
        'ambito': mov.ambito,
        'categoria_id': mov.categoria_id,
        'fecha': str(mov.fecha),
        'monto': _str(mov.monto),
        'comentario': mov.comentario,
        'oculto': mov.oculto,
        'metodo_pago_id': mov.metodo_pago_id,
        'tarjeta_id': mov.tarjeta_id,
        'num_cuotas': mov.num_cuotas,
        'monto_cuota': _str(mov.monto_cuota),
        'viaje_id': mov.viaje_id,
        'cuenta_id': mov.cuenta_id,
        'created_at': mov.created_at.isoformat(),
    }


def _ser_cuota(c):
    return {
        '_id': c.pk,
        'movimiento_id': c.movimiento_id,
        'numero': c.numero,
        'monto': _str(c.monto),
        'mes_facturacion': str(c.mes_facturacion),
        'estado': c.estado,
        'incluir': c.incluir,
    }


def _ser_presupuesto(p):
    return {
        '_id': p.pk,
        'usuario_email': p.usuario.email if p.usuario_id else None,
        'categoria_id': p.categoria_id,
        'mes': str(p.mes),
        'monto': _str(p.monto),
    }


def _ser_ingreso(ing):
    return {
        '_id': ing.pk,
        'usuario_email': ing.usuario.email,
        'mes': str(ing.mes),
        'fecha_pago': str(ing.fecha_pago) if ing.fecha_pago else None,
        'monto': _str(ing.monto),
        'origen': ing.origen,
        'movimiento_id': ing.movimiento_id,
    }


def _ser_fondo(f):
    return {
        '_id': f.pk,
        'usuario_email': f.usuario.email if f.usuario_id else None,
        'nombre': f.nombre,
        'descripcion': f.descripcion,
    }


def _ser_aporte(a):
    return {
        '_id': a.pk,
        'fondo_id': a.fondo_id,
        'fecha': str(a.fecha),
        'monto': _str(a.monto),
        'nota': a.nota,
    }


def _ser_registro_valor(rv):
    return {
        '_id': rv.pk,
        'fondo_id': rv.fondo_id,
        'fecha': str(rv.fecha),
        'valor_cuota': _str(rv.valor_cuota),
    }


def _ser_viaje(v):
    return {
        '_id': v.pk,
        'nombre': v.nombre,
        'fecha_inicio': str(v.fecha_inicio),
        'fecha_fin': str(v.fecha_fin),
        'es_activo': v.es_activo,
        'color_tema': v.color_tema,
        'archivado': v.archivado,
    }


def _ser_presupuesto_viaje(pv):
    return {
        '_id': pv.pk,
        'viaje_id': pv.viaje_id,
        'categoria_id': pv.categoria_id,
        'monto_planificado': _str(pv.monto_planificado),
    }


def exportar_espacio(espacio) -> dict:
    """Exporta todos los datos de un espacio a un dict JSON-serializable."""

    categorias = list(
        Categoria.objects.filter(espacio=espacio)
        .select_related('usuario')
    )
    movimientos = list(
        Movimiento.objects.filter(espacio=espacio)
        .select_related('usuario')
    )
    mov_ids = [m.pk for m in movimientos]
    cuotas = list(Cuota.objects.filter(movimiento_id__in=mov_ids))
    presupuestos = list(
        Presupuesto.objects.filter(espacio=espacio)
        .select_related('usuario')
    )
    ingresos = list(
        IngresoComun.objects.filter(espacio=espacio)
        .select_related('usuario')
    )
    fondos = list(
        Fondo.objects.filter(espacio=espacio)
        .select_related('usuario')
    )
    fondo_ids = [f.pk for f in fondos]
    aportes = list(Aporte.objects.filter(fondo_id__in=fondo_ids))
    registros_valor = list(RegistroValor.objects.filter(fondo_id__in=fondo_ids))
    viajes = list(Viaje.objects.filter(espacio=espacio))
    viaje_ids = [v.pk for v in viajes]
    presupuestos_viaje = list(
        PresupuestoViaje.objects.filter(viaje_id__in=viaje_ids)
    )

    tarjeta_ids = {m.tarjeta_id for m in movimientos if m.tarjeta_id}
    tarjetas = list(
        Tarjeta.objects.filter(id__in=tarjeta_ids).select_related('usuario')
    ) if tarjeta_ids else []

    cuenta_ids = {m.cuenta_id for m in movimientos if m.cuenta_id}
    cuenta_ids |= {c.cuenta_personal_id for c in categorias if c.cuenta_personal_id}
    cuentas = list(
        CuentaPersonal.objects.filter(id__in=cuenta_ids).select_related('usuario')
    ) if cuenta_ids else []

    metodo_ids = {m.metodo_pago_id for m in movimientos if m.metodo_pago_id}
    metodos = list(
        MetodoPago.objects.filter(id__in=metodo_ids)
    ) if metodo_ids else []

    return {
        'formato': 'finanzas_app_export_v1',
        'version': FORMAT_VERSION,
        'exportado_at': timezone.now().isoformat(),
        'espacio': {
            'nombre': espacio.nombre,
            'tipo': espacio.tipo,
            'modo_reparto': espacio.modo_reparto,
            'archivado': espacio.archivado,
        },
        'datos': {
            'metodos_pago': [_ser_metodo(m) for m in metodos],
            'tarjetas': [_ser_tarjeta(t) for t in tarjetas],
            'cuentas_personales': [_ser_cuenta(c) for c in cuentas],
            'categorias': [_ser_categoria(c) for c in categorias],
            'viajes': [_ser_viaje(v) for v in viajes],
            'fondos': [_ser_fondo(f) for f in fondos],
            'movimientos': [_ser_movimiento(m) for m in movimientos],
            'cuotas': [_ser_cuota(c) for c in cuotas],
            'ingresos_comunes': [_ser_ingreso(i) for i in ingresos],
            'presupuestos': [_ser_presupuesto(p) for p in presupuestos],
            'presupuestos_viaje': [_ser_presupuesto_viaje(pv) for pv in presupuestos_viaje],
            'aportes': [_ser_aporte(a) for a in aportes],
            'registros_valor': [_ser_registro_valor(rv) for rv in registros_valor],
        },
    }
