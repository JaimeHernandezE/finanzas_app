# Generated for InvitacionPendiente

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('usuarios', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='InvitacionPendiente',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email', models.EmailField(max_length=254)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('familia', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='invitaciones_pendientes', to='usuarios.familia')),
                ('invitador', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='invitaciones_enviadas', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'invitación pendiente',
                'verbose_name_plural': 'invitaciones pendientes',
                'unique_together': {('familia', 'email')},
            },
        ),
    ]
