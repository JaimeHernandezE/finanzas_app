"""
Resumen agregado para la pantalla dashboard (saldo proyectado y dependencias).
"""

from datetime import date
from decimal import Decimal

from django.db.models import Exists, OuterRef, Sum
from django.utils import timezone

from applications.espacios.models import Espacio
from applications.finanzas.models import (
    CATEGORIA_INGRESO_DECLARADO_FONDO_COMUN,
    CuentaPersonal,
    IngresoComun,
    Movimiento,
    SueldoEstimadoProrrateoMensual,
)
from applications.finanzas.tenant_helpers import (
    calcular_proporcion_usuario,
    miembros_prorrateo,
    resolver_espacio_id,
)
from . import presupuesto_mes as svc_pres
from applications.finanzas import services_recalculo


def _str_decimal(d: Decimal) -> str:
    return str(d.quantize(Decimal('0.01')))


def _efectivo_payload(usuario, espacio=None) -> dict:
    """Misma forma que `views.efectivo_disponible`."""
    datos = services_recalculo.efectivo_disponible_dashboard(usuario, espacio=espacio)
    espacio_id = resolver_espacio_id(usuario, espacio)
    recalculo = (
        services_recalculo.get_recalculo_estado(espacio_id)
        if espacio_id
        else {'pendiente': False, 'dirty_from': None}
    )
    desglose = datos['desglose']
    return {
        'efectivo': str(datos['efectivo']),
        'personal_historico': str(datos['personal_historico']),
        'comun_movimientos_historico': str(datos['comun_movimientos_historico']),
        'prorrateo_gastos_comunes_acumulado': str(datos['prorrateo_gastos_comunes_acumulado']),
        'desglose': {k: str(v) for k, v in desglose.items()},
        'recalculo': recalculo,
    }


def _ingresos_sueldo_proyectado_mes(usuario, mes: int, anio: int, espacio=None) -> Decimal:
    espacio_id = resolver_espacio_id(usuario, espacio)

    if espacio_id is None:
        return Decimal('0')

    if espacio is not None and espacio.es_personal:
        qs = (
            Movimiento.objects.filter(
                espacio_id=espacio_id,
                usuario=usuario,
                fecha__year=anio,
                fecha__month=mes,
                tipo='INGRESO',
                ambito='PERSONAL',
                oculto=False,
            )
            .exclude(metodo_pago__tipo='CREDITO')
            .exclude(Exists(IngresoComun.objects.filter(movimiento_id=OuterRef('pk'))))
            .exclude(categoria__nombre=CATEGORIA_INGRESO_DECLARADO_FONDO_COMUN)
        )
    else:
        qs = (
            Movimiento.objects.filter(
                espacio_id=espacio_id,
                usuario=usuario,
                fecha__year=anio,
                fecha__month=mes,
                tipo='INGRESO',
                ambito__in=['PERSONAL', 'COMUN'],
                oculto=False,
            )
            .exclude(metodo_pago__tipo='CREDITO')
            .exclude(Exists(IngresoComun.objects.filter(movimiento_id=OuterRef('pk'))))
            .exclude(categoria__nombre=CATEGORIA_INGRESO_DECLARADO_FONDO_COMUN)
        )

    t = qs.aggregate(s=Sum('monto'))['s']
    return (t if t is not None else Decimal('0')).quantize(Decimal('0.01'))


def _bases_prorrateo_persistidas(usuario, mes_pd, espacio=None) -> dict[int, Decimal]:
    """usuario_id -> monto guardado (0 si no hay fila)."""
    miembros = miembros_prorrateo(usuario, espacio, mes_pd)
    if not miembros:
        return {}
    ids = [u.pk for u in miembros]
    rows = SueldoEstimadoProrrateoMensual.objects.filter(
        usuario_id__in=ids,
        mes=mes_pd,
    ).values('usuario_id', 'monto')
    por_uid = {r['usuario_id']: Decimal(str(r['monto'])) for r in rows}
    return {uid: por_uid.get(uid, Decimal('0')) for uid in ids}


def obtener_resumen_dashboard(usuario, mes: int, anio: int, espacio=None) -> dict:
    """
    Resumen para `GET /api/finanzas/dashboard-resumen/`.
    """
    if not (1 <= mes <= 12) or anio < 2000 or anio > 2100:
        raise ValueError('mes o anio inválido')

    hoy = timezone.localdate()
    es_mes_calendario_actual = mes == hoy.month and anio == hoy.year
    mes_pd = date(anio, mes, 1)
    es_personal = espacio is not None and espacio.es_personal
    espacio_familiar = (
        espacio is not None
        and espacio.tipo == Espacio.TIPO_FAMILIAR
    )

    out: dict = {
        'periodo': {'mes': mes, 'anio': anio},
        'es_mes_calendario_actual': es_mes_calendario_actual,
    }

    out['efectivo'] = _efectivo_payload(usuario, espacio=espacio)

    if es_personal or not espacio_familiar:
        ing_mes = _ingresos_sueldo_proyectado_mes(usuario, mes, anio, espacio=espacio)
        out['compensacion'] = None
        out['sueldos_prorrateo_montos'] = {}
        out['prorrateo'] = {'proporcion': '0', 'base_usuario': '0'}
        out['ingresos_mes_actual'] = _str_decimal(ing_mes)
        out['sueldo_proyectado'] = _str_decimal(ing_mes)

        cuentas_propias = list(
            CuentaPersonal.objects.filter(usuario=usuario).order_by('nombre')
        )
        personales_out: list[dict] = []
        if not cuentas_propias:
            filas_p = svc_pres.build_presupuesto_mes_filas(
                usuario, mes, anio, 'PERSONAL', None, espacio=espacio
            )
            tot_p = svc_pres.total_presupuesto_comprometido(filas_p)
            if tot_p > 0:
                personales_out.append(
                    {
                        'cuenta_id': None,
                        'cuenta_nombre': 'Personal',
                        'total_comprometido': str(tot_p),
                    }
                )
        else:
            for c in cuentas_propias:
                filas_c = svc_pres.build_presupuesto_mes_filas(
                    usuario, mes, anio, 'PERSONAL', c.pk, espacio=espacio
                )
                tot_c = svc_pres.total_presupuesto_comprometido(filas_c)
                if tot_c > 0:
                    personales_out.append(
                        {
                            'cuenta_id': c.pk,
                            'cuenta_nombre': c.nombre,
                            'total_comprometido': str(tot_c),
                        }
                    )

        out['presupuesto'] = {
            'comun_total_comprometido': '0',
            'personales': personales_out,
        }
        total_pers = sum(int(p['total_comprometido']) for p in personales_out)
        out['presupuesto_comun_prorrateado'] = '0'
        out['total_presupuestos_personales'] = str(total_pers)

        datos_ef = services_recalculo.efectivo_disponible_dashboard(usuario, espacio=espacio)
        ef_dec = datos_ef['efectivo']
        des = datos_ef['desglose']
        hasta_ant = (ef_dec - des['b'] - des['e']).quantize(Decimal('0.01'))
        out['efectivo_hasta_mes_anterior'] = _str_decimal(hasta_ant)

        saldo = (ing_mes + hasta_ant - Decimal(total_pers)).quantize(Decimal('0.01'))
        out['saldo_proyectado'] = _str_decimal(saldo)
        out['desglose_saldo'] = [
            {'letra': 'A', 'etiqueta': 'Ingresos mes actual', 'monto': int(round(ing_mes))},
            {'letra': 'B', 'etiqueta': 'Efectivo hasta mes anterior', 'monto': int(round(hasta_ant))},
        ]
        for idx, p in enumerate(personales_out):
            letra = chr(ord('C') + idx)
            out['desglose_saldo'].append(
                {
                    'letra': letra,
                    'etiqueta': f"Presupuesto personal — {p['cuenta_nombre']}",
                    'monto': int(p['total_comprometido']),
                }
            )
        return out

    out['efectivo'] = _efectivo_payload(usuario, espacio=espacio)

    datos_comp = services_recalculo.datos_compensacion_proyectada(
        usuario, mes, anio, espacio=espacio
    )
    out['compensacion'] = datos_comp

    bases = _bases_prorrateo_persistidas(usuario, mes_pd, espacio=espacio)
    out['sueldos_prorrateo_montos'] = {str(k): _str_decimal(v) for k, v in bases.items()}

    proporcion, base_usuario = calcular_proporcion_usuario(
        usuario, espacio, mes_pd, bases
    )
    out['prorrateo'] = {
        'proporcion': str(proporcion),
        'base_usuario': _str_decimal(base_usuario),
    }

    ing_mes = _ingresos_sueldo_proyectado_mes(usuario, mes, anio, espacio=espacio)
    out['ingresos_mes_actual'] = _str_decimal(ing_mes)

    sueldo_proj = (base_usuario + ing_mes).quantize(Decimal('0.01'))
    out['sueldo_proyectado'] = _str_decimal(sueldo_proj)

    filas_comun = svc_pres.build_presupuesto_mes_filas(
        usuario, mes, anio, 'FAMILIAR', None, espacio=espacio
    )
    comun_total = svc_pres.total_presupuesto_comprometido(filas_comun)

    cuentas_propias = list(
        CuentaPersonal.objects.filter(usuario=usuario).order_by('nombre')
    )
    personales_out: list[dict] = []
    if not cuentas_propias:
        filas_p = svc_pres.build_presupuesto_mes_filas(
            usuario, mes, anio, 'PERSONAL', None, espacio=espacio
        )
        tot_p = svc_pres.total_presupuesto_comprometido(filas_p)
        if tot_p > 0:
            personales_out.append(
                {
                    'cuenta_id': None,
                    'cuenta_nombre': 'Personal',
                    'total_comprometido': str(tot_p),
                }
            )
    else:
        for c in cuentas_propias:
            filas_c = svc_pres.build_presupuesto_mes_filas(
                usuario, mes, anio, 'PERSONAL', c.pk, espacio=espacio
            )
            tot_c = svc_pres.total_presupuesto_comprometido(filas_c)
            if tot_c > 0:
                personales_out.append(
                    {
                        'cuenta_id': c.pk,
                        'cuenta_nombre': c.nombre,
                        'total_comprometido': str(tot_c),
                    }
                )

    out['presupuesto'] = {
        'comun_total_comprometido': str(comun_total),
        'personales': personales_out,
    }

    total_pers = sum(int(p['total_comprometido']) for p in personales_out)
    modo = espacio.modo_reparto if espacio is not None else Espacio.REPARTO_PROPORCIONAL
    if modo == Espacio.REPARTO_SIN:
        pres_comun_pror = 0
    else:
        pres_comun_pror = int(round(Decimal(comun_total) * proporcion))
    out['presupuesto_comun_prorrateado'] = str(pres_comun_pror)
    out['total_presupuestos_personales'] = str(total_pers)

    datos_ef = services_recalculo.efectivo_disponible_dashboard(usuario, espacio=espacio)
    ef_dec = datos_ef['efectivo']
    des = datos_ef['desglose']
    hasta_ant = (ef_dec - des['b'] - des['e']).quantize(Decimal('0.01'))
    out['efectivo_hasta_mes_anterior'] = _str_decimal(hasta_ant)

    saldo = (sueldo_proj + hasta_ant - Decimal(pres_comun_pror) - Decimal(total_pers)).quantize(
        Decimal('0.01')
    )
    out['saldo_proyectado'] = _str_decimal(saldo)

    alphabet = 'DEFGHIJKLMNOPQRSTUVWXYZ'
    desglose_saldo: list[dict] = [
        {'letra': 'A', 'etiqueta': 'Sueldo estimado + ingresos mes actual', 'monto': int(round(sueldo_proj))},
        {'letra': 'B', 'etiqueta': 'Efectivo hasta mes anterior', 'monto': int(round(hasta_ant))},
        {
            'letra': 'C',
            'etiqueta': 'Presupuesto común prorrateado',
            'monto': int(round(Decimal(pres_comun_pror))),
        },
    ]
    for idx, p in enumerate(personales_out):
        letra = alphabet[idx] if idx < len(alphabet) else f'P{idx + 1}'
        desglose_saldo.append(
            {
                'letra': letra,
                'etiqueta': f"Presupuesto personal — {p['cuenta_nombre']}",
                'monto': int(p['total_comprometido']),
            }
        )
    out['desglose_saldo'] = desglose_saldo

    return out
