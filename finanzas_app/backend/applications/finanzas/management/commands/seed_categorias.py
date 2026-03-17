# applications/finanzas/management/commands/seed_categorias.py

from django.core.management.base import BaseCommand
from applications.finanzas.models import Categoria


class Command(BaseCommand):
    help = 'Carga las categorías globales iniciales del sistema'

    def handle(self, *args, **kwargs):
        categorias = [
            # Egresos
            ('Alimentación', 'EGRESO', False),
            ('Transporte', 'EGRESO', False),
            ('Servicios', 'EGRESO', False),
            ('Salud', 'EGRESO', False),
            ('Educación', 'EGRESO', False),
            ('Entretención', 'EGRESO', False),
            ('Vestuario', 'EGRESO', False),
            ('Vacaciones', 'EGRESO', False),
            ('Intereses TC', 'EGRESO', False),
            # Ingresos
            ('Sueldo', 'INGRESO', False),
            ('Honorarios', 'INGRESO', False),
            ('Arriendo', 'INGRESO', False),
            # Inversiones
            ('Fondo Mutuo', 'EGRESO', True),
            ('Depósito Plazo', 'EGRESO', True),
        ]

        creadas = 0
        for nombre, tipo, es_inversion in categorias:
            _, creado = Categoria.objects.get_or_create(
                nombre=nombre,
                tipo=tipo,
                familia=None,
                usuario=None,
                defaults={'es_inversion': es_inversion}
            )
            if creado:
                creadas += 1

        self.stdout.write(
            self.style.SUCCESS(f'{creadas} categorías globales creadas.')
        )
