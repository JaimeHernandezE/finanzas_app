"""
En modo DEMO: ejecuta seed_demo solo si no existe el usuario demo Jaime.
Evita depender del Release Command en Docker (p. ej. Render) en el primer arranque.
En reinicios posteriores no vuelve a borrar/recrear datos (seed_demo es pesado).
"""

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand

from applications.usuarios.demo_constants import DEMO_EMAIL_JAIME
from applications.usuarios.models import Usuario


class Command(BaseCommand):
    help = 'Si DEMO=True y faltan usuarios demo, ejecuta seed_demo.'

    def handle(self, *args, **options):
        if not getattr(settings, 'DEMO', False):
            return
        if Usuario.objects.filter(email__iexact=DEMO_EMAIL_JAIME).exists():
            self.stdout.write(
                self.style.SUCCESS('ensure_demo_seed: usuarios demo ya existen; omitiendo seed_demo.')
            )
            return
        self.stdout.write(self.style.WARNING('ensure_demo_seed: ejecutando seed_demo (primer arranque o BD vacía)…'))
        call_command('seed_demo')
