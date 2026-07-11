# Señales de espacios (Fases 2–3).
#
# - Todo usuario nuevo obtiene su espacio personal (cualquier vía de creación).
# - Mientras conviven ambos esquemas (transición Fase 3), Familia y la membresía
#   familia/rol/activo de Usuario se espejan en Espacio/PertenenciaEspacio para
#   que los flujos legacy (invitar, cambiar rol, deshabilitar) mantengan el
#   mundo multitenant consistente sin tocar esos endpoints todavía.
# - Los usuarios y familias existentes se cubren con `manage.py backfill_espacios`.

from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver

from applications.usuarios.models import Familia

from .services import (
    crear_espacio_personal,
    espacio_para_familia,
    sincronizar_pertenencia_familiar,
)


@receiver(post_save, sender=get_user_model())
def asegurar_espacios_de_usuario(sender, instance, created, **kwargs):
    if kwargs.get('raw'):
        return
    if created:
        crear_espacio_personal(instance)
    sincronizar_pertenencia_familiar(instance)


@receiver(post_save, sender=Familia)
def espejar_familia_en_espacio(sender, instance, created, **kwargs):
    if kwargs.get('raw'):
        return
    espacio = espacio_para_familia(instance)
    if not created and espacio.nombre != (instance.nombre or 'Familia')[:150]:
        espacio.nombre = (instance.nombre or 'Familia')[:150]
        espacio.save(update_fields=['nombre'])
