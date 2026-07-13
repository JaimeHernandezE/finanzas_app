"""
Comprueba si un usuario puede salir de una familia sin dejar datos huérfanos
relevantes (movimientos, cuentas, etc.).
"""

from __future__ import annotations

from applications.espacios.models import PertenenciaEspacio
from applications.finanzas.models import (
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


def usuario_tiene_registros_en_espacio(usuario_id: int, espacio_id: int) -> tuple[bool, str]:
    """
    True si el usuario tiene algún dato que impide quitarlo del espacio familiar
    sin limpieza previa.
    """
    if Movimiento.objects.filter(usuario_id=usuario_id, espacio_id=espacio_id).exists():
        return True, 'Tiene movimientos registrados en la familia.'

    if Tarjeta.objects.filter(usuario_id=usuario_id).exists():
        return True, 'Tiene tarjetas registradas.'

    # Importante: no bloqueamos por la cuenta personal por defecto ('Personal').
    # El objetivo del endpoint es permitir quitar miembros que no han registrado
    # movimientos ni otros datos financieros.

    if TutorCuenta.objects.filter(tutor_id=usuario_id).exists():
        return True, 'Tiene cuentas tuteladas (tutorías activas).'

    if TutorCuenta.objects.filter(cuenta__usuario_id=usuario_id).exists():
        return True, 'Tiene cuentas con tutores asignados.'

    if Presupuesto.objects.filter(espacio_id=espacio_id, usuario_id=usuario_id).exists():
        return True, 'Tiene presupuestos personales en la familia.'

    if IngresoComun.objects.filter(usuario_id=usuario_id, espacio_id=espacio_id).exists():
        return True, 'Tiene ingresos comunes declarados.'

    if SueldoEstimadoProrrateoMensual.objects.filter(usuario_id=usuario_id).exists():
        return True, 'Tiene sueldos estimados de prorrateo guardados.'

    if Fondo.objects.filter(espacio_id=espacio_id, usuario_id=usuario_id).exists():
        return True, 'Tiene fondos de inversión asociados.'

    if InvitacionPendiente.objects.filter(espacio_id=espacio_id, invitador_id=usuario_id).exists():
        return True, 'Tiene invitaciones pendientes registradas como invitador.'

    return False, ''


def puede_quitar_miembro_familia(
    usuario_solicitante_id: int,
    usuario_solicitante_rol: str,
    objetivo_id: int,
    objetivo_rol: str,
    espacio_id: int,
) -> tuple[bool, str]:
    """
    Reglas de negocio + datos: ¿puede un admin quitar a `objetivo` del espacio familiar?
    """
    if usuario_solicitante_rol != 'ADMIN':
        return False, 'Solo un administrador puede quitar miembros.'

    if objetivo_id == usuario_solicitante_id:
        return False, 'No puedes quitarte a ti mismo de la familia desde aquí.'

    bloqueado, msg = usuario_tiene_registros_en_espacio(objetivo_id, espacio_id)
    if bloqueado:
        return False, msg

    if objetivo_rol == 'ADMIN':
        otros = (
            PertenenciaEspacio.objects
            .filter(espacio_id=espacio_id, rol=PertenenciaEspacio.ROL_ADMIN, activo=True)
            .exclude(usuario_id=objetivo_id)
        )
        if not otros.exists():
            return (
                False,
                'Debe existir al menos otro administrador antes de quitar a este miembro.',
            )

    return True, ''


# Alias legacy para imports existentes en tests u otros módulos.
usuario_tiene_registros_en_familia = usuario_tiene_registros_en_espacio
