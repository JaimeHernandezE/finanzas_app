# Migración de datos (idempotente, re-ejecutable):
#   1. Espacio personal para cada usuario.
#   2. Espacio familiar por cada Familia legacy + pertenencias de miembros.
#   3. Puebla FK espacio en modelos tenant (por familia_id o usuario personal).
#
# Tras restaurar un pg_dump anterior al cutover multitenant, ejecutar:
#   python manage.py migrate
#   python manage.py backfill_espacios
#   python manage.py validar_espacios

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from applications.espacios.models import PertenenciaEspacio
from applications.espacios.services import crear_espacio_personal, espacio_para_familia, modelos_tenant
from applications.usuarios.models import Familia


def _tiene_campo(modelo, nombre: str) -> bool:
    return any(f.name == nombre for f in modelo._meta.fields)


def _columna_bd_existe(tabla: str, columna: str) -> bool:
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s AND column_name = %s
            """,
            [tabla, columna],
        )
        return cursor.fetchone() is not None


class Command(BaseCommand):
    help = 'Puebla espacios y FK espacio tras migración o restauración de dump legacy (idempotente).'

    @transaction.atomic
    def handle(self, *args, **options):
        verbosity = int(options.get('verbosity', 1))
        Usuario = get_user_model()

        usuarios = list(Usuario.objects.all())
        personal_por_usuario = {}
        for usuario in usuarios:
            personal_por_usuario[usuario.id] = crear_espacio_personal(usuario).id

        espejos_familia = {
            familia.id: espacio_para_familia(familia).id
            for familia in Familia.objects.all()
        }

        pertenencias_nuevas = 0
        if _tiene_campo(Usuario, 'familia'):
            for usuario in Usuario.objects.select_related('familia').filter(familia__isnull=False):
                espacio_id = espejos_familia.get(usuario.familia_id)
                if not espacio_id:
                    continue
                rol = (
                    PertenenciaEspacio.ROL_ADMIN
                    if usuario.rol == 'ADMIN'
                    else PertenenciaEspacio.ROL_MIEMBRO
                )
                _, creada = PertenenciaEspacio.objects.get_or_create(
                    usuario=usuario,
                    espacio_id=espacio_id,
                    defaults={'rol': rol, 'activo': True},
                )
                if creada:
                    pertenencias_nuevas += 1
        else:
            from applications.espacios.models import Espacio
            from applications.finanzas.models import Movimiento

            for espacio in Espacio.objects.filter(tipo=Espacio.TIPO_FAMILIAR, activo=True):
                usuario_ids = (
                    Movimiento.objects.filter(espacio_id=espacio.id)
                    .values_list('usuario_id', flat=True)
                    .distinct()
                )
                for uid in usuario_ids:
                    if not uid:
                        continue
                    usuario = Usuario.objects.filter(pk=uid).first()
                    if not usuario:
                        continue
                    rol = (
                        PertenenciaEspacio.ROL_ADMIN
                        if usuario.rol == 'ADMIN'
                        else PertenenciaEspacio.ROL_MIEMBRO
                    )
                    _, creada = PertenenciaEspacio.objects.get_or_create(
                        usuario_id=uid,
                        espacio=espacio,
                        defaults={'rol': rol, 'activo': True},
                    )
                    if creada:
                        pertenencias_nuevas += 1

        resumen = []
        from applications.finanzas.models import Categoria, Movimiento, Presupuesto

        for modelo in modelos_tenant():
            tabla = modelo._meta.db_table
            if not _columna_bd_existe(tabla, 'espacio_id'):
                if verbosity >= 1:
                    self.stdout.write(f'  {modelo.__name__}: omitido (sin columna espacio_id)')
                continue

            actualizadas = 0
            if _tiene_campo(modelo, 'familia'):
                for familia_id, espacio_id in espejos_familia.items():
                    actualizadas += modelo.objects.filter(
                        familia_id=familia_id,
                        espacio__isnull=True,
                    ).update(espacio_id=espacio_id)

            if modelo is Categoria:
                resumen.append((modelo.__name__, actualizadas))
                continue

            if _tiene_campo(modelo, 'usuario'):
                qs = modelo.objects.filter(espacio__isnull=True).only('pk', 'usuario_id')
                for row in qs.iterator():
                    espacio_id = personal_por_usuario.get(row.usuario_id)
                    if espacio_id:
                        actualizadas += modelo.objects.filter(pk=row.pk).update(
                            espacio_id=espacio_id
                        )

            resumen.append((modelo.__name__, actualizadas))

        if verbosity >= 1:
            self.stdout.write(f'Usuarios procesados: {len(usuarios)}')
            self.stdout.write(f'Espacios familiares: {len(espejos_familia)}')
            self.stdout.write(f'Pertenencias familiares nuevas: {pertenencias_nuevas}')
            for nombre, actualizadas in resumen:
                self.stdout.write(f'  {nombre}: {actualizadas} filas con espacio asignado')
            self.stdout.write(self.style.SUCCESS('backfill_espacios OK'))
