from datetime import date
from zoneinfo import ZoneInfo

from dateutil.relativedelta import relativedelta
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
        'Tareas de inicio de mes: rollover de presupuestos (mes anterior → mes actual), '
        'recálculo histórico y reparación de cuotas. La fecha de referencia es la hora '
        'actual en la zona del administrador (mes_destino = primer día del mes civil actual).'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--admin-id',
            type=int,
            default=None,
            help='ID del usuario administrador a usar como referencia de zona horaria.',
        )

    def handle(self, *args, **options):
        admin_id = options.get('admin_id')

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

        # Solo mes anterior + mes actual: recalcular toda la historia desde GitHub
        # contra la BD remota puede tardar horas (no es viable en Actions).
        dia_ref = ahora_local.date()
        mes_actual_pd = date(dia_ref.year, dia_ref.month, 1)
        mes_anterior_pd = mes_actual_pd - relativedelta(months=1)
        services_recalculo.recalcular_familia_meses(
            familia_id, [mes_anterior_pd, mes_actual_pd]
        )
        n_resumen = services_recalculo.refrescar_resumen_historico_ultimo_mes_cerrado(
            familia_id, hoy=dia_ref
        )
        cuotas = services_recalculo.reparar_cuotas_credito_familia(familia_id)

        self.stdout.write(
            self.style.SUCCESS(
                'Tareas de inicio de mes completadas. '
                f'mes_destino={mes_destino.isoformat()} '
                f'presupuestos(creados={presupuestos_creados}, omitidos={presupuestos_omitidos}) '
                f'recalculo_meses=[{mes_anterior_pd.isoformat()}, {mes_actual_pd.isoformat()}] '
                f'resumen_ultimo_cerrado={n_resumen} '
                f"cuotas(creadas={cuotas['cuotas_creadas']}, actualizadas={cuotas['cuotas_actualizadas']}, "
                f"eliminadas={cuotas['cuotas_eliminadas']})"
            )
        )
