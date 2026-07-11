# Dominio multitenant (Fase 1 del plan): Espacio, PertenenciaEspacio,
# ConfiguracionRespaldoUsuario y la base de aislamiento TenantModel.
#
# Regla central: ningún dato de un tenant puede leerse ni escribirse sin un
# espacio explícito. TenantManager lanza TenantScopeError si se intenta
# acceder sin pasar por .en_espacio(espacio); .sin_aislamiento() existe solo
# para comandos de operación (migración de datos, validación de conteos).

from django.conf import settings
from django.db import models


class TenantScopeError(Exception):
    """Acceso a un modelo multitenant sin espacio explícito."""


class Espacio(models.Model):
    TIPO_PERSONAL = 'PERSONAL'
    TIPO_FAMILIAR = 'FAMILIAR'
    TIPO_CHOICES = [
        (TIPO_PERSONAL, 'Personal'),
        (TIPO_FAMILIAR, 'Familiar'),
    ]

    REPARTO_PROPORCIONAL = 'PROPORCIONAL'
    REPARTO_PARTES_IGUALES = 'PARTES_IGUALES'
    REPARTO_SIN = 'SIN_REPARTO'
    REPARTO_CHOICES = [
        (REPARTO_PROPORCIONAL, 'Proporcional a los ingresos'),
        (REPARTO_PARTES_IGUALES, 'Partes iguales'),
        (REPARTO_SIN, 'Sin repartición'),
    ]

    tipo = models.CharField(max_length=10, choices=TIPO_CHOICES)
    nombre = models.CharField(max_length=150)
    # Solo relevante en espacios FAMILIAR; en PERSONAL se ignora.
    modo_reparto = models.CharField(
        max_length=15,
        choices=REPARTO_CHOICES,
        default=REPARTO_PROPORCIONAL,
    )
    activo = models.BooleanField(default=True)
    # Familias disueltas quedan archivadas como registro histórico de solo lectura.
    archivado = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Espacio'
        verbose_name_plural = 'Espacios'

    def __str__(self):
        return f'{self.nombre} ({self.get_tipo_display()})'

    @property
    def es_personal(self) -> bool:
        return self.tipo == self.TIPO_PERSONAL


class PertenenciaEspacio(models.Model):
    ROL_ADMIN = 'ADMIN'
    ROL_MIEMBRO = 'MIEMBRO'
    ROL_CHOICES = [
        (ROL_ADMIN, 'Administrador'),
        (ROL_MIEMBRO, 'Miembro'),
    ]

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='pertenencias_espacio',
    )
    espacio = models.ForeignKey(
        Espacio,
        on_delete=models.CASCADE,
        related_name='pertenencias',
    )
    rol = models.CharField(max_length=10, choices=ROL_CHOICES, default=ROL_MIEMBRO)
    activo = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Pertenencia a espacio'
        verbose_name_plural = 'Pertenencias a espacios'
        constraints = [
            models.UniqueConstraint(
                fields=['usuario', 'espacio'],
                name='unique_usuario_espacio',
            ),
        ]

    def __str__(self):
        return f'{self.usuario} → {self.espacio} ({self.rol})'


class ConfiguracionRespaldoUsuario(models.Model):
    """
    Destinos de respaldo por usuario (Fase 5 del plan).
    Los tokens OAuth de Drive llegan con el flujo por usuario en Fase 5,
    junto con su cifrado en reposo; no almacenar credenciales aquí antes.
    """

    usuario = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='config_respaldo',
    )
    drive_folder_id = models.CharField(max_length=200, blank=True, default='')
    sheet_id = models.CharField(max_length=200, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Configuración de respaldo de usuario'
        verbose_name_plural = 'Configuraciones de respaldo de usuarios'

    def __str__(self):
        return f'Respaldo de {self.usuario}'


# ── Base de aislamiento por tenant ────────────────────────────────────────────

class TenantQuerySet(models.QuerySet):
    pass


class TenantManager(models.Manager):
    """
    Manager por defecto de los modelos multitenant. Cualquier acceso que no
    declare espacio falla ruidosamente: el aislamiento es opt-out explícito,
    nunca un filtro que alguien pueda olvidar.
    """

    def get_queryset(self):
        raise TenantScopeError(
            f'{self.model.__name__}: acceso sin espacio explícito. '
            'Usa .en_espacio(espacio) o, solo en comandos de operación, .sin_aislamiento().'
        )

    def en_espacio(self, espacio) -> TenantQuerySet:
        if espacio is None:
            raise TenantScopeError(
                f'{self.model.__name__}.en_espacio(None): el espacio es obligatorio.'
            )
        return TenantQuerySet(self.model, using=self._db).filter(espacio=espacio)

    def sin_aislamiento(self) -> TenantQuerySet:
        """Solo para management commands (migración de datos, conteos de validación)."""
        return TenantQuerySet(self.model, using=self._db)


class TenantModel(models.Model):
    """
    Base abstracta para todo modelo con datos de un tenant. PROTECT: un espacio
    con datos no se elimina, se archiva (registro histórico).
    """

    espacio = models.ForeignKey(
        Espacio,
        on_delete=models.PROTECT,
        related_name='%(app_label)s_%(class)s',
    )

    objects = TenantManager()

    class Meta:
        abstract = True
