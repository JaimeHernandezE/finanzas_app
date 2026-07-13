# Modelo de marcador para la entrada de menú en Django admin (sin tabla).

from django.db import models


class RespaldoPostgreSQL(models.Model):
    """Operaciones de respaldo/restauración pg_dump a nivel de instancia."""

    class Meta:
        managed = False
        default_permissions = ()
        verbose_name = 'restauración PostgreSQL'
        verbose_name_plural = 'Restauración PostgreSQL (pg_dump)'
