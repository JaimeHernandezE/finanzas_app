"""
Resumen agregado para la pantalla dashboard (saldo proyectado y dependencias).
"""

from datetime import date
from decimal import Decimal

from django.db.models import Exists, OuterRef, Sum
from django.utils import timezone

from applications.finanzas.models import (
    CATEGORIA_INGRESO_DECLARADO_FONDO_COMUN,
    CuentaPersonal,
    IngresoComun,
    Movimiento,
    SueldoEstimadoProrrateoMensual,
)
from . import presupuesto_mes as svc_pres
from applications.finanzas import services_recalculo


def _str_decimal(d: Decimal) -> str:
    return str(d.quantize(Decimal('0.01')))


def _efectivo_payload(usuario) -> dict:
    """Misma forma que `views.efectivo_disponible`."""
    datos = services_recalculo.efectivo_disponible_dashboard(usuario)
    recalculo = (
        services_recalculo.get_recalculo_estado(usuario.familia_id)
        if usuario.familia_id
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


def _ingresos_sueldo_proyectado_mes(usuario, mes: int, anio: int) -> Decimal:
    if not usuario.familia_id:
        return Decimal('0')
    qs = (
        Movimiento.objects.filter(
            familia_id=usuario.familia_id,
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


def _bases_prorrateo_persistidas(usuario, mes_pd: date) -> dict[int, Decimal]:
    """usuario_id -> monto guardado (0 si no hay fila)."""
    miembros = services_recalculo.miembros_para_prorrateo_fondo_comun(usuario.familia_id, mes_pd)
    if not miembros:
        return {}
    ids = [u.pk for u in miembros]
    rows = SueldoEstimadoProrrateoMensual.objects.filter(
        usuario_id__in=ids,
        mes=mes_pd,
    ).values('usuario_id', 'monto')
    por_uid = {r['usuario_id']: Decimal(str(r['monto'])) for r in rows}
    return {uid: por_uid.get(uid, Decimal('0')) for uid in ids}


def _proporcion_y_mi_base(
    usuario,
    mes_pd: date,
    bases: dict[int, Decimal],
) -> tuple[Decimal, Decimal]:
    """(proporcion 0..1, base del usuario autenticado)."""
    miembros = services_recalculo.miembros_para_prorrateo_fondo_comun(usuario.familia_id, mes_pd)
    if not miembros:
        return Decimal('0'), Decimal('0')
    n = len(miembros)
    tot_est = sum((bases.get(u.pk, Decimal('0')) for u in miembros), start=Decimal('0'))
    meu = bases.get(usuario.pk, Decimal('0'))
    if tot_est > Decimal('0.005'):
        prop = (meu / tot_est).quantize(Decimal('0.000001'))
    else:
        prop = (Decimal('1') / Decimal(n)).quantize(Decimal('0.000001')) if n else Decimal('0')
    return prop, meu


def obtener_resumen_dashboard(usuario, mes: int, anio: int) -> dict:
    """
    Resumen para `GET /api/finanzas/dashboard-resumen/`.

    - `efectivo` sigue siendo el del **mes calendario actual** (no depende de mes/anio del query),
      igual que la pantalla hoy al llamar `efectivo-disponible` sin parámetros.
    - Saldo / prorrateo / ingresos mes usan el **mes y año** solicitados.
    """
    if not (1 <= mes <= 12) or anio < 2000 or anio > 2100:
        raise ValueError('mes o anio inválido')

    hoy = timezone.localdate()
    es_mes_calendario_actual = mes == hoy.month and anio == hoy.year
    mes_pd = date(anio, mes, 1)

    out: dict = {
        'periodo': {'mes': mes, 'anio': anio},
        'es_mes_calendario_actual': es_mes_calendario_actual,
    }

    if not usuario.familia_id:
        out['efectivo'] = _efectivo_payload(usuario)
        out['compensacion'] = None
        out['sueldos_prorrateo_montos'] = {}
        out['prorrateo'] = {'proporcion': '0', 'base_usuario': '0'}
        out['ingresos_mes_actual'] = '0.00'
        out['sueldo_proyectado'] = '0.00'
        out['presupuesto'] = {
            'comun_total_comprometido': '0',
            'personales': [],
        }
        out['efectivo_hasta_mes_anterior'] = '0'
        out['presupuesto_comun_prorrateado'] = '0'
        out['total_presupuestos_personales'] = '0'
        out['saldo_proyectado'] = '0'
        out['desglose_saldo'] = []
        return out

    out['efectivo'] = _efectivo_payload(usuario)

    datos_comp = services_recalculo.datos_compensacion_proyectada(usuario, mes, anio)
    out['compensacion'] = datos_comp

    bases = _bases_prorrateo_persistidas(usuario, mes_pd)
    out['sueldos_prorrateo_montos'] = {str(k): _str_decimal(v) for k, v in bases.items()}

    proporcion, base_usuario = _proporcion_y_mi_base(usuario, mes_pd, bases)
    out['prorrateo'] = {
        'proporcion': str(proporcion),
        'base_usuario': _str_decimal(base_usuario),
    }

    ing_mes = _ingresos_sueldo_proyectado_mes(usuario, mes, anio)
    out['ingresos_mes_actual'] = _str_decimal(ing_mes)

    sueldo_proj = (base_usuario + ing_mes).quantize(Decimal('0.01'))
    out['sueldo_proyectado'] = _str_decimal(sueldo_proj)

    filas_comun = svc_pres.build_presupuesto_mes_filas(usuario, mes, anio, 'FAMILIAR', None)
    comun_total = svc_pres.total_presupuesto_comprometido(filas_comun)

    cuentas_propias = list(
        CuentaPersonal.objects.filter(usuario=usuario).order_by('nombre')
    )
    personales_out: list[dict] = []
    if not cuentas_propias:
        filas_p = svc_pres.build_presupuesto_mes_filas(usuario, mes, anio, 'PERSONAL', None)
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
            filas_c = svc_pres.build_presupuesto_mes_filas(usuario, mes, anio, 'PERSONAL', c.pk)
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
    pres_comun_pror = int(round(Decimal(comun_total) * proporcion))
    out['presupuesto_comun_prorrateado'] = str(pres_comun_pror)
    out['total_presupuestos_personales'] = str(total_pers)

    # efectivo hasta mes anterior (misma fórmula que el front)
    datos_ef = services_recalculo.efectivo_disponible_dashboard(usuario)
    ef_dec = datos_ef['efectivo']
    des = datos_ef['desglose']
    b = des['b']
    e = des['e']
    hasta_ant = (ef_dec - b - e).quantize(Decimal('0.01'))
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
