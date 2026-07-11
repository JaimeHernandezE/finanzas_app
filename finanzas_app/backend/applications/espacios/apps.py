from django.apps import AppConfig


class EspaciosConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'applications.espacios'
    verbose_name = 'Espacios (multitenant)'

    def ready(self):
        import applications.espacios.signals  # noqa
