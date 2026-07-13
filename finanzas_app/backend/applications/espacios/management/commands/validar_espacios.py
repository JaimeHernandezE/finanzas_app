# Validación post-migración: conteos por tenant. Falla ruidosamente
# (exit code != 0) si hay inconsistencias — requisito del plan antes del cutover.

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from applications.espacios.models import Espacio, PertenenciaEspacio
from applications.espacios.services import modelos_tenant
from applications.finanzas.models import Categoria, Cuota, Movimiento, Presupuesto


class Command(BaseCommand):
    help = 'Valida consistencia multitenant: espacios, filas sin tenant y conteos por espacio.'

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

        for modelo in modelos_tenant():
            if modelo is Categoria:
                sin_espacio_qs = modelo.objects.filter(espacio__isnull=True).exclude(
                    usuario__isnull=True,
                )
            else:
                sin_espacio_qs = modelo.objects.filter(espacio__isnull=True)
            n_sin = sin_espacio_qs.count()
            total = modelo.objects.count()
            estado = 'OK' if not n_sin else 'ERROR'
            self.stdout.write(
                f'{modelo.__name__}: total={total} sin_espacio={n_sin} → {estado}'
            )
            if n_sin:
                errores.append(
                    f'{modelo.__name__}: {n_sin} filas tenant sin espacio '
                    '(ejecuta backfill_espacios).'
                )

        self.stdout.write('')
        self.stdout.write('Conteos por espacio (movimientos / presupuestos / cuotas):')
        for espacio in Espacio.objects.order_by('id'):
            movs = Movimiento.objects.filter(espacio_id=espacio.id).count()
            pres = Presupuesto.objects.filter(espacio_id=espacio.id).count()
            cuotas = Cuota.objects.filter(movimiento__espacio_id=espacio.id).count()
            self.stdout.write(
                f'  [{espacio.id}] {espacio.nombre} ({espacio.tipo}): '
                f'movimientos={movs} presupuestos={pres} cuotas={cuotas}'
            )

        if errores:
            for e in errores:
                self.stderr.write(self.style.ERROR(e))
            raise CommandError('validar_espacios: inconsistencias detectadas.')
        self.stdout.write(self.style.SUCCESS('validar_espacios OK: datos multitenant consistentes.'))
