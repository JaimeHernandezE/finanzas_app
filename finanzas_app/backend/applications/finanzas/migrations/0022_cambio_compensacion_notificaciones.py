# Generated manually

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('espacios', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('finanzas', '0021_rename_finanzas_li_espacio_mes_idx_finanzas_li_espacio_aa9a34_idx_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='CambioCompensacionMensual',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('mes', models.DateField(help_text='Primer día del mes afectado.')),
                ('delta', models.JSONField(help_text='Resumen estructurado del cambio (diferencias y transferencias).')),
                ('payload_antes', models.JSONField(blank=True, null=True)),
                ('payload_despues', models.JSONField()),
                ('origen_tipo', models.CharField(
                    choices=[
                        ('MOVIMIENTO', 'Movimiento'),
                        ('INGRESO_COMUN', 'Ingreso común'),
                        ('RECALCULO_MANUAL', 'Recálculo manual'),
                        ('IMPORTACION', 'Importación'),
                    ],
                    max_length=20,
                )),
                ('origen_id', models.PositiveIntegerField(blank=True, null=True)),
                ('creado_at', models.DateTimeField(auto_now_add=True)),
                ('espacio', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='cambios_compensacion',
                    to='espacios.espacio',
                )),
                ('modificado_por', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='cambios_compensacion_realizados',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
        migrations.CreateModel(
            name='NotificacionUsuario',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tipo', models.CharField(
                    choices=[('CAMBIO_COMPENSACION', 'Cambio de compensación')],
                    max_length=32,
                )),
                ('titulo', models.CharField(max_length=200)),
                ('mensaje', models.TextField()),
                ('payload', models.JSONField(blank=True, default=dict)),
                ('leida_at', models.DateTimeField(blank=True, null=True)),
                ('creado_at', models.DateTimeField(auto_now_add=True)),
                ('cambio', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='notificaciones',
                    to='finanzas.cambiocompensacionmensual',
                )),
                ('espacio', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='notificaciones',
                    to='espacios.espacio',
                )),
                ('usuario', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='notificaciones',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['-creado_at'],
            },
        ),
        migrations.AddIndex(
            model_name='cambiocompensacionmensual',
            index=models.Index(fields=['espacio', 'mes'], name='finanzas_ca_espacio_8f2a1b_idx'),
        ),
        migrations.AddIndex(
            model_name='cambiocompensacionmensual',
            index=models.Index(fields=['creado_at'], name='finanzas_ca_creado__4e7c2d_idx'),
        ),
        migrations.AddIndex(
            model_name='notificacionusuario',
            index=models.Index(fields=['usuario', 'leida_at', 'creado_at'], name='finanzas_no_usuario_9a3f44_idx'),
        ),
        migrations.AddIndex(
            model_name='notificacionusuario',
            index=models.Index(fields=['espacio', 'creado_at'], name='finanzas_no_espacio_1b8e55_idx'),
        ),
    ]
