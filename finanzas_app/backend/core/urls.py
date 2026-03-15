from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/usuarios/',   include('applications.usuarios.urls')),
    path('api/finanzas/',   include('applications.finanzas.urls')),
    path('api/inversiones/', include('applications.inversiones.urls')),
    path('api/viajes/',     include('applications.viajes.urls')),
]
