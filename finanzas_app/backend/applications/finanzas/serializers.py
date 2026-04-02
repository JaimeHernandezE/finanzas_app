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
    es_padre = serializers.BooleanField(read_only=True)

    class Meta:
        model = Categoria
        fields = [
            'id',
            'nombre',
            'tipo',
            'es_inversion',
            'familia',
            'usuario',
            'cuenta_personal',
            'categoria_padre',
            'es_padre',
        ]
        read_only_fields = ['familia', 'usuario']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instancia = self.instance

        usuario = attrs.get('usuario', getattr(instancia, 'usuario', None))
        familia = attrs.get('familia', getattr(instancia, 'familia', None))
        cuenta_personal = attrs.get(
            'cuenta_personal',
            getattr(instancia, 'cuenta_personal', None),
        )
        categoria_padre = attrs.get(
            'categoria_padre',
            getattr(instancia, 'categoria_padre', None),
        )
        tipo = attrs.get('tipo', getattr(instancia, 'tipo', None))

        if categoria_padre is not None:
            if instancia is not None and categoria_padre.id == instancia.id:
                raise serializers.ValidationError(
                    {'categoria_padre': 'Una categoría no puede ser su propio padre.'}
                )
            if categoria_padre.categoria_padre_id is not None:
                raise serializers.ValidationError(
                    {'categoria_padre': 'No se permiten nietas: el padre no puede tener padre.'}
                )
            if tipo and categoria_padre.tipo != tipo:
                raise serializers.ValidationError(
                    {'categoria_padre': 'La categoría padre debe tener el mismo tipo.'}
                )

        if familia is not None and usuario is None and cuenta_personal is not None:
            raise serializers.ValidationError(
                {
                    'cuenta_personal': (
                        'Las categorías familiares no pueden vincularse a una cuenta personal.'
                    )
                }
            )

        if usuario is not None and cuenta_personal is not None:
            if cuenta_personal.usuario_id != usuario.id:
                raise serializers.ValidationError(
                    {
                        'cuenta_personal': (
                            'La cuenta personal debe pertenecer al mismo usuario de la categoría.'
                        )
                    }
                )

        return attrs


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
            'id', 'movimiento', 'numero', 'monto', 'mes_facturacion',
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
        categoria = data.get('categoria')
        if categoria is None and self.instance is not None:
            categoria = self.instance.categoria
        if categoria is not None and categoria.es_padre:
            raise serializers.ValidationError(
                {
                    'categoria': (
                        'Las categorías padre solo agrupan subcategorías; '
                        'registra el movimiento en una categoría hija.'
                    ),
                }
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
    categoria_es_inversion = serializers.BooleanField(
        source='categoria.es_inversion', read_only=True
    )
    metodo_pago_tipo = serializers.CharField(source='metodo_pago.tipo', read_only=True)
    tarjeta_nombre = serializers.CharField(
        source='tarjeta.nombre', read_only=True, allow_null=True
    )
    cuenta_nombre = serializers.CharField(
        source='cuenta.nombre', read_only=True, allow_null=True
    )
    autor_nombre = serializers.CharField(source='usuario.first_name', read_only=True)
    ingreso_comun = serializers.SerializerMethodField()

    class Meta:
        model = Movimiento
        fields = [
            'id', 'fecha', 'tipo', 'ambito', 'monto', 'comentario',
            'usuario',
            'cuenta', 'cuenta_nombre',
            'categoria', 'categoria_nombre', 'categoria_es_inversion',
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
            'id', 'mes', 'fecha_pago', 'monto', 'origen', 'usuario', 'autor_nombre', 'movimiento',
        ]
        read_only_fields = ['usuario', 'familia', 'movimiento']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        mes = attrs.get('mes')
        fecha_pago = attrs.get('fecha_pago')

        if fecha_pago is None and self.instance is not None:
            fecha_pago = self.instance.fecha_pago
        if mes is None and self.instance is not None:
            mes = self.instance.mes

        # Si viene fecha real de pago, el mes se normaliza automáticamente
        # al primer día de ese mismo mes para mantener coherencia.
        if fecha_pago:
            attrs['mes'] = date(fecha_pago.year, fecha_pago.month, 1)
        elif mes:
            attrs['fecha_pago'] = mes

        return attrs


class PresupuestoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Presupuesto
        fields = ['id', 'familia', 'usuario', 'categoria', 'mes', 'monto']
        read_only_fields = ['familia', 'usuario', 'categoria', 'mes']
