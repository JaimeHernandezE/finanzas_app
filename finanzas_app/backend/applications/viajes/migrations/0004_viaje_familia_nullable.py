from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('viajes', '0003_viaje_espacio'),
    ]

    operations = [
        migrations.AlterField(
            model_name='viaje',
            name='familia',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='viajes',
                to='usuarios.familia',
            ),
        ),
    ]
