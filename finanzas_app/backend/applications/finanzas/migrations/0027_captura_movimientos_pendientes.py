# Generated manually for captura de movimientos (fase 3)

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('espacios', '0004_remove_espacio_familia_origen'),
        ('finanzas', '0026_rename_finanzas_br_senal_8a1b2c_idx_finanzas_br_senal_df91ef_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='tarjeta',
            name='ultimos_4_digitos',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Últimos 4 dígitos de la tarjeta (para matching de alertas bancarias).',
                max_length=4,
            ),
        ),
        migrations.AlterField(
            model_name='notificacionusuario',
            name='tipo',
            field=models.CharField(
                choices=[
                    ('CAMBIO_COMPENSACION', 'Cambio de compensación'),
                    ('PRESUPUESTO_UMBRAL', 'Alerta de presupuesto'),
                    ('MOVIMIENTO_PENDIENTE', 'Movimiento pendiente de confirmar'),
                ],
                max_length=32,
            ),
        ),
        migrations.CreateModel(
            name='MovimientoPendiente',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('origen', models.CharField(
                    choices=[
                        ('WHATSAPP', 'WhatsApp'),
                        ('TELEGRAM', 'Telegram'),
                        ('EMAIL_BANCO', 'Correo bancario'),
                        ('MANUAL', 'Manual'),
                    ],
                    max_length=20,
                )),
                ('tipo', models.CharField(
                    choices=[('INGRESO', 'Ingreso'), ('EGRESO', 'Egreso')],
                    default='EGRESO',
                    max_length=10,
                )),
                ('monto', models.DecimalField(decimal_places=2, max_digits=12)),
                ('fecha', models.DateField(default=django.utils.timezone.now)),
                ('comercio', models.CharField(blank=True, default='', max_length=255)),
                ('ambito_sugerido', models.CharField(
                    blank=True,
                    choices=[('PERSONAL', 'Personal'), ('COMUN', 'Común')],
                    max_length=10,
                    null=True,
                )),
                ('confianza', models.FloatField(default=0.0)),
                ('payload_original', models.JSONField(blank=True, default=dict)),
                ('estado', models.CharField(
                    choices=[
                        ('PENDIENTE', 'Pendiente'),
                        ('CONFIRMADO', 'Confirmado'),
                        ('DESCARTADO', 'Descartado'),
                        ('DUPLICADO', 'Duplicado'),
                    ],
                    default='PENDIENTE',
                    max_length=20,
                )),
                ('hash_externo', models.CharField(
                    blank=True,
                    default='',
                    help_text='Hash del mensaje/correo para deduplicar ingestas.',
                    max_length=64,
                )),
                ('creado_at', models.DateTimeField(auto_now_add=True)),
                ('actualizado_at', models.DateTimeField(auto_now=True)),
                ('categoria_sugerida', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='pendientes_sugeridos',
                    to='finanzas.categoria',
                )),
                ('cuenta_sugerida', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='pendientes_sugeridos',
                    to='finanzas.cuentapersonal',
                )),
                ('espacio', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='movimientos_pendientes',
                    to='espacios.espacio',
                )),
                ('metodo_pago_sugerido', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='pendientes_sugeridos',
                    to='finanzas.metodopago',
                )),
                ('movimiento', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='origen_pendiente',
                    to='finanzas.movimiento',
                )),
                ('tarjeta_sugerida', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='pendientes_sugeridos',
                    to='finanzas.tarjeta',
                )),
                ('usuario', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='movimientos_pendientes',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'movimiento pendiente',
                'verbose_name_plural': 'movimientos pendientes',
                'ordering': ['-creado_at'],
            },
        ),
        migrations.CreateModel(
            name='CodigoVinculoCaptura',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('canal', models.CharField(
                    choices=[('TELEGRAM', 'Telegram'), ('WHATSAPP', 'WhatsApp')],
                    max_length=20,
                )),
                ('codigo', models.CharField(max_length=12, unique=True)),
                ('expira_at', models.DateTimeField()),
                ('usado_at', models.DateTimeField(blank=True, null=True)),
                ('creado_at', models.DateTimeField(auto_now_add=True)),
                ('usuario', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='codigos_vinculo_captura',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
        migrations.AddIndex(
            model_name='movimientopendiente',
            index=models.Index(fields=['usuario', 'espacio', 'estado', 'creado_at'], name='finanzas_mo_usuario_9f0a1b_idx'),
        ),
        migrations.AddIndex(
            model_name='movimientopendiente',
            index=models.Index(fields=['hash_externo'], name='finanzas_mo_hash_ex_9f0a1c_idx'),
        ),
        migrations.AddIndex(
            model_name='codigovinculocaptura',
            index=models.Index(fields=['codigo'], name='finanzas_co_codigo_9f0a1d_idx'),
        ),
        migrations.AddIndex(
            model_name='codigovinculocaptura',
            index=models.Index(fields=['usuario', 'canal'], name='finanzas_co_usuario_9f0a1e_idx'),
        ),
    ]
