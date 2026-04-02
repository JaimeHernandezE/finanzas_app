# Funciones que convierten cada modelo a filas para Google Sheets.

import re

from applications.finanzas.models import (
    CuentaPersonal,
    Cuota,
    IngresoComun,
    Movimiento,
    ResumenHistoricoMesSnapshot,
)
from applications.inversiones.models import Fondo
from applications.viajes.models import Viaje

# Google Sheets: título máx. 100 caracteres; no \ / ? * [ ]
_MAX_TITULO = 100
_RE_PROHIBIDOS = re.compile(r'[\\/*?:\[\]]')


def titulo_hoja_seguro(texto: str, titulos_usados: set[str]) -> str:
    """Recorta, sanea caracteres prohibidos y evita colisiones de nombre de pestaña."""
    s = _RE_PROHIBIDOS.sub('-', (texto or '').strip())
    s = re.sub(r'\s+', ' ', s)
    if not s:
        s = 'Hoja'
    base = s[:_MAX_TITULO]
    candidate = base
    n = 0
    while candidate in titulos_usados:
        n += 1
        suf = f' ({n})'
        candidate = (base[: _MAX_TITULO - len(suf)] + suf).strip()
    titulos_usados.add(candidate)
    return candidate


def nombre_hoja_fija(nombre: str, familia, multitenant: bool) -> str:
    if not multitenant:
        return nombre
    return f'{nombre} - {familia.nombre}'


def nombre_hoja_cuenta(familia, cuenta: CuentaPersonal, multitenant: bool) -> str:
    u = cuenta.usuario
    base = f'{u.username} — {cuenta.nombre}'
    if multitenant:
        return f'{familia.nombre} — {base}'
    return base


ENCABEZADO_MOVIMIENTO = [
    'ID', 'Fecha', 'Tipo', 'Ámbito', 'Categoría',
    'Monto', 'Comentario', 'Método pago', 'Tarjeta',
    'N° cuotas', 'Cuenta', 'Usuario', 'Viaje', 'Creado en',
]


def _movimiento_a_fila(m: Movimiento) -> list:
    return [
        m.id,
        str(m.fecha),
        m.tipo,
        m.ambito,
        m.categoria.nombre if m.categoria else '',
        float(m.monto),
        m.comentario or '',
        m.metodo_pago.tipo if m.metodo_pago else '',
        m.tarjeta.nombre if m.tarjeta else '',
        m.num_cuotas or '',
        m.cuenta.nombre if m.cuenta else '',
        m.usuario.first_name if m.usuario else '',
        m.viaje.nombre if m.viaje else '',
        str(m.created_at.date()),
    ]


def exportar_movimientos(familia):
    filas = [ENCABEZADO_MOVIMIENTO]
    qs = Movimiento.objects.filter(
        familia=familia, oculto=False
    ).select_related(
        'categoria', 'metodo_pago', 'tarjeta', 'usuario', 'cuenta', 'viaje'
    ).order_by('-fecha')

    for m in qs:
        filas.append(_movimiento_a_fila(m))
    return filas


def exportar_movimientos_cuenta(familia, cuenta: CuentaPersonal):
    """Movimientos de una cuenta personal concreta."""
    filas = [ENCABEZADO_MOVIMIENTO]
    qs = Movimiento.objects.filter(
        familia=familia,
        cuenta=cuenta,
        oculto=False,
    ).select_related(
        'categoria', 'metodo_pago', 'tarjeta', 'usuario', 'cuenta', 'viaje'
    ).order_by('-fecha')
    for m in qs:
        filas.append(_movimiento_a_fila(m))
    return filas


ENCABEZADO_GASTO_COMUN = [
    'Usuario registro (nick)',
    'Usuario registro (nombre)',
    *ENCABEZADO_MOVIMIENTO,
]


def _movimiento_a_fila_gasto_comun(m: Movimiento) -> list:
    nombre_u = ''
    if m.usuario:
        nombre_u = (m.usuario.get_full_name() or m.usuario.first_name or '').strip()
    return [
        m.usuario.username if m.usuario else '',
        nombre_u,
        *_movimiento_a_fila(m),
    ]


def exportar_gasto_comun(familia):
    filas = [ENCABEZADO_GASTO_COMUN]
    qs = Movimiento.objects.filter(
        familia=familia,
        ambito='COMUN',
        tipo='EGRESO',
        oculto=False,
    ).select_related(
        'categoria', 'metodo_pago', 'tarjeta', 'usuario', 'cuenta', 'viaje'
    ).order_by('-fecha')
    for m in qs:
        filas.append(_movimiento_a_fila_gasto_comun(m))
    return filas


def exportar_resumen_historico(familia):
    """
    Una fila por celda de datos en bloques por mes (payload de ResumenHistoricoMesSnapshot).
    """
    filas: list[list] = []
    qs = ResumenHistoricoMesSnapshot.objects.filter(familia=familia).order_by('mes')
    for snap in qs:
        p = snap.payload
        filas.append(
            ['MES', p.get('mes'), 'AÑO', p.get('anio'), 'GASTO_COMUN_TOTAL', p.get('gasto_comun_total', '')]
        )
        filas.append([])
        filas.append(['gastos_comunes_por_usuario'])
        filas.append(['usuario_id', 'nombre', 'total'])
        for g in p.get('gastos_comunes_por_usuario') or []:
            filas.append([g.get('usuario_id'), g.get('nombre'), g.get('total')])
        filas.append([])
        filas.append(['sueldos_por_usuario'])
        filas.append(['usuario_id', 'nombre', 'total'])
        for g in p.get('sueldos_por_usuario') or []:
            filas.append([g.get('usuario_id'), g.get('nombre'), g.get('total')])
        filas.append([])
        filas.append(['prorrateo_por_usuario'])
        filas.append(['usuario_id', 'nombre', 'porcentaje', 'ingreso_comun_mes'])
        for g in p.get('prorrateo_por_usuario') or []:
            filas.append([
                g.get('usuario_id'),
                g.get('nombre'),
                g.get('porcentaje'),
                g.get('ingreso_comun_mes'),
            ])
        filas.append([])
        filas.append(['gasto_comun_prorrateado_por_usuario'])
        filas.append(['usuario_id', 'nombre', 'total'])
        for g in p.get('gasto_comun_prorrateado_por_usuario') or []:
            filas.append([g.get('usuario_id'), g.get('nombre'), g.get('total')])
        comp = p.get('compensacion') or {}
        filas.append([])
        filas.append(['compensacion_por_usuario'])
        filas.append(['usuario_id', 'nombre', 'pagado_efectivo', 'gasto_prorrateado', 'diferencia'])
        for g in comp.get('por_usuario') or []:
            filas.append([
                g.get('usuario_id'),
                g.get('nombre'),
                g.get('pagado_efectivo'),
                g.get('gasto_prorrateado'),
                g.get('diferencia'),
            ])
        filas.append([])
        filas.append(['transferencias_sugeridas'])
        filas.append(['de_usuario_id', 'de_nombre', 'a_usuario_id', 'a_nombre', 'monto'])
        for t in comp.get('transferencias_sugeridas') or []:
            filas.append([
                t.get('de_usuario_id'),
                t.get('de_nombre'),
                t.get('a_usuario_id'),
                t.get('a_nombre'),
                t.get('monto'),
            ])
        base = p.get('base_prorrateo') or {}
        if base:
            filas.append([])
            filas.append(['base_prorrateo', base.get('nota', ''), 'mes', base.get('mes'), 'anio', base.get('anio')])
        filas.append([])
        filas.append([])

    if not filas:
        return [['Sin datos en ResumenHistoricoMesSnapshot para esta familia.']]
    return filas


def exportar_cuotas(familia):
    encabezado = [
        'ID', 'Movimiento ID', 'Número', 'Monto',
        'Mes facturación', 'Estado', 'Incluir',
    ]
    filas = [encabezado]
    qs = Cuota.objects.filter(
        movimiento__familia=familia
    ).select_related('movimiento').order_by('mes_facturacion', 'numero')

    for c in qs:
        filas.append([
            c.id,
            c.movimiento_id,
            c.numero,
            float(c.monto),
            str(c.mes_facturacion),
            c.estado,
            'Sí' if c.incluir else 'No',
        ])
    return filas


def exportar_ingresos_comunes(familia):
    encabezado = ['ID', 'Usuario', 'Mes', 'Monto', 'Origen']
    filas = [encabezado]
    qs = IngresoComun.objects.filter(
        familia=familia
    ).select_related('usuario').order_by('-mes')

    for i in qs:
        filas.append([
            i.id,
            i.usuario.first_name if i.usuario else '',
            str(i.mes),
            float(i.monto),
            i.origen or '',
        ])
    return filas


def exportar_inversiones(familia):
    encabezado = ['Fondo', 'Tipo', 'Fecha', 'Monto/Valor', 'Nota']
    filas = [encabezado]
    fondos = Fondo.objects.filter(familia=familia)

    for fondo in fondos:
        for a in fondo.aportes.order_by('-fecha'):
            filas.append([
                fondo.nombre, 'Aporte', str(a.fecha), float(a.monto), a.nota or '',
            ])
        for v in fondo.registros_valor.order_by('-fecha'):
            filas.append([
                fondo.nombre, 'Valor', str(v.fecha), float(v.valor_cuota), '',
            ])
    return filas


def exportar_viajes(familia):
    encabezado = [
        'Viaje', 'Fecha inicio', 'Fecha fin',
        'Categoría presupuesto', 'Monto planificado',
    ]
    filas = [encabezado]
    viajes = Viaje.objects.filter(familia=familia).prefetch_related(
        'presupuestos__categoria'
    )

    for v in viajes:
        pres = list(v.presupuestos.all())
        for p in pres:
            filas.append([
                v.nombre,
                str(v.fecha_inicio),
                str(v.fecha_fin),
                p.categoria.nombre if p.categoria else '',
                float(p.monto_planificado),
            ])
        if not pres:
            filas.append([v.nombre, str(v.fecha_inicio), str(v.fecha_fin), '', ''])
    return filas


def listar_cuentas_familia(familia):
    """Cuentas personales cuyo usuario pertenece a la familia."""
    return (
        CuentaPersonal.objects.filter(usuario__familia=familia)
        .select_related('usuario')
        .order_by('usuario_id', 'nombre')
    )
