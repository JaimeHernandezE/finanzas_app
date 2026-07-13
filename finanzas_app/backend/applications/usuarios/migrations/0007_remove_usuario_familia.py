# Etapa 5 (cutover): elimina Usuario.familia e InvitacionPendiente.familia.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('usuarios', '0006_invitacion_espacio'),
        ('finanzas', '0020_cutover_remove_familia'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='invitacionpendiente',
            unique_together=set(),
        ),
        migrations.RemoveField(
            model_name='invitacionpendiente',
            name='familia',
        ),
        migrations.AlterField(
            model_name='invitacionpendiente',
            name='espacio',
            field=models.ForeignKey(
                help_text='Espacio familiar al que se invita.',
                on_delete=django.db.models.deletion.CASCADE,
                related_name='invitaciones_pendientes',
                to='espacios.espacio',
            ),
        ),
        migrations.RemoveField(
            model_name='usuario',
            name='familia',
        ),
    ]
