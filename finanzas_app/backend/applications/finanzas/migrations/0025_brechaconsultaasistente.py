# Generated manually for Etapa B asistente (BrechaConsultaAsistente)

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('espacios', '0001_initial'),
        ('finanzas', '0024_notificacion_presupuesto_umbral'),
    ]

    operations = [
        migrations.CreateModel(
            name='BrechaConsultaAsistente',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('senal', models.CharField(choices=[('SIN_TOOL', 'Sin tool'), ('TOOL_VACIA', 'Tool vacía'), ('FUERA_DE_ALCANCE', 'Fuera de alcance')], max_length=32)),
                ('mensaje_normalizado', models.CharField(blank=True, default='', max_length=240)),
                ('intento_label', models.CharField(blank=True, default='otro', max_length=64)),
                ('tools_intentadas', models.JSONField(blank=True, default=list)),
                ('modelo', models.CharField(blank=True, default='', max_length=128)),
                ('provider', models.CharField(blank=True, default='', max_length=32)),
                ('creado_at', models.DateTimeField(auto_now_add=True)),
                ('espacio', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='brechas_asistente', to='espacios.espacio')),
                ('usuario', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='brechas_asistente', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-creado_at'],
            },
        ),
        migrations.AddIndex(
            model_name='brechaconsultaasistente',
            index=models.Index(fields=['senal', 'creado_at'], name='finanzas_br_senal_8a1b2c_idx'),
        ),
        migrations.AddIndex(
            model_name='brechaconsultaasistente',
            index=models.Index(fields=['intento_label', 'creado_at'], name='finanzas_br_intento_9d3e4f_idx'),
        ),
        migrations.AddIndex(
            model_name='brechaconsultaasistente',
            index=models.Index(fields=['espacio', 'creado_at'], name='finanzas_br_espacio_0a5b6c_idx'),
        ),
    ]
