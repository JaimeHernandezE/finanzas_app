# Migración inicial de la app espacios (Fase 1 multitenant).
# Escrita a mano; validada por la suite de tests (la BD de prueba se crea
# aplicando estas migraciones).

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Espacio',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tipo', models.CharField(choices=[('PERSONAL', 'Personal'), ('FAMILIAR', 'Familiar')], max_length=10)),
                ('nombre', models.CharField(max_length=150)),
                ('modo_reparto', models.CharField(choices=[('PROPORCIONAL', 'Proporcional a los ingresos'), ('PARTES_IGUALES', 'Partes iguales'), ('SIN_REPARTO', 'Sin repartición')], default='PROPORCIONAL', max_length=15)),
                ('activo', models.BooleanField(default=True)),
                ('archivado', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Espacio',
                'verbose_name_plural': 'Espacios',
            },
        ),
        migrations.CreateModel(
            name='ConfiguracionRespaldoUsuario',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('drive_folder_id', models.CharField(blank=True, default='', max_length=200)),
                ('sheet_id', models.CharField(blank=True, default='', max_length=200)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('usuario', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='config_respaldo', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Configuración de respaldo de usuario',
                'verbose_name_plural': 'Configuraciones de respaldo de usuarios',
            },
        ),
        migrations.CreateModel(
            name='PertenenciaEspacio',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('rol', models.CharField(choices=[('ADMIN', 'Administrador'), ('MIEMBRO', 'Miembro')], default='MIEMBRO', max_length=10)),
                ('activo', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('espacio', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pertenencias', to='espacios.espacio')),
                ('usuario', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pertenencias_espacio', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Pertenencia a espacio',
                'verbose_name_plural': 'Pertenencias a espacios',
            },
        ),
        migrations.AddConstraint(
            model_name='pertenenciaespacio',
            constraint=models.UniqueConstraint(fields=('usuario', 'espacio'), name='unique_usuario_espacio'),
        ),
    ]
