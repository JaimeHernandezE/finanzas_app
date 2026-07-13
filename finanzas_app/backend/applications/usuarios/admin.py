from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import Usuario, InvitacionAcceso, InvitacionPendiente


@admin.register(Usuario)
class UsuarioAdmin(UserAdmin):
    list_display = ['username', 'email', 'rol', 'activo', 'is_active']
    list_filter  = ['rol', 'activo', 'is_active']
    fieldsets    = UserAdmin.fieldsets + (
        ('App Finanzas', {'fields': ('firebase_uid', 'rol', 'activo')}),
    )


@admin.register(InvitacionAcceso)
class InvitacionAccesoAdmin(admin.ModelAdmin):
    list_display = ['email', 'creado_por', 'created_at']
    search_fields = ['email']
    readonly_fields = ['created_at']
    autocomplete_fields = ['creado_por']


@admin.register(InvitacionPendiente)
class InvitacionPendienteAdmin(admin.ModelAdmin):
    list_display = ['email', 'espacio', 'invitador', 'created_at']
    list_filter = ['espacio']
    search_fields = ['email']
