import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.db.models.functions import Lower


class Migration(migrations.Migration):

    dependencies = [
        ('usuarios', '0008_usuario_notif_presupuesto'),
    ]

    operations = [
        migrations.CreateModel(
            name='InvitacionAcceso',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email', models.EmailField(max_length=254)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                (
                    'creado_por',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='invitaciones_acceso_creadas',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                'verbose_name': 'invitación de acceso',
                'verbose_name_plural': 'invitaciones de acceso',
            },
        ),
        migrations.AddConstraint(
            model_name='invitacionacceso',
            constraint=models.UniqueConstraint(
                Lower('email'),
                name='uniq_invitacion_acceso_email',
            ),
        ),
        migrations.AlterModelOptions(
            name='invitacionpendiente',
            options={
                'verbose_name': 'invitación familiar',
                'verbose_name_plural': 'invitaciones familiares',
            },
        ),
    ]
