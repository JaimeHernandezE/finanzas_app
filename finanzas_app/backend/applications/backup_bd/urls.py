from django.urls import path

from . import views

urlpatterns = [
    path('descargar/', views.descargar_dump, name='backup-bd-descargar'),
    path('subir-drive/', views.subir_dump_a_drive, name='backup-bd-subir-drive'),
    path('importar/', views.importar_dump, name='backup-bd-importar'),
]
