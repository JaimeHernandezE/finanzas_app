# Etapa 5 (cutover): elimina vínculo legacy Familia ↔ Espacio.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('espacios', '0003_drive_oauth_fields'),
        ('finanzas', '0020_cutover_remove_familia'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='espacio',
            name='familia_origen',
        ),
    ]
