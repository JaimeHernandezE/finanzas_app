# applications/finanzas/serializers.py

from rest_framework import serializers
from .models import Categoria, MetodoPago, Tarjeta


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
