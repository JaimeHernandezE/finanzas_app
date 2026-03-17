from django.urls import path
from . import views

app_name = 'viajes'

urlpatterns = [
    path('',                            views.viajes,             name='viajes'),
    path('<int:pk>/',                   views.viaje_detalle,      name='viaje-detalle'),
    path('<int:pk>/activar/',           views.activar_viaje,      name='activar-viaje'),
    path('<int:pk>/presupuestos/',      views.presupuestos_viaje, name='presupuestos-viaje'),
    path('presupuestos/<int:pk>/',      views.presupuesto_detalle,name='presupuesto-detalle'),
]
