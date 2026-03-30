from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('usuarios', '0001_initial'),
        ('finanzas', '0008_ingresocomun_fecha_pago'),
    ]

    operations = [
        migrations.CreateModel(
            name='ResumenHistoricoMesSnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('mes', models.DateField(help_text='Primer día del mes.')),
                ('payload', models.JSONField()),
                ('calculado_at', models.DateTimeField(auto_now=True)),
                (
                    'familia',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='resumenes_historicos_mes',
                        to='usuarios.familia',
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name='resumenhistoricomessnapshot',
            constraint=models.UniqueConstraint(
                fields=('familia', 'mes'),
                name='uniq_resumen_historico_mes_familia',
            ),
        ),
        migrations.AddIndex(
            model_name='resumenhistoricomessnapshot',
            index=models.Index(fields=['familia', 'mes'], name='finanzas_re_familia_6a8b2c_idx'),
        ),
    ]
