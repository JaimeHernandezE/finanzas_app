# Modelos con datos financieros/personales: deliberadamente fuera del admin
# para evitar exposición accidental entre tenants. Operación vía API o
# management commands. Ver docs/backend/README.md (privacidad multitenant).
#
# Excepción: telemetría del asistente (sin montos) — solo lectura en admin.

from django.contrib import admin

from applications.finanzas.models import BrechaConsultaAsistente


@admin.register(BrechaConsultaAsistente)
class BrechaConsultaAsistenteAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'senal',
        'intento_label',
        'usuario_id',
        'espacio_id',
        'creado_at',
    )
    list_filter = ('senal', 'provider')
    search_fields = ('intento_label', 'mensaje_normalizado')
    readonly_fields = (
        'usuario',
        'espacio',
        'senal',
        'mensaje_normalizado',
        'intento_label',
        'tools_intentadas',
        'modelo',
        'provider',
        'creado_at',
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
