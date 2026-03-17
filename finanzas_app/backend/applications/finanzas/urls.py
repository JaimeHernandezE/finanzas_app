from django.urls import path
from . import views

app_name = 'finanzas'

urlpatterns = [
    # Categorías
    path('categorias/', views.categorias, name='categorias'),
    path('categorias/<int:pk>/', views.categoria_detalle, name='categoria-detalle'),

    # Métodos de pago
    path('metodos-pago/', views.metodos_pago, name='metodos-pago'),

    # Tarjetas
    path('tarjetas/', views.tarjetas, name='tarjetas'),
    path('tarjetas/<int:pk>/', views.tarjeta_detalle, name='tarjeta-detalle'),
]
