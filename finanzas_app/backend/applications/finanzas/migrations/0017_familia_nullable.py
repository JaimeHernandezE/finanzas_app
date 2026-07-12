from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('finanzas', '0016_espacio_transicion'),
    ]

    operations = [
        migrations.AlterField(
            model_name='movimiento',
            name='familia',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='movimientos',
                to='usuarios.familia',
            ),
        ),
        migrations.AlterField(
            model_name='presupuesto',
            name='familia',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='presupuestos',
                to='usuarios.familia',
            ),
        ),
        migrations.AlterField(
            model_name='ingresocomun',
            name='familia',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='ingresos_comunes',
                to='usuarios.familia',
            ),
        ),
    ]
