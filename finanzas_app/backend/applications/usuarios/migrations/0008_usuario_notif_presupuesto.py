from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('usuarios', '0007_remove_usuario_familia'),
    ]

    operations = [
        migrations.AddField(
            model_name='usuario',
            name='notif_presupuesto_activa',
            field=models.BooleanField(
                default=True,
                help_text='Si es True, el usuario recibe alertas in-app al acercarse al presupuesto.',
            ),
        ),
        migrations.AddField(
            model_name='usuario',
            name='notif_presupuesto_umbral_pct',
            field=models.PositiveSmallIntegerField(
                default=80,
                help_text='Porcentaje de gasto vs presupuesto a partir del cual se envía una alerta (50–100).',
            ),
        ),
    ]
