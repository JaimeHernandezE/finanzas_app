# applications/finanzas/serializers.py

from rest_framework import serializers
from .models import (
    Categoria,
    CuentaPersonal,
    MetodoPago,
    Tarjeta,
    Movimiento,
    Cuota,
    IngresoComun,
    Presupuesto,
)


class CategoriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Categoria
        fields = ['id', 'nombre', 'tipo', 'es_inversion', 'familia', 'usuario']
        read_only_fields = ['familia', 'usuario']


class MetodoPagoSerializer(serializers.ModelSerializer):
    class Meta:
        model = MetodoPago
        fields = ['id', 'nombre', 'tipo']


class TarjetaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tarjeta
        fields = ['id', 'nombre', 'banco', 'usuario']
        read_only_fields = ['usuario']


class CuotaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cuota
        fields = [
            'id', 'numero', 'monto', 'mes_facturacion',
            'estado', 'incluir'
        ]


class MovimientoSerializer(serializers.ModelSerializer):
    cuotas = CuotaSerializer(many=True, read_only=True)

    class Meta:
        model = Movimiento
        fields = [
            'id', 'fecha', 'tipo', 'ambito', 'categoria',
            'cuenta', 'monto', 'comentario', 'oculto',
            'metodo_pago', 'tarjeta', 'num_cuotas', 'monto_cuota',
            'viaje', 'cuotas', 'created_at',
        ]
        read_only_fields = ['familia', 'usuario', 'created_at', 'cuotas']

    def validate(self, data):
        """Valida que si el método es crédito, se proporcione tarjeta y num_cuotas."""
        metodo = data.get('metodo_pago')
        if metodo and metodo.tipo == 'CREDITO':
            if not data.get('tarjeta'):
                raise serializers.ValidationError(
                    {'tarjeta': 'La tarjeta es obligatoria para pagos con crédito.'}
                )
            if not data.get('num_cuotas'):
                raise serializers.ValidationError(
                    {'num_cuotas': 'El número de cuotas es obligatorio para pagos con crédito.'}
                )
        return data


class MovimientoListSerializer(serializers.ModelSerializer):
    """
    Serializer liviano para el listado. No incluye cuotas
    para evitar N+1 queries en listas largas.
    """
    categoria_nombre = serializers.CharField(source='categoria.nombre', read_only=True)
    metodo_pago_tipo = serializers.CharField(source='metodo_pago.tipo', read_only=True)
    tarjeta_nombre = serializers.CharField(
        source='tarjeta.nombre', read_only=True, allow_null=True
    )
    autor_nombre = serializers.CharField(source='usuario.first_name', read_only=True)

    class Meta:
        model = Movimiento
        fields = [
            'id', 'fecha', 'tipo', 'ambito', 'monto', 'comentario',
            'categoria', 'categoria_nombre',
            'metodo_pago', 'metodo_pago_tipo',
            'tarjeta', 'tarjeta_nombre',
            'autor_nombre', 'oculto',
        ]


class CuentaPersonalSerializer(serializers.ModelSerializer):
    """Listado: cuentas propias y tuteladas visibles para el usuario autenticado."""

    es_propia = serializers.SerializerMethodField()
    duenio_nombre = serializers.SerializerMethodField()

    class Meta:
        model = CuentaPersonal
        fields = [
            'id',
            'nombre',
            'descripcion',
            'visible_familia',
            'es_propia',
            'duenio_nombre',
        ]

    def get_es_propia(self, obj):
        u = self.context.get('usuario')
        if u is None:
            return True
        return obj.usuario_id == u.id

    def get_duenio_nombre(self, obj):
        u = self.context.get('usuario')
        if u is None or obj.usuario_id == u.id:
            return None
        o = obj.usuario
        return (o.get_full_name() or o.email or o.username or '').strip() or str(o.pk)


class CuentaPersonalWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = CuentaPersonal
        fields = ['nombre', 'descripcion', 'visible_familia']


class IngresoComunSerializer(serializers.ModelSerializer):
    autor_nombre = serializers.CharField(
        source='usuario.first_name', read_only=True
    )

    class Meta:
        model = IngresoComun
        fields = ['id', 'mes', 'monto', 'origen', 'usuario', 'autor_nombre']
        read_only_fields = ['usuario', 'familia']


class PresupuestoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Presupuesto
        fields = ['id', 'familia', 'usuario', 'categoria', 'mes', 'monto']
        read_only_fields = ['familia', 'usuario', 'categoria', 'mes']
