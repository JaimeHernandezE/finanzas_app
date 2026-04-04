from django.conf import settings
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
    activo = models.BooleanField(
        default=True,
        help_text='Si es False, la cuenta no puede usar la API y no participa en el prorrateo '
                   'de gastos comunes del mes calendario en curso ni de meses futuros.',
    )

    def cuentas_visibles(self):
        """
        Retorna todas las CuentaPersonal que este usuario puede ver y operar:
        las propias más las que tutela de otros usuarios.
        """
        from applications.finanzas.models import CuentaPersonal
        propias    = CuentaPersonal.objects.filter(usuario=self)
        tuteladas  = CuentaPersonal.objects.filter(tutores__tutor=self)
        return (propias | tuteladas).distinct()

    def __str__(self):
        return self.get_full_name() or self.username


class InvitacionPendiente(models.Model):
    """
    Email invitado a unirse a una familia (registro pendiente).
    No envía correo por sí sola; la app solo registra la invitación.
    El invitado debe aceptar explícitamente en la app (p. ej. Configuración).
    """

    familia = models.ForeignKey(
        Familia,
        on_delete=models.CASCADE,
        related_name='invitaciones_pendientes',
    )
    email = models.EmailField()
    invitador = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='invitaciones_enviadas',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('familia', 'email')]
        verbose_name = 'invitación pendiente'
        verbose_name_plural = 'invitaciones pendientes'

    def __str__(self):
        return f'{self.email} → {self.familia}'
