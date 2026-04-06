"""
Demo mínimo en segundos: familia «Demo», Jaime y Glori, métodos de pago.
Para arranque Docker/Render antes de Gunicorn (health check); no incluye movimientos ni historia.

Datos completos (15 meses): `seed_demo` o Release Command `./release.sh` con DEMO activo.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from applications.usuarios.demo_constants import (
    DEMO_EMAIL_GLORI,
    DEMO_EMAIL_JAIME,
    DEMO_FIREBASE_UID_GLORI,
    DEMO_FIREBASE_UID_JAIME,
    FAMILIA_DEMO_NOMBRE,
)
from applications.usuarios.models import Familia, Usuario

from .seed_demo import _asegurar_metodos, _wipe_familia_demo


class Command(BaseCommand):
    help = 'Crea solo familia Demo y usuarios Jaime/Glori (login demo operativo de inmediato).'

    def handle(self, *args, **options):
        with transaction.atomic():
            _wipe_familia_demo()
            _asegurar_metodos()
            familia = Familia.objects.create(nombre=FAMILIA_DEMO_NOMBRE)
            Usuario.objects.create_user(
                username=DEMO_EMAIL_JAIME,
                email=DEMO_EMAIL_JAIME,
                password='unused-demo',
                firebase_uid=DEMO_FIREBASE_UID_JAIME,
                familia=familia,
                rol='ADMIN',
                first_name='Jaime',
                last_name='Demo',
            )
            Usuario.objects.create_user(
                username=DEMO_EMAIL_GLORI,
                email=DEMO_EMAIL_GLORI,
                password='unused-demo',
                firebase_uid=DEMO_FIREBASE_UID_GLORI,
                familia=familia,
                rol='MIEMBRO',
                first_name='Glori',
                last_name='Demo',
            )
        self.stdout.write(
            self.style.SUCCESS('seed_demo_minimal: familia Demo + Jaime + Glori listos.')
        )
