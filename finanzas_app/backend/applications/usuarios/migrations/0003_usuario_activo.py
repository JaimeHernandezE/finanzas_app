# Generated manually — usuario.activo (habilitar / deshabilitar sin borrar)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('usuarios', '0002_invitacionpendiente'),
    ]

    operations = [
        migrations.AddField(
            model_name='usuario',
            name='activo',
            field=models.BooleanField(
                default=True,
                help_text='Si es False, la cuenta no puede usar la API y no participa en el prorrateo '
                'de gastos comunes del mes calendario en curso ni de meses futuros.',
            ),
        ),
    ]
