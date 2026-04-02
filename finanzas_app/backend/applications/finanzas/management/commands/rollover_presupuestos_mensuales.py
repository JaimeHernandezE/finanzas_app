"""
Copia presupuestos del mes anterior al mes indicado (por defecto el mes en curso).
- Ámbito familiar: usuario null, categorías compartidas sin cuenta personal.
- Ámbito personal: un registro por cada presupuesto personal del mes anterior
  (cada usuario/categoría/cuenta), para todas las cuentas personales.

Ejecutar el día 1 de cada mes (cron) o manualmente.
No sobrescribe: si ya existe Presupuesto para ese mes/categoría/usuario, se omite.
"""

from datetime import date

from dateutil.relativedelta import relativedelta
from django.core.management.base import BaseCommand
from django.db import transaction

from applications.finanzas.models import Presupuesto
from applications.usuarios.models import Familia


def _primer_dia(d: date) -> date:
    return date(d.year, d.month, 1)


def copiar_mes_familia(familia_id: int, mes_destino: date, dry_run: bool) -> tuple[int, int]:
    """
    Devuelve (creados, ya_existentes_omitidos).
    """
    mes_origen = _primer_dia(mes_destino - relativedelta(months=1))
    mes_destino = _primer_dia(mes_destino)

    creados = 0
    omitidos = 0

    qs_familiar = Presupuesto.objects.filter(
        familia_id=familia_id,
        usuario__isnull=True,
        mes=mes_origen,
        categoria__familia_id=familia_id,
        categoria__usuario__isnull=True,
        categoria__cuenta_personal__isnull=True,
    ).select_related('categoria')

    qs_personal = Presupuesto.objects.filter(
        familia_id=familia_id,
        usuario__isnull=False,
        mes=mes_origen,
    ).select_related('categoria', 'usuario')

    for p in qs_familiar:
        existe = Presupuesto.objects.filter(
            familia_id=p.familia_id,
            usuario=None,
            categoria_id=p.categoria_id,
            mes=mes_destino,
        ).exists()
        if existe:
            omitidos += 1
            continue
        if dry_run:
            creados += 1
            continue
        Presupuesto.objects.create(
            familia_id=p.familia_id,
            usuario=None,
            categoria_id=p.categoria_id,
            mes=mes_destino,
            monto=p.monto,
        )
        creados += 1

    for p in qs_personal:
        existe = Presupuesto.objects.filter(
            familia_id=p.familia_id,
            usuario_id=p.usuario_id,
            categoria_id=p.categoria_id,
            mes=mes_destino,
        ).exists()
        if existe:
            omitidos += 1
            continue
        if dry_run:
            creados += 1
            continue
        Presupuesto.objects.create(
            familia_id=p.familia_id,
            usuario_id=p.usuario_id,
            categoria_id=p.categoria_id,
            mes=mes_destino,
            monto=p.monto,
        )
        creados += 1

    return creados, omitidos


class Command(BaseCommand):
    help = (
        'Crea presupuestos del mes destino copiando montos del mes anterior '
        '(familiar + personal por cuenta). Idempotente: no pisa filas ya existentes.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--mes',
            type=str,
            default=None,
            help='Mes destino YYYY-MM-01 (default: primer día del mes actual).',
        )
        parser.add_argument(
            '--familia-id',
            type=int,
            default=None,
            help='Solo esta familia (default: todas).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Solo mostrar cuántos se crearían.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        if options.get('mes'):
            parts = str(options['mes'])[:10].split('-')
            mes_destino = date(int(parts[0]), int(parts[1]), 1)
        else:
            mes_destino = _primer_dia(date.today())

        familias_qs = Familia.objects.all()
        if options.get('familia_id'):
            familias_qs = familias_qs.filter(pk=options['familia_id'])

        total_c = 0
        total_o = 0
        for fam in familias_qs.order_by('id'):
            with transaction.atomic():
                c, o = copiar_mes_familia(fam.id, mes_destino, dry_run)
            total_c += c
            total_o += o
            if c or o:
                self.stdout.write(
                    f'  Familia {fam.id}: +{c} creados, {o} ya existían (omitidos).'
                )

        accion = 'Simulación' if dry_run else 'Listo'
        self.stdout.write(
            self.style.SUCCESS(
                f'{accion}: {total_c} presupuesto(s) nuevos, {total_o} omitido(s). '
                f'Mes destino: {mes_destino:%Y-%m}. Origen: mes anterior.'
            )
        )
