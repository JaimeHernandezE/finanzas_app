"""
Comprueba si un usuario puede salir de una familia sin dejar datos huérfanos
relevantes (movimientos, cuentas, etc.).
"""

from __future__ import annotations

from django.contrib.auth import get_user_model

from applications.finanzas.models import (
    Categoria,
    CuentaPersonal,
    IngresoComun,
    LiquidacionComunMensualSnapshot,
    Movimiento,
    Presupuesto,
    SaldoMensualSnapshot,
    SueldoEstimadoProrrateoMensual,
    Tarjeta,
    TutorCuenta,
)
from applications.inversiones.models import Fondo

from .models import InvitacionPendiente

Usuario = get_user_model()


def usuario_tiene_registros_en_familia(usuario_id: int, familia_id: int) -> tuple[bool, str]:
    """
    True si el usuario tiene algún dato que impide quitarlo de la familia sin limpieza previa.
    """
    if Movimiento.objects.filter(usuario_id=usuario_id, familia_id=familia_id).exists():
        return True, 'Tiene movimientos registrados en la familia.'

    if Tarjeta.objects.filter(usuario_id=usuario_id).exists():
        return True, 'Tiene tarjetas registradas.'

    # La signal crea automáticamente la cuenta 'Personal'; no bloqueará la salida si
    # no hay cuentas adicionales.
    if (
        CuentaPersonal.objects.filter(usuario_id=usuario_id)
        .exclude(nombre__iexact='Personal')
        .exists()
    ):
        return True, 'Tiene cuentas personales.'

    if TutorCuenta.objects.filter(tutor_id=usuario_id).exists():
        return True, 'Tiene cuentas tuteladas (tutorías activas).'

    if TutorCuenta.objects.filter(cuenta__usuario_id=usuario_id).exists():
        return True, 'Tiene cuentas con tutores asignados.'

    if Presupuesto.objects.filter(familia_id=familia_id, usuario_id=usuario_id).exists():
        return True, 'Tiene presupuestos personales en la familia.'

    if IngresoComun.objects.filter(usuario_id=usuario_id, familia_id=familia_id).exists():
        return True, 'Tiene ingresos comunes declarados.'

    if SaldoMensualSnapshot.objects.filter(usuario_id=usuario_id, familia_id=familia_id).exists():
        return True, 'Tiene datos en el histórico de saldos (snapshots).'

    if LiquidacionComunMensualSnapshot.objects.filter(
        usuario_id=usuario_id, familia_id=familia_id
    ).exists():
        return True, 'Tiene datos en snapshots de liquidación común.'

    if SueldoEstimadoProrrateoMensual.objects.filter(usuario_id=usuario_id).exists():
        return True, 'Tiene sueldos estimados de prorrateo guardados.'

    if Categoria.objects.filter(usuario_id=usuario_id, familia_id=familia_id).exists():
        return True, 'Tiene categorías personales.'

    if Fondo.objects.filter(familia_id=familia_id, usuario_id=usuario_id).exists():
        return True, 'Tiene fondos de inversión asociados.'

    if InvitacionPendiente.objects.filter(familia_id=familia_id, invitador_id=usuario_id).exists():
        return True, 'Tiene invitaciones pendientes registradas como invitador.'

    return False, ''


def puede_quitar_miembro_familia(
    usuario_solicitante_id: int,
    usuario_solicitante_rol: str,
    objetivo_id: int,
    objetivo_rol: str,
    familia_id: int,
) -> tuple[bool, str]:
    """
    Reglas de negocio + datos: ¿puede un admin quitar a `objetivo` de la familia?
    """
    if usuario_solicitante_rol != 'ADMIN':
        return False, 'Solo un administrador puede quitar miembros.'

    if objetivo_id == usuario_solicitante_id:
        return False, 'No puedes quitarte a ti mismo de la familia desde aquí.'

    bloqueado, msg = usuario_tiene_registros_en_familia(objetivo_id, familia_id)
    if bloqueado:
        return False, msg

    if objetivo_rol == 'ADMIN':
        otros = Usuario.objects.filter(familia_id=familia_id, rol='ADMIN').exclude(pk=objetivo_id)
        if not otros.exists():
            return (
                False,
                'Debe existir al menos otro administrador antes de quitar a este miembro.',
            )

    return True, ''
