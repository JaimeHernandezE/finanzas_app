# Transición multitenant Fase 3 (ver finanzas/0016_espacio_transicion.py).

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inversiones', '0002_initial'),
        ('espacios', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='fondo',
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
