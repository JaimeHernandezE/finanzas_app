# Servicios de dominio de espacios (Fase 1).

from django.db import transaction

from .models import Espacio, PertenenciaEspacio


def obtener_espacio_personal(usuario) -> Espacio | None:
    """Espacio personal del usuario, o None si aún no existe (pre-migración)."""
    pertenencia = (
        PertenenciaEspacio.objects
        .select_related('espacio')
        .filter(usuario=usuario, activo=True, espacio__tipo=Espacio.TIPO_PERSONAL)
        .first()
    )
    return pertenencia.espacio if pertenencia else None


@transaction.atomic
def crear_espacio_personal(usuario) -> Espacio:
    """
    Garantiza el espacio personal del usuario (idempotente): si ya existe lo
    retorna; si no, lo crea con el usuario como ADMIN. Regla del plan: todo
    usuario tiene exactamente 1 espacio personal.
    """
    existente = obtener_espacio_personal(usuario)
    if existente is not None:
        return existente

    nombre = usuario.get_full_name() or usuario.username or usuario.email
    espacio = Espacio.objects.create(
        tipo=Espacio.TIPO_PERSONAL,
        nombre=f'Personal — {nombre}'[:150],
    )
    PertenenciaEspacio.objects.create(
        usuario=usuario,
        espacio=espacio,
        rol=PertenenciaEspacio.ROL_ADMIN,
    )
    return espacio
