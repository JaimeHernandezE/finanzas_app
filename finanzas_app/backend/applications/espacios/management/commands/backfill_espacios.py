# Migración de datos Fase 3 (idempotente, re-ejecutable):
#   1. Espacio personal para cada usuario existente.
#   2. Espacio FAMILIAR espejo por cada Familia + pertenencias según Usuario.familia.
#   3. Puebla el FK espacio (donde esté NULL) desde familia en los modelos tenant.
#
# Seguro de correr en caliente: solo crea filas nuevas y llena NULLs; nunca
# modifica un espacio ya asignado. Ejecutar de nuevo antes del cutover para
# cubrir filas creadas después del último backfill. Validar luego con:
#   python manage.py validar_espacios

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from applications.espacios.services import (
    crear_espacio_personal,
    espacio_para_familia,
    modelos_tenant,
    sincronizar_pertenencia_familiar,
)
from applications.usuarios.models import Familia


class Command(BaseCommand):
    help = 'Puebla espacios, pertenencias y el FK espacio de los modelos tenant (Fase 3, idempotente).'

    @transaction.atomic
    def handle(self, *args, **options):
        verbosity = int(options.get('verbosity', 1))
        Usuario = get_user_model()

        usuarios = list(Usuario.objects.all())
        for usuario in usuarios:
            crear_espacio_personal(usuario)
            sincronizar_pertenencia_familiar(usuario)

        espejos = {
            familia.id: espacio_para_familia(familia)
            for familia in Familia.objects.all()
        }

        resumen = []
        for modelo in modelos_tenant():
            actualizadas = 0
            for familia_id, espacio in espejos.items():
                actualizadas += (
                    modelo.objects
                    .filter(familia_id=familia_id, espacio__isnull=True)
                    .update(espacio=espacio)
                )
            resumen.append((modelo.__name__, actualizadas))

        if verbosity >= 1:
            self.stdout.write(
                f'Usuarios procesados: {len(usuarios)} · Familias espejadas: {len(espejos)}'
            )
            for nombre, actualizadas in resumen:
                self.stdout.write(f'  {nombre}: {actualizadas} filas con espacio asignado')
            self.stdout.write(self.style.SUCCESS('backfill_espacios OK'))
