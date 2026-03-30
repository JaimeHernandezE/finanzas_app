from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finanzas', '0009_resumen_historico_mes_snapshot'),
    ]

    operations = [
        migrations.AddField(
            model_name='saldomensualsnapshot',
            name='egresos_efectivo',
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text='Suma de egresos en efectivo/débito (excluye crédito) del mes.',
                max_digits=14,
            ),
        ),
        migrations.AddField(
            model_name='saldomensualsnapshot',
            name='ingresos_efectivo',
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text='Suma de ingresos en efectivo/débito (excluye crédito) del mes.',
                max_digits=14,
            ),
        ),
    ]
