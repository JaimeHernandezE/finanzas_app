from django.contrib import admin
from .models import PresupuestoViaje, Viaje


@admin.register(Viaje)
class ViajeAdmin(admin.ModelAdmin):
    list_display  = ['nombre', 'familia', 'fecha_inicio', 'fecha_fin', 'es_activo']
    list_filter   = ['es_activo', 'familia']
    search_fields = ['nombre']


@admin.register(PresupuestoViaje)
class PresupuestoViajeAdmin(admin.ModelAdmin):
    list_display = ['viaje', 'categoria', 'monto_planificado']
    list_filter  = ['viaje']
