# Transición multitenant Fase 3 (ver finanzas/0016_espacio_transicion.py).

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('viajes', '0002_viaje_archivado'),
        ('espacios', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='viaje',
            name='espacio',
            field=models.ForeignKey(
                blank=True,
                help_text='Tenant (transición multitenant Fase 3); reemplazará a familia en el cutover.',
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='+',
                to='espacios.espacio',
            ),
        ),
    ]
