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


def obtener_espacio_familiar_activo(usuario) -> Espacio | None:
    """Espacio familiar activo del usuario, o None si no tiene membresía."""
    pertenencia = (
        PertenenciaEspacio.objects
        .select_related('espacio')
        .filter(usuario=usuario, activo=True, espacio__tipo=Espacio.TIPO_FAMILIAR)
        .first()
    )
    return pertenencia.espacio if pertenencia else None


@transaction.atomic
def crear_espacio_personal(usuario) -> Espacio:
    """
    Garantiza el espacio personal del usuario (idempotente): si ya existe lo
    retorna; si no, lo crea con el usuario como ADMIN.
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


def modelos_tenant():
    """Modelos con FK directa a espacio (validación y backfill)."""
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
    """
    Espacio FAMILIAR asociado a una Familia legacy (idempotente).
    Durante la transición se vincula por nombre; tras el cutover Familia es solo
    fixture de tests.
    """
    nombre = (familia.nombre or 'Familia')[:150]
    espacio = Espacio.objects.filter(tipo=Espacio.TIPO_FAMILIAR, nombre=nombre).first()
    if espacio is not None:
        return espacio
    return Espacio.objects.create(tipo=Espacio.TIPO_FAMILIAR, nombre=nombre)


def miembros_activos_espacio(espacio, mes_pd=None) -> list:
    """
    Usuarios con pertenencia activa al espacio. En espacios FAMILIAR aplica la misma
    regla histórica que miembros_para_prorrateo: meses pasados incluyen inactivos.
    """
    from django.utils import timezone

    from applications.finanzas.services_recalculo import primer_dia_mes

    pertenencias = (
        PertenenciaEspacio.objects
        .filter(espacio=espacio, activo=True)
        .select_related('usuario')
        .order_by('usuario__first_name', 'usuario__id')
    )
    if espacio.tipo != Espacio.TIPO_FAMILIAR:
        return [p.usuario for p in pertenencias]

    if mes_pd is None:
        mes_pd = primer_dia_mes(timezone.localdate())
    mes_actual = primer_dia_mes(timezone.localdate())
    if mes_pd < mes_actual:
        pertenencias = (
            PertenenciaEspacio.objects
            .filter(espacio=espacio)
            .select_related('usuario')
            .order_by('usuario__first_name', 'usuario__id')
        )
    return [p.usuario for p in pertenencias]


def familia_id_de_espacio(espacio) -> int | None:
    """Compatibilidad legacy: sin familia_origen retorna None."""
    return None
