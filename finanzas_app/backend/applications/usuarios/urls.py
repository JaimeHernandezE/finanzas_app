from django.urls import path
from . import views

urlpatterns = [
    path('me/', views.me, name='me'),
    path('registro/', views.registrar_usuario, name='registro'),
]
