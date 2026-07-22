from django.urls import path
from . import views
from . import views_pendientes
from .asistente import views_asistente
from .captura_bot import views_webhooks

app_name = 'finanzas'

urlpatterns = [
    # Categorías
    path('categorias/', views.categorias, name='categorias'),
    path('categorias/<int:pk>/', views.categoria_detalle, name='categoria-detalle'),

    # Métodos de pago
    path('metodos-pago/', views.metodos_pago, name='metodos-pago'),

    # Tarjetas
    path('tarjetas/', views.tarjetas, name='tarjetas'),
    path('tarjetas/<int:pk>/', views.tarjeta_detalle, name='tarjeta-detalle'),

    # Cuentas personales (propias + tuteladas)
    path('cuentas-personales/', views.cuentas_personales, name='cuentas-personales'),
    path(
        'cuentas-personales/<int:pk>/',
        views.cuenta_personal_detalle,
        name='cuenta-personal-detalle',
    ),

    # Movimientos
    path('movimientos/', views.movimientos, name='movimientos'),
    path('movimientos/<int:pk>/', views.movimiento_detalle, name='movimiento-detalle'),

    # Pendientes (captura — bandeja)
    path('pendientes/', views_pendientes.pendientes, name='pendientes'),
    path(
        'pendientes/contador/',
        views_pendientes.pendientes_contador,
        name='pendientes-contador',
    ),
    path(
        'pendientes/<int:pk>/confirmar/',
        views_pendientes.pendiente_confirmar,
        name='pendiente-confirmar',
    ),
    path(
        'pendientes/<int:pk>/descartar/',
        views_pendientes.pendiente_descartar,
        name='pendiente-descartar',
    ),
    path(
        'captura/vinculo/',
        views_pendientes.captura_generar_vinculo,
        name='captura-generar-vinculo',
    ),
    path(
        'captura/vinculo/estado/',
        views_pendientes.captura_estado_vinculo,
        name='captura-estado-vinculo',
    ),
    path(
        'captura/correo/',
        views_pendientes.captura_correo,
        name='captura-correo',
    ),
    path(
        'captura/correo/oauth/connect/',
        views_pendientes.captura_correo_oauth_connect,
        name='captura-correo-oauth-connect',
    ),
    path(
        'captura/correo/oauth/callback/google/',
        views_pendientes.captura_correo_oauth_callback_google,
        name='captura-correo-oauth-callback-google',
    ),
    path(
        'captura/correo/oauth/callback/microsoft/',
        views_pendientes.captura_correo_oauth_callback_microsoft,
        name='captura-correo-oauth-callback-microsoft',
    ),
    path(
        'captura/correo/probar/',
        views_pendientes.captura_correo_probar,
        name='captura-correo-probar',
    ),
    path(
        'captura/correo/sincronizar/',
        views_pendientes.captura_correo_sincronizar,
        name='captura-correo-sincronizar',
    ),
    path(
        'captura/correo/desconectar/',
        views_pendientes.captura_correo_desconectar,
        name='captura-correo-desconectar',
    ),
    path(
        'captura/webhooks/telegram/',
        views_webhooks.webhook_telegram,
        name='captura-webhook-telegram',
    ),
    path(
        'captura/webhooks/whatsapp/',
        views_webhooks.webhook_whatsapp,
        name='captura-webhook-whatsapp',
    ),

    # Cuotas
    path('cuotas/', views.cuotas, name='cuotas'),
    path(
        'cuotas/deuda-pendiente/',
        views.cuotas_deuda_pendiente,
        name='cuotas-deuda-pendiente',
    ),
    path('cuotas/<int:pk>/', views.cuota_detalle, name='cuota-detalle'),

    # Ingresos comunes (sueldos)
    path('ingresos-comunes/', views.ingresos_comunes, name='ingresos-comunes'),
    path('ingresos-comunes/<int:pk>/', views.ingreso_comun_detalle, name='ingreso-comun-detalle'),

    # Presupuesto mensual (modelo Presupuesto en finanzas)
    path('presupuesto-mes/', views.presupuesto_mes, name='presupuesto-mes'),
    path('presupuestos/', views.presupuestos_create, name='presupuestos-create'),
    path(
        'presupuestos/<int:pk>/',
        views.presupuesto_detalle_finanzas,
        name='presupuesto-finanzas-detalle',
    ),

    # Pago de tarjeta
    path('pagar-tarjeta/', views.pagar_tarjeta, name='pagar-tarjeta'),

    # Liquidación
    path('liquidacion/', views.liquidacion, name='liquidacion'),
    path('resumen-historico/', views.resumen_historico, name='resumen-historico'),

    # Snapshots / recálculo
    path('saldo-mensual/', views.saldo_mensual, name='saldo-mensual'),
    path(
        'cuenta-resumen-mensual/',
        views.cuenta_resumen_mensual,
        name='cuenta-resumen-mensual',
    ),
    path('efectivo-disponible/', views.efectivo_disponible, name='efectivo-disponible'),
    path('dashboard-resumen/', views.dashboard_resumen, name='dashboard-resumen'),
    # Alias legacy: algunos clientes antiguos usan variantes de nombre.
    path('dashboard/', views.dashboard_resumen, name='dashboard-resumen-legacy'),
    path('resumen-dashboard/', views.dashboard_resumen, name='resumen-dashboard-legacy'),
    path('dashboard_resumen/', views.dashboard_resumen, name='dashboard-resumen-legacy-underscore'),
    path(
        'compensacion-proyectada/',
        views.compensacion_proyectada_datos,
        name='compensacion-proyectada',
    ),
    path(
        'sueldos-estimados-prorrateo/',
        views.sueldos_estimados_prorrateo,
        name='sueldos-estimados-prorrateo',
    ),
    # Alias legacy para compatibilidad con tests/clients antiguos.
    path('recalculo-estado/', views.recalculo_estado, name='recalculo-estado-legacy'),
    path('recalculo/estado/', views.recalculo_estado, name='recalculo-estado'),
    path('recalculo/historico/', views.recalculo_historico, name='recalculo-historico'),

    path('notificaciones/', views.notificaciones_lista, name='notificaciones-lista'),
    path(
        'notificaciones/no-leidas/',
        views.notificaciones_no_leidas_count,
        name='notificaciones-no-leidas',
    ),
    path(
        'notificaciones/marcar-todas-leidas/',
        views.notificaciones_marcar_todas_leidas,
        name='notificaciones-marcar-todas',
    ),
    path(
        'notificaciones/<int:pk>/leida/',
        views.notificacion_marcar_leida,
        name='notificacion-marcar-leida',
    ),

    # Asistente financiero (Etapa B)
    path(
        'asistente/consulta/',
        views_asistente.asistente_consulta,
        name='asistente-consulta',
    ),

    # Importación de planillas
    path(
        'importaciones/cuenta-personal/',
        views.importar_cuenta_personal_planilla,
        name='importar-cuenta-personal-planilla',
    ),
    path(
        'importaciones/honorarios/',
        views.importar_honorarios_planilla,
        name='importar-honorarios-planilla',
    ),
    path(
        'importaciones/sueldos/',
        views.importar_sueldos_planilla,
        name='importar-sueldos-planilla',
    ),
    path(
        'importaciones/gastos-comunes/',
        views.importar_gastos_comunes_planilla,
        name='importar-gastos-comunes-planilla',
    ),

    # Métricas públicas (sin autenticación)
    path('metricas-publicas/', views.metricas_publicas, name='metricas-publicas'),
]
