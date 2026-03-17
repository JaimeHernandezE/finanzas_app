from django.contrib import admin
from .models import Aporte, Fondo, RegistroValor


@admin.register(Fondo)
class FondoAdmin(admin.ModelAdmin):
    list_display  = ['nombre', 'familia', 'usuario']
    search_fields = ['nombre']


@admin.register(Aporte)
class AporteAdmin(admin.ModelAdmin):
    list_display = ['fondo', 'fecha', 'monto', 'nota']
    list_filter  = ['fondo']
    date_hierarchy = 'fecha'


@admin.register(RegistroValor)
class RegistroValorAdmin(admin.ModelAdmin):
    list_display = ['fondo', 'fecha', 'valor_cuota']
    list_filter  = ['fondo']
    date_hierarchy = 'fecha'
