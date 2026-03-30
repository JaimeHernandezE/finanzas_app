from django.core.management.base import BaseCommand

from applications.finanzas import services_recalculo


class Command(BaseCommand):
    help = 'Procesa familias con RecalculoPendiente y actualiza snapshots mensuales.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limit',
            type=int,
            default=None,
            help='Máximo número de familias a procesar.',
        )

    def handle(self, *args, **options):
        n = services_recalculo.procesar_recalculos_pendientes(
            limit_familias=options.get('limit'),
        )
        self.stdout.write(self.style.SUCCESS(f'Familias procesadas: {n}.'))
