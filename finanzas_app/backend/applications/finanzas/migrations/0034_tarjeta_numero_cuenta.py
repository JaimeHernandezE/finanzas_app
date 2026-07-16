from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finanzas', '0033_sanear_captura_correo_oauth'),
    ]

    operations = [
        migrations.AddField(
            model_name='tarjeta',
            name='numero_cuenta',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Número de cuenta bancaria (débito). Matching de transferencias TEF.',
                max_length=34,
            ),
        ),
    ]
