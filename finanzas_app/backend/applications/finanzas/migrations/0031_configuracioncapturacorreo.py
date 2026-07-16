# Generated manually for ConfiguracionCapturaCorreo (etapa 3a)

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('finanzas', '0030_alter_movimiento_tarjeta_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='ConfiguracionCapturaCorreo',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('proveedor', models.CharField(
                    choices=[
                        ('GMAIL', 'Gmail'),
                        ('OUTLOOK', 'Outlook / Hotmail'),
                        ('OTRO', 'Otro (IMAP)'),
                    ],
                    default='GMAIL',
                    max_length=20,
                )),
                ('email', models.EmailField(blank=True, default='', max_length=254)),
                ('imap_host', models.CharField(blank=True, default='', max_length=255)),
                ('imap_folder', models.CharField(blank=True, default='INBOX', max_length=100)),
                ('password_enc', models.TextField(blank=True, default='')),
                ('conectado', models.BooleanField(default=False)),
                ('remitentes_banco', models.JSONField(
                    blank=True,
                    default=list,
                    help_text='Emails o dominios (@banco.cl) de los que se aceptan alertas.',
                )),
                ('intervalo_minutos', models.PositiveSmallIntegerField(default=15)),
                ('notificaciones_activas', models.BooleanField(default=True)),
                ('ultimo_sync_at', models.DateTimeField(blank=True, null=True)),
                ('ultimo_error', models.CharField(blank=True, default='', max_length=500)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('usuario', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='config_captura_correo',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'configuración de captura por correo',
                'verbose_name_plural': 'configuraciones de captura por correo',
            },
        ),
    ]
