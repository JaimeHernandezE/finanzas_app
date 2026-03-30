# Manual: SueldoEstimadoProrrateoMensual para saldo proyectado (dashboard).

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('finanzas', '0011_rename_finanzas_re_familia_6a8b2c_idx_finanzas_re_familia_269404_idx'),
    ]

    operations = [
        migrations.CreateModel(
            name='SueldoEstimadoProrrateoMensual',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('mes', models.DateField(help_text='Primer día del mes al que aplica.')),
                ('monto', models.DecimalField(decimal_places=2, max_digits=12)),
                ('actualizado_at', models.DateTimeField(auto_now=True)),
                (
                    'usuario',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='sueldos_estimados_prorrateo_mensual',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                'indexes': [models.Index(fields=['usuario', 'mes'], name='finanzas_su_usuario_0a1b2c_idx')],
            },
        ),
        migrations.AddConstraint(
            model_name='sueldoestimadoprorrateomensual',
            constraint=models.UniqueConstraint(
                fields=('usuario', 'mes'),
                name='uniq_sueldo_estimado_prorrateo_usuario_mes',
            ),
        ),
    ]
