"""
En modo DEMO: si la familia Demo existe pero no tiene movimientos, ejecuta seed_demo completo.

Pensado para Render plan gratuito (sin Pre-deploy command): el entrypoint lanza esto en
segundo plano para no bloquear el puerto; si ya hay historial, sale al instante.
"""

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand

from applications.finanzas.models import Movimiento
from applications.usuarios.demo_constants import FAMILIA_DEMO_NOMBRE
from applications.usuarios.models import Familia


class Command(BaseCommand):
    help = 'Si DEMO y familia Demo sin movimientos, ejecuta seed_demo completo.'

    def handle(self, *args, **options):
        if not getattr(settings, 'DEMO', False):
            return
        try:
            familia = Familia.objects.get(nombre=FAMILIA_DEMO_NOMBRE)
        except Familia.DoesNotExist:
            self.stdout.write(
                self.style.WARNING('seed_demo_if_empty: no hay familia Demo; omite (¿ensure_demo_seed?).')
            )
            return
        if Movimiento.objects.filter(familia=familia).exists():
            self.stdout.write(
                self.style.SUCCESS('seed_demo_if_empty: ya hay movimientos demo; omite.')
            )
            return
        self.stdout.write(self.style.WARNING('seed_demo_if_empty: ejecutando seed_demo completo…'))
        call_command('seed_demo')
