# applications/finanzas/serializers.py

from datetime import date

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
        model  = Tarjeta
        fields = [
            'id', 'nombre', 'banco',
            'dia_facturacion', 'dia_vencimiento',
            'usuario',
        ]
        read_only_fields = ['usuario']

    def validate_dia_facturacion(self, value):
        if value is not None and not (1 <= value <= 31):
            raise serializers.ValidationError(
                'El día de facturación debe estar entre 1 y 31.'
            )
        return value

    def validate_dia_vencimiento(self, value):
        if value is not None and not (1 <= value <= 31):
            raise serializers.ValidationError(
                'El día de vencimiento debe estar entre 1 y 31.'
            )
        return value


class CuotaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cuota
        fields = [
            'id', 'numero', 'monto', 'mes_facturacion',
            'estado', 'incluir'
        ]


# Campos que no pueden cambiarse en un movimiento vinculado a IngresoComun
# (el ingreso común es la fuente de verdad de tipo/ámbito/categoría/método/cuenta).
MOVIMIENTO_INGRESO_COMUN_CAMPOS_RESTRINGIDOS = frozenset({
    'tipo', 'ambito', 'categoria', 'metodo_pago', 'cuenta',
    'tarjeta', 'num_cuotas', 'monto_cuota', 'viaje', 'oculto',
})


class MovimientoSerializer(serializers.ModelSerializer):
    cuotas = CuotaSerializer(many=True, read_only=True)
    ingreso_comun = serializers.SerializerMethodField()

    class Meta:
        model = Movimiento
        fields = [
            'id', 'fecha', 'tipo', 'ambito', 'categoria',
            'cuenta', 'monto', 'comentario', 'oculto',
            'metodo_pago', 'tarjeta', 'num_cuotas', 'monto_cuota',
            'viaje', 'cuotas', 'created_at', 'ingreso_comun',
        ]
        read_only_fields = ['familia', 'usuario', 'created_at', 'cuotas', 'ingreso_comun']

    def get_ingreso_comun(self, obj):
        """PK del IngresoComun vinculado, si existe."""
        if hasattr(obj, '_ingreso_comun_pk'):
            return obj._ingreso_comun_pk
        return (
            IngresoComun.objects.filter(movimiento_id=obj.pk)
            .values_list('pk', flat=True)
            .first()
        )

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

    def update(self, instance, validated_data):
        ic = IngresoComun.objects.filter(movimiento_id=instance.pk).first()
        if ic:
            restringidos = MOVIMIENTO_INGRESO_COMUN_CAMPOS_RESTRINGIDOS & validated_data.keys()
            if restringidos:
                raise serializers.ValidationError({
                    k: (
                        'Este movimiento está vinculado a un ingreso común; '
                        'solo puedes editar fecha, monto y comentario (origen).'
                    )
                    for k in restringidos
                })
        instance = super().update(instance, validated_data)
        ic = IngresoComun.objects.filter(movimiento_id=instance.pk).first()
        if ic:
            mes = date(instance.fecha.year, instance.fecha.month, 1)
            IngresoComun.objects.filter(pk=ic.pk).update(
                monto=instance.monto,
                origen=instance.comentario or '',
                mes=mes,
            )
        return instance


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
    ingreso_comun = serializers.SerializerMethodField()

    class Meta:
        model = Movimiento
        fields = [
            'id', 'fecha', 'tipo', 'ambito', 'monto', 'comentario',
            'categoria', 'categoria_nombre',
            'metodo_pago', 'metodo_pago_tipo',
            'tarjeta', 'tarjeta_nombre',
            'autor_nombre', 'oculto', 'ingreso_comun',
        ]

    def get_ingreso_comun(self, obj):
        return getattr(obj, '_ingreso_comun_pk', None)


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
    movimiento = serializers.IntegerField(
        source='movimiento_id', read_only=True, allow_null=True
    )

    class Meta:
        model = IngresoComun
        fields = [
            'id', 'mes', 'monto', 'origen', 'usuario', 'autor_nombre', 'movimiento',
        ]
        read_only_fields = ['usuario', 'familia', 'movimiento']


class PresupuestoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Presupuesto
        fields = ['id', 'familia', 'usuario', 'categoria', 'mes', 'monto']
        read_only_fields = ['familia', 'usuario', 'categoria', 'mes']
