"""
Demo mínimo en segundos: familia «Demo», Jaime y Glori, métodos de pago.
Para arranque Docker/Render antes de Gunicorn (health check); no incluye movimientos ni historia.

Datos completos (15 meses): `seed_demo` o Release Command `./release.sh` con DEMO activo.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from applications.espacios.models import PertenenciaEspacio
from applications.espacios.services import espacio_para_familia
from applications.usuarios.demo_constants import (
    DEMO_EMAIL_GLORI,
    DEMO_EMAIL_JAIME,
    DEMO_FIREBASE_UID_GLORI,
    DEMO_FIREBASE_UID_JAIME,
    FAMILIA_DEMO_NOMBRE,
)
from applications.usuarios.models import Familia, Usuario

from .seed_demo import _asegurar_metodos, _wipe_familia_demo


def _crear_usuario_demo(*, email, firebase_uid, rol, first_name, last_name, espacio_familiar):
    usuario = Usuario.objects.create_user(
        username=email,
        email=email,
        password='unused-demo',
        firebase_uid=firebase_uid,
        rol=rol,
        first_name=first_name,
        last_name=last_name,
    )
    PertenenciaEspacio.objects.get_or_create(
        usuario=usuario,
        espacio=espacio_familiar,
        defaults={
            'rol': (
                PertenenciaEspacio.ROL_ADMIN
                if rol == 'ADMIN'
                else PertenenciaEspacio.ROL_MIEMBRO
            ),
        },
    )
    return usuario


class Command(BaseCommand):
    help = 'Crea solo familia Demo y usuarios Jaime/Glori (login demo operativo de inmediato).'

    def handle(self, *args, **options):
        with transaction.atomic():
            _wipe_familia_demo()
            _asegurar_metodos()
            familia = Familia.objects.create(nombre=FAMILIA_DEMO_NOMBRE)
            espacio_familiar = espacio_para_familia(familia)
            _crear_usuario_demo(
                email=DEMO_EMAIL_JAIME,
                firebase_uid=DEMO_FIREBASE_UID_JAIME,
                rol='ADMIN',
                first_name='Jaime',
                last_name='Demo',
                espacio_familiar=espacio_familiar,
            )
            _crear_usuario_demo(
                email=DEMO_EMAIL_GLORI,
                firebase_uid=DEMO_FIREBASE_UID_GLORI,
                rol='MIEMBRO',
                first_name='Glori',
                last_name='Demo',
                espacio_familiar=espacio_familiar,
            )
        self.stdout.write(
            self.style.SUCCESS('seed_demo_minimal: familia Demo + Jaime + Glori listos.')
        )
