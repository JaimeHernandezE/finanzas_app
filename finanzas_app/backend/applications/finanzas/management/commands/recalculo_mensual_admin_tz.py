from django.core.management.base import BaseCommand

from applications.finanzas.management.commands.rollover_presupuestos_mensuales import (
    ejecutar_rollover,
    mes_civil_actual,
)


class Command(BaseCommand):
    help = (
        'Tareas de inicio de mes: copia presupuestos personales y familiares '
        'del mes anterior al mes civil actual (TIME_ZONE). No recalcula snapshots.'
    )

    def handle(self, *args, **options):
        mes_destino = mes_civil_actual()
        presupuestos_creados, presupuestos_omitidos = ejecutar_rollover(
            mes_destino,
            dry_run=False,
            stdout=self.stdout,
        )
        self.stdout.write(
            self.style.SUCCESS(
                'Tareas de inicio de mes completadas (solo rollover de presupuestos). '
                f'mes_destino={mes_destino.isoformat()} '
                f'presupuestos(creados={presupuestos_creados}, omitidos={presupuestos_omitidos}).'
            )
        )
