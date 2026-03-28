from django.urls import path
from . import views

urlpatterns = [
    path('config/', views.configuracion_global, name='configuracion-global'),
    path('me/', views.me, name='me'),
    path('registro/', views.registrar_usuario, name='registro'),
    path('auth/check-email/', views.auth_check_email, name='auth_check_email'),
    path('familia/miembros/', views.familia_miembros, name='familia_miembros'),
    path('familia/miembros/<int:pk>/rol/', views.miembro_actualizar_rol, name='miembro_rol'),
    path('familia/invitaciones/', views.familia_invitaciones, name='familia_invitaciones'),
    path('familia/invitaciones/<int:pk>/', views.familia_invitacion_eliminar, name='familia_invitacion_eliminar'),
]
