# Etapa 3: origen_familia, constraints por espacio, backfill y espacio NOT NULL en snapshots.

import django.db.models.deletion
from django.db import migrations, models


def _mapa_espejos(apps):
    Espacio = apps.get_model('espacios', 'Espacio')
    Familia = apps.get_model('usuarios', 'Familia')
    espejos = {
        e.familia_origen_id: e.id
        for e in Espacio.objects.filter(familia_origen_id__isnull=False)
    }
    for familia in Familia.objects.all():
        if familia.id not in espejos:
            espacio = Espacio.objects.create(
                tipo='FAMILIAR',
                nombre=(familia.nombre or 'Familia')[:150],
                familia_origen_id=familia.id,
            )
            espejos[familia.id] = espacio.id
    return espejos


def _mapa_personal(apps):
    PertenenciaEspacio = apps.get_model('espacios', 'PertenenciaEspacio')
    return {
        p.usuario_id: p.espacio_id
        for p in PertenenciaEspacio.objects.filter(
            activo=True,
            espacio__tipo='PERSONAL',
        )
    }


def backfill_espacio_tenant(apps, schema_editor):
    espejos = _mapa_espejos(apps)
    personal = _mapa_personal(apps)

    modelos_familia = [
        ('finanzas', 'Categoria'),
        ('finanzas', 'Movimiento'),
        ('finanzas', 'Presupuesto'),
        ('finanzas', 'IngresoComun'),
        ('finanzas', 'SaldoMensualSnapshot'),
        ('finanzas', 'LiquidacionComunMensualSnapshot'),
        ('finanzas', 'ResumenHistoricoMesSnapshot'),
    ]
    for app_label, model_name in modelos_familia:
        Model = apps.get_model(app_label, model_name)
        for familia_id, espacio_id in espejos.items():
            Model.objects.filter(
                familia_id=familia_id,
                espacio__isnull=True,
            ).update(espacio_id=espacio_id)

    Movimiento = apps.get_model('finanzas', 'Movimiento')
    Presupuesto = apps.get_model('finanzas', 'Presupuesto')
    for modelo in (Movimiento, Presupuesto):
        qs = modelo.objects.filter(familia__isnull=True, espacio__isnull=True)
        for row in qs.only('pk', 'usuario_id').iterator():
            espacio_id = personal.get(row.usuario_id)
            if espacio_id:
                modelo.objects.filter(pk=row.pk).update(espacio_id=espacio_id)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    # RunPython actualiza presupuesto/movimiento y luego se añaden constraints
    # sobre las mismas tablas; PostgreSQL exige transacciones separadas.
    atomic = False

    dependencies = [
        ('espacios', '0003_drive_oauth_fields'),
        ('finanzas', '0018_alter_ingresocomun_espacio_alter_presupuesto_espacio'),
    ]

    operations = [
        migrations.AddField(
            model_name='categoria',
            name='origen_familia',
            field=models.ForeignKey(
                blank=True,
                help_text='Espacio familiar de origen si el registro fue copiado al salir de una familia.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='+',
                to='espacios.espacio',
            ),
        ),
        migrations.AddField(
            model_name='movimiento',
            name='origen_familia',
            field=models.ForeignKey(
                blank=True,
                help_text='Espacio familiar de origen si el registro fue copiado al salir de una familia.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='+',
                to='espacios.espacio',
            ),
        ),
        migrations.AddField(
            model_name='presupuesto',
            name='origen_familia',
            field=models.ForeignKey(
                blank=True,
                help_text='Espacio familiar de origen si el registro fue copiado al salir de una familia.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='+',
                to='espacios.espacio',
            ),
        ),
        migrations.RunPython(backfill_espacio_tenant, noop),
        migrations.AddConstraint(
            model_name='presupuesto',
            constraint=models.UniqueConstraint(
                fields=('espacio', 'usuario', 'categoria', 'mes'),
                name='uniq_presupuesto_espacio_usuario_categoria_mes',
            ),
        ),
        migrations.AddConstraint(
            model_name='saldomensualsnapshot',
            constraint=models.UniqueConstraint(
                fields=('espacio', 'usuario', 'mes', 'cuenta_id'),
                name='uniq_saldo_mensual_snapshot_espacio',
            ),
        ),
        migrations.AddIndex(
            model_name='saldomensualsnapshot',
            index=models.Index(
                fields=['espacio', 'usuario', 'mes'],
                name='finanzas_sa_espacio_usuario_mes_idx',
            ),
        ),
        migrations.AddConstraint(
            model_name='liquidacioncomunmensualsnapshot',
            constraint=models.UniqueConstraint(
                fields=('espacio', 'mes', 'usuario', 'tipo_linea'),
                name='uniq_liquidacion_comun_mensual_espacio',
            ),
        ),
        migrations.AddIndex(
            model_name='liquidacioncomunmensualsnapshot',
            index=models.Index(
                fields=['espacio', 'mes'],
                name='finanzas_li_espacio_mes_idx',
            ),
        ),
        migrations.AddConstraint(
            model_name='resumenhistoricomessnapshot',
            constraint=models.UniqueConstraint(
                fields=('espacio', 'mes'),
                name='uniq_resumen_historico_mes_espacio',
            ),
        ),
        migrations.AddIndex(
            model_name='resumenhistoricomessnapshot',
            index=models.Index(
                fields=['espacio', 'mes'],
                name='finanzas_re_espacio_mes_idx',
            ),
        ),
        migrations.AlterField(
            model_name='saldomensualsnapshot',
            name='espacio',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='+',
                to='espacios.espacio',
            ),
        ),
        migrations.AlterField(
            model_name='liquidacioncomunmensualsnapshot',
            name='espacio',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='+',
                to='espacios.espacio',
            ),
        ),
        migrations.AlterField(
            model_name='resumenhistoricomessnapshot',
            name='espacio',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='+',
                to='espacios.espacio',
            ),
        ),
        migrations.AlterField(
            model_name='ingresocomun',
            name='espacio',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='+',
                to='espacios.espacio',
            ),
        ),
    ]
