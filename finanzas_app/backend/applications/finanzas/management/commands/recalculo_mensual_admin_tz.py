from datetime import date
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Min
from django.utils import timezone

from applications.finanzas.models import IngresoComun, Movimiento
from applications.finanzas import services_recalculo
from applications.finanzas.management.commands.rollover_presupuestos_mensuales import copiar_mes_familia


class Command(BaseCommand):
    help = (
        'Ejecuta tareas de inicio de mes si la hora local del administrador es '
        'día 1 entre las 02:00 y las 03:59 (horas de reloj 2 y 3): rollover de '
        'presupuestos, recálculo histórico y reparación de cuotas. '
        'Permite un único cron UTC mensual alineado con Chile (DST).'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--admin-id',
            type=int,
            default=None,
            help='ID del usuario administrador a usar como referencia de zona horaria.',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Ejecuta aunque no sea día 1 en la ventana horaria local esperada.',
        )

    def handle(self, *args, **options):
        admin_id = options.get('admin_id')
        force = options.get('force', False)

        User = get_user_model()
        admins = User.objects.filter(rol='ADMIN', activo=True, familia__isnull=False).order_by('id')
        if admin_id is not None:
            admins = admins.filter(id=admin_id)
        admin = admins.first()

        if admin is None:
            self.stdout.write(self.style.WARNING('No hay administrador activo con familia para ejecutar recálculo.'))
            return

        tz_name = (admin.zona_horaria or 'America/Santiago').strip()
        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            tz_name = 'America/Santiago'
            tz = ZoneInfo(tz_name)

        ahora_local = timezone.now().astimezone(tz)
        # Ventana horas 2 y 3 locales: cron workflow `0 6 1 * *` (UTC) → ~02:00 o ~03:00 CL según offset.
        en_ventana = ahora_local.day == 1 and ahora_local.hour in (2, 3)
        if not force and not en_ventana:
            self.stdout.write(
                self.style.WARNING(
                    f'Se omite ejecución: ahora local admin ({tz_name}) es {ahora_local.isoformat()} '
                    '(se requiere día 1, entre 02:00 y 03:59).'
                )
            )
            return

        familia_id = admin.familia_id
        mes_destino = date(ahora_local.year, ahora_local.month, 1)
        with transaction.atomic():
            presupuestos_creados, presupuestos_omitidos = copiar_mes_familia(
                familia_id,
                mes_destino,
                dry_run=False,
            )

        min_mov = Movimiento.objects.filter(familia_id=familia_id).aggregate(m=Min('fecha'))['m']
        min_ing = IngresoComun.objects.filter(familia_id=familia_id).aggregate(m=Min('mes'))['m']
        candidatos = [d for d in (min_mov, min_ing) if d is not None]

        if not candidatos:
            self.stdout.write(
                self.style.SUCCESS(
                    'Rollover de presupuestos completado. '
                    f'mes_destino={mes_destino.isoformat()} '
                    f'presupuestos(creados={presupuestos_creados}, omitidos={presupuestos_omitidos}). '
                    'No hay datos históricos para recalcular.'
                )
            )
            return

        mes_inicio = services_recalculo.primer_dia_mes(min(candidatos))
        services_recalculo.recalcular_familia_desde(familia_id, mes_inicio)
        n_resumen = services_recalculo.backfill_resumen_historico_snapshots(familia_id)
        n_saldos = services_recalculo.backfill_saldos_personales_usuario(admin.pk, familia_id)
        cuotas = services_recalculo.reparar_cuotas_credito_familia(familia_id)

        self.stdout.write(
            self.style.SUCCESS(
                'Tareas de inicio de mes completadas. '
                f'mes_destino={mes_destino.isoformat()} '
                f'presupuestos(creados={presupuestos_creados}, omitidos={presupuestos_omitidos}) '
                f'desde={mes_inicio.isoformat()} resumen={n_resumen} saldos={n_saldos} '
                f"cuotas(creadas={cuotas['cuotas_creadas']}, actualizadas={cuotas['cuotas_actualizadas']}, "
                f"eliminadas={cuotas['cuotas_eliminadas']})"
            )
        )
