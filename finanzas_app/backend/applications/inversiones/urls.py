from django.urls import path
from . import views

app_name = 'inversiones'

urlpatterns = [
    path('fondos/',                    views.fondos,          name='fondos'),
    path('fondos/<int:pk>/',           views.fondo_detalle,   name='fondo-detalle'),
    path('fondos/<int:pk>/aportes/',   views.agregar_aporte,  name='agregar-aporte'),
    path('fondos/<int:pk>/valores/',   views.agregar_valor,   name='agregar-valor'),
    path('aportes/<int:pk>/',          views.eliminar_aporte, name='eliminar-aporte'),
    path('valores/<int:pk>/',          views.eliminar_valor,  name='eliminar-valor'),
]
