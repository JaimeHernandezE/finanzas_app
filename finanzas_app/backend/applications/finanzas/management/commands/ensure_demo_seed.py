"""
En modo DEMO: si falta Jaime demo, ejecuta seed_demo_minimal (rápido).

El seed completo (15 meses) tarda demasiado para el entrypoint Docker: Render corta el
arranque si Gunicorn no abre el puerto a tiempo. Usa Release Command `./release.sh` para
`seed_demo` completo, o `python manage.py seed_demo` cuando tengas shell.
"""

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand

from applications.usuarios.demo_constants import DEMO_EMAIL_JAIME
from applications.usuarios.models import Usuario


class Command(BaseCommand):
    help = 'Si DEMO=True y faltan usuarios demo, ejecuta seed_demo_minimal (rápido).'

    def handle(self, *args, **options):
        if not getattr(settings, 'DEMO', False):
            return
        if Usuario.objects.filter(email__iexact=DEMO_EMAIL_JAIME).exists():
            self.stdout.write(
                self.style.SUCCESS('ensure_demo_seed: usuarios demo ya existen; omitiendo.')
            )
            return
        self.stdout.write(
            self.style.WARNING(
                'ensure_demo_seed: ejecutando seed_demo_minimal (login demo; datos completos vía release.sh / seed_demo).'
            )
        )
        call_command('seed_demo_minimal')
