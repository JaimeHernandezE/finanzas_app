from datetime import date

from dateutil.relativedelta import relativedelta
from django.contrib.auth import get_user_model
from django.db.models import Count, Max, Min, Sum
from django.db.models.functions import TruncMonth

from applications.finanzas.models import Movimiento, Presupuesto

Usuario = get_user_model()

UMBRAL_K = 10


def metricas_producto():
    usuarios_activos = Usuario.objects.filter(is_active=True).count()
    movimientos_totales = Movimiento.objects.count()
    rango = Movimiento.objects.aggregate(
        primera=Min('fecha'),
        ultima=Max('fecha'),
    )
    if rango['primera'] and rango['ultima']:
        delta = relativedelta(rango['ultima'], rango['primera'])
        meses = delta.years * 12 + delta.months + 1
    else:
        meses = 0

    return {
        'usuarios_activos': usuarios_activos,
        'movimientos_totales': movimientos_totales,
        'meses_de_datos': meses,
    }


def distribucion_gasto_por_categoria():
    base = Movimiento.objects.filter(tipo='EGRESO', oculto=False, categoria__es_inversion=False)
    total_usuarios = base.aggregate(n=Count('usuario', distinct=True))['n'] or 0
    if total_usuarios < UMBRAL_K:
        return []
    qs = (
        base
        .values('categoria__nombre')
        .annotate(total=Sum('monto'))
        .order_by('-total')
    )
    gran_total = sum(row['total'] for row in qs)
    if not gran_total:
        return []
    return [
        {
            'categoria': row['categoria__nombre'],
            'porcentaje': round(float(row['total']) / float(gran_total) * 100, 1),
        }
        for row in qs
    ]


def uso_metodo_pago():
    base = Movimiento.objects.filter(tipo='EGRESO', oculto=False)
    total_usuarios = base.aggregate(n=Count('usuario', distinct=True))['n'] or 0
    if total_usuarios < UMBRAL_K:
        return {'efectivo': 0, 'debito': 0, 'credito': 0}
    qs = base.values('metodo_pago__tipo').annotate(total=Sum('monto'))
    gran_total = sum(row['total'] for row in qs)
    if not gran_total:
        return {'efectivo': 0, 'debito': 0, 'credito': 0}
    resultado = {}
    for row in qs:
        key = row['metodo_pago__tipo'].lower()
        resultado[key] = round(float(row['total']) / float(gran_total) * 100, 0)
    for k in ('efectivo', 'debito', 'credito'):
        resultado.setdefault(k, 0)
    return resultado


def estacionalidad_gasto():
    hace_12 = date.today().replace(day=1) - relativedelta(months=11)
    base = Movimiento.objects.filter(tipo='EGRESO', oculto=False, fecha__gte=hace_12)
    total_usuarios = base.aggregate(n=Count('usuario', distinct=True))['n'] or 0
    if total_usuarios < UMBRAL_K:
        return []
    qs = list(
        base
        .annotate(periodo=TruncMonth('fecha'))
        .values('periodo')
        .annotate(total=Sum('monto'))
        .order_by('periodo')
    )
    if not qs:
        return []
    max_total = max(float(row['total']) for row in qs)
    if not max_total:
        return []
    return [
        {
            'periodo': row['periodo'].strftime('%Y-%m'),
            'indice': round(float(row['total']) / max_total * 100, 0),
        }
        for row in qs
    ]


def presupuesto_vs_real():
    hoy = date.today()
    mes_actual = hoy.replace(day=1)
    base_presupuesto = Presupuesto.objects.filter(mes=mes_actual)
    total_usuarios = base_presupuesto.aggregate(n=Count('usuario', distinct=True))['n'] or 0
    if total_usuarios < UMBRAL_K:
        return None

    cat_ids = list(
        base_presupuesto.values_list('categoria', flat=True).distinct()
    )
    if not cat_ids:
        return None

    total_cats = 0
    excedidas = 0
    for cat_id in cat_ids:
        presupuestado = (
            base_presupuesto
            .filter(categoria_id=cat_id)
            .aggregate(total=Sum('monto'))['total']
        ) or 0
        gastado = (
            Movimiento.objects
            .filter(
                tipo='EGRESO', oculto=False,
                categoria_id=cat_id,
                fecha__year=hoy.year, fecha__month=hoy.month,
            )
            .aggregate(total=Sum('monto'))['total']
        ) or 0
        total_cats += 1
        if gastado > presupuestado:
            excedidas += 1

    cumplimiento = round((1 - excedidas / total_cats) * 100, 1) if total_cats else 0
    return {
        'categorias_con_presupuesto': total_cats,
        'categorias_excedidas': excedidas,
        'porcentaje_cumplimiento': cumplimiento,
    }
