from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('inversiones', '0003_fondo_espacio'),
    ]

    operations = [
        migrations.AlterField(
            model_name='fondo',
            name='familia',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='fondos',
                to='usuarios.familia',
            ),
        ),
    ]
