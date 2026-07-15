from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finanzas', '0028_rename_finanzas_co_codigo_9f0a1d_idx_finanzas_co_codigo_a9de0d_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='tarjeta',
            name='tipo',
            field=models.CharField(
                choices=[('DEBITO', 'Débito'), ('CREDITO', 'Crédito')],
                default='CREDITO',
                help_text='Débito o crédito; filtra el selector según método de pago del movimiento.',
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name='tarjeta',
            name='es_por_defecto',
            field=models.BooleanField(
                default=False,
                help_text='Si es True, se preselecciona al registrar un egreso con el mismo tipo '
                          '(una por defecto por usuario y tipo).',
            ),
        ),
        migrations.AlterField(
            model_name='tarjeta',
            name='ultimos_4_digitos',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Últimos 4 dígitos (matching de alertas bancarias y etiqueta en UI).',
                max_length=4,
            ),
        ),
    ]
