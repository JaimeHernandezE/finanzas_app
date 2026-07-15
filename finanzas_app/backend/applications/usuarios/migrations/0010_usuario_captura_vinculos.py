from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('usuarios', '0009_invitacionacceso'),
    ]

    operations = [
        migrations.AddField(
            model_name='usuario',
            name='telegram_chat_id',
            field=models.CharField(
                blank=True,
                default='',
                help_text='chat_id de Telegram vinculado para captura de movimientos.',
                max_length=64,
            ),
        ),
        migrations.AddField(
            model_name='usuario',
            name='telegram_vinculado',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='usuario',
            name='whatsapp_phone',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Teléfono E.164 vinculado a WhatsApp Business (ej: +56912345678).',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='usuario',
            name='whatsapp_vinculado',
            field=models.BooleanField(default=False),
        ),
    ]
