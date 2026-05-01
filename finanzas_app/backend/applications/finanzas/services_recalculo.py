"""
Recálculo incremental de snapshots mensuales (efectivo personal y liquidación común).
"""

from datetime import date, datetime
from decimal import Decimal, ROUND_DOWN
from typing import Iterable

from dateutil.relativedelta import relativedelta
from django.contrib.auth import get_user_model
from django.db.models import Count, Exists, Min, OuterRef, Sum
from django.utils import timezone

from .models import (
    CATEGORIA_INGRESO_DECLARADO_FONDO_COMUN,
    Cuota,
    CuentaPersonal,
    IngresoComun,
    LiquidacionComunMensualSnapshot,
    Movimiento,
    ResumenHistoricoMesSnapshot,
    SaldoMensualSnapshot,
)


def primer_dia_mes(d: date | str) -> date:
    if isinstance(d, str):
        d = datetime.strptime(d[:10], '%Y-%m-%d').date()
    return date(d.year, d.month, 1)


def _calcular_mes_base_cuotas(fecha_gasto: date, dia_facturacion: int | None) -> date:
    if not dia_facturacion:
        return date(fecha_gasto.year, fecha_gasto.month, 1)
    if fecha_gasto.day <= dia_facturacion:
        return date(fecha_gasto.year, fecha_gasto.month, 1)
    siguiente = date(fecha_gasto.year, fecha_gasto.month, 1) + relativedelta(months=1)
    return date(siguiente.year, siguiente.month, 1)


def _plan_cuotas_esperado(mov: Movimiento) -> list[dict]:
    n = mov.num_cuotas or 0
    if n <= 0:
        return []

    monto_base = Decimal(str(mov.monto))
    if mov.monto_cuota:
        monto_cuota = Decimal(str(mov.monto_cuota))
    else:
        monto_cuota = (monto_base / n).quantize(Decimal('0.01'), rounding=ROUND_DOWN)
    diferencia = monto_base - (monto_cuota * n)

    dia_facturacion = mov.tarjeta.dia_facturacion if mov.tarjeta else None
    mes_base = _calcular_mes_base_cuotas(mov.fecha, dia_facturacion)
    plan = []
    for i in range(n):
        plan.append({
            'numero': i + 1,
            'monto': monto_cuota + (diferencia if i == 0 else Decimal('0.00')),
            'mes_facturacion': mes_base + relativedelta(months=i),
        })
    return plan


def reparar_cuotas_credito_familia(familia_id: int) -> dict:
    """
    Repara cuotas de movimientos CREDITO preservando historia de pagos:
    - Actualiza monto y, si incluir=True, mes_facturacion de cuotas no pagadas.
    - Crea cuotas faltantes.
    - Elimina cuotas sobrantes no pagadas.
    - Nunca modifica ni elimina cuotas con estado PAGADO.
    """
    stats = {
        'movimientos_credito': 0,
        'cuotas_creadas': 0,
        'cuotas_actualizadas': 0,
        'cuotas_eliminadas': 0,
        'cuotas_pagadas_omitidas': 0,
    }

    movimientos = (
        Movimiento.objects.filter(familia_id=familia_id, metodo_pago__tipo='CREDITO')
        .select_related('tarjeta')
        .order_by('id')
    )
    stats['movimientos_credito'] = movimientos.count()

    for mov in movimientos:
        esperadas = _plan_cuotas_esperado(mov)
        existentes = list(Cuota.objects.filter(movimiento=mov).order_by('numero', 'id'))

        existentes_por_num: dict[int, list[Cuota]] = {}
        for c in existentes:
            existentes_por_num.setdefault(c.numero, []).append(c)

        numeros_esperados = {e['numero'] for e in esperadas}
        pagadas = [c for c in existentes if c.estado == 'PAGADO']
        stats['cuotas_pagadas_omitidas'] += len(pagadas)

        for e in esperadas:
            num = e['numero']
            candidatos = existentes_por_num.get(num, [])
            base = candidatos[0] if candidatos else None

            if base is None:
                Cuota.objects.create(
                    movimiento=mov,
                    numero=num,
                    monto=e['monto'],
                    mes_facturacion=e['mes_facturacion'],
                    estado='PENDIENTE',
                    incluir=True,
                )
                stats['cuotas_creadas'] += 1
                continue

            if base.estado != 'PAGADO':
                cambios = []
                if base.monto != e['monto']:
                    base.monto = e['monto']
                    cambios.append('monto')
                # Si fue excluida manualmente, se respeta su desplazamiento de mes.
                if base.incluir and base.mes_facturacion != e['mes_facturacion']:
                    base.mes_facturacion = e['mes_facturacion']
                    cambios.append('mes_facturacion')
                if cambios:
                    base.save(update_fields=cambios)
                    stats['cuotas_actualizadas'] += 1

            duplicadas = candidatos[1:] if len(candidatos) > 1 else []
            for dup in duplicadas:
                if dup.estado == 'PAGADO':
                    stats['cuotas_pagadas_omitidas'] += 1
                    continue
                dup.delete()
                stats['cuotas_eliminadas'] += 1

        for c in existentes:
            if c.numero in numeros_esperados:
                continue
            if c.estado == 'PAGADO':
                stats['cuotas_pagadas_omitidas'] += 1
                continue
            c.delete()
            stats['cuotas_eliminadas'] += 1

    return stats


def ultimo_mes_cerrado(hoy: date | None = None) -> date:
    """Primer día del último mes calendario cerrado (excluye el mes en curso)."""
    if hoy is None:
        hoy = timezone.localdate()
    return primer_dia_mes(hoy) - relativedelta(months=1)


def meses_desde_hasta(inicio: date, fin: date) -> list[date]:
    """Lista de primeros días de mes desde inicio hasta fin (inclusive)."""
    cur = primer_dia_mes(inicio)
    fin_m = primer_dia_mes(fin)
    out: list[date] = []
    while cur <= fin_m:
        out.append(cur)
        cur = cur + relativedelta(months=1)
    return out


def miembros_para_prorrateo_fondo_comun(familia_id: int, mes_pd: date) -> list:
    """
    Miembros que participan en el prorrateo de gastos comunes para ese mes calendario.

    Meses estrictamente anteriores al mes en curso: todos los de la familia (no se reescribe
    el historial al deshabilitar alguien). Mes en curso y futuros: solo usuarios con activo=True.
    """
    User = get_user_model()
    base = User.objects.filter(familia_id=familia_id)
    hoy = timezone.localdate()
    mes_actual = primer_dia_mes(hoy)
    if mes_pd < mes_actual:
        return list(base.order_by('first_name', 'id'))
    return list(base.filter(activo=True).order_by('first_name', 'id'))


def get_recalculo_estado(familia_id: int) -> dict:
    return {
        'pendiente': False,
        'dirty_from': None,
    }


def _efectivo_neto_personal_qs(qs):
    """
    Ámbito PERSONAL (efectivo/débito, sin crédito):
    - Ingresos: no incluye sueldos/ingresos declarados al fondo común (Movimiento vinculado a IngresoComun).
    - Egresos: solo gastos corrientes de la cuenta (excluye categorías marcadas como inversión/patrimonio).
    Retorna (efectivo_neto, n_movimientos, ingresos_sum, egresos_sum); egresos como suma positiva.
    """
    ingresos = Decimal('0')
    egresos = Decimal('0')
    n = 0
    qs = qs.select_related('metodo_pago', 'categoria').annotate(
        _tiene_ingreso_comun=Exists(
            IngresoComun.objects.filter(movimiento_id=OuterRef('pk'))
        )
    )
    for m in qs:
        if m.metodo_pago.tipo == 'CREDITO':
            continue
        amt = Decimal(m.monto)
        if m.tipo == 'INGRESO':
            if m._tiene_ingreso_comun:
                continue
            if m.categoria.nombre == CATEGORIA_INGRESO_DECLARADO_FONDO_COMUN:
                continue
            ingresos += amt
        else:
            if m.categoria.es_inversion:
                continue
            egresos += amt
        n += 1
    return ingresos - egresos, n, ingresos, egresos


def recalcular_mes_liquidacion_comun(familia_id: int, mes_primer_dia: date) -> None:
    LiquidacionComunMensualSnapshot.objects.filter(
        familia_id=familia_id,
        mes=mes_primer_dia,
    ).delete()

    ingresos_qs = (
        IngresoComun.objects.filter(
            familia_id=familia_id,
            mes__month=mes_primer_dia.month,
            mes__year=mes_primer_dia.year,
        )
        .values('usuario_id')
        .annotate(total=Sum('monto'), cnt=Count('id'))
    )
    for row in ingresos_qs:
        LiquidacionComunMensualSnapshot.objects.create(
            familia_id=familia_id,
            mes=mes_primer_dia,
            usuario_id=row['usuario_id'],
            tipo_linea='INGRESO_COMUN',
            total=row['total'] or Decimal('0'),
            items_contados=row['cnt'],
        )

    gastos_qs = (
        Movimiento.objects.filter(
            familia_id=familia_id,
            ambito='COMUN',
            tipo='EGRESO',
            fecha__month=mes_primer_dia.month,
            fecha__year=mes_primer_dia.year,
            oculto=False,
        )
        .exclude(metodo_pago__tipo='CREDITO')
        .values('usuario_id')
        .annotate(total=Sum('monto'), cnt=Count('id'))
    )
    cuotas_comunes_pendientes_qs = (
        Cuota.objects.filter(
            movimiento__familia_id=familia_id,
            movimiento__ambito='COMUN',
            movimiento__tipo='EGRESO',
            movimiento__oculto=False,
            movimiento__metodo_pago__tipo='CREDITO',
            incluir=True,
            mes_facturacion__month=mes_primer_dia.month,
            mes_facturacion__year=mes_primer_dia.year,
            estado='PENDIENTE',
        )
        .values('movimiento__usuario_id')
        .annotate(total=Sum('monto'), cnt=Count('id'))
    )

    gastos_por_usuario: dict[int, dict[str, Decimal | int]] = {}
    for row in gastos_qs:
        uid = row['usuario_id']
        gastos_por_usuario[uid] = {
            'total': row['total'] or Decimal('0'),
            'cnt': row['cnt'] or 0,
        }
    for row in cuotas_comunes_pendientes_qs:
        uid = row['movimiento__usuario_id']
        previo = gastos_por_usuario.get(uid, {'total': Decimal('0'), 'cnt': 0})
        gastos_por_usuario[uid] = {
            'total': (previo['total'] or Decimal('0')) + (row['total'] or Decimal('0')),
            'cnt': int(previo['cnt']) + int(row['cnt'] or 0),
        }
    for usuario_id, data in gastos_por_usuario.items():
        LiquidacionComunMensualSnapshot.objects.create(
            familia_id=familia_id,
            mes=mes_primer_dia,
            usuario_id=usuario_id,
            tipo_linea='GASTO_COMUN_NO_CREDITO',
            total=data['total'] or Decimal('0'),
            items_contados=int(data['cnt']),
        )


def recalcular_mes_saldos_personales_usuario(
    familia_id: int, usuario_id: int, mes_primer_dia: date
) -> None:
    """Snapshots SaldoMensualSnapshot para un usuario y mes (ámbito PERSONAL)."""
    SaldoMensualSnapshot.objects.filter(
        familia_id=familia_id, usuario_id=usuario_id, mes=mes_primer_dia
    ).delete()

    base = Movimiento.objects.filter(
        familia_id=familia_id,
        usuario_id=usuario_id,
        ambito='PERSONAL',
        oculto=False,
        fecha__month=mes_primer_dia.month,
        fecha__year=mes_primer_dia.year,
    )
    if not base.exists():
        return

    cuenta_ids = list(base.values_list('cuenta_id', flat=True).distinct())
    for cid in cuenta_ids:
        if cid is None:
            sub = base.filter(cuenta_id__isnull=True)
            ck = 0
        else:
            sub = base.filter(cuenta_id=cid)
            ck = int(cid)
        efectivo, cnt, ing, egr = _efectivo_neto_personal_qs(sub)
        SaldoMensualSnapshot.objects.update_or_create(
            familia_id=familia_id,
            usuario_id=usuario_id,
            mes=mes_primer_dia,
            cuenta_id=ck,
            defaults={
                'ingresos_efectivo': ing,
                'egresos_efectivo': egr,
                'efectivo_neto': efectivo,
                'movimientos_contados': cnt,
            },
        )


def recalcular_mes_saldos_personales_familia(familia_id: int, mes_primer_dia: date) -> None:
    SaldoMensualSnapshot.objects.filter(familia_id=familia_id, mes=mes_primer_dia).delete()

    User = get_user_model()
    for usuario in User.objects.filter(familia_id=familia_id):
        recalcular_mes_saldos_personales_usuario(familia_id, usuario.pk, mes_primer_dia)


def _primer_mes_movimiento_personal_usuario(familia_id: int, usuario_id: int) -> date | None:
    m = Movimiento.objects.filter(
        familia_id=familia_id,
        usuario_id=usuario_id,
        ambito='PERSONAL',
    ).aggregate(m=Min('fecha'))['m']
    return primer_dia_mes(m) if m else None


def backfill_saldos_personales_usuario(usuario_id: int, familia_id: int) -> int:
    """
    Recalcula SaldoMensualSnapshot del usuario desde el primer mes con movimientos PERSONAL
    hasta el mes calendario actual (inclusive).
    """
    primero = _primer_mes_movimiento_personal_usuario(familia_id, usuario_id)
    if not primero:
        return 0
    hoy = timezone.localdate()
    fin = primer_dia_mes(hoy)
    n = 0
    for mes_pd in meses_desde_hasta(primero, fin):
        recalcular_mes_saldos_personales_usuario(familia_id, usuario_id, mes_pd)
        n += 1
    return n


def recalcular_familia_desde(familia_id: int, mes_inicio: date) -> None:
    """Recalcula snapshots desde mes_inicio (inclusive) hasta el mes actual."""
    mes_inicio = primer_dia_mes(mes_inicio)
    hoy = timezone.localdate()
    fin = primer_dia_mes(hoy)
    for mes in meses_desde_hasta(mes_inicio, fin):
        recalcular_mes_liquidacion_comun(familia_id, mes)
        recalcular_mes_saldos_personales_familia(familia_id, mes)


def recalcular_familia_meses(familia_id: int, meses: Iterable[date]) -> None:
    """Recalcula snapshots solo para los meses especificados."""
    meses_norm = sorted({primer_dia_mes(m) for m in meses})
    for mes in meses_norm:
        recalcular_mes_liquidacion_comun(familia_id, mes)
        recalcular_mes_saldos_personales_familia(familia_id, mes)


def dispatch_recalculo_tras_cambio(familia_id: int, mes_afectado: date) -> None:
    """Tras crear/editar/borrar datos: recalcula snapshots del mes afectado."""
    recalcular_familia_meses(familia_id, [mes_afectado])


def meses_afectados_por_movimiento(
    anterior: Movimiento | None, nuevo: Movimiento | None
) -> set[date]:
    meses: set[date] = set()
    if anterior is not None:
        meses.add(primer_dia_mes(anterior.fecha))
    if nuevo is not None:
        meses.add(primer_dia_mes(nuevo.fecha))
    return meses


def meses_afectados_por_ingreso_comun(
    anterior: IngresoComun | None, nuevo: IngresoComun | None
) -> set[date]:
    meses: set[date] = set()
    if anterior is not None:
        meses.add(primer_dia_mes(anterior.mes))
    if nuevo is not None:
        meses.add(primer_dia_mes(nuevo.mes))
    return meses


def dispatch_recalculo_multiples_meses(familia_id: int, meses: set[date]) -> None:
    """Varios meses afectados (p. ej. cambio de fecha): recálculo inmediato puntual."""
    if not meses:
        return
    recalcular_familia_meses(familia_id, meses)


def procesar_recalculos_pendientes(limit_familias: int | None = None) -> int:
    """Compatibilidad: ya no existe cola diferida, no hay trabajo pendiente."""
    _ = limit_familias
    return 0


def nombre_usuario_liquidacion(usuario) -> str:
    """Nombre completo para API de liquidación (coherente con el resto de la app)."""
    if usuario is None:
        return ''
    return (usuario.get_full_name() or usuario.username or str(usuario.pk)).strip()


def nombre_para_liquidacion_valores(
    first_name: str | None, last_name: str | None, username: str | None
) -> str:
    """Construye el mismo criterio que get_full_name cuando solo hay columnas en values()."""
    full = f'{(first_name or "").strip()} {(last_name or "").strip()}'.strip()
    return full or (username or '').strip() or ''


def liquidacion_datos_desde_snapshot_o_query(familia_id: int, mes: int, anio: int):
    """
    Retorna (ingresos_list, gastos_list) como listas de dicts compatibles con la vista liquidacion,
    o None si no hay snapshots y debe usarse query directa.
    """
    mes_pd = date(anio, mes, 1)
    qs = LiquidacionComunMensualSnapshot.objects.filter(
        familia_id=familia_id,
        mes=mes_pd,
    ).select_related('usuario')
    if not qs.exists():
        return None

    ingresos = []
    gastos = []
    for row in qs:
        nombre = nombre_usuario_liquidacion(row.usuario)
        if row.tipo_linea == 'INGRESO_COMUN':
            ingresos.append(
                {
                    'usuario_id': row.usuario_id,
                    'nombre': nombre,
                    'total': str(row.total),
                }
            )
        else:
            gastos.append(
                {
                    'usuario_id': row.usuario_id,
                    'nombre': nombre,
                    'total': str(row.total),
                }
            )
    return ingresos, gastos


def efectivo_por_cuenta_live(usuario, familia_id: int, mes: int, anio: int):
    """Calcula efectivo neto por cuenta sin persistir snapshot (fallback)."""
    from .models import CuentaPersonal

    base = Movimiento.objects.filter(
        familia_id=familia_id,
        usuario_id=usuario.pk,
        ambito='PERSONAL',
        oculto=False,
        fecha__month=mes,
        fecha__year=anio,
    )
    if not base.exists():
        return []

    out = []
    for cid in base.values_list('cuenta_id', flat=True).distinct():
        if cid is None:
            sub = base.filter(cuenta_id__isnull=True)
            ck = 0
            nombre = 'Sin cuenta'
        else:
            sub = base.filter(cuenta_id=cid)
            ck = int(cid)
            c = CuentaPersonal.objects.filter(pk=cid, usuario=usuario).first()
            nombre = c.nombre if c else 'Cuenta'
        efectivo, _cnt, ing, egr = _efectivo_neto_personal_qs(sub)
        out.append(
            {
                'cuenta_id': ck,
                'nombre': nombre,
                'efectivo': str(efectivo),
                'ingresos': str(ing),
                'egresos': str(egr),
            }
        )
    return sorted(out, key=lambda x: x['cuenta_id'])


def _primer_mes_datos_familia(familia_id: int) -> date | None:
    m1 = Movimiento.objects.filter(familia_id=familia_id).aggregate(m=Min('fecha'))['m']
    m2 = IngresoComun.objects.filter(familia_id=familia_id).aggregate(m=Min('mes'))['m']
    cands = [d for d in (m1, m2) if d is not None]
    if not cands:
        return None
    return primer_dia_mes(min(cands))


def _total_ingresos_comunes_mes(familia_id: int, mes_pd: date) -> Decimal:
    t = IngresoComun.objects.filter(
        familia_id=familia_id,
        mes__year=mes_pd.year,
        mes__month=mes_pd.month,
    ).aggregate(t=Sum('monto'))['t']
    return t if t is not None else Decimal('0')


def _ingreso_comun_usuario_mes(familia_id: int, usuario_id: int, mes_pd: date) -> Decimal:
    t = IngresoComun.objects.filter(
        familia_id=familia_id,
        usuario_id=usuario_id,
        mes__year=mes_pd.year,
        mes__month=mes_pd.month,
    ).aggregate(t=Sum('monto'))['t']
    return t if t is not None else Decimal('0')


def _total_comun_neto_familia_mes(familia_id: int, mes_pd: date) -> Decimal:
    """
    Neto familia en ámbito COMÚN (efectivo/débito): suma ingresos − suma egresos del mes.
    Egresos en categoría de inversión/patrimonio (es_inversion) no cuentan en liquidación/prorrateo.
    """
    qs = Movimiento.objects.filter(
        familia_id=familia_id,
        ambito='COMUN',
        oculto=False,
        fecha__year=mes_pd.year,
        fecha__month=mes_pd.month,
    ).exclude(metodo_pago__tipo='CREDITO')
    ing = (
        qs.filter(tipo='INGRESO')
        .exclude(categoria__nombre=CATEGORIA_INGRESO_DECLARADO_FONDO_COMUN)
        .aggregate(t=Sum('monto'))['t']
    )
    egr = (
        qs.filter(tipo='EGRESO')
        .exclude(categoria__es_inversion=True)
        .aggregate(t=Sum('monto'))['t']
    )
    ing = ing if ing is not None else Decimal('0')
    egr = egr if egr is not None else Decimal('0')
    return ing - egr


def _efectivo_comun_neto_usuario_mes(usuario_id: int, familia_id: int, mes_pd: date) -> Decimal:
    """
    Neto efectivo/débito ámbito COMÚN en el mes: suma ingresos como positivo y egresos como negativo
    (excluye crédito). Misma convención que el listado de gastos comunes en la app.
    """
    qs = Movimiento.objects.filter(
        familia_id=familia_id,
        usuario_id=usuario_id,
        ambito='COMUN',
        oculto=False,
        fecha__year=mes_pd.year,
        fecha__month=mes_pd.month,
    ).exclude(metodo_pago__tipo='CREDITO')

    ing = (
        qs.filter(tipo='INGRESO')
        .exclude(categoria__nombre=CATEGORIA_INGRESO_DECLARADO_FONDO_COMUN)
        .aggregate(t=Sum('monto'))['t']
    )
    egr = (
        qs.filter(tipo='EGRESO')
        .exclude(categoria__es_inversion=True)
        .aggregate(t=Sum('monto'))['t']
    )
    ing = ing if ing is not None else Decimal('0')
    egr = egr if egr is not None else Decimal('0')
    return ing - egr


def efectivo_disponible_dashboard(usuario) -> dict:
    """
    Efectivo para el dashboard (usuario autenticado):

    - A: total IngresoComun del usuario (todos los meses excepto el calendario actual).
    - B: total IngresoComun del mes calendario en curso (sueldo declarado).
    - C: suma de todos los netos mensuales (ingresos − egresos) de resumen_cuenta_personal_mensual
      por cada cuenta personal del usuario, más resumen_sin_cuenta_personal_mensual (igual que la UI).
    - D: suma de |gasto_prorrateado| en snapshots de meses distintos al actual (magnitud a restar).
    - E: neto mes actual personal (sin duplicar sueldos declarados; excluye ingreso vinculado
      a IngresoComun) + neto común efectivo/débito del mes.

    efectivo = A + B + C − D + E (mismo orden en desglose: a…e, e_personal, e_comun).
    """
    familia_id = usuario.familia_id
    z = Decimal('0')
    if not familia_id:
        zq = z.quantize(Decimal('0.01'))
        vacio = {
            'a': zq,
            'b': zq,
            'c': zq,
            'd': zq,
            'e': zq,
            'e_personal': zq,
            'e_comun': zq,
        }
        return {
            'efectivo': zq,
            'personal_historico': zq,
            'comun_movimientos_historico': zq,
            'prorrateo_gastos_comunes_acumulado': zq,
            'desglose': vacio,
        }

    hoy = timezone.localdate()
    mes_actual_pd = primer_dia_mes(hoy)
    uid = usuario.pk

    # A — Total sueldos declarados (IngresoComun), todos los meses excepto el actual
    sueldos_historico = (
        IngresoComun.objects.filter(familia_id=familia_id, usuario_id=uid)
        .exclude(mes__year=mes_actual_pd.year, mes__month=mes_actual_pd.month)
        .aggregate(t=Sum('monto'))['t']
        or z
    )

    # B — Suma de efectivo_neto de cada mes en el resumen de cada cuenta + sin cuenta (como la pantalla)
    personal_snap_historico = _total_b_resumen_mensual_todas_cuentas_personales(usuario)

    # C — Sueldo declarado (IngresoComun) del mes calendario en curso
    sueldo_mes_actual = (
        IngresoComun.objects.filter(
            familia_id=familia_id,
            usuario_id=uid,
            mes__year=mes_actual_pd.year,
            mes__month=mes_actual_pd.month,
        ).aggregate(t=Sum('monto'))['t']
        or z
    )

    # D — Suma de gastos prorrateados (esperado) del resumen familiar.
    # En payloads puede venir con signo negativo; siempre restamos la magnitud para no convertir
    # "− D" en suma cuando D acumulado es negativo.
    gastos_prorrateados_resumen = z
    for snap in ResumenHistoricoMesSnapshot.objects.filter(familia_id=familia_id).exclude(
        mes=mes_actual_pd
    ):
        for row in snap.payload.get('compensacion', {}).get('por_usuario', []):
            if row.get('usuario_id') == uid:
                gastos_prorrateados_resumen += abs(
                    Decimal(str(row.get('gasto_prorrateado', '0')))
                )
    d_monto_restar = gastos_prorrateados_resumen

    # E — Mes actual: neto personal sin duplicar sueldos (excluye ingreso vinculado a IngresoComun) + neto común
    qs_pers_mes = Movimiento.objects.filter(
        familia_id=familia_id,
        usuario_id=uid,
        ambito='PERSONAL',
        oculto=False,
        fecha__year=mes_actual_pd.year,
        fecha__month=mes_actual_pd.month,
    )
    neto_pers_base, _, _, _ = _efectivo_neto_personal_qs(qs_pers_mes)
    neto_comun_mes_actual = _efectivo_comun_neto_usuario_mes(uid, familia_id, mes_actual_pd)
    e_total = neto_pers_base + neto_comun_mes_actual

    efectivo_total = (
        sueldos_historico
        + personal_snap_historico
        + sueldo_mes_actual
        - d_monto_restar
        + e_total
    )
    efectivo_total = efectivo_total.quantize(Decimal('0.01'))

    qs_com = Movimiento.objects.filter(
        familia_id=familia_id,
        usuario_id=uid,
        ambito='COMUN',
        oculto=False,
    )
    comun_raw, _, _, _ = _efectivo_neto_personal_qs(qs_com)

    def q(d: Decimal) -> Decimal:
        return d.quantize(Decimal('0.01'))

    desglose = {
        'a': q(sueldos_historico),
        'b': q(sueldo_mes_actual),
        'c': q(personal_snap_historico),
        'd': q(d_monto_restar),
        'e': q(e_total),
        'e_personal': q(neto_pers_base),
        'e_comun': q(neto_comun_mes_actual),
    }

    return {
        'efectivo': efectivo_total,
        'personal_historico': q(personal_snap_historico),
        'comun_movimientos_historico': comun_raw.quantize(Decimal('0.01')),
        'prorrateo_gastos_comunes_acumulado': q(d_monto_restar),
        'desglose': desglose,
    }


def datos_compensacion_proyectada(usuario, mes: int, anio: int) -> dict | None:
    """
    Base para compensación como Resumen común del mes indicado:
    neto familiar COMÚN (ingresos − egresos COMÚN sin crédito) y, por miembro, neto común real en ese mes.
    ingreso_declarado_mes sirve para restarlo de la base guardada en SueldoEstimadoProrrateoMensual
    en el mes en curso (sueldo proyectado neto y pesos del prorrateo sin duplicar ingreso real).
    """
    familia_id = usuario.familia_id
    if not familia_id:
        return None
    mes_pd = date(anio, mes, 1)
    neto_familiar = _total_comun_neto_familia_mes(familia_id, mes_pd)
    miembros = miembros_para_prorrateo_fondo_comun(familia_id, mes_pd)
    if not miembros:
        return None
    out_miembros = []
    for u in miembros:
        neto_mes = _efectivo_comun_neto_usuario_mes(u.pk, familia_id, mes_pd)
        ing_decl = _ingreso_comun_usuario_mes(familia_id, u.pk, mes_pd)
        nombre = (u.get_full_name() or u.first_name or u.email or str(u.pk)).strip()
        out_miembros.append(
            {
                'usuario_id': u.pk,
                'nombre': nombre,
                'neto_comun_mes': str(neto_mes.quantize(Decimal('0.01'))),
                'ingreso_declarado_mes': str(ing_decl.quantize(Decimal('0.01'))),
            }
        )
    return {
        'periodo': {'mes': mes, 'anio': anio},
        'neto_familiar_comun': str(neto_familiar.quantize(Decimal('0.01'))),
        'miembros': out_miembros,
    }


def _transferencias_compensacion(
    deltas: dict[int, Decimal], uid_to_nombre: dict[int, str]
) -> list[dict]:
    """Empareja deudores con acreedores para sugerir transferencias que liquidan las diferencias."""
    creditors: list[list] = []
    debtors: list[list] = []
    for uid, d in deltas.items():
        if d > Decimal('0.005'):
            creditors.append([uid, d])
        elif d < Decimal('-0.005'):
            debtors.append([uid, d])
    creditors.sort(key=lambda x: -x[1])
    debtors.sort(key=lambda x: x[1])
    transfers: list[dict] = []
    i, j = 0, 0
    while i < len(creditors) and j < len(debtors):
        cu, c_amt = creditors[i]
        du, d_amt = debtors[j]
        amt = min(c_amt, -d_amt)
        if amt > Decimal('0.005'):
            transfers.append(
                {
                    'de_usuario_id': du,
                    'de_nombre': uid_to_nombre.get(du, ''),
                    'a_usuario_id': cu,
                    'a_nombre': uid_to_nombre.get(cu, ''),
                    'monto': str(amt.quantize(Decimal('0.01'))),
                }
            )
        creditors[i][1] -= amt
        debtors[j][1] += amt
        if creditors[i][1] < Decimal('0.01'):
            i += 1
        if debtors[j][1] > Decimal('-0.01'):
            j += 1
    return transfers


def invalidar_snapshots_resumen_historico(familia_id: int, meses: Iterable[date]) -> None:
    """Elimina snapshots del resumen histórico para los meses indicados (primer día de mes)."""
    if not familia_id:
        return
    for m in meses:
        mp = primer_dia_mes(m)
        ResumenHistoricoMesSnapshot.objects.filter(familia_id=familia_id, mes=mp).delete()


def calcular_resumen_mes(familia_id: int, mes_pd: date, miembros: list | None = None) -> dict | None:
    """
    Un mes calendario: neto familiar COMÚN (ingresos − egresos), neto por usuario, sueldos
    declarados, prorrateo sobre el neto familiar, compensación (neto vs esperado) y
    transferencias sugeridas.

    Si ``miembros`` es None, el conjunto depende del mes respecto al mes en curso
    (ver ``miembros_para_prorrateo_fondo_comun``): meses pasados = todos; mes actual y
    futuros = solo ``Usuario.activo``.
    El total de ingresos comunes para porcentajes es la suma solo de esos miembros.
    """
    if miembros is None:
        miembros = miembros_para_prorrateo_fondo_comun(familia_id, mes_pd)
    if not miembros:
        return None
    miembros_ids = [u.pk for u in miembros]
    n_miembros = len(miembros_ids)
    uid_to_nombre = {
        u.pk: (u.get_full_name() or u.first_name or u.email or u.username or str(u.pk)).strip()
        for u in miembros
    }

    neto_familiar = _total_comun_neto_familia_mes(familia_id, mes_pd)
    tot_ing = sum(
        (_ingreso_comun_usuario_mes(familia_id, uid, mes_pd) for uid in miembros_ids),
        start=Decimal('0'),
    )

    gastos_por_usuario = []
    sueldos = []
    prorrateo_list = []
    esperado_list = []
    por_usuario_comp = []
    deltas: dict[int, Decimal] = {}

    for uid in miembros_ids:
        neto_mes = _efectivo_comun_neto_usuario_mes(uid, familia_id, mes_pd)
        ing_mes = _ingreso_comun_usuario_mes(familia_id, uid, mes_pd)

        if tot_ing > 0:
            pct = (ing_mes / tot_ing) * Decimal('100')
            esperado = (ing_mes / tot_ing) * neto_familiar
        else:
            pct = (
                (Decimal('100') / Decimal(n_miembros))
                if n_miembros
                else Decimal('0')
            )
            esperado = (
                (neto_familiar / Decimal(n_miembros)).quantize(Decimal('0.01'))
                if n_miembros
                else Decimal('0')
            )

        diff = neto_mes - esperado
        deltas[uid] = diff

        gastos_por_usuario.append(
            {
                'usuario_id': uid,
                'nombre': uid_to_nombre[uid],
                'total': str(neto_mes.quantize(Decimal('0.01'))),
            }
        )
        sueldos.append(
            {
                'usuario_id': uid,
                'nombre': uid_to_nombre[uid],
                'total': str(ing_mes.quantize(Decimal('0.01'))),
            }
        )
        prorrateo_list.append(
            {
                'usuario_id': uid,
                'nombre': uid_to_nombre[uid],
                'porcentaje': str(pct.quantize(Decimal('0.01'))),
                'ingreso_comun_mes': str(ing_mes.quantize(Decimal('0.01'))),
            }
        )
        esperado_list.append(
            {
                'usuario_id': uid,
                'nombre': uid_to_nombre[uid],
                'total': str(esperado.quantize(Decimal('0.01'))),
            }
        )
        por_usuario_comp.append(
            {
                'usuario_id': uid,
                'nombre': uid_to_nombre[uid],
                'pagado_efectivo': str(neto_mes.quantize(Decimal('0.01'))),
                'gasto_prorrateado': str(esperado.quantize(Decimal('0.01'))),
                'diferencia': str(diff.quantize(Decimal('0.01'))),
            }
        )

    transferencias = _transferencias_compensacion(deltas, uid_to_nombre)

    return {
        'mes': mes_pd.month,
        'anio': mes_pd.year,
        'gasto_comun_total': str(neto_familiar.quantize(Decimal('0.01'))),
        'gastos_comunes_por_usuario': gastos_por_usuario,
        'sueldos_por_usuario': sueldos,
        'prorrateo_por_usuario': prorrateo_list,
        'gasto_comun_prorrateado_por_usuario': esperado_list,
        'compensacion': {
            'por_usuario': por_usuario_comp,
            'transferencias_sugeridas': transferencias,
        },
        'base_prorrateo': {
            'mes': mes_pd.month,
            'anio': mes_pd.year,
            'nota': 'El neto familiar y las cuotas usan ingresos − egresos. Proporciones según ingresos comunes declarados del mismo mes.',
        },
    }


def refrescar_resumen_historico_ultimo_mes_cerrado(
    familia_id: int, hoy: date | None = None
) -> int:
    """
    Persiste solo el snapshot del último mes calendario cerrado (útil en cron de inicio de mes).
    Retorna 1 si hubo fila guardada, 0 si no aplicaba.
    """
    User = get_user_model()
    if not User.objects.filter(familia_id=familia_id).exists():
        return 0
    if hoy is None:
        hoy = timezone.localdate()
    mes_pd = ultimo_mes_cerrado(hoy)
    row = calcular_resumen_mes(familia_id, mes_pd, miembros=None)
    if row is None:
        return 0
    ResumenHistoricoMesSnapshot.objects.update_or_create(
        familia_id=familia_id,
        mes=mes_pd,
        defaults={'payload': row},
    )
    return 1


def backfill_resumen_historico_snapshots(familia_id: int) -> int:
    """
    Recalcula y persiste snapshots para todos los meses con datos hasta el último mes cerrado
    (no incluye el mes calendario en curso).
    Útil tras migraciones o para reparar datos.
    """
    User = get_user_model()
    if not User.objects.filter(familia_id=familia_id).exists():
        return 0
    primero = _primer_mes_datos_familia(familia_id)
    if not primero:
        return 0
    mes_fin = ultimo_mes_cerrado()
    n = 0
    for mes_pd in meses_desde_hasta(primero, mes_fin):
        row = calcular_resumen_mes(familia_id, mes_pd, miembros=None)
        if row is None:
            continue
        ResumenHistoricoMesSnapshot.objects.update_or_create(
            familia_id=familia_id,
            mes=mes_pd,
            defaults={'payload': row},
        )
        n += 1
    return n


def resumen_historico_familia(familia_id: int) -> list[dict]:
    """
    Por cada mes calendario cerrado con datos: neto familiar COMÚN (ing. − egr.), neto por usuario,
    sueldos declarados, prorrateo sobre el neto familiar, compensación y transferencias.
    No incluye el mes calendario en curso (pasa a formar parte del resumen al cambiar de mes).
    Usa snapshots persistidos; si falta un mes, calcula y guarda.
    """
    User = get_user_model()
    if not User.objects.filter(familia_id=familia_id).exists():
        return []

    primero = _primer_mes_datos_familia(familia_id)
    if not primero:
        return []
    hoy = timezone.localdate()
    mes_fin = ultimo_mes_cerrado(hoy)
    out: list[dict] = []

    for mes_pd in meses_desde_hasta(primero, mes_fin):
        snap = ResumenHistoricoMesSnapshot.objects.filter(
            familia_id=familia_id, mes=mes_pd
        ).first()
        if snap is not None:
            out.append(snap.payload)
            continue
        row = calcular_resumen_mes(familia_id, mes_pd, miembros=None)
        if row is None:
            continue
        ResumenHistoricoMesSnapshot.objects.update_or_create(
            familia_id=familia_id,
            mes=mes_pd,
            defaults={'payload': row},
        )
        out.append(row)
    return out


def saldo_efectivo_cuentas_desde_snapshot(usuario, familia_id: int, mes: int, anio: int):
    """
    Lista {cuenta_id, nombre, efectivo, ingresos, egresos} desde snapshots; None si falta snapshot.
    cuenta_id 0 = sin cuenta.
    """
    mes_pd = date(anio, mes, 1)
    qs = SaldoMensualSnapshot.objects.filter(
        familia_id=familia_id,
        usuario_id=usuario.pk,
        mes=mes_pd,
    )
    if not qs.exists():
        return None
    from .models import CuentaPersonal

    out = []
    for row in qs.order_by('cuenta_id'):
        nombre = 'Sin cuenta'
        if row.cuenta_id:
            c = CuentaPersonal.objects.filter(pk=row.cuenta_id, usuario=usuario).first()
            if c:
                nombre = c.nombre
        out.append(
            {
                'cuenta_id': row.cuenta_id,
                'nombre': nombre,
                'efectivo': str(row.efectivo_neto),
                'ingresos': str(row.ingresos_efectivo),
                'egresos': str(row.egresos_efectivo),
            }
        )
    return out


def resumen_cuenta_personal_mensual(familia_id: int, cuenta_id: int) -> list[dict]:
    """
    Por mes calendario cerrado (desde el primer movimiento en la cuenta hasta el mes anterior al actual):
    ingresos/egresos/n neto con la misma regla que snapshots personales (sin sueldos declarados
    en ingresos; egresos solo gastos corrientes en esa cuenta, sin categoría inversión).
    No incluye el mes en curso. Solo movimientos de esta cuenta (cuenta_id) y ámbito PERSONAL.
    """
    base_q = Movimiento.objects.filter(
        familia_id=familia_id,
        cuenta_id=cuenta_id,
        ambito='PERSONAL',
        oculto=False,
    )
    min_f = base_q.aggregate(m=Min('fecha'))['m']
    if not min_f:
        return []
    primero = primer_dia_mes(min_f)
    hoy = timezone.localdate()
    mes_fin = ultimo_mes_cerrado(hoy)
    rows: list[dict] = []
    for mes_pd in meses_desde_hasta(primero, mes_fin):
        sub = base_q.filter(
            fecha__month=mes_pd.month,
            fecha__year=mes_pd.year,
        )
        efectivo, cnt, ing, egr = _efectivo_neto_personal_qs(sub)
        if cnt == 0 and efectivo == Decimal('0'):
            continue
        rows.append(
            {
                'mes': mes_pd.month,
                'anio': mes_pd.year,
                'ingresos': str(ing),
                'egresos': str(egr),
                'efectivo_neto': str(efectivo),
            }
        )
    rows.reverse()
    return rows


def resumen_sin_cuenta_personal_mensual(familia_id: int, usuario_id: int) -> list[dict]:
    """
    Igual que resumen_cuenta_personal_mensual pero para movimientos PERSONAL del usuario
    sin cuenta asignada (cuenta_id nulo).
    """
    base_q = Movimiento.objects.filter(
        familia_id=familia_id,
        usuario_id=usuario_id,
        cuenta_id__isnull=True,
        ambito='PERSONAL',
        oculto=False,
    )
    min_f = base_q.aggregate(m=Min('fecha'))['m']
    if not min_f:
        return []
    primero = primer_dia_mes(min_f)
    hoy = timezone.localdate()
    mes_fin = ultimo_mes_cerrado(hoy)
    rows: list[dict] = []
    for mes_pd in meses_desde_hasta(primero, mes_fin):
        sub = base_q.filter(
            fecha__month=mes_pd.month,
            fecha__year=mes_pd.year,
        )
        efectivo, cnt, ing, egr = _efectivo_neto_personal_qs(sub)
        if cnt == 0 and efectivo == Decimal('0'):
            continue
        rows.append(
            {
                'mes': mes_pd.month,
                'anio': mes_pd.year,
                'ingresos': str(ing),
                'egresos': str(egr),
                'efectivo_neto': str(efectivo),
            }
        )
    rows.reverse()
    return rows


def _total_b_resumen_mensual_todas_cuentas_personales(usuario) -> Decimal:
    """
    Suma de los netos mensuales (ingresos − egresos) del resumen de cada cuenta personal
    del usuario, más el resumen «sin cuenta». Misma fuente que la pantalla de resumen por cuenta.
    """
    familia_id = usuario.familia_id
    if not familia_id:
        return Decimal('0')
    total = Decimal('0')
    for cuenta in CuentaPersonal.objects.filter(usuario=usuario):
        for row in resumen_cuenta_personal_mensual(familia_id, cuenta.pk):
            total += Decimal(row['efectivo_neto'])
    for row in resumen_sin_cuenta_personal_mensual(familia_id, usuario.pk):
        total += Decimal(row['efectivo_neto'])
    return total
