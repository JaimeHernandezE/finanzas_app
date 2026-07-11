from django.urls import path

from . import views

urlpatterns = [
    path('mios/', views.mis_espacios, name='espacios-mios'),
    path('activo/', views.espacio_activo, name='espacios-activo'),
    path('<int:pk>/', views.espacio_actualizar, name='espacios-actualizar'),
]
