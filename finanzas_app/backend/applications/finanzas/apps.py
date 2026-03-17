from django.apps import AppConfig


class FinanzasConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'applications.finanzas'
    verbose_name = 'Finanzas'

    def ready(self):
        import applications.finanzas.signals  # noqa
