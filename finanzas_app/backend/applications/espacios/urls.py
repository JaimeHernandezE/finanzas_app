from django.urls import path

from . import views

urlpatterns = [
    path('mios/', views.mis_espacios, name='espacios-mios'),
    path('activo/', views.espacio_activo, name='espacios-activo'),
    path('<int:pk>/', views.espacio_actualizar, name='espacios-actualizar'),
    path('<int:pk>/exportar/', views.espacio_exportar, name='espacio-exportar'),
    path('<int:pk>/importar/', views.espacio_importar, name='espacio-importar'),
]
