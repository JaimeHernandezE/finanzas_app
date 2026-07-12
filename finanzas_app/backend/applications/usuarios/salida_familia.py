"""
Fase 4 — Salida de familia: copia datos del miembro saliente a su espacio
personal, y si la familia queda con un solo miembro, disuelve la familia
copiando los datos del miembro restante también.

Reglas de negocio (definidas por el usuario):
  - 2 miembros: ambos reciben copia, familia se archiva
  - 3+ miembros: solo el saliente recibe copia, familia continúa
  - Saldos pendientes quedan vigentes y se liquidan manualmente
  - Al entrar a otra familia se parte de cero (no se migra nada)
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import transaction

from applications.espacios.models import Espacio
from applications.espacios.services import obtener_espacio_personal
from applications.finanzas.models import (
    Categoria,
    Cuota,
    IngresoComun,
    Movimiento,
    Presupuesto,
    SueldoEstimadoProrrateoMensual,
)
from applications.inversiones.models import Fondo, Aporte, RegistroValor
from applications.viajes.models import Viaje, PresupuestoViaje

from .models import InvitacionPendiente

Usuario = get_user_model()


def _copiar_categorias_usuario(usuario, familia_id, espacio_personal):
    """Copia categorías personales del usuario al espacio personal.
    Returns: mapping {old_id: new_categoria} para reasignar movimientos."""
    cat_map = {}
    personales = Categoria.objects.filter(
        usuario=usuario, familia_id=familia_id,
    )
    for cat in personales:
        old_id = cat.pk
        cat.pk = None
        cat.familia = None
        cat.espacio = espacio_personal
        cat.save()
        cat_map[old_id] = cat
    return cat_map


def _copiar_movimientos_usuario(usuario, familia_id, espacio_personal, cat_map):
    """Copia movimientos del usuario al espacio personal."""
    movimientos = Movimiento.objects.filter(
        usuario=usuario, familia_id=familia_id,
    ).select_related('categoria')
    for mov in movimientos:
        old_pk = mov.pk
        cuotas_orig = list(Cuota.objects.filter(movimiento_id=old_pk))
        mov.pk = None
        mov.familia = None
        mov.espacio = espacio_personal
        if mov.categoria_id in cat_map:
            mov.categoria = cat_map[mov.categoria_id]
        mov.save()
        for cuota in cuotas_orig:
            cuota.pk = None
            cuota.movimiento = mov
            cuota.save()


def _copiar_ingresos_usuario(usuario, familia_id, espacio_personal):
    """Copia ingresos comunes del usuario al espacio personal."""
    ingresos = IngresoComun.objects.filter(
        usuario=usuario, familia_id=familia_id,
    )
    for ing in ingresos:
        old_mov_id = ing.movimiento_id
        ing.pk = None
        ing.familia = None
        ing.espacio = espacio_personal
        if old_mov_id:
            nuevo_mov = Movimiento.objects.filter(
                espacio=espacio_personal, usuario=usuario,
                fecha=ing.mes, tipo='INGRESO',
            ).order_by('-created_at').first()
            ing.movimiento = nuevo_mov
        ing.save()


def _copiar_presupuestos_usuario(usuario, familia_id, espacio_personal, cat_map):
    """Copia presupuestos del usuario al espacio personal."""
    presupuestos = Presupuesto.objects.filter(
        usuario=usuario, familia_id=familia_id,
    )
    for p in presupuestos:
        p.pk = None
        p.familia = None
        p.espacio = espacio_personal
        if p.categoria_id in cat_map:
            p.categoria = cat_map[p.categoria_id]
        p.save()


def _copiar_fondos_usuario(usuario, familia_id, espacio_personal):
    """Copia fondos de inversión del usuario al espacio personal."""
    fondos = Fondo.objects.filter(
        usuario=usuario, familia_id=familia_id,
    ).prefetch_related('aportes', 'registros_valor')
    for fondo in fondos:
        old_pk = fondo.pk
        aportes_orig = list(Aporte.objects.filter(fondo_id=old_pk))
        valores_orig = list(RegistroValor.objects.filter(fondo_id=old_pk))
        fondo.pk = None
        fondo.familia = None
        fondo.espacio = espacio_personal
        fondo.save()
        for aporte in aportes_orig:
            aporte.pk = None
            aporte.fondo = fondo
            aporte.save()
        for valor in valores_orig:
            valor.pk = None
            valor.fondo = fondo
            valor.save()


def _copiar_viajes_usuario(usuario, familia_id, espacio_personal):
    """Copia viajes de la familia al espacio personal del usuario.
    Los viajes son familiares, no por usuario — se copian todos."""
    viajes = Viaje.objects.filter(
        familia_id=familia_id,
    ).prefetch_related('presupuestos')
    for viaje in viajes:
        old_pk = viaje.pk
        presupuestos_orig = list(PresupuestoViaje.objects.filter(viaje_id=old_pk))
        viaje.pk = None
        viaje.familia = None
        viaje.espacio = espacio_personal
        viaje.save()
        for pv in presupuestos_orig:
            pv.pk = None
            pv.viaje = viaje
            pv.save()


def copiar_datos_familia_a_personal(usuario, familia_id):
    """Copia todos los datos familiares del usuario a su espacio personal."""
    espacio_personal = obtener_espacio_personal(usuario)
    cat_map = _copiar_categorias_usuario(usuario, familia_id, espacio_personal)
    _copiar_movimientos_usuario(usuario, familia_id, espacio_personal, cat_map)
    _copiar_ingresos_usuario(usuario, familia_id, espacio_personal)
    _copiar_presupuestos_usuario(usuario, familia_id, espacio_personal, cat_map)
    _copiar_fondos_usuario(usuario, familia_id, espacio_personal)
    _copiar_viajes_usuario(usuario, familia_id, espacio_personal)
    return espacio_personal


def puede_salir_de_familia(usuario) -> tuple[bool, str]:
    """Valida si el usuario puede salir de su familia."""
    if not usuario.familia_id:
        return False, 'El usuario no pertenece a una familia.'

    familia_id = usuario.familia_id
    miembros = Usuario.objects.filter(
        familia_id=familia_id, activo=True,
    ).exclude(pk=usuario.pk)

    if usuario.rol == 'ADMIN' and miembros.exists():
        otros_admin = miembros.filter(rol='ADMIN')
        if not otros_admin.exists():
            return False, (
                'Eres el único administrador. Transfiere el rol a otro '
                'miembro antes de salir.'
            )

    return True, ''


@transaction.atomic
def salir_de_familia(usuario) -> dict:
    """
    Ejecuta la salida de familia del usuario.

    Returns:
        dict con resumen de la operación.
    """
    ok, msg = puede_salir_de_familia(usuario)
    if not ok:
        raise ValueError(msg)

    familia_id = usuario.familia_id
    familia = usuario.familia

    miembros_activos = list(
        Usuario.objects.filter(
            familia_id=familia_id, activo=True,
        ).exclude(pk=usuario.pk)
    )
    disolver = len(miembros_activos) <= 1

    copiar_datos_familia_a_personal(usuario, familia_id)
    resultado = {
        'usuario_id': usuario.pk,
        'familia_id': familia_id,
        'disolucion': disolver,
        'miembros_con_copia': [usuario.pk],
    }

    if disolver and miembros_activos:
        otro = miembros_activos[0]
        copiar_datos_familia_a_personal(otro, familia_id)
        resultado['miembros_con_copia'].append(otro.pk)
        otro.familia = None
        otro.save(update_fields=['familia'])

    SueldoEstimadoProrrateoMensual.objects.filter(
        usuario=usuario
    ).delete()

    InvitacionPendiente.objects.filter(
        familia_id=familia_id, invitador=usuario,
    ).delete()

    usuario.familia = None
    usuario.save(update_fields=['familia'])

    if disolver:
        espejo = Espacio.objects.filter(familia_origen=familia).first()
        if espejo:
            espejo.archivado = True
            espejo.save(update_fields=['archivado'])

    return resultado
