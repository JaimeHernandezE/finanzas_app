"""
Fase 4 — Salida de familia: copia datos del miembro saliente a su espacio
personal, y si la familia queda con un solo miembro, disuelve el espacio
familiar copiando los datos del miembro restante también.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import transaction

from applications.espacios.models import Espacio, PertenenciaEspacio
from applications.espacios.services import (
    espacio_para_familia,
    obtener_espacio_familiar_activo,
    obtener_espacio_personal,
)
from applications.finanzas.models import (
    Categoria,
    Cuota,
    CuentaPersonal,
    IngresoComun,
    Movimiento,
    Presupuesto,
    SueldoEstimadoProrrateoMensual,
    Tarjeta,
)
from applications.inversiones.models import Fondo, Aporte, RegistroValor
from applications.usuarios.models import Familia, InvitacionPendiente
from applications.viajes.models import Viaje, PresupuestoViaje

Usuario = get_user_model()


def _resolver_espacio_origen(familia_id: int) -> Espacio:
    """Resuelve el espacio familiar de origen (por Familia legacy o id de espacio)."""
    espacio = Espacio.objects.filter(pk=familia_id, tipo=Espacio.TIPO_FAMILIAR).first()
    if espacio is not None:
        return espacio
    familia = Familia.objects.get(pk=familia_id)
    return espacio_para_familia(familia)


def _resolver_espacios(usuario, familia_id) -> tuple[Espacio, Espacio]:
    espacio_origen = _resolver_espacio_origen(familia_id)
    espacio_personal = obtener_espacio_personal(usuario)
    if espacio_personal is None:
        raise ValueError('El usuario no tiene espacio personal.')
    return espacio_origen, espacio_personal


def _ids_cuentas_referenciadas(usuario, espacio_origen) -> set[int]:
    movs = Movimiento.objects.filter(usuario=usuario, espacio=espacio_origen)
    cuenta_ids = set(
        movs.filter(cuenta_id__isnull=False).values_list('cuenta_id', flat=True)
    )
    cuenta_ids.update(
        Categoria.objects.filter(
            usuario=usuario,
            espacio=espacio_origen,
            cuenta_personal_id__isnull=False,
        ).values_list('cuenta_personal_id', flat=True)
    )
    return cuenta_ids


def _copiar_tarjetas_usuario(usuario, tarjeta_ids: set[int]) -> dict[int, Tarjeta]:
    tarjeta_map = {}
    for tarjeta in Tarjeta.objects.filter(pk__in=tarjeta_ids, usuario=usuario):
        old_id = tarjeta.pk
        tarjeta.pk = None
        tarjeta.save()
        tarjeta_map[old_id] = tarjeta
    return tarjeta_map


def _copiar_cuentas_usuario(usuario, cuenta_ids: set[int]) -> dict[int, CuentaPersonal]:
    cuenta_map = {}
    for cuenta in CuentaPersonal.objects.filter(pk__in=cuenta_ids, usuario=usuario):
        old_id = cuenta.pk
        cuenta.pk = None
        cuenta.save()
        cuenta_map[old_id] = cuenta
    return cuenta_map


def _copiar_categorias_usuario(
    usuario, espacio_origen, espacio_personal, cuenta_map, espacio_familiar_origen,
):
    cat_map = {}
    personales = Categoria.objects.filter(usuario=usuario, espacio=espacio_origen)
    for cat in personales:
        old_id = cat.pk
        old_cuenta_id = cat.cuenta_personal_id
        cat.pk = None
        cat.espacio = espacio_personal
        cat.origen_familia = espacio_familiar_origen
        if old_cuenta_id and old_cuenta_id in cuenta_map:
            cat.cuenta_personal = cuenta_map[old_cuenta_id]
        cat.save()
        cat_map[old_id] = cat
    return cat_map


def _copiar_categorias_familiares(espacio_origen, espacio_personal, espacio_familiar_origen):
    cat_map = {}
    familiares = Categoria.objects.filter(usuario=None, espacio=espacio_origen)
    for cat in familiares:
        old_id = cat.pk
        cat.pk = None
        cat.espacio = espacio_personal
        cat.origen_familia = espacio_familiar_origen
        cat.save()
        cat_map[old_id] = cat
    return cat_map


def _copiar_viajes_usuario(
    usuario, espacio_origen, espacio_personal, cat_map,
) -> dict[int, Viaje]:
    viaje_map = {}
    viaje_ids = Movimiento.objects.filter(
        usuario=usuario,
        espacio=espacio_origen,
        viaje_id__isnull=False,
    ).values_list('viaje_id', flat=True).distinct()
    viajes = Viaje.objects.filter(pk__in=viaje_ids, espacio=espacio_origen)
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
            if pv.categoria_id in cat_map:
                pv.categoria = cat_map[pv.categoria_id]
            pv.save()
        viaje_map[old_pk] = viaje
    return viaje_map


def _copiar_movimientos_usuario(
    usuario,
    espacio_origen,
    espacio_personal,
    espacio_familiar_origen,
    cat_map,
    tarjeta_map,
    cuenta_map,
    viaje_map,
):
    movimientos = Movimiento.objects.filter(
        usuario=usuario, espacio=espacio_origen,
    ).select_related('categoria')
    for mov in movimientos:
        old_pk = mov.pk
        cuotas_orig = list(Cuota.objects.filter(movimiento_id=old_pk))
        mov.pk = None
        mov.espacio = espacio_personal
        mov.origen_familia = espacio_familiar_origen
        if mov.categoria_id in cat_map:
            mov.categoria = cat_map[mov.categoria_id]
        if mov.tarjeta_id and mov.tarjeta_id in tarjeta_map:
            mov.tarjeta = tarjeta_map[mov.tarjeta_id]
        if mov.cuenta_id and mov.cuenta_id in cuenta_map:
            mov.cuenta = cuenta_map[mov.cuenta_id]
        if mov.viaje_id and mov.viaje_id in viaje_map:
            mov.viaje = viaje_map[mov.viaje_id]
        mov.save()
        if cuotas_orig and mov.tarjeta_id is None:
            for cuota in cuotas_orig:
                cuota.pk = None
                cuota.movimiento = mov
                cuota.save()


def _copiar_ingresos_usuario(usuario, espacio_origen, espacio_personal):
    ingresos = IngresoComun.objects.filter(usuario=usuario, espacio=espacio_origen)
    for ing in ingresos:
        old_mov_id = ing.movimiento_id
        ing.pk = None
        ing.espacio = espacio_personal
        if old_mov_id:
            nuevo_mov = Movimiento.objects.filter(
                espacio=espacio_personal, usuario=usuario,
                fecha=ing.mes, tipo='INGRESO',
            ).order_by('-created_at').first()
            ing.movimiento = nuevo_mov
        ing.save()


def _copiar_presupuestos_usuario(
    usuario, espacio_origen, espacio_personal, espacio_familiar_origen, cat_map,
):
    presupuestos = Presupuesto.objects.filter(usuario=usuario, espacio=espacio_origen)
    for p in presupuestos:
        p.pk = None
        p.espacio = espacio_personal
        p.origen_familia = espacio_familiar_origen
        if p.categoria_id in cat_map:
            p.categoria = cat_map[p.categoria_id]
        p.save()


def _copiar_fondos_usuario(usuario, espacio_origen, espacio_personal):
    fondos = Fondo.objects.filter(
        usuario=usuario, espacio=espacio_origen,
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


def copiar_datos_familia_a_personal(usuario, familia_id):
    """
    Copia todos los datos del espacio familiar al espacio personal del usuario.

    ``familia_id`` acepta el pk de una Familia legacy o el id del Espacio FAMILIAR.
    """
    espacio_origen, espacio_personal = _resolver_espacios(usuario, familia_id)
    espacio_familiar_origen = espacio_origen

    movs_qs = Movimiento.objects.filter(usuario=usuario, espacio=espacio_origen)
    tarjeta_ids = set(
        movs_qs.filter(tarjeta_id__isnull=False).values_list('tarjeta_id', flat=True)
    )
    cuenta_ids = _ids_cuentas_referenciadas(usuario, espacio_origen)

    cuenta_map = _copiar_cuentas_usuario(usuario, cuenta_ids)
    cat_personal = _copiar_categorias_usuario(
        usuario, espacio_origen, espacio_personal, cuenta_map, espacio_familiar_origen,
    )
    cat_familiar = _copiar_categorias_familiares(
        espacio_origen, espacio_personal, espacio_familiar_origen,
    )
    cat_map = {**cat_personal, **cat_familiar}
    tarjeta_map = _copiar_tarjetas_usuario(usuario, tarjeta_ids)
    viaje_map = _copiar_viajes_usuario(usuario, espacio_origen, espacio_personal, cat_map)

    _copiar_movimientos_usuario(
        usuario,
        espacio_origen,
        espacio_personal,
        espacio_familiar_origen,
        cat_map,
        tarjeta_map,
        cuenta_map,
        viaje_map,
    )
    _copiar_ingresos_usuario(usuario, espacio_origen, espacio_personal)
    _copiar_presupuestos_usuario(
        usuario, espacio_origen, espacio_personal, espacio_familiar_origen, cat_map,
    )
    _copiar_fondos_usuario(usuario, espacio_origen, espacio_personal)
    return espacio_personal


def _pertenencia_familiar(usuario, espacio: Espacio):
    return PertenenciaEspacio.objects.get(usuario=usuario, espacio=espacio)


def puede_salir_de_familia(usuario) -> tuple[bool, str]:
    """Valida si el usuario puede salir de su espacio familiar activo."""
    espacio = obtener_espacio_familiar_activo(usuario)
    if espacio is None:
        return False, 'El usuario no pertenece a una familia.'

    pertenencia = _pertenencia_familiar(usuario, espacio)
    miembros = PertenenciaEspacio.objects.filter(
        espacio=espacio, activo=True,
    ).exclude(usuario=usuario)

    if pertenencia.rol == PertenenciaEspacio.ROL_ADMIN and miembros.exists():
        otros_admin = miembros.filter(rol=PertenenciaEspacio.ROL_ADMIN)
        if not otros_admin.exists():
            return False, (
                'Eres el único administrador. Transfiere el rol a otro '
                'miembro antes de salir.'
            )

    return True, ''


@transaction.atomic
def salir_de_familia(usuario) -> dict:
    """Ejecuta la salida del espacio familiar del usuario."""
    ok, msg = puede_salir_de_familia(usuario)
    if not ok:
        raise ValueError(msg)

    espacio = obtener_espacio_familiar_activo(usuario)
    if espacio is None:
        raise ValueError('El usuario no pertenece a una familia.')

    miembros_activos = list(
        PertenenciaEspacio.objects.filter(
            espacio=espacio, activo=True,
        ).exclude(usuario=usuario).select_related('usuario')
    )
    disolver = len(miembros_activos) <= 1

    copiar_datos_familia_a_personal(usuario, espacio.pk)
    resultado = {
        'usuario_id': usuario.pk,
        'espacio_id': espacio.pk,
        'disolucion': disolver,
        'miembros_con_copia': [usuario.pk],
    }

    PertenenciaEspacio.objects.filter(
        usuario=usuario, espacio=espacio,
    ).update(activo=False)

    if disolver and miembros_activos:
        otro = miembros_activos[0].usuario
        copiar_datos_familia_a_personal(otro, espacio.pk)
        resultado['miembros_con_copia'].append(otro.pk)
        PertenenciaEspacio.objects.filter(
            usuario=otro, espacio=espacio,
        ).update(activo=False)

    SueldoEstimadoProrrateoMensual.objects.filter(usuario=usuario).delete()

    InvitacionPendiente.objects.filter(
        espacio=espacio, invitador=usuario,
    ).delete()

    if disolver:
        espacio.archivado = True
        espacio.save(update_fields=['archivado'])

    return resultado
