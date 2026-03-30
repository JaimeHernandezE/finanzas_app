# Generated manually for SaldoMensualSnapshot, LiquidacionComunMensualSnapshot, RecalculoPendiente

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('usuarios', '0001_initial'),
        ('finanzas', '0005_sembrar_metodos_pago'),
    ]

    operations = [
        migrations.CreateModel(
            name='SaldoMensualSnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('mes', models.DateField(help_text='Primer día del mes.')),
                ('cuenta_id', models.PositiveIntegerField(default=0, help_text='PK de CuentaPersonal o 0 si el movimiento no tiene cuenta.')),
                ('efectivo_neto', models.DecimalField(decimal_places=2, max_digits=14)),
                ('movimientos_contados', models.PositiveIntegerField(default=0)),
                ('calculado_at', models.DateTimeField(auto_now=True)),
                ('familia', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='saldos_mensuales_snapshot', to='usuarios.familia')),
                ('usuario', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='saldos_mensuales_snapshot', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'indexes': [
                    models.Index(fields=['familia', 'usuario', 'mes'], name='finanzas_sa_familia_6e8b9d_idx'),
                ],
            },
        ),
        migrations.AddConstraint(
            model_name='saldomensualsnapshot',
            constraint=models.UniqueConstraint(fields=('familia', 'usuario', 'mes', 'cuenta_id'), name='uniq_saldo_mensual_snapshot'),
        ),
        migrations.CreateModel(
            name='LiquidacionComunMensualSnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('mes', models.DateField(help_text='Primer día del mes.')),
                ('tipo_linea', models.CharField(choices=[('INGRESO_COMUN', 'Ingreso común declarado'), ('GASTO_COMUN_NO_CREDITO', 'Gasto común (efectivo/débito)')], max_length=30)),
                ('total', models.DecimalField(decimal_places=2, max_digits=14)),
                ('items_contados', models.PositiveIntegerField(default=0)),
                ('calculado_at', models.DateTimeField(auto_now=True)),
                ('familia', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='liquidaciones_comun_snapshot', to='usuarios.familia')),
                ('usuario', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='liquidaciones_comun_snapshot', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'indexes': [
                    models.Index(fields=['familia', 'mes'], name='finanzas_li_familia_9a1c2e_idx'),
                ],
            },
        ),
        migrations.AddConstraint(
            model_name='liquidacioncomunmensualsnapshot',
            constraint=models.UniqueConstraint(fields=('familia', 'mes', 'usuario', 'tipo_linea'), name='uniq_liquidacion_comun_mensual'),
        ),
        migrations.CreateModel(
            name='RecalculoPendiente',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('dirty_from', models.DateField(help_text='Recalcular snapshots desde este mes (inclusive) hasta el actual.')),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('familia', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='recalculo_pendiente', to='usuarios.familia')),
            ],
        ),
    ]
