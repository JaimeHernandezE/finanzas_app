# Etapa 3: FK espacio en InvitacionPendiente (transición) + unique (espacio, email).

import django.db.models.deletion
from django.db import migrations, models


def backfill_invitacion_espacio(apps, schema_editor):
    InvitacionPendiente = apps.get_model('usuarios', 'InvitacionPendiente')
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

    for inv in InvitacionPendiente.objects.filter(espacio__isnull=True).iterator():
        espacio_id = espejos.get(inv.familia_id)
        if espacio_id:
            InvitacionPendiente.objects.filter(pk=inv.pk).update(espacio_id=espacio_id)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('espacios', '0003_drive_oauth_fields'),
        ('usuarios', '0005_alter_usuario_zona_horaria'),
    ]

    operations = [
        migrations.AddField(
            model_name='invitacionpendiente',
            name='espacio',
            field=models.ForeignKey(
                blank=True,
                help_text='Espacio familiar al que se invita (transición multitenant).',
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='invitaciones_pendientes',
                to='espacios.espacio',
            ),
        ),
        migrations.RunPython(backfill_invitacion_espacio, noop),
        migrations.AddConstraint(
            model_name='invitacionpendiente',
            constraint=models.UniqueConstraint(
                fields=('espacio', 'email'),
                name='uniq_invitacion_espacio_email',
            ),
        ),
    ]
