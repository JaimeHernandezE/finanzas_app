from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import Familia, Usuario, InvitacionPendiente


@admin.register(Familia)
class FamiliaAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'created_at']
    search_fields = ['nombre']


@admin.register(Usuario)
class UsuarioAdmin(UserAdmin):
    list_display = ['username', 'email', 'familia', 'rol', 'is_active']
    list_filter  = ['rol', 'familia', 'is_active']
    fieldsets    = UserAdmin.fieldsets + (
        ('App Finanzas', {'fields': ('firebase_uid', 'familia', 'rol')}),
    )


@admin.register(InvitacionPendiente)
class InvitacionPendienteAdmin(admin.ModelAdmin):
    list_display = ['email', 'familia', 'invitador', 'created_at']
    list_filter = ['familia']
    search_fields = ['email']
