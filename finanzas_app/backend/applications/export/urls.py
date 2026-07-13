from django.urls import path

from . import views

urlpatterns = [
    # Solo integración/cron con X-Export-Token. No hay sincronizar desde la app (dump global = PostgreSQL).
    path('sheets/', views.exportar_a_sheets, name='exportar-sheets'),
]
