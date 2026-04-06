from django.urls import path
from . import views

urlpatterns = [
    path('config/', views.configuracion_global, name='configuracion-global'),
    path('demo-login/', views.demo_login, name='demo-login'),
    path('me/', views.me, name='me'),
    path('registro/', views.registrar_usuario, name='registro'),
    path('auth/check-email/', views.auth_check_email, name='auth_check_email'),
    path('familia/miembros/', views.familia_miembros, name='familia_miembros'),
    path('familia/miembros/<int:pk>/', views.miembro_eliminar, name='miembro_eliminar'),
    path('familia/miembros/<int:pk>/rol/', views.miembro_actualizar_rol, name='miembro_rol'),
    path('familia/miembros/<int:pk>/activo/', views.miembro_actualizar_activo, name='miembro_activo'),
    path('familia/invitaciones/', views.familia_invitaciones, name='familia_invitaciones'),
    path('familia/invitaciones/<int:pk>/', views.familia_invitacion_eliminar, name='familia_invitacion_eliminar'),
    path(
        'familia/invitaciones-recibidas/',
        views.invitaciones_recibidas_list,
        name='invitaciones_recibidas_list',
    ),
    path(
        'familia/invitaciones-recibidas/<int:pk>/aceptar/',
        views.invitacion_recibida_aceptar,
        name='invitacion_recibida_aceptar',
    ),
    path(
        'familia/invitaciones-recibidas/<int:pk>/rechazar/',
        views.invitacion_recibida_rechazar,
        name='invitacion_recibida_rechazar',
    ),
]
