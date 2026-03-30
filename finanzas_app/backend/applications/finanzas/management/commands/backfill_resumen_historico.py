from django.core.management.base import BaseCommand

from applications.usuarios.models import Familia
from applications.finanzas import services_recalculo


class Command(BaseCommand):
    help = 'Recalcula y persiste snapshots del resumen histórico (todos los meses con datos).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--familia-id',
            type=int,
            default=None,
            help='Solo esta familia; si se omite, procesa todas.',
        )

    def handle(self, *args, **options):
        fid = options.get('familia_id')
        if fid is not None:
            n = services_recalculo.backfill_resumen_historico_snapshots(fid)
            self.stdout.write(
                self.style.SUCCESS(f'Meses escritos: {n} (familia {fid}).')
            )
            return

        total = 0
        for fam in Familia.objects.all().order_by('pk'):
            n = services_recalculo.backfill_resumen_historico_snapshots(fam.pk)
            total += n
            if n:
                self.stdout.write(f'Familia {fam.pk}: {n} meses')
        self.stdout.write(self.style.SUCCESS(f'Total meses escritos: {total}.'))
