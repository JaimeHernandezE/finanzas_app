# Generated manually for IngresoComun.movimiento

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('finanzas', '0002_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='ingresocomun',
            name='movimiento',
            field=models.OneToOneField(
                blank=True,
                help_text='Ingreso en efectivo en cuenta Personal generado automáticamente.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='ingreso_comun',
                to='finanzas.movimiento',
            ),
        ),
    ]
