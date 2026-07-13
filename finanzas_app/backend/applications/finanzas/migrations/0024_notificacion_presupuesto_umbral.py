from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finanzas', '0023_rename_finanzas_ca_espacio_8f2a1b_idx_finanzas_ca_espacio_35eb0b_idx_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='notificacionusuario',
            name='tipo',
            field=models.CharField(
                choices=[
                    ('CAMBIO_COMPENSACION', 'Cambio de compensación'),
                    ('PRESUPUESTO_UMBRAL', 'Alerta de presupuesto'),
                ],
                max_length=32,
            ),
        ),
    ]
