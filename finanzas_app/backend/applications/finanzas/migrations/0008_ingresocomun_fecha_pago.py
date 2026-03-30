from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finanzas', '0007_rename_finanzas_li_familia_9a1c2e_idx_finanzas_li_familia_981e0a_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='ingresocomun',
            name='fecha_pago',
            field=models.DateField(
                blank=True,
                null=True,
                help_text='Fecha real de pago del ingreso (si se conoce).',
            ),
        ),
    ]
