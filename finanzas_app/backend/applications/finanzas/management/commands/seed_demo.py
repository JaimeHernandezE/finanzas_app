"""
Recrea la familia demo (Jaime + Glori), catálogo financiero y 15 meses de datos.
Sin viajes ni inversiones. Idempotente: borra la familia «Demo» si existe y vuelve a sembrar.

Cada mes, por usuario: 60% del sueldo declarado (IngresoComun) en gastos COMÚN operativos,
30% en gastos PERSONALES (cuenta asignada), 10% en ahorro Fondo Mutuo (COMÚN, cuenta en D).
Los montos se reparten en categorías con suma exacta (miles de pesos). Presupuestos alineados a esas proporciones sobre sueldos de referencia.

Ancla calendario: hoy (TIME_ZONE Django): el mes en curso no tiene fechas posteriores a hoy.
Ejecutar tras migrate en entornos DEMO.
"""

import random
from calendar import monthrange
from datetime import date
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from applications.finanzas import services_recalculo
from applications.finanzas.models import (
    Categoria,
    Cuota,
    CuentaPersonal,
    IngresoComun,
    LiquidacionComunMensualSnapshot,
    MetodoPago,
    Movimiento,
    Presupuesto,
    RecalculoPendiente,
    ResumenHistoricoMesSnapshot,
    SaldoMensualSnapshot,
    SueldoEstimadoProrrateoMensual,
    Tarjeta,
    TutorCuenta,
)
from applications.usuarios.demo_constants import (
    DEMO_EMAIL_GLORI,
    DEMO_EMAIL_JAIME,
    DEMO_FIREBASE_UID_GLORI,
    DEMO_FIREBASE_UID_JAIME,
    FAMILIA_DEMO_NOMBRE,
)
from applications.usuarios.models import Familia, InvitacionPendiente, Usuario

MESES_HISTORIA = 15
# Mismo sueldo base para ambos miembros; cada mes se elige al azar en ±10%.
SUELDO_BASE_MIEMBRO = 2_000_000
SUELDO_MENSUAL_MIN = int(SUELDO_BASE_MIEMBRO * 0.9)
SUELDO_MENSUAL_MAX = int(SUELDO_BASE_MIEMBRO * 1.1)
RNG_SEED = 42

# Reparto del sueldo declarado de cada miembro en el mes (debe sumar 1).
FRACCION_GASTO_COMUN = Decimal('0.60')
FRACCION_GASTO_PERSONAL = Decimal('0.30')
FRACCION_AHORRO_FONDO = Decimal('0.10')
# Variación mensual sobre montos de gasto/ahorro (meses cerrados).
VARIACION_MENSUAL_MIN = Decimal('0.95')
VARIACION_MENSUAL_MAX = Decimal('1.05')

# Común operativo: casi todo efectivo/débito para que el neto común impacte D.
PESOS_METODO = [25, 75, 0]
# Personales: solo efectivo/débito para evitar cuotas que caigan en el mes actual.
PESOS_METODO_PERSONAL = [15, 85, 0]

# Gasto común corriente (familia, aparece en «De la familia»). Fondo Mutuo va aparte.
CATEGORIAS_COMUNES_OPERATIVAS = [
    ('Alimentación', 200_000, 320_000),
    ('Educación', 200_000, 320_000),
    ('Entretención', 120_000, 200_000),
    ('Intereses TC', 40_000, 80_000),
    ('Limpieza hogar', 80_000, 120_000),
    ('Salud', 120_000, 200_000),
    ('Servicios', 300_000, 400_000),
    ('Supermercado', 550_000, 750_000),
    ('Transporte', 180_000, 260_000),
    ('Vacaciones', 80_000, 180_000),
    ('Vestuario', 100_000, 180_000),
]

NOMBRE_FONDO_MUTUO = 'Fondo Mutuo'

# Personales Jaime — solo para repartir proporciones del 30% mensual
CATEGORIAS_JAIME = [
    ('Bencina', 110_000, 150_000),
    ('Almuerzo trabajo', 75_000, 115_000),
    ('Gimnasio', 30_000, 30_000),
    ('Ropa y calzado', 50_000, 120_000),
    ('Libros y cursos', 25_000, 70_000),
    ('Copago médico', 25_000, 55_000),
    ('Suscripciones', 25_000, 40_000),
    ('Varios Jaime', 25_000, 55_000),
]

# Personales Glori
CATEGORIAS_GLORI = [
    ('Belleza y cuidado', 50_000, 80_000),
    ('Ropa y accesorios', 60_000, 100_000),
    ('Farmacia', 20_000, 40_000),
    ('Café y salidas', 30_000, 60_000),
    ('Mascotas', 25_000, 45_000),
    ('Copago médico', 20_000, 40_000),
    ('Varios Glori', 15_000, 35_000),
]

def _presupuesto_fijo_desde_rango(bmin: int, bmax: int) -> Decimal:
    """Promedio del rango como presupuesto mensual constante (redondeado a miles)."""
    return Decimal(str(round((bmin + bmax) / 2 / 1000) * 1000))


_ingreso_familia_referencia_mes = SUELDO_BASE_MIEMBRO * 2
_comun_familia_ref = int(
    (Decimal(_ingreso_familia_referencia_mes) * FRACCION_GASTO_COMUN) // 1000
) * 1000
_mids_comun = [
    int(_presupuesto_fijo_desde_rango(lo, hi)) for _, lo, hi in CATEGORIAS_COMUNES_OPERATIVAS
]
_sum_mids_comun = sum(_mids_comun) or 1
PRESUPUESTO_MENSUAL_COMUN = {
    n: Decimal(
        str(round(_comun_familia_ref * mid / _sum_mids_comun / 1000) * 1000)
    )
    for (n, _, _), mid in zip(CATEGORIAS_COMUNES_OPERATIVAS, _mids_comun)
}
_fondo_familia_ref = int(
    (Decimal(_ingreso_familia_referencia_mes) * FRACCION_AHORRO_FONDO) // 1000
) * 1000
PRESUPUESTO_MENSUAL_COMUN[NOMBRE_FONDO_MUTUO] = Decimal(str(_fondo_familia_ref))
_personal_ref = int(
    (Decimal(SUELDO_BASE_MIEMBRO) * FRACCION_GASTO_PERSONAL) // 1000
) * 1000
_mids_j = [int(_presupuesto_fijo_desde_rango(lo, hi)) for _, lo, hi in CATEGORIAS_JAIME]
_sum_j = sum(_mids_j) or 1
PRESUPUESTO_MENSUAL_JAIME = {
    n: Decimal(str(round(_personal_ref * mid / _sum_j / 1000) * 1000))
    for (n, _, _), mid in zip(CATEGORIAS_JAIME, _mids_j)
}
_mids_g = [int(_presupuesto_fijo_desde_rango(lo, hi)) for _, lo, hi in CATEGORIAS_GLORI]
_sum_g = sum(_mids_g) or 1
PRESUPUESTO_MENSUAL_GLORI = {
    n: Decimal(str(round(_personal_ref * mid / _sum_g / 1000) * 1000))
    for (n, _, _), mid in zip(CATEGORIAS_GLORI, _mids_g)
}


def _monto_variado(base_min: int, base_max: int) -> Decimal:
    lo = base_min // 1000
    hi = max(lo, base_max // 1000)
    return Decimal(str(random.randint(lo, hi) * 1000))


def _repartir_en_miles(total: int, n: int) -> list[int]:
    """
    Divide total pesos (alinea a miles hacia abajo) en n partes que suman exactamente ese total.
    Si hay miles suficientes (>= n), cada parte es al menos $1000.
    """
    total = (int(total) // 1000) * 1000
    tm = total // 1000
    if n <= 0:
        return []
    if tm == 0:
        return [0] * n
    if n == 1:
        return [total]
    restante = tm - n
    if restante < 0:
        out = [0] * n
        out[0] = total
        return out
    cortes = sorted([0] + [random.randint(0, restante) for _ in range(n - 1)] + [restante])
    extras = [cortes[i + 1] - cortes[i] for i in range(n)]
    return [(1 + e) * 1000 for e in extras]


def _fecha_en_mes(
    anio: int,
    mes: int,
    dia_base: int,
    *,
    fecha_tope: date | None = None,
) -> date:
    """Si fecha_tope cae en el mismo (año, mes), la fecha nunca supera ese día (evita futuro)."""
    max_dia = monthrange(anio, mes)[1]
    dia = max(1, min(max_dia, dia_base + random.randint(-2, 2)))
    out = date(anio, mes, dia)
    if fecha_tope is not None and (anio, mes) == (fecha_tope.year, fecha_tope.month) and out > fecha_tope:
        return fecha_tope
    return out


def _asegurar_metodos():
    for tipo, nombre in MetodoPago.TIPO_CHOICES:
        if not MetodoPago.objects.filter(tipo=tipo).exists():
            MetodoPago.objects.create(nombre=nombre, tipo=tipo)


def _wipe_familia_demo():
    try:
        familia = Familia.objects.get(nombre=FAMILIA_DEMO_NOMBRE)
    except Familia.DoesNotExist:
        return None

    fid = familia.id
    uids = list(Usuario.objects.filter(familia_id=fid).values_list('id', flat=True))

    InvitacionPendiente.objects.filter(familia_id=fid).delete()
    ResumenHistoricoMesSnapshot.objects.filter(familia_id=fid).delete()
    LiquidacionComunMensualSnapshot.objects.filter(familia_id=fid).delete()
    SaldoMensualSnapshot.objects.filter(familia_id=fid).delete()
    RecalculoPendiente.objects.filter(familia_id=fid).delete()
    if uids:
        SueldoEstimadoProrrateoMensual.objects.filter(usuario_id__in=uids).delete()

    Cuota.objects.filter(movimiento__familia_id=fid).delete()
    Movimiento.objects.filter(familia_id=fid).delete()
    IngresoComun.objects.filter(familia_id=fid).delete()
    Presupuesto.objects.filter(familia_id=fid).delete()

    if uids:
        Tarjeta.objects.filter(usuario_id__in=uids).delete()
        TutorCuenta.objects.filter(
            Q(tutor_id__in=uids) | Q(cuenta__usuario_id__in=uids)
        ).delete()
        Categoria.objects.filter(Q(familia_id=fid) | Q(usuario_id__in=uids)).delete()
        CuentaPersonal.objects.filter(usuario_id__in=uids).delete()
        Usuario.objects.filter(pk__in=uids).delete()

    familia.delete()
    return True


class Command(BaseCommand):
    help = 'Borra y recrea datos de demostración (familia Demo, Jaime y Glori, 15 meses).'

    def handle(self, *args, **options):
        random.seed(RNG_SEED)
        ref = timezone.localdate()
        mes_cierre = date(ref.year, ref.month, 1)

        with transaction.atomic():
            _wipe_familia_demo()
            _asegurar_metodos()
            efectivo = MetodoPago.objects.filter(tipo='EFECTIVO').order_by('pk').first()
            debito = MetodoPago.objects.filter(tipo='DEBITO').order_by('pk').first()
            credito = MetodoPago.objects.filter(tipo='CREDITO').order_by('pk').first()
            metodos = {'efectivo': efectivo, 'debito': debito, 'credito': credito}

            familia = Familia.objects.create(nombre=FAMILIA_DEMO_NOMBRE)
            jaime = Usuario.objects.create_user(
                username=DEMO_EMAIL_JAIME,
                email=DEMO_EMAIL_JAIME,
                password='unused-demo',
                firebase_uid=DEMO_FIREBASE_UID_JAIME,
                familia=familia,
                rol='ADMIN',
                first_name='Jaime',
                last_name='Demo',
            )
            glori = Usuario.objects.create_user(
                username=DEMO_EMAIL_GLORI,
                email=DEMO_EMAIL_GLORI,
                password='unused-demo',
                firebase_uid=DEMO_FIREBASE_UID_GLORI,
                familia=familia,
                rol='MIEMBRO',
                first_name='Glori',
                last_name='Demo',
            )

            cuenta_j = CuentaPersonal.objects.get(usuario=jaime, nombre='Personal')
            cuenta_g = CuentaPersonal.objects.get(usuario=glori, nombre='Personal')

            tj1 = Tarjeta.objects.create(
                usuario=jaime,
                nombre='Visa BCI',
                banco='BCI',
                dia_facturacion=15,
                dia_vencimiento=5,
            )
            tj2 = Tarjeta.objects.create(
                usuario=jaime,
                nombre='Mastercard Santander',
                banco='Santander',
                dia_facturacion=5,
                dia_vencimiento=25,
            )
            tg = Tarjeta.objects.create(
                usuario=glori,
                nombre='Visa Estado',
                banco='Banco Estado',
                dia_facturacion=20,
                dia_vencimiento=10,
            )
            tarjetas = {'j1': tj1, 'j2': tj2, 'g': tg}

            categorias: dict[str, Categoria] = {}
            for nombre, _, _ in CATEGORIAS_COMUNES_OPERATIVAS:
                cat, _ = Categoria.objects.get_or_create(
                    nombre=nombre,
                    familia=familia,
                    usuario=None,
                    defaults={'tipo': 'EGRESO', 'es_inversion': False},
                )
                categorias[nombre] = cat

            cat_fondo, _ = Categoria.objects.get_or_create(
                nombre=NOMBRE_FONDO_MUTUO,
                familia=familia,
                usuario=None,
                defaults={'tipo': 'EGRESO', 'es_inversion': False},
            )
            if cat_fondo.es_inversion:
                cat_fondo.es_inversion = False
                cat_fondo.save(update_fields=['es_inversion'])
            categorias[NOMBRE_FONDO_MUTUO] = cat_fondo

            cat_sueldo, _ = Categoria.objects.get_or_create(
                nombre='Sueldo',
                familia=None,
                usuario=None,
                defaults={'tipo': 'INGRESO', 'es_inversion': False},
            )
            categorias['Sueldo'] = cat_sueldo

            for nombre, _, _ in CATEGORIAS_JAIME:
                cat, _ = Categoria.objects.get_or_create(
                    nombre=nombre,
                    familia=familia,
                    usuario=jaime,
                    defaults={
                        'tipo': 'EGRESO',
                        'es_inversion': False,
                        'cuenta_personal': cuenta_j,
                    },
                )
                if cat.cuenta_personal_id != cuenta_j.pk:
                    cat.cuenta_personal = cuenta_j
                    cat.save(update_fields=['cuenta_personal'])
                categorias[f'j_{nombre}'] = cat

            for nombre, _, _ in CATEGORIAS_GLORI:
                cat, _ = Categoria.objects.get_or_create(
                    nombre=nombre,
                    familia=familia,
                    usuario=glori,
                    defaults={
                        'tipo': 'EGRESO',
                        'es_inversion': False,
                        'cuenta_personal': cuenta_g,
                    },
                )
                if cat.cuenta_personal_id != cuenta_g.pk:
                    cat.cuenta_personal = cuenta_g
                    cat.save(update_fields=['cuenta_personal'])
                categorias[f'g_{nombre}'] = cat

            for i in range(MESES_HISTORIA):
                primer_dia = mes_cierre - relativedelta(months=i)
                anio, mes = primer_dia.year, primer_dia.month
                es_mes_actual = i == 0

                ic_j = IngresoComun.objects.create(
                    familia=familia,
                    usuario=jaime,
                    mes=primer_dia,
                    monto=_monto_variado(SUELDO_MENSUAL_MIN, SUELDO_MENSUAL_MAX),
                    origen='Sueldo',
                )
                ic_g = IngresoComun.objects.create(
                    familia=familia,
                    usuario=glori,
                    mes=primer_dia,
                    monto=_monto_variado(SUELDO_MENSUAL_MIN, SUELDO_MENSUAL_MAX),
                    origen='Sueldo',
                )
                sj = ic_j.monto
                sg = ic_g.monto
                ingreso_mes = sj + sg
                # Para meses cerrados, agregamos una variación de +/-5%.
                factor_mes = (
                    Decimal(random.randint(int(VARIACION_MENSUAL_MIN * 100), int(VARIACION_MENSUAL_MAX * 100)))
                    / Decimal('100')
                )
                # El modelo crea un Movimiento automático por cada IngresoComun.
                # Para el mes actual no dejamos movimientos (solo sueldo declarado para B).
                if es_mes_actual:
                    if ic_j.movimiento_id:
                        Movimiento.objects.filter(pk=ic_j.movimiento_id).delete()
                    if ic_g.movimiento_id:
                        Movimiento.objects.filter(pk=ic_g.movimiento_id).delete()

                if not es_mes_actual:
                    comun_total = int(
                        ((ingreso_mes * FRACCION_GASTO_COMUN) * factor_mes) // 1000
                    ) * 1000
                    partes_com = _repartir_en_miles(
                        comun_total, len(CATEGORIAS_COMUNES_OPERATIVAS)
                    )
                    filas_com = list(zip(partes_com, CATEGORIAS_COMUNES_OPERATIVAS))
                    random.shuffle(filas_com)
                    for monto_pesos, (nombre, _, _) in filas_com:
                        if monto_pesos < 1000:
                            continue
                        autor = jaime if random.random() < 0.55 else glori
                        monto = Decimal(str(monto_pesos))
                        metodo = random.choices(
                            [metodos['efectivo'], metodos['debito'], metodos['credito']],
                            weights=PESOS_METODO,
                        )[0]
                        tarjeta = None
                        num_cuotas = None
                        comentario = ''

                        Movimiento.objects.create(
                            usuario=autor,
                            familia=familia,
                            fecha=_fecha_en_mes(anio, mes, 15, fecha_tope=ref),
                            tipo='EGRESO',
                            ambito='COMUN',
                            categoria=categorias[nombre],
                            monto=monto,
                            comentario=comentario,
                            metodo_pago=metodo,
                            tarjeta=tarjeta,
                            num_cuotas=num_cuotas,
                        )

                    f_j = int(((sj * FRACCION_AHORRO_FONDO) * factor_mes) // 1000) * 1000
                    f_g = int(((sg * FRACCION_AHORRO_FONDO) * factor_mes) // 1000) * 1000
                    if f_j >= 1000:
                        Movimiento.objects.create(
                            usuario=jaime,
                            familia=familia,
                            fecha=_fecha_en_mes(anio, mes, 8, fecha_tope=ref),
                            tipo='EGRESO',
                            ambito='COMUN',
                            categoria=categorias[NOMBRE_FONDO_MUTUO],
                            monto=Decimal(str(f_j)),
                            comentario='Ahorro Fondo Mutuo (10% sueldo declarado del mes)',
                            metodo_pago=metodos['debito'],
                        )
                    if f_g >= 1000:
                        Movimiento.objects.create(
                            usuario=glori,
                            familia=familia,
                            fecha=_fecha_en_mes(anio, mes, 9, fecha_tope=ref),
                            tipo='EGRESO',
                            ambito='COMUN',
                            categoria=categorias[NOMBRE_FONDO_MUTUO],
                            monto=Decimal(str(f_g)),
                            comentario='Ahorro Fondo Mutuo (10% sueldo declarado del mes)',
                            metodo_pago=metodos['debito'],
                        )

                    pers_j = int(((sj * FRACCION_GASTO_PERSONAL) * factor_mes) // 1000) * 1000
                    pers_g = int(((sg * FRACCION_GASTO_PERSONAL) * factor_mes) // 1000) * 1000
                    partes_j = _repartir_en_miles(pers_j, len(CATEGORIAS_JAIME))
                    partes_g = _repartir_en_miles(pers_g, len(CATEGORIAS_GLORI))
                    filas_j = list(zip(partes_j, CATEGORIAS_JAIME))
                    filas_g = list(zip(partes_g, CATEGORIAS_GLORI))
                    random.shuffle(filas_j)
                    random.shuffle(filas_g)

                    for monto_pesos, (nombre, _, _) in filas_j:
                        if monto_pesos < 1000:
                            continue
                        monto = Decimal(str(monto_pesos))
                        metodo = random.choices(
                            [metodos['efectivo'], metodos['debito'], metodos['credito']],
                            weights=PESOS_METODO_PERSONAL,
                        )[0]
                        tarjeta = None
                        num_cuotas = None
                        if metodo == metodos['credito']:
                            tarjeta = random.choice([tarjetas['j1'], tarjetas['j2']])
                            num_cuotas = random.choice([1, 3, 6])
                        Movimiento.objects.create(
                            usuario=jaime,
                            familia=familia,
                            cuenta=cuenta_j,
                            fecha=_fecha_en_mes(
                                anio, mes, random.randint(3, 28), fecha_tope=ref
                            ),
                            tipo='EGRESO',
                            ambito='PERSONAL',
                            categoria=categorias[f'j_{nombre}'],
                            monto=monto,
                            comentario='',
                            metodo_pago=metodo,
                            tarjeta=tarjeta,
                            num_cuotas=num_cuotas,
                        )

                    for monto_pesos, (nombre, _, _) in filas_g:
                        if monto_pesos < 1000:
                            continue
                        monto = Decimal(str(monto_pesos))
                        metodo = random.choices(
                            [metodos['efectivo'], metodos['debito'], metodos['credito']],
                            weights=PESOS_METODO_PERSONAL,
                        )[0]
                        tarjeta = None
                        num_cuotas = None
                        if metodo == metodos['credito']:
                            tarjeta = tarjetas['g']
                            num_cuotas = random.choice([1, 3, 6])
                        Movimiento.objects.create(
                            usuario=glori,
                            familia=familia,
                            cuenta=cuenta_g,
                            fecha=_fecha_en_mes(
                                anio, mes, random.randint(3, 28), fecha_tope=ref
                            ),
                            tipo='EGRESO',
                            ambito='PERSONAL',
                            categoria=categorias[f'g_{nombre}'],
                            monto=monto,
                            comentario='',
                            metodo_pago=metodo,
                            tarjeta=tarjeta,
                            num_cuotas=num_cuotas,
                        )

                for nombre, monto in PRESUPUESTO_MENSUAL_COMUN.items():
                    Presupuesto.objects.update_or_create(
                        familia=familia,
                        usuario=None,
                        categoria=categorias[nombre],
                        mes=primer_dia,
                        defaults={'monto': monto},
                    )
                for nombre, monto in PRESUPUESTO_MENSUAL_JAIME.items():
                    Presupuesto.objects.update_or_create(
                        familia=familia,
                        usuario=jaime,
                        categoria=categorias[f'j_{nombre}'],
                        mes=primer_dia,
                        defaults={'monto': monto},
                    )
                for nombre, monto in PRESUPUESTO_MENSUAL_GLORI.items():
                    Presupuesto.objects.update_or_create(
                        familia=familia,
                        usuario=glori,
                        categoria=categorias[f'g_{nombre}'],
                        mes=primer_dia,
                        defaults={'monto': monto},
                    )

            mes_inicio = mes_cierre - relativedelta(months=MESES_HISTORIA - 1)
            services_recalculo.recalcular_familia_desde(familia.id, mes_inicio)
            services_recalculo.backfill_resumen_historico_snapshots(familia.id)
            RecalculoPendiente.objects.filter(familia_id=familia.id).delete()
            transaction.on_commit(
                lambda fid=familia.id, y=ref.year, m=ref.month: Movimiento.objects.filter(
                    familia_id=fid, fecha__year=y, fecha__month=m
                ).delete()
            )

        self.stdout.write(
            self.style.SUCCESS(
                f'Seed demo listo. Familia «{FAMILIA_DEMO_NOMBRE}» (id={familia.id}), '
                f'referencia hoy={ref.isoformat()}.'
            )
        )
