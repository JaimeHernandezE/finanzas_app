# Etapa 5 (cutover): elimina FK familia; espacio obligatorio en modelos tenant restantes.

import django.db.models.deletion
from django.db import migrations, models


def backfill_espacio_restante(apps, schema_editor):
    """Última pasada antes de NOT NULL en movimiento/presupuesto."""
    Espacio = apps.get_model('espacios', 'Espacio')
    Familia = apps.get_model('usuarios', 'Familia')
    PertenenciaEspacio = apps.get_model('espacios', 'PertenenciaEspacio')

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

    personal = {
        p.usuario_id: p.espacio_id
        for p in PertenenciaEspacio.objects.filter(
            activo=True,
            espacio__tipo='PERSONAL',
        )
    }

    modelos = [
        ('finanzas', 'Categoria'),
        ('finanzas', 'Movimiento'),
        ('finanzas', 'Presupuesto'),
        ('finanzas', 'IngresoComun'),
        ('finanzas', 'SaldoMensualSnapshot'),
        ('finanzas', 'LiquidacionComunMensualSnapshot'),
        ('finanzas', 'ResumenHistoricoMesSnapshot'),
    ]
    for app_label, model_name in modelos:
        Model = apps.get_model(app_label, model_name)
        for familia_id, espacio_id in espejos.items():
            Model.objects.filter(
                familia_id=familia_id,
                espacio__isnull=True,
            ).update(espacio_id=espacio_id)

    Movimiento = apps.get_model('finanzas', 'Movimiento')
    Presupuesto = apps.get_model('finanzas', 'Presupuesto')
    for modelo in (Movimiento, Presupuesto):
        qs = modelo.objects.filter(espacio__isnull=True)
        for row in qs.only('pk', 'usuario_id').iterator():
            espacio_id = personal.get(row.usuario_id)
            if espacio_id:
                modelo.objects.filter(pk=row.pk).update(espacio_id=espacio_id)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    atomic = False

    dependencies = [
        ('finanzas', '0019_multitenant_constraints_origen'),
        ('usuarios', '0006_invitacion_espacio'),
    ]

    operations = [
        migrations.RunPython(backfill_espacio_restante, noop),
        migrations.AlterUniqueTogether(
            name='presupuesto',
            unique_together=set(),
        ),
        migrations.RemoveConstraint(
            model_name='saldomensualsnapshot',
            name='uniq_saldo_mensual_snapshot',
        ),
        migrations.RemoveConstraint(
            model_name='liquidacioncomunmensualsnapshot',
            name='uniq_liquidacion_comun_mensual',
        ),
        migrations.RemoveConstraint(
            model_name='resumenhistoricomessnapshot',
            name='uniq_resumen_historico_mes_familia',
        ),
        migrations.RemoveIndex(
            model_name='saldomensualsnapshot',
            name='finanzas_sa_familia_c3e9f3_idx',
        ),
        migrations.RemoveIndex(
            model_name='liquidacioncomunmensualsnapshot',
            name='finanzas_li_familia_981e0a_idx',
        ),
        migrations.RemoveIndex(
            model_name='resumenhistoricomessnapshot',
            name='finanzas_re_familia_269404_idx',
        ),
        migrations.RemoveField(model_name='categoria', name='familia'),
        migrations.RemoveField(model_name='movimiento', name='familia'),
        migrations.RemoveField(model_name='presupuesto', name='familia'),
        migrations.RemoveField(model_name='ingresocomun', name='familia'),
        migrations.RemoveField(model_name='saldomensualsnapshot', name='familia'),
        migrations.RemoveField(
            model_name='liquidacioncomunmensualsnapshot',
            name='familia',
        ),
        migrations.RemoveField(
            model_name='resumenhistoricomessnapshot',
            name='familia',
        ),
        migrations.AlterField(
            model_name='movimiento',
            name='espacio',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='+',
                to='espacios.espacio',
            ),
        ),
        migrations.AlterField(
            model_name='presupuesto',
            name='espacio',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='+',
                to='espacios.espacio',
            ),
        ),
    ]
