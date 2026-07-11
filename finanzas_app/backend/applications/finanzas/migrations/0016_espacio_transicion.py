# Transición multitenant Fase 3: FK espacio (nullable) en los modelos con
# familia directa. Se puebla con `manage.py backfill_espacios`; pasa a ser
# obligatorio (y reemplaza a familia) en el cutover.

import django.db.models.deletion
from django.db import migrations, models


def _campo_espacio(help_text):
    return models.ForeignKey(
        blank=True,
        help_text=help_text,
        null=True,
        on_delete=django.db.models.deletion.PROTECT,
        related_name='+',
        to='espacios.espacio',
    )


_HELP = 'Tenant (transición multitenant Fase 3); reemplazará a familia en el cutover.'


class Migration(migrations.Migration):

    dependencies = [
        ('finanzas', '0015_delete_recalculopendiente'),
        ('espacios', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='categoria',
            name='espacio',
            field=_campo_espacio(
                'Tenant (transición multitenant Fase 3); reemplazará a familia en el cutover. '
                'Null también para categorías globales del sistema.'
            ),
        ),
        migrations.AddField(
            model_name='movimiento',
            name='espacio',
            field=_campo_espacio(_HELP),
        ),
        migrations.AddField(
            model_name='presupuesto',
            name='espacio',
            field=_campo_espacio(_HELP),
        ),
        migrations.AddField(
            model_name='ingresocomun',
            name='espacio',
            field=_campo_espacio(_HELP),
        ),
        migrations.AddField(
            model_name='saldomensualsnapshot',
            name='espacio',
            field=_campo_espacio(_HELP),
        ),
        migrations.AddField(
            model_name='liquidacioncomunmensualsnapshot',
            name='espacio',
            field=_campo_espacio(_HELP),
        ),
        migrations.AddField(
            model_name='resumenhistoricomessnapshot',
            name='espacio',
            field=_campo_espacio(_HELP),
        ),
    ]
