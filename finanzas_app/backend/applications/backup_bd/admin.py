import os

from django.contrib import admin, messages
from django.http import Http404, HttpResponseRedirect, StreamingHttpResponse
from django.template.response import TemplateResponse
from django.urls import path, reverse

from .drive_pg import backup_filename
from .models import RespaldoPostgreSQL
from .ops import (
    CONFIRMACION_IMPORT,
    CONFIRMACION_IMPORT_EMERGENCIA,
    export_habilitado,
    generar_dump_temporal,
    import_habilitado,
    puede_modo_emergencia,
    restaurar_desde_upload,
    validar_archivo_respaldo,
)


@admin.register(RespaldoPostgreSQL)
class RespaldoPostgreSQLAdmin(admin.ModelAdmin):
    """Pantalla de operaciones de instancia: exportar / restaurar pg_dump."""

    def has_module_permission(self, request):
        return request.user.is_active and request.user.is_superuser

    def has_view_permission(self, request, obj=None):
        return self.has_module_permission(request)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def get_urls(self):
        urls = super().get_urls()
        custom = [
            path(
                'descargar-dump/',
                self.admin_site.admin_view(self.descargar_dump_view),
                name='descargar_dump',
            ),
        ]
        return custom + urls

    def changelist_view(self, request, extra_context=None):
        if request.method == 'POST':
            return self._procesar_restauracion(request)
        base_path = request.path.rstrip('/') + '/'
        context = {
            **self.admin_site.each_context(request),
            'title': 'Restauración PostgreSQL (pg_dump)',
            'opts': self.model._meta,
            'app_label': self.model._meta.app_label,
            'confirma_texto': CONFIRMACION_IMPORT,
            'confirma_emergencia': CONFIRMACION_IMPORT_EMERGENCIA,
            'import_habilitado': import_habilitado(),
            'export_habilitado': export_habilitado(),
            'modo_emergencia': puede_modo_emergencia(),
            'descargar_url': f'{base_path}descargar-dump/',
        }
        return TemplateResponse(
            request,
            'admin/backup_bd/restaurar_sql.html',
            context,
        )

    def _procesar_restauracion(self, request):
        if not import_habilitado():
            messages.error(
                request,
                'Importación deshabilitada. Define ALLOW_DB_IMPORT=true en el entorno '
                '(o usa DEBUG=true en desarrollo).',
            )
            return HttpResponseRedirect(request.path)

        if request.POST.get('confirmacion') != CONFIRMACION_IMPORT:
            messages.error(
                request,
                f'Debes escribir exactamente {CONFIRMACION_IMPORT} en el campo de confirmación.',
            )
            return HttpResponseRedirect(request.path)

        if puede_modo_emergencia():
            if request.POST.get('confirmacion_emergencia') != CONFIRMACION_IMPORT_EMERGENCIA:
                messages.error(
                    request,
                    'La base está incompleta. Marca el modo emergencia y escribe '
                    f'{CONFIRMACION_IMPORT_EMERGENCIA}.',
                )
                return HttpResponseRedirect(request.path)

        archivo = request.FILES.get('archivo')
        if not archivo:
            messages.error(request, 'Selecciona un archivo .sql.gz o .sql.')
            return HttpResponseRedirect(request.path)

        err = validar_archivo_respaldo(archivo.name, archivo.size)
        if err:
            messages.error(request, err)
            return HttpResponseRedirect(request.path)

        try:
            restaurar_desde_upload(archivo.name, archivo.chunks())
        except Exception as e:
            messages.error(request, f'Error al restaurar: {e}')
            return HttpResponseRedirect(request.path)

        messages.success(
            request,
            'Base de datos restaurada correctamente desde el respaldo SQL.',
        )
        return HttpResponseRedirect(request.path)

    def descargar_dump_view(self, request):
        if not self.has_module_permission(request):
            raise Http404
        if not export_habilitado():
            messages.error(
                request,
                'Exportación deshabilitada. Define ALLOW_DB_EXPORT=true en el entorno.',
            )
            return HttpResponseRedirect(reverse('admin:backup_bd_respaldopostgresql_changelist'))

        tmp_path: str | None = None
        try:
            tmp_path = generar_dump_temporal()

            def file_iterator(path, chunk_size=1024 * 1024):
                with open(path, 'rb') as f:
                    while True:
                        chunk = f.read(chunk_size)
                        if not chunk:
                            break
                        yield chunk
                try:
                    os.unlink(path)
                except OSError:
                    pass

            response = StreamingHttpResponse(
                file_iterator(tmp_path),
                content_type='application/gzip',
            )
            response['Content-Disposition'] = f'attachment; filename="{backup_filename()}"'
            return response
        except Exception as e:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
            messages.error(request, str(e))
            return HttpResponseRedirect(reverse('admin:backup_bd_respaldopostgresql_changelist'))
