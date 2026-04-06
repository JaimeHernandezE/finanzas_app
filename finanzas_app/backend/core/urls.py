from django.contrib import admin
from django.urls import include, path

from core import views

urlpatterns = [
    path('', views.raiz_api, name='raiz-api'),
    path('admin/', admin.site.urls),
    path('api/usuarios/',   include('applications.usuarios.urls')),
    path('api/finanzas/',   include('applications.finanzas.urls')),
    path('api/inversiones/', include('applications.inversiones.urls')),
    path('api/viajes/',     include('applications.viajes.urls')),
    path('api/export/',    include('applications.export.urls')),
    path('api/backup-bd/', include('applications.backup_bd.urls')),
]
