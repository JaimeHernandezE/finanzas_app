# applications/viajes/serializers.py

from rest_framework import serializers
from .models import Viaje, PresupuestoViaje


class PresupuestoViajeSerializer(serializers.ModelSerializer):
    categoria_nombre = serializers.CharField(
        source='categoria.nombre', read_only=True
    )

    class Meta:
        model  = PresupuestoViaje
        fields = ['id', 'categoria', 'categoria_nombre', 'monto_planificado']


class ViajeSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Viaje
        fields = [
            'id', 'nombre', 'fecha_inicio', 'fecha_fin',
            'color_tema', 'es_activo', 'archivado',
        ]
        read_only_fields = ['familia', 'es_activo', 'archivado']


class ViajeDetalleSerializer(ViajeSerializer):
    presupuestos        = PresupuestoViajeSerializer(many=True, read_only=True)
    total_presupuestado = serializers.SerializerMethodField()
    total_gastado       = serializers.SerializerMethodField()

    class Meta(ViajeSerializer.Meta):
        fields = ViajeSerializer.Meta.fields + [
            'presupuestos', 'total_presupuestado', 'total_gastado'
        ]

    def get_total_presupuestado(self, obj):
        from django.db.models import Sum
        total = obj.presupuestos.aggregate(t=Sum('monto_planificado'))['t'] or 0
        return str(total)

    def get_total_gastado(self, obj):
        from django.db.models import Sum
        total = obj.movimientos.filter(
            tipo='EGRESO', oculto=False
        ).aggregate(t=Sum('monto'))['t'] or 0
        return str(total)
