"""
Filas de presupuesto vs gasto por mes (misma semántica que GET presupuesto-mes).
"""

from datetime import date
from decimal import Decimal

from django.db.models import Sum

from applications.finanzas.models import Categoria, Cuota, Movimiento, Presupuesto


def build_presupuesto_mes_filas(
    usuario,
    mes: int,
    anio: int,
    ambito: str,
    cuenta_id: int | None,
) -> list[dict]:
    """
    Construye la lista de filas que devuelve la vista `presupuesto_mes`.

    `ambito` debe ser 'FAMILIAR' o 'PERSONAL' (mayúsculas).
    `cuenta_id` solo aplica a ámbito PERSONAL (filtra movimientos/presupuesto por cuenta).
    """
    familia_id = usuario.familia_id
    mes_first = date(anio, mes, 1)

    if ambito == 'FAMILIAR':
        pres_qs = Presupuesto.objects.filter(
            familia_id=familia_id,
            mes=mes_first,
            usuario__isnull=True,
            categoria__familia_id=familia_id,
            categoria__usuario__isnull=True,
            categoria__cuenta_personal__isnull=True,
        ).select_related('categoria')
        mov_qs = Movimiento.objects.filter(
            familia_id=familia_id,
            fecha__month=mes,
            fecha__year=anio,
            tipo='EGRESO',
            ambito='COMUN',
            oculto=False,
        ).exclude(metodo_pago__tipo='CREDITO')
        cuotas_qs = Cuota.objects.filter(
            movimiento__familia_id=familia_id,
            movimiento__ambito='COMUN',
            movimiento__tipo='EGRESO',
            movimiento__oculto=False,
            movimiento__metodo_pago__tipo='CREDITO',
            incluir=True,
            mes_facturacion__month=mes,
            mes_facturacion__year=anio,
            estado='PENDIENTE',
        )
    else:
        pres_qs = Presupuesto.objects.filter(
            familia_id=familia_id,
            mes=mes_first,
            usuario=usuario,
            categoria__usuario=usuario,
        ).select_related('categoria')
        mov_qs = Movimiento.objects.filter(
            familia_id=familia_id,
            usuario=usuario,
            fecha__month=mes,
            fecha__year=anio,
            tipo='EGRESO',
            ambito='PERSONAL',
            oculto=False,
            categoria__usuario=usuario,
        ).exclude(metodo_pago__tipo='CREDITO')
        cuotas_qs = Cuota.objects.filter(
            movimiento__familia_id=familia_id,
            movimiento__usuario=usuario,
            movimiento__ambito='PERSONAL',
            movimiento__tipo='EGRESO',
            movimiento__oculto=False,
            movimiento__categoria__usuario=usuario,
            movimiento__metodo_pago__tipo='CREDITO',
            incluir=True,
            mes_facturacion__month=mes,
            mes_facturacion__year=anio,
            estado='PENDIENTE',
        )
        if cuenta_id is not None:
            mov_qs = mov_qs.filter(cuenta_id=cuenta_id, categoria__cuenta_personal_id=cuenta_id)
            pres_qs = pres_qs.filter(categoria__cuenta_personal_id=cuenta_id)
            cuotas_qs = cuotas_qs.filter(
                movimiento__cuenta_id=cuenta_id,
                movimiento__categoria__cuenta_personal_id=cuenta_id,
            )

    gastos_por_cat = {
        row['categoria_id']: row['t'] or 0
        for row in mov_qs.values('categoria_id').annotate(t=Sum('monto'))
    }
    gastos_cuotas_por_cat = {
        row['movimiento__categoria_id']: row['t'] or 0
        for row in cuotas_qs.values('movimiento__categoria_id').annotate(t=Sum('monto'))
    }
    for categoria_id, total_cuotas in gastos_cuotas_por_cat.items():
        gastos_por_cat[categoria_id] = (gastos_por_cat.get(categoria_id) or 0) + total_cuotas
    pres_map = {p.categoria_id: p for p in pres_qs}
    all_ids = set(pres_map.keys()) | set(gastos_por_cat.keys())
    nombres = {c.id: c.nombre for c in Categoria.objects.filter(pk__in=all_ids)}
    cat_meta_inicial = {
        c['id']: c['categoria_padre_id']
        for c in Categoria.objects.filter(pk__in=all_ids).values('id', 'categoria_padre_id')
    }

    padres_con_hijos_ids = set(
        Categoria.objects.filter(pk__in=all_ids, subcategorias__isnull=False)
        .values_list('id', flat=True)
        .distinct()
    )

    def _gastado_int(g):
        try:
            return int(g)
        except (TypeError, ValueError):
            return int(float(g))

    def _monto_pres_a_decimal(monto_str):
        if monto_str is None:
            return Decimal('0')
        try:
            return Decimal(str(monto_str))
        except Exception:
            return Decimal('0')

    filas: list[dict] = []
    for cid in sorted(all_ids, key=lambda x: nombres.get(x, '')):
        if cid in padres_con_hijos_ids:
            continue
        p = pres_map.get(cid)
        g = gastos_por_cat.get(cid) or 0
        filas.append(
            {
                'presupuesto_id': p.id if p else None,
                'categoria_id': cid,
                'categoria_nombre': nombres.get(cid, '—'),
                'monto_presupuestado': str(p.monto) if p else None,
                'gastado': _gastado_int(g),
                'es_agregado_padre': False,
                'categoria_padre_id': cat_meta_inicial.get(cid),
            }
        )

    fila_por_cid = {f['categoria_id']: f for f in filas}
    hijos_por_padre: dict[int, list] = {}
    for cid in all_ids:
        padre_id = cat_meta_inicial.get(cid)
        if padre_id:
            hijos_por_padre.setdefault(padre_id, []).append(cid)

    padres_ids = set(hijos_por_padre.keys())
    if padres_ids:
        faltan_nombres = padres_ids - set(nombres.keys())
        if faltan_nombres:
            for c in Categoria.objects.filter(pk__in=faltan_nombres).values('id', 'nombre'):
                nombres[c['id']] = c['nombre']

    ids_meta = set(all_ids) | padres_ids
    cat_meta = {
        c['id']: c['categoria_padre_id']
        for c in Categoria.objects.filter(pk__in=ids_meta).values('id', 'categoria_padre_id')
    }

    for padre_id in sorted(padres_ids, key=lambda x: nombres.get(x, '')):
        hijos = hijos_por_padre.get(padre_id) or []
        if not hijos:
            continue
        sum_pres = Decimal('0')
        sum_gast_hijos = 0
        for hid in hijos:
            fh = fila_por_cid.get(hid)
            if not fh:
                continue
            sum_pres += _monto_pres_a_decimal(fh.get('monto_presupuestado'))
            sum_gast_hijos += int(fh.get('gastado') or 0)

        monto_str = str(sum_pres) if sum_pres > 0 else None
        fila_padre = {
            'presupuesto_id': None,
            'categoria_id': padre_id,
            'categoria_nombre': nombres.get(padre_id, '—'),
            'monto_presupuestado': monto_str,
            'gastado': sum_gast_hijos,
            'es_agregado_padre': True,
            'categoria_padre_id': cat_meta_inicial.get(padre_id),
        }
        if padre_id in fila_por_cid:
            existente = fila_por_cid[padre_id]
            existente.update(fila_padre)
        else:
            filas.append(fila_padre)
            fila_por_cid[padre_id] = fila_padre

    def _orden_fila(row):
        cid = row['categoria_id']
        padre_id = cat_meta.get(cid)
        nombre = (row.get('categoria_nombre') or '').lower()
        if padre_id is None:
            return (0, nombre)
        clave_padre = (nombres.get(padre_id) or '').lower()
        return (1, clave_padre, nombre)

    filas.sort(key=_orden_fila)
    for row in filas:
        row['categoria_padre_id'] = cat_meta.get(row['categoria_id'])
    return filas


def total_presupuesto_comprometido(filas: list[dict]) -> int:
    """
    Igual que `totalPresupuestoComprometido` en el dashboard web:
    solo filas hoja con `presupuesto_id` no nulo; suma max(presupuestado, gastado).
    """
    total = 0
    for f in filas:
        if f.get('es_agregado_padre'):
            continue
        if f.get('presupuesto_id') is None:
            continue
        try:
            pres = int(round(Decimal(str(f.get('monto_presupuestado') or '0'))))
        except Exception:
            pres = 0
        gast = int(f.get('gastado') or 0)
        total += max(pres, gast)
    return total
