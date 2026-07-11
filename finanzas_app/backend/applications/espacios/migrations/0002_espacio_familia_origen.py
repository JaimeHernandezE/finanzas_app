# Transición Fase 3: vínculo Espacio ↔ Familia legacy para espejar datos
# y membresías durante la convivencia de esquemas.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('espacios', '0001_initial'),
        ('usuarios', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='espacio',
            name='familia_origen',
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='espacio_espejo',
                to='usuarios.familia',
            ),
        ),
    ]
