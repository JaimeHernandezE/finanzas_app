"""
Recrea la familia demo (Jaime + Glori), catálogo financiero y 15 meses de datos.
Sin viajes ni inversiones. Idempotente: borra la familia «Demo» si existe y vuelve a sembrar.

Ancla calendario: ayer (TIME_ZONE Django). Ejecutar tras migrate en entornos DEMO.
"""

import random
from calendar import monthrange
from datetime import date, timedelta
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
SUELDO_JAIME = 2_500_000
SUELDO_GLORI = 1_500_000
RNG_SEED = 42

CATEGORIAS_COMUNES = [
    ('Supermercado', 400_000, 600_000),
    ('Arriendo', 450_000, 450_000),
    ('Servicios', 150_000, 200_000),
    ('Educación', 100_000, 200_000),
    ('Salud', 50_000, 150_000),
    ('Entretención', 80_000, 150_000),
]

CATEGORIAS_JAIME = [
    ('Bencina', 60_000, 100_000),
    ('Restaurant', 50_000, 100_000),
    ('Auto', 30_000, 80_000),
    ('Farmacia', 20_000, 50_000),
    ('Ropa', 50_000, 150_000),
    ('Suscripciones', 20_000, 40_000),
]

CATEGORIAS_GLORI = [
    ('Belleza', 40_000, 80_000),
    ('Restaurant', 40_000, 80_000),
    ('Farmacia', 20_000, 50_000),
    ('Ropa', 60_000, 150_000),
    ('Mascotas', 30_000, 60_000),
    ('Entretención', 30_000, 70_000),
]


def _monto_variado(base_min: int, base_max: int) -> Decimal:
    lo = base_min // 1000
    hi = max(lo, base_max // 1000)
    return Decimal(str(random.randint(lo, hi) * 1000))


def _fecha_en_mes(anio: int, mes: int, dia_base: int) -> date:
    max_dia = monthrange(anio, mes)[1]
    dia = max(1, min(max_dia, dia_base + random.randint(-2, 2)))
    return date(anio, mes, dia)


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
        ref = timezone.localdate() - timedelta(days=1)
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
            for nombre in [
                'Supermercado', 'Arriendo', 'Servicios', 'Educación', 'Salud',
                'Entretención', 'Sueldo',
            ]:
                cat, _ = Categoria.objects.get_or_create(
                    nombre=nombre,
                    familia=None,
                    usuario=None,
                    defaults={
                        'tipo': 'INGRESO' if nombre == 'Sueldo' else 'EGRESO',
                        'es_inversion': False,
                    },
                )
                categorias[nombre] = cat

            for nombre, _, _ in CATEGORIAS_JAIME:
                cat, _ = Categoria.objects.get_or_create(
                    nombre=nombre,
                    familia=familia,
                    usuario=jaime,
                    defaults={'tipo': 'EGRESO', 'es_inversion': False},
                )
                categorias[f'j_{nombre}'] = cat

            for nombre, _, _ in CATEGORIAS_GLORI:
                cat, _ = Categoria.objects.get_or_create(
                    nombre=nombre,
                    familia=familia,
                    usuario=glori,
                    defaults={'tipo': 'EGRESO', 'es_inversion': False},
                )
                categorias[f'g_{nombre}'] = cat

            for i in range(MESES_HISTORIA):
                primer_dia = mes_cierre - relativedelta(months=i)
                anio, mes = primer_dia.year, primer_dia.month

                IngresoComun.objects.create(
                    familia=familia,
                    usuario=jaime,
                    mes=primer_dia,
                    monto=_monto_variado(
                        int(SUELDO_JAIME * 0.95), int(SUELDO_JAIME * 1.05)
                    ),
                    origen='Sueldo',
                )
                IngresoComun.objects.create(
                    familia=familia,
                    usuario=glori,
                    mes=primer_dia,
                    monto=_monto_variado(
                        int(SUELDO_GLORI * 0.95), int(SUELDO_GLORI * 1.05)
                    ),
                    origen='Sueldo',
                )

                for nombre, bmin, bmax in CATEGORIAS_COMUNES:
                    monto = _monto_variado(bmin, bmax)
                    autor = jaime if random.random() < 0.55 else glori
                    metodo = random.choices(
                        [metodos['efectivo'], metodos['debito'], metodos['credito']],
                        weights=[40, 35, 25],
                    )[0]
                    tarjeta = None
                    num_cuotas = None
                    if metodo == metodos['credito']:
                        tarjeta = tarjetas['j1'] if autor == jaime else tarjetas['g']
                        num_cuotas = random.choice([1, 3, 6])

                    Movimiento.objects.create(
                        usuario=autor,
                        familia=familia,
                        fecha=_fecha_en_mes(anio, mes, 15),
                        tipo='EGRESO',
                        ambito='COMUN',
                        categoria=categorias[nombre],
                        monto=monto,
                        comentario='',
                        metodo_pago=metodo,
                        tarjeta=tarjeta,
                        num_cuotas=num_cuotas,
                    )

                presupuesto_j = 620_000
                gastado_j = 0
                cats_j = list(CATEGORIAS_JAIME)
                random.shuffle(cats_j)
                for nombre, bmin, bmax in cats_j:
                    if gastado_j >= presupuesto_j:
                        break
                    cap = min(bmax, presupuesto_j - gastado_j)
                    if cap < bmin:
                        continue
                    monto = _monto_variado(bmin, cap)
                    gastado_j += int(monto)
                    metodo = random.choices(
                        [metodos['efectivo'], metodos['debito'], metodos['credito']],
                        weights=[30, 40, 30],
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
                        fecha=_fecha_en_mes(anio, mes, random.randint(5, 25)),
                        tipo='EGRESO',
                        ambito='PERSONAL',
                        categoria=categorias[f'j_{nombre}'],
                        monto=monto,
                        comentario='',
                        metodo_pago=metodo,
                        tarjeta=tarjeta,
                        num_cuotas=num_cuotas,
                    )

                presupuesto_g = 380_000
                gastado_g = 0
                cats_g = list(CATEGORIAS_GLORI)
                random.shuffle(cats_g)
                for nombre, bmin, bmax in cats_g:
                    if gastado_g >= presupuesto_g:
                        break
                    cap = min(bmax, presupuesto_g - gastado_g)
                    if cap < bmin:
                        continue
                    monto = _monto_variado(bmin, cap)
                    gastado_g += int(monto)
                    metodo = random.choices(
                        [metodos['efectivo'], metodos['debito'], metodos['credito']],
                        weights=[35, 35, 30],
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
                        fecha=_fecha_en_mes(anio, mes, random.randint(5, 25)),
                        tipo='EGRESO',
                        ambito='PERSONAL',
                        categoria=categorias[f'g_{nombre}'],
                        monto=monto,
                        comentario='',
                        metodo_pago=metodo,
                        tarjeta=tarjeta,
                        num_cuotas=num_cuotas,
                    )

                for nombre, bmin, bmax in CATEGORIAS_COMUNES:
                    cat = categorias[nombre]
                    Presupuesto.objects.get_or_create(
                        familia=familia,
                        usuario=None,
                        categoria=cat,
                        mes=primer_dia,
                        defaults={'monto': Decimal(str((bmin + bmax) // 2))},
                    )

            mes_inicio = mes_cierre - relativedelta(months=MESES_HISTORIA - 1)
            services_recalculo.recalcular_familia_desde(familia.id, mes_inicio)
            services_recalculo.backfill_resumen_historico_snapshots(familia.id)
            RecalculoPendiente.objects.filter(familia_id=familia.id).delete()

        self.stdout.write(
            self.style.SUCCESS(
                f'Seed demo listo. Familia «{FAMILIA_DEMO_NOMBRE}» (id={familia.id}), '
                f'referencia ayer={ref.isoformat()}.'
            )
        )
