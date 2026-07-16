# applications/finanzas/serializers.py

from datetime import date
from decimal import Decimal, ROUND_DOWN

from rest_framework import serializers
from django.db import transaction
from dateutil.relativedelta import relativedelta
from .models import (
    Categoria,
    CuentaPersonal,
    MetodoPago,
    Tarjeta,
    Movimiento,
    MovimientoPendiente,
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
            'espacio',
            'usuario',
            'cuenta_personal',
            'categoria_padre',
            'es_padre',
        ]
        read_only_fields = ['espacio', 'usuario']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instancia = self.instance

        usuario = attrs.get('usuario', getattr(instancia, 'usuario', None))
        espacio = attrs.get('espacio', getattr(instancia, 'espacio', None))
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

        if espacio is not None and usuario is None and cuenta_personal is not None:
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
            'id', 'nombre', 'banco', 'tipo', 'ultimos_4_digitos', 'numero_cuenta',
            'es_por_defecto',
            'dia_facturacion', 'dia_vencimiento',
            'usuario',
        ]
        read_only_fields = ['usuario']

    def validate_ultimos_4_digitos(self, value):
        value = (value or '').strip()
        if value and (len(value) != 4 or not value.isdigit()):
            raise serializers.ValidationError(
                'Debe ser exactamente 4 dígitos numéricos.'
            )
        return value

    def validate_numero_cuenta(self, value):
        value = (value or '').strip()
        if not value:
            return ''
        digits = ''.join(c for c in value if c.isdigit())
        if len(digits) < 4:
            raise serializers.ValidationError(
                'El número de cuenta debe tener al menos 4 dígitos.'
            )
        if len(value) > 34:
            raise serializers.ValidationError(
                'El número de cuenta no puede superar 34 caracteres.'
            )
        return value

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
    movimiento_comentario = serializers.CharField(
        source='movimiento.comentario',
        read_only=True,
        allow_blank=True,
    )
    movimiento_categoria_nombre = serializers.SerializerMethodField()

    class Meta:
        model = Cuota
        fields = [
            'id', 'movimiento', 'numero', 'monto', 'mes_facturacion',
            'estado', 'incluir', 'movimiento_comentario',
            'movimiento_categoria_nombre',
        ]

    def get_movimiento_categoria_nombre(self, obj):
        cat = getattr(obj.movimiento, 'categoria', None)
        return cat.nombre if cat is not None else ''


# Campos que no pueden cambiarse en un movimiento vinculado a IngresoComun
# (el ingreso común es la fuente de verdad de tipo/ámbito/categoría/método/cuenta).
MOVIMIENTO_INGRESO_COMUN_CAMPOS_RESTRINGIDOS = frozenset({
    'tipo', 'ambito', 'categoria', 'metodo_pago', 'cuenta',
    'tarjeta', 'num_cuotas', 'monto_cuota', 'viaje', 'oculto',
})


def _calcular_mes_base_cuotas(fecha_gasto: date, dia_facturacion: int | None) -> date:
    if not dia_facturacion:
        return date(fecha_gasto.year, fecha_gasto.month, 1)
    if fecha_gasto.day <= dia_facturacion:
        return date(fecha_gasto.year, fecha_gasto.month, 1)
    siguiente = date(fecha_gasto.year, fecha_gasto.month, 1) + relativedelta(months=1)
    return date(siguiente.year, siguiente.month, 1)


def _regenerar_cuotas_movimiento_credito(movimiento: Movimiento) -> None:
    n = movimiento.num_cuotas or 0
    if n <= 0:
        Cuota.objects.filter(movimiento=movimiento).delete()
        return

    monto_base = Decimal(str(movimiento.monto))
    if movimiento.monto_cuota:
        monto_cuota = Decimal(str(movimiento.monto_cuota))
    else:
        monto_cuota = (monto_base / n).quantize(
            Decimal('0.01'),
            rounding=ROUND_DOWN,
        )
    diferencia = monto_base - (monto_cuota * n)
    dia_facturacion = movimiento.tarjeta.dia_facturacion if movimiento.tarjeta else None
    mes_base = _calcular_mes_base_cuotas(movimiento.fecha, dia_facturacion)

    Cuota.objects.filter(movimiento=movimiento).delete()
    cuotas = []
    for i in range(n):
        mes_facturacion = mes_base + relativedelta(months=i)
        monto_final = monto_cuota + (diferencia if i == 0 else Decimal('0.00'))
        cuotas.append(Cuota(
            movimiento=movimiento,
            numero=i + 1,
            monto=monto_final,
            mes_facturacion=mes_facturacion,
            estado='PENDIENTE',
            incluir=True,
        ))
    Cuota.objects.bulk_create(cuotas)


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
        """Valida tarjeta/cuotas según método de pago y coherencia tipo de tarjeta."""
        metodo = data.get('metodo_pago')
        if metodo is None and self.instance is not None:
            metodo = self.instance.metodo_pago
        tarjeta = data.get('tarjeta')
        if 'tarjeta' not in data and self.instance is not None:
            tarjeta = self.instance.tarjeta

        if metodo and metodo.tipo == 'CREDITO':
            if not tarjeta:
                raise serializers.ValidationError(
                    {'tarjeta': 'La tarjeta es obligatoria para pagos con crédito.'}
                )
            num_cuotas = data.get('num_cuotas')
            if num_cuotas is None and self.instance is not None and 'num_cuotas' not in data:
                num_cuotas = self.instance.num_cuotas
            if not num_cuotas:
                raise serializers.ValidationError(
                    {'num_cuotas': 'El número de cuotas es obligatorio para pagos con crédito.'}
                )
            if tarjeta and getattr(tarjeta, 'tipo', None) and tarjeta.tipo != 'CREDITO':
                raise serializers.ValidationError(
                    {'tarjeta': 'Para crédito debes elegir una tarjeta de tipo crédito.'}
                )

        if metodo and metodo.tipo == 'DEBITO':
            if tarjeta and getattr(tarjeta, 'tipo', None) and tarjeta.tipo != 'DEBITO':
                raise serializers.ValidationError(
                    {'tarjeta': 'Para débito debes elegir una tarjeta de tipo débito.'}
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
        previo = {
            'monto': instance.monto,
            'num_cuotas': instance.num_cuotas,
            'monto_cuota': instance.monto_cuota,
            'fecha': instance.fecha,
            'tarjeta_id': instance.tarjeta_id,
            'metodo_pago_tipo': instance.metodo_pago.tipo if instance.metodo_pago_id else None,
        }
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
        with transaction.atomic():
            instance = super().update(instance, validated_data)

            es_credito = instance.metodo_pago.tipo == 'CREDITO'
            era_credito = previo['metodo_pago_tipo'] == 'CREDITO'
            cambios_que_afectan_cuotas = (
                instance.monto != previo['monto']
                or instance.num_cuotas != previo['num_cuotas']
                or instance.monto_cuota != previo['monto_cuota']
                or instance.fecha != previo['fecha']
                or instance.tarjeta_id != previo['tarjeta_id']
                or (es_credito and not era_credito)
            )

            if es_credito and cambios_que_afectan_cuotas:
                if Cuota.objects.filter(movimiento=instance, estado='PAGADO').exists():
                    raise serializers.ValidationError({
                        'monto': (
                            'Este movimiento tiene cuotas pagadas. '
                            'No se puede recalcular su plan de cuotas.'
                        )
                    })
                _regenerar_cuotas_movimiento_credito(instance)
            elif era_credito and not es_credito:
                Cuota.objects.filter(movimiento=instance).delete()

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
        """
        PK de IngresoComun vinculado al movimiento, o None.
        Si el queryset no trae la anotación `_ingreso_comun_pk`, consulta la BD
        (p. ej. respuestas puntuales sin `_qs_movimientos_con_ingreso_comun`).
        """
        if hasattr(obj, '_ingreso_comun_pk'):
            return obj._ingreso_comun_pk
        return (
            IngresoComun.objects.filter(movimiento_id=obj.pk)
            .values_list('pk', flat=True)
            .first()
        )


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


class MovimientoPendienteSerializer(serializers.ModelSerializer):
    categoria_sugerida_nombre = serializers.CharField(
        source='categoria_sugerida.nombre', read_only=True, allow_null=True,
    )
    metodo_pago_sugerido_tipo = serializers.CharField(
        source='metodo_pago_sugerido.tipo', read_only=True, allow_null=True,
    )
    metodo_pago_sugerido_nombre = serializers.CharField(
        source='metodo_pago_sugerido.nombre', read_only=True, allow_null=True,
    )
    tarjeta_sugerida_nombre = serializers.CharField(
        source='tarjeta_sugerida.nombre', read_only=True, allow_null=True,
    )
    tarjeta_sugerida_ultimos_4 = serializers.CharField(
        source='tarjeta_sugerida.ultimos_4_digitos', read_only=True, allow_null=True,
    )
    tarjeta_sugerida_banco = serializers.CharField(
        source='tarjeta_sugerida.banco', read_only=True, allow_null=True,
    )
    cuenta_sugerida_nombre = serializers.CharField(
        source='cuenta_sugerida.nombre', read_only=True, allow_null=True,
    )
    hora = serializers.SerializerMethodField()
    ultimos_4 = serializers.SerializerMethodField()
    banco = serializers.SerializerMethodField()
    es_transferencia = serializers.SerializerMethodField()

    class Meta:
        model = MovimientoPendiente
        fields = [
            'id', 'origen', 'tipo', 'monto', 'fecha', 'hora', 'comercio',
            'ultimos_4', 'banco', 'es_transferencia',
            'categoria_sugerida', 'categoria_sugerida_nombre',
            'ambito_sugerido',
            'metodo_pago_sugerido', 'metodo_pago_sugerido_tipo',
            'metodo_pago_sugerido_nombre',
            'tarjeta_sugerida', 'tarjeta_sugerida_nombre',
            'tarjeta_sugerida_ultimos_4', 'tarjeta_sugerida_banco',
            'cuenta_sugerida', 'cuenta_sugerida_nombre',
            'confianza', 'estado', 'movimiento',
            'creado_at', 'actualizado_at',
        ]
        read_only_fields = fields

    def get_hora(self, obj):
        payload = obj.payload_original or {}
        hora = (payload.get('hora') or '').strip()
        return hora or None

    def get_ultimos_4(self, obj):
        payload = obj.payload_original or {}
        from_payload = (payload.get('ultimos_4') or '').strip()
        if from_payload:
            return from_payload
        if obj.tarjeta_sugerida_id and obj.tarjeta_sugerida.ultimos_4_digitos:
            return obj.tarjeta_sugerida.ultimos_4_digitos
        return ''

    def get_banco(self, obj):
        payload = obj.payload_original or {}
        from_payload = (payload.get('banco') or '').strip()
        if from_payload and from_payload.upper() not in ('GENERICO',):
            return from_payload
        if obj.tarjeta_sugerida_id and (obj.tarjeta_sugerida.banco or '').strip():
            return obj.tarjeta_sugerida.banco.strip()
        return ''

    def get_es_transferencia(self, obj):
        payload = obj.payload_original or {}
        return bool(payload.get('es_transferencia'))
