from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('finanzas', '0014_categoria_categoria_padre_categoria_cuenta_personal'),
    ]

    operations = [
        migrations.DeleteModel(
            name='RecalculoPendiente',
        ),
    ]
