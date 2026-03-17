# applications/inversiones/serializers.py

from rest_framework import serializers
from .models import Fondo, Aporte, RegistroValor


class AporteSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Aporte
        fields = ['id', 'fecha', 'monto', 'nota']


class RegistroValorSerializer(serializers.ModelSerializer):
    class Meta:
        model  = RegistroValor
        fields = ['id', 'fecha', 'valor_cuota']


class EventoFondoSerializer(serializers.Serializer):
    """
    Serializer para el historial mezclado de aportes y registros de valor.
    El frontend los muestra en una sola lista cronológica.
    """
    id    = serializers.IntegerField()
    tipo  = serializers.CharField()      # 'APORTE' o 'VALOR'
    fecha = serializers.DateField()
    monto = serializers.DecimalField(max_digits=14, decimal_places=2)
    nota  = serializers.CharField(allow_null=True)


class FondoListSerializer(serializers.ModelSerializer):
    """
    Serializer para el listado de fondos.
    Incluye métricas calculadas: capital total, valor actual, rentabilidad.
    """
    capital_total = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True
    )
    valor_actual  = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True
    )
    ganancia      = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True
    )
    rentabilidad  = serializers.DecimalField(
        max_digits=8, decimal_places=2, read_only=True
    )
    es_compartido = serializers.SerializerMethodField()

    class Meta:
        model  = Fondo
        fields = [
            'id', 'nombre', 'descripcion', 'es_compartido',
            'capital_total', 'valor_actual', 'ganancia', 'rentabilidad',
        ]

    def get_es_compartido(self, obj):
        return obj.usuario is None


class FondoDetalleSerializer(FondoListSerializer):
    """Extiende el listado con el historial completo de eventos."""
    historial = serializers.SerializerMethodField()

    class Meta(FondoListSerializer.Meta):
        fields = FondoListSerializer.Meta.fields + ['historial']

    def get_historial(self, obj):
        aportes = [
            {
                'id':    a.id,
                'tipo':  'APORTE',
                'fecha': str(a.fecha),
                'monto': str(a.monto),
                'nota':  a.nota or None,
            }
            for a in obj.aportes.all()
        ]
        valores = [
            {
                'id':    v.id,
                'tipo':  'VALOR',
                'fecha': str(v.fecha),
                'monto': str(v.valor_cuota),
                'nota':  None,
            }
            for v in obj.registros_valor.all()
        ]
        # Mezclar y ordenar de más reciente a más antiguo
        historial = sorted(
            aportes + valores,
            key=lambda x: x['fecha'],
            reverse=True,
        )
        return historial
