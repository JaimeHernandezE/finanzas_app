from django.urls import path
from . import views

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

    # Liquidación
    path('liquidacion/', views.liquidacion, name='liquidacion'),
]
