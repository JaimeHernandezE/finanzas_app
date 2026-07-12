# Validación post-migración Fase 3: conteos por tenant. Falla ruidosamente
# (exit code != 0) si hay inconsistencias — requisito del plan antes del cutover.
#
# Revisa:
#   - usuarios sin espacio personal,
#   - usuarios con familia sin pertenencia activa al espacio espejo,
#   - filas tenant con familia pero sin espacio (backfill pendiente),
#   - filas cuyo espacio NO es el espejo de su familia (desalineadas).

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db.models import F

from applications.espacios.models import Espacio, PertenenciaEspacio
from applications.espacios.services import modelos_tenant


class Command(BaseCommand):
    help = 'Valida la consistencia familia ↔ espacio tras backfill_espacios (Fase 3).'

    def handle(self, *args, **options):
        errores = []
        Usuario = get_user_model()

        sin_personal = [
            u.email for u in Usuario.objects.all()
            if not PertenenciaEspacio.objects.filter(
                usuario=u, activo=True, espacio__tipo=Espacio.TIPO_PERSONAL
            ).exists()
        ]
        if sin_personal:
            errores.append(f'Usuarios sin espacio personal: {sin_personal}')

        sin_pertenencia_familiar = [
            u.email for u in Usuario.objects.filter(familia__isnull=False)
            if not PertenenciaEspacio.objects.filter(
                usuario=u, activo=True, espacio__familia_origen_id=u.familia_id
            ).exists()
        ]
        if sin_pertenencia_familiar:
            errores.append(
                f'Usuarios con familia sin pertenencia al espacio espejo: {sin_pertenencia_familiar}'
            )

        for modelo in modelos_tenant():
            qs = modelo.objects.filter(familia__isnull=False)
            total = qs.count()
            sin_espacio = qs.filter(espacio__isnull=True).count()
            desalineadas = (
                qs.filter(espacio__isnull=False)
                .exclude(espacio__familia_origen_id=F('familia_id'))
                .count()
            )
            estado = 'OK' if not sin_espacio and not desalineadas else 'ERROR'
            self.stdout.write(
                f'{modelo.__name__}: total={total} sin_espacio={sin_espacio} '
                f'desalineadas={desalineadas} → {estado}'
            )
            if sin_espacio:
                errores.append(
                    f'{modelo.__name__}: {sin_espacio} filas con familia y sin espacio '
                    '(ejecuta backfill_espacios).'
                )
            if desalineadas:
                errores.append(
                    f'{modelo.__name__}: {desalineadas} filas cuyo espacio no es el espejo '
                    'de su familia.'
                )

        if errores:
            for e in errores:
                self.stderr.write(self.style.ERROR(e))
            raise CommandError('validar_espacios: inconsistencias detectadas.')
        self.stdout.write(self.style.SUCCESS('validar_espacios OK: familia ↔ espacio consistente.'))
