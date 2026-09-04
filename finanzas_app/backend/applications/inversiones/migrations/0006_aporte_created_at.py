import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Agrega `created_at` a Aporte para poder descartar reenvíos del mismo
    movimiento tras un timeout del cliente.

    Las filas existentes quedan con el instante en que se aplica la migración
    (es el default de un solo uso que exige `auto_now_add` sobre una tabla con
    datos). Sin efectos prácticos: el campo solo se consulta dentro de una
    ventana de segundos.
    """

    dependencies = [
        ('inversiones', '0005_alter_fondo_espacio'),
    ]

    operations = [
        migrations.AddField(
            model_name='aporte',
            name='created_at',
            field=models.DateTimeField(
                auto_now_add=True,
                default=django.utils.timezone.now,
                help_text='Instante de creación. Permite descartar reenvíos del mismo '
                          'movimiento cuando el cliente reintenta tras un timeout.',
            ),
            preserve_default=False,
        ),
        migrations.AlterModelOptions(
            name='aporte',
            options={'ordering': ['-fecha', '-created_at']},
        ),
    ]
