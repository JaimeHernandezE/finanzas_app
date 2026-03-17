from django.contrib.auth.models import AbstractUser
from django.db import models


class Familia(models.Model):
    """
    Tenant raíz de la aplicación. Todos los datos (movimientos, categorías,
    presupuestos, viajes) pertenecen a una familia. Esto permite que distintas
    familias usen la misma instancia de la app de forma completamente aislada.
    """
    nombre     = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.nombre

    class Meta:
        verbose_name_plural = "familias"


class Usuario(AbstractUser):
    """
    Extiende el User de Django con datos propios de la app.
    La autenticación se delega a Firebase; el firebase_uid es el puente
    entre el token JWT de Firebase y este registro en la base de datos local.
    """
    ROL_CHOICES = [
        ('ADMIN',   'Administrador'),
        ('MIEMBRO', 'Miembro'),
        ('LECTURA', 'Solo lectura'),
    ]

    firebase_uid = models.CharField(
        max_length=128,
        unique=True,
        help_text="UID del usuario en Firebase Authentication. "
                  "Se usa para validar tokens JWT entrantes."
    )
    familia = models.ForeignKey(
        Familia,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='miembros',
        help_text="Familia a la que pertenece este usuario."
    )
    rol = models.CharField(max_length=10, choices=ROL_CHOICES, default='MIEMBRO')

    def __str__(self):
        return self.get_full_name() or self.username
