import csv
from datetime import datetime
from decimal import Decimal, InvalidOperation

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from applications.finanzas.models import (
    Categoria,
    CuentaPersonal,
    MetodoPago,
    Movimiento,
    Tarjeta,
)
from applications.viajes.models import Viaje


FORMATOS_FECHA = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y")
TIPOS_VALIDOS = {"INGRESO", "EGRESO"}
AMBITOS_VALIDOS = {"PERSONAL", "COMUN"}
HEADER_REQUERIDOS = {"fecha", "monto", "tipo", "categoria"}


class Command(BaseCommand):
    help = "Importa movimientos desde un CSV (con opcion de dry-run)."

    def add_arguments(self, parser):
        parser.add_argument("archivo_csv", type=str, help="Ruta al archivo CSV.")
        parser.add_argument("--usuario-id", type=int, required=True, help="ID del usuario dueno de los movimientos.")
        parser.add_argument(
            "--familia-id",
            type=int,
            required=False,
            help="ID de familia (si no se informa, se usa la del usuario).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Valida y procesa sin persistir cambios.",
        )

    def handle(self, *args, **options):
        archivo_csv = options["archivo_csv"]
        usuario_id = options["usuario_id"]
        familia_id = options.get("familia_id")
        dry_run = options["dry_run"]

        usuario = self._obtener_usuario(usuario_id)
        familia_id_resuelta = self._resolver_familia_id(usuario, familia_id)

        creados = 0
        errores = []

        with transaction.atomic():
            for idx, fila in self._iterar_filas_csv(archivo_csv):
                try:
                    payload = self._normalizar_fila(fila, idx, usuario, familia_id_resuelta)
                    Movimiento.objects.create(**payload)
                    creados += 1
                except CommandError as exc:
                    errores.append(f"Fila {idx}: {exc}")

            if dry_run:
                transaction.set_rollback(True)

        if errores:
            for error in errores:
                self.stdout.write(self.style.ERROR(error))
            raise CommandError(
                f"Importacion finalizada con errores. Creados validos: {creados}. Errores: {len(errores)}."
            )

        estado = "DRY-RUN (sin guardar)" if dry_run else "OK"
        self.stdout.write(
            self.style.SUCCESS(f"Importacion {estado}. Movimientos procesados: {creados}.")
        )

    def _iterar_filas_csv(self, archivo_csv):
        try:
            with open(archivo_csv, "r", encoding="utf-8-sig", newline="") as fh:
                sample = fh.read(4096)
                fh.seek(0)
                dialect = csv.Sniffer().sniff(sample, delimiters=",;")
                reader = csv.DictReader(fh, dialect=dialect)
                if not reader.fieldnames:
                    raise CommandError("El CSV no tiene encabezados.")

                headers = {h.strip().lower() for h in reader.fieldnames if h}
                faltantes = HEADER_REQUERIDOS - headers
                if faltantes:
                    faltantes_txt = ", ".join(sorted(faltantes))
                    raise CommandError(f"Faltan encabezados obligatorios: {faltantes_txt}.")

                for idx, fila in enumerate(reader, start=2):
                    fila_normalizada = {
                        (k or "").strip().lower(): (v or "").strip()
                        for k, v in fila.items()
                    }
                    yield idx, fila_normalizada
        except FileNotFoundError as exc:
            raise CommandError(f"No existe el archivo CSV: {archivo_csv}") from exc
        except csv.Error as exc:
            raise CommandError(f"No se pudo leer el CSV: {exc}") from exc

    def _normalizar_fila(self, fila, idx, usuario, familia_id):
        fecha = self._parsear_fecha(fila.get("fecha"), idx)
        monto = self._parsear_monto(fila.get("monto"), idx)
        tipo = self._parsear_tipo(fila.get("tipo"), idx)
        ambito = self._parsear_ambito(fila.get("ambito"))

        categoria = self._resolver_categoria(
            nombre_categoria=fila.get("categoria", ""),
            tipo=tipo,
            familia_id=familia_id,
            usuario=usuario,
            idx=idx,
        )
        metodo_pago = self._resolver_metodo_pago(fila.get("metodo_pago"))
        cuenta = self._resolver_cuenta(fila.get("cuenta"), usuario)
        tarjeta = self._resolver_tarjeta(fila.get("tarjeta"), usuario, metodo_pago, idx)
        viaje = self._resolver_viaje(fila.get("viaje"), familia_id)
        num_cuotas, monto_cuota = self._resolver_cuotas(
            fila=fila,
            metodo_pago=metodo_pago,
            idx=idx,
        )
        oculto = self._parsear_booleano(fila.get("oculto", "false"))

        return {
            "familia_id": familia_id,
            "usuario": usuario,
            "cuenta": cuenta,
            "tipo": tipo,
            "ambito": ambito,
            "categoria": categoria,
            "fecha": fecha,
            "monto": monto,
            "comentario": fila.get("comentario", ""),
            "oculto": oculto,
            "metodo_pago": metodo_pago,
            "tarjeta": tarjeta,
            "num_cuotas": num_cuotas,
            "monto_cuota": monto_cuota,
            "viaje": viaje,
        }

    def _obtener_usuario(self, usuario_id):
        User = get_user_model()
        try:
            return User.objects.get(pk=usuario_id)
        except User.DoesNotExist as exc:
            raise CommandError(f"No existe usuario con id={usuario_id}.") from exc

    def _resolver_familia_id(self, usuario, familia_id):
        if familia_id:
            return familia_id
        if usuario.familia_id:
            return usuario.familia_id
        raise CommandError(
            "Debes informar --familia-id o usar un usuario con familia asociada."
        )

    def _parsear_fecha(self, valor, idx):
        if not valor:
            raise CommandError("fecha vacia.")
        for formato in FORMATOS_FECHA:
            try:
                return datetime.strptime(valor, formato).date()
            except ValueError:
                continue
        raise CommandError(
            f"fecha invalida '{valor}'. Formatos soportados: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY."
        )

    def _parsear_monto(self, valor, idx):
        if not valor:
            raise CommandError("monto vacio.")
        normalizado = valor.replace(".", "").replace(",", ".")
        try:
            monto = Decimal(normalizado)
        except InvalidOperation as exc:
            raise CommandError(f"monto invalido '{valor}'.") from exc
        if monto <= 0:
            raise CommandError("monto debe ser mayor a 0.")
        return monto

    def _parsear_tipo(self, valor, idx):
        tipo = (valor or "").upper()
        if tipo not in TIPOS_VALIDOS:
            raise CommandError(f"tipo invalido '{valor}'. Usa INGRESO o EGRESO.")
        return tipo

    def _parsear_ambito(self, valor):
        ambito = (valor or "PERSONAL").upper()
        if ambito not in AMBITOS_VALIDOS:
            raise CommandError(f"ambito invalido '{valor}'. Usa PERSONAL o COMUN.")
        return ambito

    def _parsear_booleano(self, valor):
        return (valor or "").strip().lower() in {"1", "true", "si", "sí", "yes", "y"}

    def _resolver_categoria(self, nombre_categoria, tipo, familia_id, usuario, idx):
        if not nombre_categoria:
            raise CommandError("categoria vacia.")

        categoria = (
            Categoria.objects.filter(
                nombre__iexact=nombre_categoria,
                tipo=tipo,
                familia_id=familia_id,
            )
            .order_by("usuario_id")
            .first()
        )
        if categoria:
            return categoria

        categoria_global = Categoria.objects.filter(
            nombre__iexact=nombre_categoria,
            tipo=tipo,
            familia__isnull=True,
            usuario__isnull=True,
        ).first()
        if categoria_global:
            return categoria_global

        raise CommandError(
            f"No existe categoria '{nombre_categoria}' tipo {tipo} para la familia/usuario."
        )

    def _resolver_metodo_pago(self, valor):
        if not valor:
            metodo = MetodoPago.objects.filter(tipo="EFECTIVO").order_by("pk").first()
            if metodo:
                return metodo
            raise CommandError(
                "No hay metodo_pago en CSV ni metodo EFECTIVO cargado en BD."
            )

        metodo = MetodoPago.objects.filter(nombre__iexact=valor).first()
        if metodo:
            return metodo

        metodo_por_tipo = MetodoPago.objects.filter(tipo=valor.upper()).first()
        if metodo_por_tipo:
            return metodo_por_tipo

        raise CommandError(f"No existe metodo_pago '{valor}'.")

    def _resolver_cuenta(self, valor, usuario):
        if not valor:
            return None
        cuenta = CuentaPersonal.objects.filter(
            usuario=usuario,
            nombre__iexact=valor,
        ).first()
        if not cuenta:
            raise CommandError(f"No existe cuenta '{valor}' para el usuario.")
        return cuenta

    def _resolver_tarjeta(self, valor, usuario, metodo_pago, idx):
        if metodo_pago.tipo != "CREDITO":
            return None
        if not valor:
            raise CommandError("metodo CREDITO requiere columna tarjeta.")
        tarjeta = Tarjeta.objects.filter(usuario=usuario, nombre__iexact=valor).first()
        if not tarjeta:
            raise CommandError(f"No existe tarjeta '{valor}' para el usuario.")
        return tarjeta

    def _resolver_viaje(self, valor, familia_id):
        if not valor:
            return None
        viaje = Viaje.objects.filter(familia_id=familia_id, nombre__iexact=valor).first()
        if not viaje:
            raise CommandError(f"No existe viaje '{valor}' en la familia.")
        return viaje

    def _resolver_cuotas(self, fila, metodo_pago, idx):
        if metodo_pago.tipo != "CREDITO":
            return None, None

        valor_num_cuotas = (fila.get("num_cuotas") or "").strip()
        valor_monto_cuota = (fila.get("monto_cuota") or "").strip()

        if not valor_num_cuotas:
            raise CommandError("metodo CREDITO requiere num_cuotas.")

        try:
            num_cuotas = int(valor_num_cuotas)
        except ValueError as exc:
            raise CommandError(f"num_cuotas invalido '{valor_num_cuotas}'.") from exc

        if num_cuotas <= 0:
            raise CommandError("num_cuotas debe ser mayor a 0.")

        if not valor_monto_cuota:
            return num_cuotas, None

        normalizado = valor_monto_cuota.replace(".", "").replace(",", ".")
        try:
            monto_cuota = Decimal(normalizado)
        except InvalidOperation as exc:
            raise CommandError(f"monto_cuota invalido '{valor_monto_cuota}'.") from exc
        return num_cuotas, monto_cuota
