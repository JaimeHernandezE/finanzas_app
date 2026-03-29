# Datos iniciales: catálogo global de métodos de pago (EFECTIVO, DEBITO, CREDITO).
# En producción (p. ej. Render) la BD nueva puede no tener filas; el cliente web/móvil
# resuelve el id por tipo y falla si falta «Débito». Esta migración no depende de un GET al API.

from django.db import migrations


def sembrar_metodos_pago(apps, schema_editor):
    MetodoPago = apps.get_model('finanzas', 'MetodoPago')
    # Debe coincidir con MetodoPago.TIPO_CHOICES
    filas = [
        ('EFECTIVO', 'Efectivo'),
        ('DEBITO', 'Débito'),
        ('CREDITO', 'Crédito'),
    ]
    for tipo, nombre in filas:
        if not MetodoPago.objects.filter(tipo=tipo).exists():
            MetodoPago.objects.create(nombre=nombre, tipo=tipo)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('finanzas', '0004_tarjeta_dia_facturacion_tarjeta_dia_vencimiento'),
    ]

    operations = [
        migrations.RunPython(sembrar_metodos_pago, noop_reverse),
    ]
