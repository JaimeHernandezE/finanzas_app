# Generated manually: OAuth-only captura correo (quita IMAP password fields)

from django.db import migrations, models


def _migrar_otro_a_gmail(apps, schema_editor):
    Config = apps.get_model('finanzas', 'ConfiguracionCapturaCorreo')
    Config.objects.filter(proveedor='OTRO').update(proveedor='GMAIL', conectado=False)


class Migration(migrations.Migration):

    dependencies = [
        ('finanzas', '0031_configuracioncapturacorreo'),
    ]

    operations = [
        migrations.AddField(
            model_name='configuracioncapturacorreo',
            name='refresh_token_enc',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.RunPython(_migrar_otro_a_gmail, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='configuracioncapturacorreo',
            name='imap_folder',
        ),
        migrations.RemoveField(
            model_name='configuracioncapturacorreo',
            name='imap_host',
        ),
        migrations.RemoveField(
            model_name='configuracioncapturacorreo',
            name='password_enc',
        ),
        migrations.AlterField(
            model_name='configuracioncapturacorreo',
            name='proveedor',
            field=models.CharField(
                choices=[('GMAIL', 'Gmail'), ('OUTLOOK', 'Outlook / Hotmail')],
                default='GMAIL',
                max_length=20,
            ),
        ),
    ]
