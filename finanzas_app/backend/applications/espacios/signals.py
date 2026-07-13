# Señales de espacios: todo usuario nuevo obtiene su espacio personal.

from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver

from .services import crear_espacio_personal


@receiver(post_save, sender=get_user_model())
def asegurar_espacios_de_usuario(sender, instance, created, **kwargs):
    if kwargs.get('raw'):
        return
    if created:
        crear_espacio_personal(instance)
