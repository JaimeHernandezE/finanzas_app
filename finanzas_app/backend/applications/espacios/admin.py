from django.contrib import admin

from .models import Espacio, PertenenciaEspacio


class PertenenciaEspacioInline(admin.TabularInline):
    model = PertenenciaEspacio
    extra = 0


@admin.register(Espacio)
class EspacioAdmin(admin.ModelAdmin):
    list_display = ('id', 'nombre', 'tipo', 'modo_reparto', 'activo', 'archivado', 'created_at')
    list_filter = ('tipo', 'activo', 'archivado')
    search_fields = ('nombre',)
    inlines = [PertenenciaEspacioInline]


@admin.register(PertenenciaEspacio)
class PertenenciaEspacioAdmin(admin.ModelAdmin):
    list_display = ('id', 'usuario', 'espacio', 'rol', 'activo', 'created_at')
    list_filter = ('rol', 'activo', 'espacio__tipo')
    search_fields = ('usuario__email', 'espacio__nombre')
