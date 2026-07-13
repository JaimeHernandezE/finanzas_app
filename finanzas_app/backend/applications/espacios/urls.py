from django.urls import path

from . import views

urlpatterns = [
    path('mios/', views.mis_espacios, name='espacios-mios'),
    path('activo/', views.espacio_activo, name='espacios-activo'),
    path('<int:pk>/', views.espacio_actualizar, name='espacios-actualizar'),
    path('<int:pk>/exportar/', views.espacio_exportar, name='espacio-exportar'),
    path('<int:pk>/importar/', views.espacio_importar, name='espacio-importar'),
    # Fase 5 V2: Google Drive por usuario
    path('drive/status/', views.drive_status, name='drive-status'),
    path('drive/connect/', views.drive_connect, name='drive-connect'),
    path('drive/callback/', views.drive_callback, name='drive-callback'),
    path('drive/disconnect/', views.drive_disconnect, name='drive-disconnect'),
    path('drive/config/', views.drive_config, name='drive-config'),
    path('<int:pk>/backup-drive/', views.drive_backup_espacio, name='espacio-backup-drive'),
]
