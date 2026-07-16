# Sanea configs IMAP antiguas: conectado sin refresh_token OAuth

from django.db import migrations


def _desconectar_sin_oauth(apps, schema_editor):
    Config = apps.get_model('finanzas', 'ConfiguracionCapturaCorreo')
    Config.objects.filter(conectado=True, refresh_token_enc='').update(
        conectado=False,
        ultimo_error=(
            'Debes volver a conectar con Gmail u Outlook (OAuth). '
            'La conexión anterior (IMAP) ya no es válida.'
        ),
    )


class Migration(migrations.Migration):

    dependencies = [
        ('finanzas', '0032_captura_correo_oauth'),
    ]

    operations = [
        migrations.RunPython(_desconectar_sin_oauth, migrations.RunPython.noop),
    ]
