"""
Ingiere alertas bancarias vía Gmail API / Microsoft Graph (OAuth por usuario).

Uso:
  python manage.py ingestar_correos_bancarios
  python manage.py ingestar_correos_bancarios --dry-run
  python manage.py ingestar_correos_bancarios --usuario-id=1
  python manage.py ingestar_correos_bancarios --force

Cron recomendado: cada CAPTURA_EMAIL_INTERVALO_MIN_MINUTOS minutos (default 5).
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from applications.finanzas.models import ConfiguracionCapturaCorreo
from applications.finanzas.services.captura.mail_ingest import ingerir_config


class Command(BaseCommand):
    help = 'Ingiere alertas bancarias (OAuth Gmail/Outlook) y crea movimientos pendientes.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--usuario-id', type=int, default=None)
        parser.add_argument('--limit', type=int, default=50)
        parser.add_argument(
            '--force',
            action='store_true',
            help='Ignora intervalo_minutos de cada configuración.',
        )

    def handle(self, *args, **options):
        dry = options['dry_run']
        limit = options['limit']
        force = options['force']
        usuario_id = options['usuario_id']

        qs = ConfiguracionCapturaCorreo.objects.filter(
            conectado=True,
        ).exclude(refresh_token_enc='').select_related('usuario')
        if usuario_id:
            qs = qs.filter(usuario_id=usuario_id)

        configs = list(qs)
        if not configs:
            self.stdout.write(
                'No hay cuentas de correo OAuth conectadas.',
            )
            return

        total_creados = 0
        for config in configs:
            self.stdout.write(
                f'Usuario {config.usuario_id} ({config.proveedor} {config.email}) …',
            )
            try:
                stats = ingerir_config(
                    config, dry_run=dry, limit=limit, force=force,
                )
            except Exception as exc:
                self.stderr.write(self.style.ERROR(f'  error: {exc}'))
                continue
            if stats is None:
                self.stdout.write('  skip (intervalo no cumplido)')
                continue
            total_creados += stats.creados
            self.stdout.write(
                self.style.SUCCESS(
                    f'  creados={stats.creados} '
                    f'skip_remitente={stats.skip_remitente} '
                    f'skip_parseo={stats.skip_parseo}',
                ),
            )
        self.stdout.write(
            self.style.SUCCESS(f'Listo. Creados={total_creados} dry_run={dry}'),
        )
