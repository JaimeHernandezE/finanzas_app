# Señales de espacios (Fase 2): todo usuario nuevo obtiene su espacio personal.
# Regla del plan: todo usuario tiene exactamente 1 espacio personal; la señal
# cubre cualquier vía de creación (registro, seed, admin). Los usuarios
# existentes se cubren con la migración de datos (Fase 3).

from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver

from .services import crear_espacio_personal


@receiver(post_save, sender=get_user_model())
def asegurar_espacio_personal(sender, instance, created, **kwargs):
    if not created or kwargs.get('raw'):
        return
    crear_espacio_personal(instance)
