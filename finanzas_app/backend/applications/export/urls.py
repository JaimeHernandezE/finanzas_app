from django.urls import path

from . import views

urlpatterns = [
    path('sheets/', views.exportar_a_sheets, name='exportar-sheets'),
    path('sincronizar/', views.exportar_sheets_autenticado, name='exportar-sheets-auth'),
]
