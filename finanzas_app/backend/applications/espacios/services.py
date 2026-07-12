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


# ── Transición Fase 3: espejo Familia ↔ Espacio FAMILIAR ─────────────────────

def modelos_tenant():
    """Modelos con FK directa a familia que reciben espacio en la transición."""
    from applications.finanzas.models import (
        Categoria,
        IngresoComun,
        LiquidacionComunMensualSnapshot,
        Movimiento,
        Presupuesto,
        ResumenHistoricoMesSnapshot,
        SaldoMensualSnapshot,
    )
    from applications.inversiones.models import Fondo
    from applications.viajes.models import Viaje

    return [
        Categoria,
        Movimiento,
        Presupuesto,
        IngresoComun,
        SaldoMensualSnapshot,
        LiquidacionComunMensualSnapshot,
        ResumenHistoricoMesSnapshot,
        Fondo,
        Viaje,
    ]

def espacio_para_familia(familia) -> Espacio:
    """Espacio FAMILIAR espejo de una Familia legacy (idempotente)."""
    espacio = Espacio.objects.filter(familia_origen=familia).first()
    if espacio is not None:
        return espacio
    return Espacio.objects.create(
        tipo=Espacio.TIPO_FAMILIAR,
        nombre=(familia.nombre or 'Familia')[:150],
        familia_origen=familia,
    )


def sincronizar_pertenencia_familiar(usuario) -> None:
    """
    Espeja Usuario.familia / rol / activo en PertenenciaEspacio mientras conviven
    ambos esquemas. Al cambiar o abandonar la familia, las pertenencias familiares
    anteriores quedan inactivas (el espacio persiste como registro histórico).
    """
    if usuario.familia_id:
        espacio = espacio_para_familia(usuario.familia)
        pertenencia, created = PertenenciaEspacio.objects.get_or_create(
            usuario=usuario,
            espacio=espacio,
            defaults={'rol': usuario.rol, 'activo': usuario.activo},
        )
        if not created and (
            pertenencia.rol != usuario.rol or pertenencia.activo != usuario.activo
        ):
            pertenencia.rol = usuario.rol
            pertenencia.activo = usuario.activo
            pertenencia.save(update_fields=['rol', 'activo'])
        PertenenciaEspacio.objects.filter(
            usuario=usuario,
            activo=True,
            espacio__tipo=Espacio.TIPO_FAMILIAR,
        ).exclude(espacio=espacio).update(activo=False)
    else:
        PertenenciaEspacio.objects.filter(
            usuario=usuario,
            activo=True,
            espacio__tipo=Espacio.TIPO_FAMILIAR,
        ).update(activo=False)
