from django.contrib import admin
from .models import (
    Categoria, CuentaPersonal, Cuota, IngresoComun,
    MetodoPago, Movimiento, Presupuesto, Tarjeta,
)


@admin.register(Categoria)
class CategoriaAdmin(admin.ModelAdmin):
    list_display  = ['nombre', 'tipo', 'es_inversion', 'familia', 'usuario']
    list_filter   = ['tipo', 'es_inversion']
    search_fields = ['nombre']


@admin.register(MetodoPago)
class MetodoPagoAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'tipo']
    list_filter  = ['tipo']


@admin.register(Tarjeta)
class TarjetaAdmin(admin.ModelAdmin):
    list_display  = ['nombre', 'banco', 'usuario']
    search_fields = ['nombre', 'banco']


@admin.register(CuentaPersonal)
class CuentaPersonalAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'usuario', 'visible_familia']
    list_filter  = ['visible_familia']


@admin.register(Movimiento)
class MovimientoAdmin(admin.ModelAdmin):
    list_display  = ['fecha', 'tipo', 'ambito', 'monto', 'categoria', 'usuario', 'oculto']
    list_filter   = ['tipo', 'ambito', 'oculto', 'familia']
    search_fields = ['comentario']
    date_hierarchy = 'fecha'


@admin.register(Cuota)
class CuotaAdmin(admin.ModelAdmin):
    list_display = ['movimiento', 'numero', 'monto', 'mes_facturacion', 'estado', 'incluir']
    list_filter  = ['estado', 'incluir']


@admin.register(Presupuesto)
class PresupuestoAdmin(admin.ModelAdmin):
    list_display = ['categoria', 'mes', 'monto', 'familia', 'usuario']
    list_filter  = ['familia']


@admin.register(IngresoComun)
class IngresoComunAdmin(admin.ModelAdmin):
    list_display = ['usuario', 'mes', 'monto', 'origen', 'familia', 'movimiento']
    list_filter  = ['familia']
    readonly_fields = ['movimiento']
