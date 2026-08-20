"""
Copia presupuestos del mes anterior al mes indicado (por defecto el mes civil
en TIME_ZONE / America/Santiago).

- Espacio FAMILIAR: presupuestos compartidos (usuario null) y personales.
- Espacio PERSONAL: presupuestos de ese espacio.

No sobrescribe: si ya existe Presupuesto para espacio/usuario/categoría/mes, se omite.
No toca espacios inactivos ni archivados.
"""

from datetime import date
from zoneinfo import ZoneInfo

from dateutil.relativedelta import relativedelta
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from applications.espacios.models import Espacio
from applications.finanzas.models import Presupuesto
from applications.finanzas.recalculo_context import RecalculoContext, recalculo_context


def _primer_dia(d: date) -> date:
    return date(d.year, d.month, 1)


def mes_civil_actual(tz_name: str | None = None) -> date:
    """Primer día del mes civil actual en la zona indicada (default: TIME_ZONE)."""
    nombre = (tz_name or getattr(settings, 'TIME_ZONE', None) or 'America/Santiago').strip()
    try:
        tz = ZoneInfo(nombre)
    except Exception:
        tz = ZoneInfo('America/Santiago')
    ahora = timezone.now().astimezone(tz)
    return date(ahora.year, ahora.month, 1)


def copiar_mes_espacio(espacio_id: int, mes_destino: date, dry_run: bool) -> tuple[int, int]:
    """
    Copia presupuestos de mes_origen (mes anterior) a mes_destino.
    Devuelve (creados, ya_existentes_omitidos).
    """
    mes_origen = _primer_dia(mes_destino - relativedelta(months=1))
    mes_destino = _primer_dia(mes_destino)

    creados = 0
    omitidos = 0

    qs = Presupuesto.objects.filter(
        espacio_id=espacio_id,
        mes=mes_origen,
    ).select_related('categoria', 'usuario')

    for p in qs:
        existe = Presupuesto.objects.filter(
            espacio_id=p.espacio_id,
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
            espacio_id=p.espacio_id,
            origen_familia_id=p.origen_familia_id,
            usuario_id=p.usuario_id,
            categoria_id=p.categoria_id,
            mes=mes_destino,
            monto=p.monto,
        )
        creados += 1

    return creados, omitidos


def espacios_para_rollover(espacio_id: int | None = None):
    qs = Espacio.objects.filter(activo=True, archivado=False)
    if espacio_id is not None:
        qs = qs.filter(pk=espacio_id)
    return qs.order_by('id')


def ejecutar_rollover(
    mes_destino: date,
    *,
    espacio_id: int | None = None,
    dry_run: bool = False,
    stdout=None,
) -> tuple[int, int]:
    total_c = 0
    total_o = 0
    ctx = RecalculoContext(suprimir_notificaciones=True)
    for espacio in espacios_para_rollover(espacio_id):
        with recalculo_context(ctx), transaction.atomic():
            c, o = copiar_mes_espacio(espacio.id, mes_destino, dry_run)
        total_c += c
        total_o += o
        if stdout is not None and (c or o):
            stdout.write(
                f'  Espacio {espacio.id} ({espacio.tipo}): '
                f'+{c} creados, {o} ya existían (omitidos).'
            )
    return total_c, total_o


class Command(BaseCommand):
    help = (
        'Crea presupuestos del mes destino copiando montos del mes anterior '
        '(familiar + personal, en todos los espacios activos). '
        'Idempotente: no pisa filas ya existentes.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--mes',
            type=str,
            default=None,
            help='Mes destino YYYY-MM-01 (default: primer día del mes civil actual).',
        )
        parser.add_argument(
            '--espacio-id',
            type=int,
            default=None,
            help='Solo este espacio (default: todos los activos no archivados).',
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
            mes_destino = mes_civil_actual()

        total_c, total_o = ejecutar_rollover(
            mes_destino,
            espacio_id=options.get('espacio_id'),
            dry_run=dry_run,
            stdout=self.stdout,
        )

        accion = 'Simulación' if dry_run else 'Listo'
        origen = mes_destino - relativedelta(months=1)
        self.stdout.write(
            self.style.SUCCESS(
                f'{accion}: {total_c} presupuesto(s) nuevos, {total_o} omitido(s). '
                f'Mes destino: {mes_destino:%Y-%m}. Origen: {origen:%Y-%m}.'
            )
        )
