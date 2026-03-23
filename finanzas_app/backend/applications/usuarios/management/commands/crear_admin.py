import os

from django.core.management.base import BaseCommand

from applications.usuarios.models import Familia, Usuario


class Command(BaseCommand):
    help = "Crea el usuario administrador inicial si no existe."

    def handle(self, *args, **kwargs):
        email = os.getenv("ADMIN_EMAIL")
        nombre = os.getenv("ADMIN_NOMBRE", "Admin")
        apellido = os.getenv("ADMIN_APELLIDO", "")
        familia_nombre = os.getenv("FAMILIA_NOMBRE", "Mi Familia")

        if not email:
            self.stdout.write(
                self.style.WARNING("ADMIN_EMAIL no definido - saltando creacion de admin.")
            )
            return

        if Usuario.objects.filter(email=email).exists():
            self.stdout.write(f"Usuario {email} ya existe - sin cambios.")
            return

        familia, creada = Familia.objects.get_or_create(nombre=familia_nombre)
        if creada:
            self.stdout.write(f'Familia "{familia_nombre}" creada.')

        Usuario.objects.create_user(
            username=email,
            email=email,
            password="no-se-usa",  # Firebase maneja la autenticacion
            firebase_uid="pendiente",  # Se actualiza en el primer login
            familia=familia,
            rol="ADMIN",
            first_name=nombre,
            last_name=apellido,
        )

        self.stdout.write(
            self.style.SUCCESS(
                f'Admin {nombre} ({email}) creado en familia "{familia_nombre}".'
            )
        )
