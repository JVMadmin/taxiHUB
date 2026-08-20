from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import math
from enum import Enum
from typing import List, Optional, Dict
from datetime import datetime, timedelta, timezone

import jwt
import bcrypt
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import (FastAPI, APIRouter, HTTPException, Depends, Request,
                     WebSocket, WebSocketDisconnect, UploadFile, File, Form, Header, Query, Response)
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
import uuid
import httpx


# ---------------------------------------------------------------------------
# DB + app setup
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---- Almacenamiento local de archivos ----
APP_NAME = "central-taxis"
UPLOAD_DIR = ROOT_DIR / "uploads"


def put_object(path: str, data: bytes, content_type: str) -> dict:
    full_path = UPLOAD_DIR / path
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_bytes(data)
    return {"path": path}


def get_object(path: str):
    full_path = UPLOAD_DIR / path
    if not full_path.is_file():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return full_path.read_bytes(), "application/octet-stream"

app = FastAPI(title="Central de Taxis - API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("central_taxis")

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"

SCOPES = {"operador": "operador", "terminal": "terminal", "pasajero": "pasajero", "dev": "dev", "dueno": "dueno"}
DEFAULT_SITIO = "default"

# Historial de recorrido del taxi (Fase 10): rastro acotado y sin ruido.
TRACK_MAX_POINTS = 400            # cuántos puntos conservar por operador
TRACK_MIN_DIST_M = 8              # solo guardar punto si se movió ≥ este umbral


# ---------------------------------------------------------------------------
# Config en colección `config` (clave-valor, con cache en memoria ligera)
# ---------------------------------------------------------------------------
async def get_config(key: str, default):
    doc = await db.config.find_one({"key": key})
    return doc.get("valor", default) if doc and "valor" in doc else default


async def gps_stale_seconds() -> float:
    return float(await get_config("gps_stale_seconds", 120))


async def oferta_ttl_seconds() -> float:
    return float(await get_config("oferta_duracion_seg", 60))


def _parse_iso(iso: Optional[str]) -> Optional[datetime]:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(iso)
    except (ValueError, TypeError):
        return None


def _gps_fresco(ultima_actualizacion: Optional[str], umbral_seg: float) -> bool:
    ts = _parse_iso(ultima_actualizacion)
    if not ts:
        return False
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - ts).total_seconds() <= umbral_seg


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distancia entre dos coordenadas en kilómetros (fórmula de Haversine)."""
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def to_oid(id_str: str) -> ObjectId:
    try:
        return ObjectId(id_str)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail="ID inválido")


def serialize(doc: Optional[dict]) -> Optional[dict]:
    """Convert a Mongo document into a JSON-safe dict (never leaks ObjectId / password_hash)."""
    if doc is None:
        return None
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    doc.pop("password_hash", None)
    return doc


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_token(subject_id: str, usuario: str, scope: str = "operador") -> str:
    payload = {"sub": subject_id, "usuario": usuario, "scope": scope, "iat": datetime.now(timezone.utc)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_operador(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    token = auth[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")
    op = await db.operadores.find_one({"_id": to_oid(payload["sub"])})
    if not op or op.get("activo") is False:
        raise HTTPException(status_code=401, detail="Operador no encontrado")
    return serialize(op)


def _decode(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")
    return payload


def _exige_scope(payload: dict, scope: str, permitir_sin_scope: bool = False) -> None:
    actual = payload.get("scope")
    if actual == scope:
        return
    if permitir_sin_scope and not actual:
        return
    raise HTTPException(status_code=403, detail="No autorizado para esta operación")


async def _read_operador(payload: dict) -> dict:
    op = await db.operadores.find_one({"_id": to_oid(payload["sub"])})
    if not op or op.get("activo") is False:
        raise HTTPException(status_code=401, detail="Operador no encontrado")
    return serialize(op)


async def require_operador(request: Request) -> dict:
    """Token de operador (v2). Tokens antiguos sin scope también se aceptan."""
    payload = _decode(request)
    _exige_scope(payload, SCOPES["operador"], permitir_sin_scope=True)
    return await _read_operador(payload)


async def require_operador_estricto(request: Request) -> dict:
    """Token de operador sin fallback a tokens viejos (para acciones mutables)."""
    payload = _decode(request)
    _exige_scope(payload, SCOPES["operador"])
    return await _read_operador(payload)


async def require_terminal(request: Request) -> dict:
    payload = _decode(request)
    _exige_scope(payload, SCOPES["terminal"])
    u = await db.usuarios_terminal.find_one({"_id": to_oid(payload["sub"])})
    if not u or u.get("activo") is False:
        raise HTTPException(status_code=401, detail="Usuario de terminal no encontrado")
    return serialize(u)


async def require_pasajero(request: Request) -> dict:
    payload = _decode(request)
    _exige_scope(payload, SCOPES["pasajero"])
    c = await db.clientes.find_one({"_id": to_oid(payload["sub"])})
    if not c or c.get("activo") is False:
        raise HTTPException(status_code=401, detail="Cliente no encontrado")
    return serialize(c)


async def require_dev(request: Request) -> dict:
    payload = _decode(request)
    _exige_scope(payload, SCOPES["dev"])
    return payload


async def require_dueno(request: Request) -> dict:
    """Token de dueño de flota: ve únicamente sus vehículos/conductores/servicios
    (ownership por `vehiculos.propietario_id`, no por `sitio_id`)."""
    payload = _decode(request)
    _exige_scope(payload, SCOPES["dueno"])
    d = await db.usuarios_dueno.find_one({"_id": to_oid(payload["sub"])})
    if not d or d.get("activo") is False:
        raise HTTPException(status_code=401, detail="Cuenta de dueño no encontrada")
    return serialize(d)


async def _mismo_o_terminal(request: Request, operador_id: str):
    """Permite el operador dueño del id o la terminal (scope terminal)."""
    auth = request.headers.get("Authorization", "")
    if auth:
        try:
            payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Token inválido")
        if payload.get("scope") == "terminal":
            u = await require_terminal(request)
            u["_actor"] = "terminal"
            return u
        if payload.get("scope") in (None, "operador"):
            op = await _read_operador(payload)
            if str(op["id"]) != operador_id:
                raise HTTPException(status_code=403, detail="Solo puedes operar sobre tu propia cuenta")
            op["_actor"] = "operador"
            return op
    raise HTTPException(status_code=401, detail="No autenticado")


async def _any_autenticado(request: Request) -> dict:
    """Acepta operador o terminal (touchpoints públicos de ambas apps)."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")
    scope = payload.get("scope")
    if scope == "terminal":
        return await require_terminal(request)
    if scope in (None, "operador"):
        return await _read_operador(payload)
    raise HTTPException(status_code=403, detail="No autorizado para esta operación")


async def _any_autenticado_o_pasajero(request: Request) -> dict:
    """Igual que `_any_autenticado` pero también acepta pasajero. Uso acotado
    (routing de su propio viaje): el pasajero ya ve su posición propia y la del
    taxi asignado, así que trazar la ruta entre ellas no expone flota ajena."""
    if request.headers.get("Authorization", "").startswith("Bearer "):
        auth = request.headers.get("Authorization", "")
        try:
            payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except jwt.InvalidTokenError:
            payload = None
        try:
            if payload and payload.get("scope") == "pasajero":
                return await require_pasajero(request)
        except Exception:
            raise HTTPException(status_code=401, detail="Token inválido")
    return await _any_autenticado(request)


# ---------------------------------------------------------------------------
# Enums + Models
# ---------------------------------------------------------------------------
class EstadoOperador(str, Enum):
    # Mapeo conceptual: libre=AVAILABLE · ocupado=BUSY · no_disponible=PAUSED ·
    # fuera_de_servicio=OFFLINE · averiado=OUT_OF_SERVICE
    libre = "libre"
    ocupado = "ocupado"
    no_disponible = "no_disponible"
    fuera_de_servicio = "fuera_de_servicio"
    averiado = "averiado"


class EstadoServicio(str, Enum):
    pendiente = "pendiente"          # PENDING
    ofrecido = "ofrecido"            # OFFERED (ofertado a N conductores)
    asignado = "asignado"            # ASSIGNED (aceptado / asignación manual)
    en_curso = "en_curso"            # IN_PROGRESS
    completado = "completado"        # COMPLETED
    cancelado = "cancelado"          # CANCELLED
    vencido = "vencido"              # EXPIRED (oferta no aceptada a tiempo)
    rechazado = "rechazado"          # REJECTED (ofrecido y rechazado)


ESTADOS_ACTIVOS_SERVICIO = ["pendiente", "ofrecido", "asignado", "en_curso"]
ESTADOS_OFERTA = ["pendiente", "ofrecido"]


class Ubicacion(BaseModel):
    texto: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


# ---- Operadores ----
class OperadorCreate(BaseModel):
    nombre: str
    telefono: str
    placa: str
    ruta_asignada: Optional[str] = None
    usuario: str
    contrasena: str
    sitio_id: Optional[str] = None
    vehiculo_id: Optional[str] = None


class OperadorUpdate(BaseModel):
    nombre: Optional[str] = None
    telefono: Optional[str] = None
    placa: Optional[str] = None
    ruta_asignada: Optional[str] = None
    contrasena: Optional[str] = None
    vehiculo_id: Optional[str] = None


class EstadoUpdate(BaseModel):
    estado: EstadoOperador


class UbicacionUpdate(BaseModel):
    lat: float
    lng: float
    accuracy: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None
    battery_level: Optional[float] = None
    timestamp: Optional[str] = None


class UbicacionGPS(BaseModel):
    """Payload GPS completo (aceptado desde web o futura app Android)."""
    lat: float
    lng: float
    driver_id: Optional[str] = None
    vehicle_id: Optional[str] = None
    accuracy: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None
    timestamp: Optional[str] = None
    status: Optional[str] = None
    battery_level: Optional[float] = None


class LoginBody(BaseModel):
    usuario: str
    contrasena: str


# ---- Vehículos ----
class VehiculoCreate(BaseModel):
    numero_economico: str
    placa: Optional[str] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None
    color: Optional[str] = None
    anio: Optional[int] = None
    estado: str = "activo"
    sitio_id: Optional[str] = None
    operador_conductor_id: Optional[str] = None
    propietario_id: Optional[str] = None
    tipo_vehiculo_id: Optional[str] = None


class VehiculoUpdate(BaseModel):
    numero_economico: Optional[str] = None
    placa: Optional[str] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None
    color: Optional[str] = None
    anio: Optional[int] = None
    estado: Optional[str] = None
    activo: Optional[bool] = None
    operador_conductor_id: Optional[str] = None
    propietario_id: Optional[str] = None
    tipo_vehiculo_id: Optional[str] = None


# ---- Tipos de vehículo (catálogo, no hardcodeado) ----
class TipoVehiculoCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    capacidad: Optional[int] = None
    caracteristicas: List[str] = Field(default_factory=list)
    orden: int = 0
    activo: bool = True


class TipoVehiculoUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    capacidad: Optional[int] = None
    caracteristicas: Optional[List[str]] = None
    orden: Optional[int] = None
    activo: Optional[bool] = None


# ---- Clientes / Pasajeros ----
class ClienteCreate(BaseModel):
    nombre: str
    telefono: str
    usuario: Optional[str] = None
    contrasena: Optional[str] = None


class ClienteUpdate(BaseModel):
    nombre: Optional[str] = None
    telefono: Optional[str] = None


class ClienteLoginBody(BaseModel):
    usuario: str
    contrasena: str


# ---- Rutas ----
class RutaCreate(BaseModel):
    nombre: str
    color_hex: str = "#00b894"


class RutaUpdate(BaseModel):
    nombre: Optional[str] = None
    color_hex: Optional[str] = None


# ---- Servicios ----
class ServicioCreate(BaseModel):
    cliente_id: Optional[str] = None
    cliente_nombre: Optional[str] = None
    cliente_telefono: Optional[str] = None
    pasajero_id: Optional[str] = None
    origen: Ubicacion
    destino: Ubicacion
    operador_asignado_id: Optional[str] = None
    costo: Optional[float] = None
    tarifa_id: Optional[str] = None
    metodo_pago: str = "cash"
    tipo_vehiculo_preferido_id: Optional[str] = None


class AsignarBody(BaseModel):
    operador_id: str


class DispatchOfferBody(BaseModel):
    servicio_id: str
    num_opciones: int = 8


class CancelarBody(BaseModel):
    motivo: Optional[str] = None


class ServicioOperadorBody(BaseModel):
    origen_texto: Optional[str] = None
    destino_texto: Optional[str] = None
    costo: Optional[float] = None
    tarifa_id: Optional[str] = None


class CalificacionCreate(BaseModel):
    puntuacion: float = Field(..., ge=1, le=5)
    comentario: Optional[str] = None


class MensajeViajeCreate(BaseModel):
    texto: str


# ---- Usuarios Terminal (operadoras) ----
class TerminalUserCreate(BaseModel):
    nombre: str
    usuario: str
    contrasena: str


class TerminalLoginBody(BaseModel):
    usuario: str
    contrasena: str


# ---- Usuarios Dueño (propietarios de flota) ----
class DuenoUserCreate(BaseModel):
    nombre: str
    usuario: str
    contrasena: str


class DuenoLoginBody(BaseModel):
    usuario: str
    contrasena: str


# ---------------------------------------------------------------------------
# WebSocket connection manager
# ---------------------------------------------------------------------------
class ConnectionManager:
    def __init__(self):
        self.terminal: List[WebSocket] = []
        self.operadores: Dict[str, List[WebSocket]] = {}
        self.pasajeros: Dict[str, List[WebSocket]] = {}
        self.duenos: Dict[str, List[WebSocket]] = {}

    async def connect_terminal(self, ws: WebSocket):
        self.terminal.append(ws)

    def disconnect_terminal(self, ws: WebSocket):
        if ws in self.terminal:
            self.terminal.remove(ws)

    async def connect_operador(self, operador_id: str, ws: WebSocket):
        self.operadores.setdefault(operador_id, []).append(ws)

    def disconnect_operador(self, operador_id: str, ws: WebSocket):
        conns = self.operadores.get(operador_id, [])
        if ws in conns:
            conns.remove(ws)

    async def connect_pasajero(self, pasajero_id: str, ws: WebSocket):
        self.pasajeros.setdefault(pasajero_id, []).append(ws)

    def disconnect_pasajero(self, pasajero_id: str, ws: WebSocket):
        conns = self.pasajeros.get(pasajero_id, [])
        if ws in conns:
            conns.remove(ws)

    async def connect_dueno(self, dueno_id: str, ws: WebSocket):
        self.duenos.setdefault(dueno_id, []).append(ws)

    def disconnect_dueno(self, dueno_id: str, ws: WebSocket):
        conns = self.duenos.get(dueno_id, [])
        if ws in conns:
            conns.remove(ws)

    async def broadcast_terminal(self, message: dict):
        for ws in list(self.terminal):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect_terminal(ws)

    async def send_operador(self, operador_id: str, message: dict):
        for ws in list(self.operadores.get(operador_id, [])):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect_operador(operador_id, ws)

    async def send_pasajero(self, pasajero_id: str, message: dict):
        for ws in list(self.pasajeros.get(pasajero_id, [])):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect_pasajero(pasajero_id, ws)

    async def send_dueno(self, dueno_id: str, message: dict):
        for ws in list(self.duenos.get(dueno_id, [])):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect_dueno(dueno_id, ws)


manager = ConnectionManager()


async def _notificar_dueno_de_operador(operador_id: Optional[str], message: dict) -> None:
    """Reenvía un evento (ubicación/estado/servicio) al dueño del vehículo que
    maneja `operador_id`, si ese vehículo tiene propietario asignado."""
    if not operador_id:
        return
    v = await db.vehiculos.find_one({"operador_conductor_id": operador_id}, {"propietario_id": 1})
    if v and v.get("propietario_id"):
        await manager.send_dueno(v["propietario_id"], message)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@api_router.post("/auth/login")
async def login(body: LoginBody):
    op = await db.operadores.find_one({"usuario": body.usuario})
    if not op or not verify_password(body.contrasena, op.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    if op.get("activo") is False:
        raise HTTPException(status_code=403, detail="Cuenta desactivada")
    token = create_token(str(op["_id"]), op["usuario"], scope="operador")
    return {"token": token, "operador": serialize(op)}


@api_router.get("/auth/me")
async def me(current: dict = Depends(get_current_operador)):
    vid = current.get("vehiculo_id")
    if vid:
        try:
            v = await db.vehiculos.find_one({"_id": to_oid(vid)})
            if v:
                current["vehiculo"] = _vehiculo_resumen(v, await _mapa_tipos_vehiculo())
        except HTTPException:
            pass
    return current


# ---- Pasajeros (reutiliza la colección `clientes`) ----
@api_router.post("/clientes/login")
async def cliente_login(body: ClienteLoginBody):
    c = await db.clientes.find_one({"usuario": body.usuario})
    if not c or not verify_password(body.contrasena, c.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    if c.get("activo") is False:
        raise HTTPException(status_code=403, detail="Cuenta desactivada")
    token = create_token(str(c["_id"]), body.usuario, scope="pasajero")
    return {"token": token, "cliente": serialize(c)}


def create_terminal_token(user_id: str, usuario: str) -> str:
    payload = {"sub": user_id, "usuario": usuario, "scope": "terminal", "iat": datetime.now(timezone.utc)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


@api_router.post("/terminal/usuarios")
async def crear_usuario_terminal(body: TerminalUserCreate):
    if await db.usuarios_terminal.find_one({"usuario": body.usuario}):
        raise HTTPException(status_code=409, detail="El usuario ya existe")
    doc = {"nombre": body.nombre, "usuario": body.usuario, "password_hash": hash_password(body.contrasena)}
    res = await db.usuarios_terminal.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api_router.get("/terminal/usuarios")
async def list_usuarios_terminal():
    docs = await db.usuarios_terminal.find().to_list(1000)
    return [serialize(d) for d in docs]


@api_router.post("/terminal/login")
async def terminal_login(body: TerminalLoginBody):
    u = await db.usuarios_terminal.find_one({"usuario": body.usuario})
    if not u or not verify_password(body.contrasena, u.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    if u.get("activo") is False:
        raise HTTPException(status_code=403, detail="Cuenta desactivada")
    token = create_terminal_token(str(u["_id"]), u["usuario"])
    return {"token": token, "usuario": serialize(u)}


# ---- Dueños de flota ----
def create_dueno_token(user_id: str, usuario: str) -> str:
    payload = {"sub": user_id, "usuario": usuario, "scope": "dueno", "iat": datetime.now(timezone.utc)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


@api_router.post("/dueno/usuarios")
async def crear_usuario_dueno(body: DuenoUserCreate, _=Depends(require_terminal)):
    """Solo la central da de alta cuentas de dueño (sin registro público)."""
    if await db.usuarios_dueno.find_one({"usuario": body.usuario}):
        raise HTTPException(status_code=409, detail="El usuario ya existe")
    doc = {
        "nombre": body.nombre, "usuario": body.usuario,
        "password_hash": hash_password(body.contrasena),
        "activo": True, "creado": now_iso(),
    }
    res = await db.usuarios_dueno.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api_router.get("/dueno/usuarios")
async def list_usuarios_dueno(_=Depends(require_terminal)):
    docs = await db.usuarios_dueno.find().to_list(1000)
    return [serialize(d) for d in docs]


@api_router.post("/dueno/login")
async def dueno_login(body: DuenoLoginBody):
    d = await db.usuarios_dueno.find_one({"usuario": body.usuario})
    if not d or not verify_password(body.contrasena, d.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    if d.get("activo") is False:
        raise HTTPException(status_code=403, detail="Cuenta desactivada")
    token = create_dueno_token(str(d["_id"]), d["usuario"])
    return {"token": token, "usuario": serialize(d)}


# ---------------------------------------------------------------------------
# Helpers de dominio (vehículos, servicio, transiciones, despacho)
# ---------------------------------------------------------------------------
VALORES_ESTADO_OPERADOR = {e.value for e in EstadoOperador}


async def _tipo_vehiculo_default_id() -> Optional[str]:
    """Id de "Taxi estándar" — todo vehículo nuevo sin tipo explícito cae aquí,
    para que SIEMPRE tenga una representación visual (nunca "Taxi #12" a secas)."""
    t = await db.tipos_vehiculo.find_one({"nombre": "Taxi estándar"})
    return str(t["_id"]) if t else None


async def _mapa_tipos_vehiculo() -> Dict[str, dict]:
    """Catálogo completo de tipos de vehículo, indexado por id. Colección pequeña
    (decenas de filas como mucho): cargarla entera evita N+1 al enriquecer vehículos."""
    docs = await db.tipos_vehiculo.find().to_list(500)
    return {str(d["_id"]): serialize(d) for d in docs}


def _imagen_resuelta_vehiculo(v: Optional[dict], tipos: Dict[str, dict]) -> Optional[str]:
    """Prioridad de imagen: foto propia del vehículo → imagen del VehicleType → None
    (el frontend aplica el último fallback genérico si esto es None)."""
    if not v:
        return None
    if v.get("foto_url"):
        return v["foto_url"]
    tipo = tipos.get(v.get("tipo_vehiculo_id"))
    return tipo.get("imagen_url") if tipo else None


def _enriquecer_vehiculo(v: dict, tipos: Dict[str, dict]) -> dict:
    """Añade `tipo_vehiculo` (objeto embebido) e `imagen_resuelta` a un vehículo YA
    serializado (con `foto_url`/`tipo_vehiculo_id` presentes)."""
    tipo = tipos.get(v.get("tipo_vehiculo_id"))
    v["tipo_vehiculo"] = tipo
    v["imagen_resuelta"] = v.get("foto_url") or (tipo.get("imagen_url") if tipo else None)
    return v


def _vehiculo_resumen(v: Optional[dict], tipos: Optional[Dict[str, dict]] = None) -> Optional[dict]:
    if not v:
        return None
    tipos = tipos or {}
    tipo = tipos.get(v.get("tipo_vehiculo_id"))
    return {
        "numero_economico": v.get("numero_economico"),
        "placa": v.get("placa"),
        "marca": v.get("marca"),
        "modelo": v.get("modelo"),
        "color": v.get("color"),
        "tipo_vehiculo": {"nombre": tipo.get("nombre"), "imagen_url": tipo.get("imagen_url")} if tipo else None,
        "imagen_resuelta": _imagen_resuelta_vehiculo(v, tipos),
    }


async def _enriquecer_operadores_con_vehiculos(ops: List[dict]) -> List[dict]:
    veh_ids = {o.get("vehiculo_id") for o in ops if o.get("vehiculo_id")}
    veh_map: Dict[str, dict] = {}
    if veh_ids:
        try:
            docs = await db.vehiculos.find({"_id": {"$in": [to_oid(x) for x in veh_ids]}}).to_list(1000)
            veh_map = {str(v["_id"]): v for v in docs}
        except HTTPException:
            pass
    tipos = await _mapa_tipos_vehiculo() if veh_map else {}
    out = []
    for o in ops:
        o = dict(o)
        v = veh_map.get(o.get("vehiculo_id"))
        if v:
            o["vehiculo"] = _vehiculo_resumen(v, tipos)
        out.append(o)
    return out


async def _tiene_servicio_activo(operador_id: str) -> bool:
    count = await db.servicios.count_documents(
        {"operador_asignado_id": operador_id, "estado": {"$in": ESTADOS_ACTIVOS_SERVICIO}}
    )
    return count > 0


async def _validar_transicion_estado(operador_id: str, prev: str, nuevo: str) -> None:
    """Máquina de estados del conductor (el backend es la fuente de verdad).

    Se conserva el control manual actual (modelo de radio ambulante), pero se
    impide transiciones inválidas: un conductor con servicio activo no puede
    soltarlo desde la UI, y un vehículo averiado no puede quedar libre/ocupado.
    """
    if prev == nuevo:
        return
    if nuevo not in VALORES_ESTADO_OPERADOR:
        raise HTTPException(status_code=400, detail="Estado desconocido")
    if nuevo in ("libre", "no_disponible", "averiado", "fuera_de_servicio"):
        if await _tiene_servicio_activo(operador_id):
            raise HTTPException(
                status_code=409,
                detail="No puedes cambiar de estado con un servicio en curso; terminalo antes",
            )
    if prev == "averiado" and nuevo in ("ocupado", "libre"):
        raise HTTPException(status_code=409, detail="Un vehículo averiado no puede tomar servicio")


async def _servicio_para_pasajero(s: dict) -> dict:
    """Vista reducida: el pasajero SOLO ve su propio servicio y el taxi asignado."""
    out = {
        "id": str(s["_id"]),
        "estado": s.get("estado"),
        "costo": s.get("costo"),
        "metodo_pago": s.get("metodo_pago", "cash"),
        "origen": s.get("origen"),
        "destino": s.get("destino"),
        "timestamp_creacion": s.get("timestamp_creacion"),
    }
    if s.get("estado") in ("asignado", "en_curso", "completado"):
        oid = s.get("operador_asignado_id")
        if oid:
            try:
                op = await db.operadores.find_one({"_id": to_oid(oid)})
            except HTTPException:
                op = None
            if op:
                out["taxi"] = {
                    "lat": op.get("lat"), "lng": op.get("lng"),
                    "numero_economico": op.get("placa"), "nombre_conductor": op.get("nombre"),
                    "telefono": op.get("telefono"),
                    "foto_url": op.get("foto_url"),
                    "ultima_actualizacion": op.get("ultima_actualizacion"),
                }
                ratings = await db.servicios.find(
                    {"operador_asignado_id": str(op["_id"]), "estado": "completado", "calificacion_conductor.puntuacion": {"$exists": True}},
                    {"calificacion_conductor.puntuacion": 1},
                ).to_list(500)
                values = [float(item["calificacion_conductor"]["puntuacion"]) for item in ratings]
                out["taxi"]["calificacion_promedio"] = round(sum(values) / len(values), 1) if values else None
                out["taxi"]["total_calificaciones"] = len(values)
                vid = op.get("vehiculo_id")
                v = await db.vehiculos.find_one({"_id": to_oid(vid)}) if vid else None
                if v:
                    out["taxi"]["vehiculo"] = _vehiculo_resumen(v, await _mapa_tipos_vehiculo())
    return out


async def _notificar_servicio(s: dict):
    """Empuja el servicio a terminal, al conductor asignado, al dueño del
    vehículo (si tiene) y —solo si es suyo— al pasajero dueño del servicio
    (privacidad GPS obligatoria en backend)."""
    ser = serialize(s)
    await manager.broadcast_terminal({"type": "servicio", "servicio": ser})
    oid = s.get("operador_asignado_id")
    estado = s.get("estado")
    if estado == "ofrecido":
        # Sin operador_asignado_id todavía: se ofrece a cada candidato en ofrecido_a.
        for op_id in s.get("ofrecido_a", []) or []:
            await manager.send_operador(op_id, {"type": "nuevo_servicio", "servicio": ser})
    elif oid and estado in ("asignado", "en_curso"):
        await manager.send_operador(oid, {"type": "nuevo_servicio", "servicio": ser})
    await _notificar_dueno_de_operador(oid, {"type": "servicio", "servicio": ser})
    pid = s.get("pasajero_id")
    if pid and s.get("estado") in ("asignado", "en_curso", "completado", "cancelado"):
        await manager.send_pasajero(pid, {"type": "servicio", "servicio": await _servicio_para_pasajero(s)})


async def _expirar_ofertas_vencidas() -> int:
    """Marca como `vencido` las ofertas cuyo expira_en ya pasó (sin job de fondo)."""
    ahora = datetime.now(timezone.utc)
    docs = await db.servicios.find({"estado": "ofrecido", "expira_en": {"$exists": True}}).to_list(500)
    n = 0
    for s in docs:
        exp = _parse_iso(s.get("expira_en"))
        if exp and (exp.replace(tzinfo=timezone.utc) if exp.tzinfo is None else exp) < ahora:
            await db.servicios.update_one({"_id": s["_id"]}, {"$set": {"estado": "vencido", "ts_vencido": now_iso()}})
            n += 1
    return n


# ---------------------------------------------------------------------------
# Operadores CRUD
# ---------------------------------------------------------------------------
@api_router.post("/operadores")
async def create_operador(body: OperadorCreate, current=Depends(require_terminal)):
    if await db.operadores.find_one({"usuario": body.usuario}):
        raise HTTPException(status_code=409, detail="El usuario ya existe")
    if body.vehiculo_id:
        if not await db.vehiculos.find_one({"_id": to_oid(body.vehiculo_id)}):
            raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    doc = {
        "nombre": body.nombre,
        "telefono": body.telefono,
        "placa": body.placa,
        "ruta_asignada": body.ruta_asignada,
        "vehiculo_id": body.vehiculo_id,
        "sitio_id": body.sitio_id or DEFAULT_SITIO,
        "estado": EstadoOperador.fuera_de_servicio.value,
        "lat": None,
        "lng": None,
        "ultima_actualizacion": None,
        "usuario": body.usuario,
        "password_hash": hash_password(body.contrasena),
        "activo": True,
    }
    res = await db.operadores.insert_one(doc)
    op_id = str(res.inserted_id)
    if body.vehiculo_id:
        await db.vehiculos.update_one({"_id": to_oid(body.vehiculo_id)},
                                      {"$set": {"operador_conductor_id": op_id}})
    doc["_id"] = res.inserted_id
    logger.info("operador creado id=%s usuario=%s", op_id, body.usuario)
    return serialize(doc)


@api_router.get("/operadores")
async def list_operadores(_=Depends(require_terminal)):
    docs = await db.operadores.find().to_list(1000)
    return await _enriquecer_operadores_con_vehiculos([serialize(d) for d in docs])


@api_router.get("/operadores/activos")
async def list_operadores_activos(_=Depends(require_terminal)):
    """Operadores en operación (todo menos fuera_de_servicio) con estado y ubicación, para el mapa."""
    docs = await db.operadores.find(
        {"estado": {"$ne": EstadoOperador.fuera_de_servicio.value}}
    ).to_list(1000)
    return await _enriquecer_operadores_con_vehiculos([serialize(d) for d in docs])


@api_router.get("/operadores/me")
async def get_operador_me(current: dict = Depends(require_operador)):
    op = await db.operadores.find_one({"_id": to_oid(current["id"])})
    return serialize(op)


@api_router.get("/operadores/{operador_id}")
async def get_operador(operador_id: str, request: Request):
    await _mismo_o_terminal(request, operador_id)
    op = await db.operadores.find_one({"_id": to_oid(operador_id)})
    if not op:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    return serialize(op)


@api_router.put("/operadores/{operador_id}")
async def update_operador(operador_id: str, body: OperadorUpdate, request: Request):
    actor = await _mismo_o_terminal(request, operador_id)
    es_terminal = actor.get("_actor") == "terminal"
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items() if k != "contrasena"}
    if body.contrasena:
        updates["password_hash"] = hash_password(body.contrasena)
    # Un operador solo puede actualizar su ruta y asignación de vehículo.
    if not es_terminal:
        updates = {k: updates[k] for k in ("ruta_asignada", "vehiculo_id") if k in updates}
    if not updates:
        raise HTTPException(status_code=400, detail="Nada que actualizar")
    res = await db.operadores.update_one({"_id": to_oid(operador_id)}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    if "vehiculo_id" in updates:
        # Libera el vehículo anterior y asigna el nuevo si procede
        await db.vehiculos.update_many(
            {"operador_conductor_id": operador_id}, {"$set": {"operador_conductor_id": None}}
        )
        if updates["vehiculo_id"]:
            try:
                await db.vehiculos.update_one({"_id": to_oid(updates["vehiculo_id"])},
                                              {"$set": {"operador_conductor_id": operador_id}})
            except HTTPException:
                pass
    op = await db.operadores.find_one({"_id": to_oid(operador_id)})
    out = serialize(op)
    out.pop("_actor", None)
    return out


@api_router.delete("/operadores/{operador_id}")
async def delete_operador(operador_id: str, _=Depends(require_terminal)):
    res = await db.operadores.delete_one({"_id": to_oid(operador_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    return {"ok": True}


@api_router.patch("/operadores/{operador_id}/estado")
async def update_estado(operador_id: str, body: EstadoUpdate, request: Request):
    await _mismo_o_terminal(request, operador_id)
    ts = now_iso()
    prev = await db.operadores.find_one({"_id": to_oid(operador_id)})
    if not prev:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    nuevo = body.estado.value
    await _validar_transicion_estado(operador_id, prev.get("estado") or "fuera_de_servicio", nuevo)
    updates = {"estado": nuevo, "ultima_actualizacion": ts}
    if nuevo == "fuera_de_servicio":
        updates["inicio_operacion"] = None
    elif prev.get("estado") == "fuera_de_servicio":
        updates["inicio_operacion"] = ts
    await db.operadores.update_one({"_id": to_oid(operador_id)}, {"$set": updates})
    logger.info("estado operador id=%s %s -> %s", operador_id, prev.get("estado"), nuevo)
    msg = {"type": "estado", "operador_id": operador_id, "estado": nuevo, "ts": ts}
    await manager.broadcast_terminal(msg)
    await _notificar_dueno_de_operador(operador_id, msg)
    return {"ok": True, "estado": nuevo}


async def _track_puntual(operador_id: str, lat: float, lng: float, ts: str, set_fields: dict) -> None:
    """Historial de recorrido (Fase 10): guarda [lat,lng,ts] en un array acotado
    del operador (`track`), solo si el vehículo se movió ≥ umbral (sin ruido).
    El track SOLO se expone a la terminal (scope terminal), nunca a pasajeros."""
    op = await db.operadores.find_one({"_id": to_oid(operador_id)}, {"track": 1})
    track = op.get("track") or []
    update = {"$set": set_fields}
    if track and haversine_km(track[-1][0], track[-1][1], lat, lng) * 1000 < TRACK_MIN_DIST_M:
        await db.operadores.update_one({"_id": to_oid(operador_id)}, update)
        return
    update["$push"] = {"track": {"$each": [[lat, lng, ts]], "$slice": -TRACK_MAX_POINTS}}
    await db.operadores.update_one({"_id": to_oid(operador_id)}, update)


async def _actualizar_ubicacion(operador_id: str, lat: float, lng: float,
                                accuracy=None, speed=None, heading=None, battery=None,
                                client_ts: Optional[str] = None) -> dict:
    ts = now_iso()
    set_fields = {"lat": lat, "lng": lng, "ultima_actualizacion": ts}
    if accuracy is not None:
        set_fields["gps_accuracy"] = accuracy
    if speed is not None:
        set_fields["gps_speed"] = speed
    if heading is not None:
        set_fields["gps_heading"] = heading
    if battery is not None:
        set_fields["gps_battery"] = battery
    if client_ts is not None:
        set_fields["gps_ts_cliente"] = client_ts
    await _track_puntual(operador_id, lat, lng, ts, set_fields)
    op = await db.operadores.find_one({"_id": to_oid(operador_id)})
    if op and op.get("vehiculo_id"):
        try:
            await db.vehiculos.update_one({"_id": to_oid(op["vehiculo_id"])},
                                          {"$set": {"lat": lat, "lng": lng, "ultima_actualizacion": ts}})
        except HTTPException:
            pass
    logger.info("ubicación recibida operador=%s lat=%s lng=%s sn=%s",
                operador_id, lat, lng, ts)
    ubi_msg = {"type": "ubicacion", "operador_id": operador_id, "lat": lat, "lng": lng, "ts": ts}
    await manager.broadcast_terminal(ubi_msg)
    await _notificar_dueno_de_operador(operador_id, ubi_msg)
    # Privacidad: solo se reenvía al pasajero dueño de un servicio activo del
    # conductor en cuestión, nunca al resto de la flotilla.
    activo = await db.servicios.find_one({
        "operador_asignado_id": operador_id,
        "pasajero_id": {"$exists": True, "$ne": None},
        "estado": {"$in": ["asignado", "en_curso"]},
    })
    if activo:
        await manager.send_pasajero(activo["pasajero_id"], {
            "type": "ubicacion",
            "servicio_id": str(activo["_id"]),
            "lat": lat,
            "lng": lng,
            "ts": ts,
        })
    return {"ok": True}


@api_router.post("/operadores/{operador_id}/ubicacion")
async def update_ubicacion(operador_id: str, body: UbicacionUpdate, request: Request):
    """Compatible con la app web actual; delega al pipeline GPS moderno."""
    await _mismo_o_terminal(request, operador_id)
    return await _actualizar_ubicacion(operador_id, body.lat, body.lng,
                                       body.accuracy, body.speed, body.heading,
                                       body.battery_level, body.timestamp)


@api_router.get("/operadores/{operador_id}/track")
async def get_track(operador_id: str, limite: int = Query(TRACK_MAX_POINTS, ge=2, le=2000),
                    _=Depends(require_terminal)):
    """Historial de recorrido de un taxi (Fase 10). Solo la terminal lo ve;
    el pasajero nunca accede al rastro de la flota (privacidad GPS)."""
    op = await db.operadores.find_one({"_id": to_oid(operador_id)})
    if not op:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    track = (op.get("track") or [])[-limite:]
    return {
        "operador_id": operador_id,
        "track": [{"lat": p[0], "lng": p[1], "ts": p[2]} for p in track],
    }


# ---------------------------------------------------------------------------
# Ubicaciones GPS (pipeline profesional, acepta web y app móvil)
# ---------------------------------------------------------------------------
@api_router.post("/locations")
async def ingest_ubicacion(body: UbicacionGPS, current: dict = Depends(require_operador)):
    if body.driver_id and body.driver_id != current["id"]:
        raise HTTPException(status_code=403, detail="No puedes enviar ubicación de otro conductor")
    driver_id = body.driver_id or current["id"]
    return await _actualizar_ubicacion(driver_id, body.lat, body.lng,
                                       body.accuracy, body.speed, body.heading,
                                       body.battery_level, body.timestamp)


# ---------------------------------------------------------------------------
# Clientes CRUD (y cuentas de pasajero)
# ---------------------------------------------------------------------------
@api_router.post("/clientes")
async def create_cliente(body: ClienteCreate, request: Request):
    """Registro de cliente: por la Terminal (sin credenciales) o cuenta de
    pasajero (registro público con usuario+contraseña para la app móvil)."""
    sitio_id = DEFAULT_SITIO
    # Un pasajero puede registrarse públicamente (sin token).
    if not body.usuario and not body.contrasena:
        await require_terminal(request)
        if await db.clientes.find_one({"telefono": body.telefono}):
            raise HTTPException(status_code=409, detail="Ya existe un cliente con ese teléfono")
        doc = {"nombre": body.nombre, "telefono": body.telefono,
               "creado": now_iso(), "sitio_id": sitio_id}
        res = await db.clientes.insert_one(doc)
        doc["_id"] = res.inserted_id
        return serialize(doc)
    if not body.usuario or not body.contrasena:
        raise HTTPException(status_code=400, detail="usuario y contrasena son obligatorios al crear una cuenta")
    if await db.clientes.find_one({"usuario": body.usuario}):
        raise HTTPException(status_code=409, detail="El usuario ya existe")
    doc = {
        "nombre": body.nombre, "telefono": body.telefono,
        "usuario": body.usuario, "password_hash": hash_password(body.contrasena),
        "activo": True, "creado": now_iso(), "sitio_id": sitio_id,
    }
    res = await db.clientes.insert_one(doc)
    doc["_id"] = res.inserted_id
    token = create_token(str(res.inserted_id), body.usuario, scope="pasajero")
    logger.info("cliente/pasajero registrado id=%s usuario=%s", res.inserted_id, body.usuario)
    return {"cliente": serialize(doc), "token": token}


@api_router.get("/clientes")
async def list_clientes(_=Depends(require_terminal)):
    docs = await db.clientes.find().to_list(1000)
    return [serialize(d) for d in docs]


# ---- Endpoints de pasajero (app móvil futura) ----
@api_router.get("/clientes/me")
async def pasajero_me(current: dict = Depends(require_pasajero)):
    return current


@api_router.get("/clientes/me/servicios")
async def pasajero_mis_servicios(current: dict = Depends(require_pasajero)):
    docs = await db.servicios.find(
        {"pasajero_id": current["id"]}).sort("timestamp_creacion", -1).to_list(200)
    return [serialize(d) for d in docs]


@api_router.get("/clientes/me/viaje-activo")
async def pasajero_viaje_activo(current: dict = Depends(require_pasajero)):
    """Devuelve SOLO el servicio activo del pasajero + taxi asignado (privacidad)."""
    s = await db.servicios.find_one({
        "pasajero_id": current["id"],
        "estado": {"$in": ESTADOS_ACTIVOS_SERVICIO},
    }, sort=[("timestamp_creacion", -1)])
    if not s:
        return {"servicio": None}
    return {"servicio": await _servicio_para_pasajero(s)}


@api_router.get("/clientes/{cliente_id}")
async def get_cliente(cliente_id: str, _=Depends(require_terminal)):
    c = await db.clientes.find_one({"_id": to_oid(cliente_id)})
    if not c:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    out = serialize(c)
    servicios = await db.servicios.find({"cliente_id": cliente_id}).to_list(1000)
    out["historial_servicios"] = [serialize(s) for s in servicios]
    return out


@api_router.put("/clientes/{cliente_id}")
async def update_cliente(cliente_id: str, body: ClienteUpdate, _=Depends(require_terminal)):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nada que actualizar")
    res = await db.clientes.update_one({"_id": to_oid(cliente_id)}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return serialize(await db.clientes.find_one({"_id": to_oid(cliente_id)}))


@api_router.delete("/clientes/{cliente_id}")
async def delete_cliente(cliente_id: str, _=Depends(require_terminal)):
    res = await db.clientes.delete_one({"_id": to_oid(cliente_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Tipos de vehículo (catálogo visual — VehicleType)
#
# Nunca hardcodear un `if tipo == "sedan" -> sedan.png` en el código: la
# imagen vive en este catálogo y el vehículo solo referencia su id. Lectura
# pública (catálogo sin datos sensibles, lo consumen las 5 superficies);
# escritura reservada a `require_terminal`.
# ---------------------------------------------------------------------------
@api_router.post("/tipos-vehiculo")
async def create_tipo_vehiculo(body: TipoVehiculoCreate, _=Depends(require_terminal)):
    doc = {
        "nombre": body.nombre,
        "descripcion": body.descripcion,
        "capacidad": body.capacidad,
        "caracteristicas": body.caracteristicas,
        "orden": body.orden,
        "activo": body.activo,
        "imagen_url": None,
    }
    res = await db.tipos_vehiculo.insert_one(doc)
    doc["_id"] = res.inserted_id
    logger.info("tipo de vehículo creado id=%s nombre=%s", res.inserted_id, body.nombre)
    return serialize(doc)


@api_router.get("/tipos-vehiculo")
async def list_tipos_vehiculo():
    docs = await db.tipos_vehiculo.find().sort("orden", 1).to_list(500)
    return [serialize(d) for d in docs]


@api_router.get("/tipos-vehiculo/{tipo_id}")
async def get_tipo_vehiculo(tipo_id: str):
    t = await db.tipos_vehiculo.find_one({"_id": to_oid(tipo_id)})
    if not t:
        raise HTTPException(status_code=404, detail="Tipo de vehículo no encontrado")
    return serialize(t)


@api_router.put("/tipos-vehiculo/{tipo_id}")
async def update_tipo_vehiculo(tipo_id: str, body: TipoVehiculoUpdate, _=Depends(require_terminal)):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nada que actualizar")
    res = await db.tipos_vehiculo.update_one({"_id": to_oid(tipo_id)}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tipo de vehículo no encontrado")
    return serialize(await db.tipos_vehiculo.find_one({"_id": to_oid(tipo_id)}))


@api_router.delete("/tipos-vehiculo/{tipo_id}")
async def delete_tipo_vehiculo(tipo_id: str, _=Depends(require_terminal)):
    en_uso = await db.vehiculos.count_documents({"tipo_vehiculo_id": tipo_id})
    if en_uso > 0:
        raise HTTPException(status_code=409, detail=f"{en_uso} vehículo(s) usan este tipo; desactívalo en vez de eliminarlo")
    res = await db.tipos_vehiculo.delete_one({"_id": to_oid(tipo_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tipo de vehículo no encontrado")
    return {"ok": True}


@api_router.post("/tipos-vehiculo/{tipo_id}/imagen")
async def subir_imagen_tipo_vehiculo(tipo_id: str, foto: UploadFile = File(...), _=Depends(require_terminal)):
    if not await db.tipos_vehiculo.find_one({"_id": to_oid(tipo_id)}):
        raise HTTPException(status_code=404, detail="Tipo de vehículo no encontrado")
    url = await _guardar_imagen_vehiculo(foto, "tipos-vehiculo")
    await db.tipos_vehiculo.update_one({"_id": to_oid(tipo_id)}, {"$set": {"imagen_url": url}})
    return {"imagen_url": url}


# ---------------------------------------------------------------------------
# Vehículos (flota del sitio)
# ---------------------------------------------------------------------------
@api_router.post("/vehiculos")
async def create_vehiculo(body: VehiculoCreate, _=Depends(require_terminal)):
    if await db.vehiculos.find_one({"numero_economico": body.numero_economico}):
        raise HTTPException(status_code=409, detail="Ya existe un vehículo con ese número económico")
    doc = {
        "numero_economico": body.numero_economico,
        "placa": body.placa,
        "marca": body.marca,
        "modelo": body.modelo,
        "color": body.color,
        "anio": body.anio,
        "estado": body.estado,
        "activo": body.estado != "inactivo",
        "sitio_id": body.sitio_id or DEFAULT_SITIO,
        "operador_conductor_id": body.operador_conductor_id,
        "propietario_id": body.propietario_id,
        "tipo_vehiculo_id": body.tipo_vehiculo_id or await _tipo_vehiculo_default_id(),
        "foto_url": None,
        "lat": None, "lng": None, "ultima_actualizacion": None,
    }
    res = await db.vehiculos.insert_one(doc)
    doc["_id"] = res.inserted_id
    if body.operador_conductor_id:
        await db.operadores.update_one(
            {"_id": to_oid(body.operador_conductor_id)},
            {"$set": {"vehiculo_id": str(res.inserted_id)}},
        )
    logger.info("vehículo creado id=%s numero_economico=%s", res.inserted_id, body.numero_economico)
    tipos = await _mapa_tipos_vehiculo()
    return _enriquecer_vehiculo(serialize(doc), tipos)


@api_router.get("/vehiculos")
async def list_vehiculos(_=Depends(require_terminal)):
    docs = await db.vehiculos.find().to_list(1000)
    ops = {str(o["_id"]): o for o in await db.operadores.find().to_list(1000)}
    tipos = await _mapa_tipos_vehiculo()
    out = []
    for d in docs:
        v = _enriquecer_vehiculo(serialize(d), tipos)
        op = ops.get(v.get("operador_conductor_id"))
        v["conductor_nombre"] = op["nombre"] if op else None
        out.append(v)
    return out


@api_router.get("/vehiculos/{vehiculo_id}")
async def get_vehiculo(vehiculo_id: str, _=Depends(require_terminal)):
    v = await db.vehiculos.find_one({"_id": to_oid(vehiculo_id)})
    if not v:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    return _enriquecer_vehiculo(serialize(v), await _mapa_tipos_vehiculo())


@api_router.post("/vehiculos/{vehiculo_id}/foto")
async def subir_foto_vehiculo(vehiculo_id: str, foto: UploadFile = File(...), _=Depends(require_terminal)):
    if not await db.vehiculos.find_one({"_id": to_oid(vehiculo_id)}):
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    url = await _guardar_imagen_vehiculo(foto, "vehiculos")
    await db.vehiculos.update_one({"_id": to_oid(vehiculo_id)}, {"$set": {"foto_url": url}})
    return {"foto_url": url}


@api_router.put("/vehiculos/{vehiculo_id}")
async def update_vehiculo(vehiculo_id: str, body: VehiculoUpdate, _=Depends(require_terminal)):
    updates = body.model_dump(exclude_none=True)
    if "activo" in updates and not updates["activo"]:
        updates["estado"] = "inactivo"
    if body.estado:
        updates["activo"] = body.estado != "inactivo"
    if not updates:
        raise HTTPException(status_code=400, detail="Nada que actualizar")
    prev = await db.vehiculos.find_one({"_id": to_oid(vehiculo_id)})
    if not prev:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    # Sincroniza el conductor asignado
    if "operador_conductor_id" in updates and updates["operador_conductor_id"] != prev.get("operador_conductor_id"):
        if prev.get("operador_conductor_id"):
            await db.operadores.update_one(
                {"_id": to_oid(prev["operador_conductor_id"]), "vehiculo_id": vehiculo_id},
                {"$unset": {"vehiculo_id": ""}},
            )
        nuevo = updates["operador_conductor_id"]
        if nuevo:
            await db.operadores.update_one(
                {"_id": to_oid(nuevo)}, {"$set": {"vehiculo_id": vehiculo_id}}
            )
    await db.vehiculos.update_one({"_id": to_oid(vehiculo_id)}, {"$set": updates})
    v = serialize(await db.vehiculos.find_one({"_id": to_oid(vehiculo_id)}))
    return _enriquecer_vehiculo(v, await _mapa_tipos_vehiculo())


@api_router.delete("/vehiculos/{vehiculo_id}")
async def delete_vehiculo(vehiculo_id: str, _=Depends(require_terminal)):
    v = await db.vehiculos.find_one({"_id": to_oid(vehiculo_id)})
    if not v:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    if v.get("operador_conductor_id"):
        await db.operadores.update_one(
            {"_id": to_oid(v["operador_conductor_id"]), "vehiculo_id": vehiculo_id},
            {"$unset": {"vehiculo_id": ""}},
        )
    await db.vehiculos.delete_one({"_id": to_oid(vehiculo_id)})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Despacho (primera versión: candidatos por proximidad + GPS fresco)
# ---------------------------------------------------------------------------
async def _buscar_candidatos(lat: float, lng: float, num: int = 8,
                             sitio_id: Optional[str] = None, solo_libres: bool = True) -> List[dict]:
    """Taxis disponibles para un servicio: AVAILABLE, vehículo activo, GPS fresco,
    ordenados por distancia (Haversine) al origen."""
    await _expirar_ofertas_vencidas()
    umbral = await gps_stale_seconds()
    base = {"estado": EstadoOperador.libre.value} if solo_libres else {}
    query = {**base, "activo": {"$ne": False}}
    if sitio_id:
        query["sitio_id"] = sitio_id
    docs = await db.operadores.find(query).to_list(1000)
    tipos = await _mapa_tipos_vehiculo()
    ops = []
    for op in docs:
        if op.get("lat") is None or op.get("lng") is None:
            continue
        if not _gps_fresco(op.get("ultima_actualizacion"), umbral):
            continue
        if await _tiene_servicio_activo(str(op["_id"])):
            continue
        vid = op.get("vehiculo_id")
        v = None
        if vid:
            try:
                v = await db.vehiculos.find_one({"_id": to_oid(vid)})
            except HTTPException:
                v = None
            if v and v.get("activo") is False:
                continue
        dist = haversine_km(lat, lng, op["lat"], op["lng"])
        cand = serialize(op)
        cand["distancia_km"] = round(dist, 3)
        cand["distancia_m"] = round(dist * 1000)
        if v:
            cand["vehiculo"] = _vehiculo_resumen(v, tipos)
        ops.append(cand)
    ops.sort(key=lambda x: x["distancia_km"])
    return ops[:num]


@api_router.get("/dispatch/candidates")
async def dispatch_candidates(lat: float, lng: float,
                              num: int = Query(8, ge=1, le=50),
                              sitio_id: Optional[str] = None,
                              _=Depends(require_terminal)):
    """Lista los taxis más cercanos al punto dado (para el mapa del dispatcher)."""
    return await _buscar_candidatos(lat, lng, num, sitio_id)


@api_router.post("/dispatch/offer")
async def dispatch_offer(body: DispatchOfferBody, _=Depends(require_terminal)):
    """Ofrece un servicio pendiente a los N taxis más cercanos (estado `ofrecido`)."""
    s = await db.servicios.find_one({"_id": to_oid(body.servicio_id)})
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    if s.get("estado") != EstadoServicio.pendiente.value:
        raise HTTPException(status_code=409, detail="El servicio no está pendiente de despacho")
    origen = s.get("origen") or {}
    lat, lng = origen.get("lat"), origen.get("lng")
    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="El servicio no tiene coordenadas de origen")
    candidatos = await _buscar_candidatos(lat, lng, body.num_opciones, s.get("sitio_id"))
    if not candidatos:
        raise HTTPException(status_code=409, detail="No hay taxis disponibles en este momento")
    ids = [c["id"] for c in candidatos]
    ttl = await oferta_ttl_seconds()
    expira = (datetime.now(timezone.utc) + timedelta(seconds=ttl)).isoformat()
    await db.servicios.update_one(
        {"_id": to_oid(body.servicio_id)},
        {"$set": {
            "estado": EstadoServicio.ofrecido.value,
            "ofrecido_a": ids,
            "expira_en": expira,
            "rechazados": [],
        }},
    )
    logger.info("despacho: servicio %s ofrecido a %s taxis", body.servicio_id, len(ids))
    s = await db.servicios.find_one({"_id": to_oid(body.servicio_id)})
    await _notificar_servicio(s)
    return {"servicio": serialize(s), "candidatos": candidatos}


# ---------------------------------------------------------------------------
# Routing (rutas sobre calles + ETA) — Fase 9E
# ---------------------------------------------------------------------------
# Proveedor abierto/gratuito por defecto (OSRM). Se puede apuntar a otra
# instancia vía ROUTING_PROVIDER_URL. Si el proveedor falla (offline, timeout),
# se cae a línea recta (Haversine) para no romper la navegación del conductor.
ROUTING_PROVIDER_URL = os.environ.get("ROUTING_PROVIDER_URL", "https://router.project-osrm.org").rstrip("/")
ROUTING_TIMEOUT_SECONDS = float(os.environ.get("ROUTING_TIMEOUT_SECONDS", "8"))


class RoutingBody(BaseModel):
    origen: Ubicacion
    destino: Ubicacion


def _ruta_haversine(origen: Ubicacion, destino: Ubicacion) -> dict:
    d_m = haversine_km(origen.lat, origen.lng, destino.lat, destino.lng) * 1000
    # Estimación conservadora de velocidad urbana (25 km/h) para la ETA de fallback.
    speed_ms = 25.0 / 3.6
    return {
        "provider": "haversine",
        "distance_m": round(d_m),
        "duration_s": round(d_m / speed_ms),
        "geometry": {
            "type": "LineString",
            "coordinates": [[origen.lng, origen.lat], [destino.lng, destino.lat]],
        },
    }


@api_router.post("/routing/route")
async def routing_route(body: RoutingBody, _=Depends(_any_autenticado_o_pasajero)):
    """Ruta real sobre calles (OSRM) entre dos coordenadas. Accesible para
    operador, terminal o el pasajero con servicio activo (la polilínea entre
    su origen y/o el taxi asignado no expone flota ajena)."""
    origen, destino = body.origen, body.destino
    if origen.lat is None or origen.lng is None or destino.lat is None or destino.lng is None:
        raise HTTPException(status_code=400, detail="Origen y destino deben tener coordenadas")
    try:
        async with httpx.AsyncClient(timeout=ROUTING_TIMEOUT_SECONDS) as hc:
            url = (
                f"{ROUTING_PROVIDER_URL}/route/v1/driving/"
                f"{origen.lng:.6f},{origen.lat:.6f};{destino.lng:.6f},{destino.lat:.6f}"
                f"?overview=full&geometries=geojson"
            )
            r = await hc.get(url)
            r.raise_for_status()
            data = r.json()
        route = (data.get("routes") or [None])[0]
        if not route:
            raise ValueError("sin rutas")
        coords = ((route.get("geometry") or {}).get("coordinates")) or []
        if len(coords) < 2:
            raise ValueError("geometría insuficiente")
        return {
            "provider": "osrm",
            "distance_m": round(route.get("distance", 0)),
            "duration_s": round(route.get("duration", 0)),
            "geometry": {"type": "LineString", "coordinates": coords},
        }
    except Exception as exc:  # red, timeout, proveedor caído -> fallback
        logger.warning("routing fallback haversine: %s", exc)
        return _ruta_haversine(origen, destino)


# ---------------------------------------------------------------------------
# Rutas CRUD
# ---------------------------------------------------------------------------
@api_router.post("/rutas")
async def create_ruta(body: RutaCreate, _=Depends(require_terminal)):
    doc = {"nombre": body.nombre, "color_hex": body.color_hex}
    res = await db.rutas.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api_router.get("/rutas")
async def list_rutas(_=Depends(_any_autenticado)):
    docs = await db.rutas.find().to_list(1000)
    return [serialize(d) for d in docs]


@api_router.get("/rutas/{ruta_id}")
async def get_ruta(ruta_id: str, _=Depends(_any_autenticado)):
    r = await db.rutas.find_one({"_id": to_oid(ruta_id)})
    if not r:
        raise HTTPException(status_code=404, detail="Ruta no encontrada")
    return serialize(r)


@api_router.put("/rutas/{ruta_id}")
async def update_ruta(ruta_id: str, body: RutaUpdate, _=Depends(require_terminal)):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nada que actualizar")
    res = await db.rutas.update_one({"_id": to_oid(ruta_id)}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Ruta no encontrada")
    return serialize(await db.rutas.find_one({"_id": to_oid(ruta_id)}))


@api_router.delete("/rutas/{ruta_id}")
async def delete_ruta(ruta_id: str, _=Depends(require_terminal)):
    res = await db.rutas.delete_one({"_id": to_oid(ruta_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ruta no encontrada")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Servicios / Llamadas (ciclo completo: solicitud → oferta → asignación atómica)
# ---------------------------------------------------------------------------
async def _asignar_atomicamente(servicio_id: str, operador_id: str,
                                permitir_estados: Optional[List[str]] = None) -> bool:
    """Asigna un servicio de forma atómica (BBDD es la fuente de verdad).

    Solamente un conductor puede ganar: usamos `update_one` filtrado por estado
    del servicio y verificamos cuántos documentos se modificaron.
    """
    permitir_estados = permitir_estados or ESTADOS_OFERTA
    op = await db.operadores.find_one({"_id": to_oid(operador_id)})
    if not op or op.get("activo") is False:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    if op.get("estado") != EstadoOperador.libre.value:
        raise HTTPException(status_code=409, detail="El operador no está disponible")
    if await _tiene_servicio_activo(operador_id):
        raise HTTPException(status_code=409, detail="El operador ya tiene un servicio activo")
    vid = op.get("vehiculo_id")
    if vid:
        try:
            v = await db.vehiculos.find_one({"_id": to_oid(vid)})
        except HTTPException:
            v = None
        if v and v.get("activo") is False:
            raise HTTPException(status_code=409, detail="El vehículo del operador está inactivo")
    ts = now_iso()
    res = await db.servicios.update_one(
        {"_id": to_oid(servicio_id), "estado": {"$in": permitir_estados}},
        {"$set": {
            "operador_asignado_id": operador_id,
            "estado": EstadoServicio.asignado.value,
            "timestamp_asignacion": ts,
            "ofrecido_a": [operador_id],
        }},
    )
    if res.matched_count == 0:
        return False
    after = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    await db.operadores.update_one(
        {"_id": to_oid(operador_id)},
        {"$set": {"estado": EstadoOperador.ocupado.value, "ultima_actualizacion": ts}},
    )
    estado_msg = {"type": "estado", "operador_id": operador_id, "estado": EstadoOperador.ocupado.value, "ts": ts}
    await manager.broadcast_terminal(estado_msg)
    await _notificar_dueno_de_operador(operador_id, estado_msg)
    logger.info("servicio asignado id=%s operador=%s (asignación atómica)", servicio_id, operador_id)
    await _notificar_servicio(after)
    return True


async def _auth_servicio(request: Request, s: dict):
    """Devuelve el actor autenticado cuando puede ver/actuar sobre el servicio."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")
    scope = payload.get("scope")
    if scope == "terminal":
        return await require_terminal(request)
    if scope in (None, "operador"):
        op = await _read_operador(payload)
        opid = str(op["id"])
        if opid in (s.get("operador_asignado_id"),) or opid in s.get("ofrecido_a", []):
            return op
        raise HTTPException(status_code=403, detail="No tienes acceso a este servicio")
    if scope == "pasajero":
        c = await require_pasajero(request)
        if str(c["id"]) == s.get("pasajero_id"):
            return c
        raise HTTPException(status_code=403, detail="No tienes acceso a este servicio")
    raise HTTPException(status_code=403, detail="No autorizado")


async def _auth_pasajero_o_terminal(request: Request, s: dict):
    """Autoriza terminal o al pasajero dueño (para cancelar un servicio propio)."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")
    if payload.get("scope") == "terminal":
        return await require_terminal(request)
    if payload.get("scope") == "pasajero":
        c = await require_pasajero(request)
        if str(c["id"]) == s.get("pasajero_id"):
            return c
    raise HTTPException(status_code=403, detail="No tienes acceso a este servicio")


def _situar_servicio(body: ServicioCreate, pasajero: Optional[dict], sitio_id: str) -> dict:
    origen = body.origen.model_dump() if body.origen else {"texto": None, "lat": None, "lng": None}
    destino = body.destino.model_dump() if body.destino else {"texto": None, "lat": None, "lng": None}
    cliente_id = body.cliente_id or (str(pasajero["id"]) if pasajero else None)
    cliente_nombre = body.cliente_nombre or (pasajero["nombre"] if pasajero else None)
    cliente_telefono = body.cliente_telefono or (pasajero["telefono"] if pasajero else None)
    return {
        "cliente_id": cliente_id,
        "cliente_nombre": cliente_nombre,
        "cliente_telefono": cliente_telefono,
        "pasajero_id": str(pasajero["id"]) if pasajero else (body.pasajero_id or None),
        "origen": origen,
        "destino": destino,
        "origen_texto": origen.get("texto"),
        "destino_texto": destino.get("texto"),
        "costo": body.costo,
        "tarifa_id": body.tarifa_id,
        "metodo_pago": body.metodo_pago,
        "tipo_vehiculo_preferido_id": body.tipo_vehiculo_preferido_id,
        "sitio_id": sitio_id,
        "tipo": "pasajero" if pasajero else "terminal",
        "operador_asignado_id": None,
        "estado": EstadoServicio.pendiente.value,
        "timestamp_creacion": now_iso(),
        "timestamp_asignacion": None,
    }


@api_router.post("/servicios")
async def create_servicio(body: ServicioCreate, request: Request):
    auth = request.headers.get("Authorization", "")
    pasajero = None
    if auth.startswith("Bearer "):
        try:
            payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Token inválido")
        if payload.get("scope") == "pasajero":
            pasajero = await require_pasajero(request)
    if pasajero:
        if body.operador_asignado_id:
            raise HTTPException(status_code=400, detail="Un pasajero no puede elegir el taxi")
        if not body.origen or body.origen.lat is None or body.origen.lng is None:
            raise HTTPException(status_code=400, detail="Debes indicar coordenadas del origen")
        if not body.destino or body.destino.lat is None or body.destino.lng is None:
            raise HTTPException(status_code=400, detail="Debes indicar coordenadas del destino")
        sitio_id = pasajero.get("sitio_id") or DEFAULT_SITIO
    else:
        await require_terminal(request)
        sitio_id = DEFAULT_SITIO

    doc = _situar_servicio(body, pasajero, sitio_id)
    res = await db.servicios.insert_one(doc)
    doc["_id"] = res.inserted_id
    logger.info("servicio creado id=%s tipo=%s estado=pendiente", res.inserted_id, doc.get("tipo"))

    if body.operador_asignado_id:
        ok = await _asignar_atomicamente(str(res.inserted_id), body.operador_asignado_id)
        if not ok:
            # La asignación manual perdió la carrera; queda pendiente para despacho.
            _doc_fresh = await db.servicios.find_one({"_id": res.inserted_id})
            out = serialize(_doc_fresh)
            await manager.broadcast_terminal({"type": "servicio", "servicio": out})
            return {"servicio": out, "asignado": False,
                    "detalle": "El taxi ya no estaba disponible; el servicio quedó pendiente"}
    doc = await db.servicios.find_one({"_id": res.inserted_id})
    out = serialize(doc)
    await _notificar_servicio(doc)
    return {"servicio": out, "asignado": doc.get("estado") == EstadoServicio.asignado.value}


@api_router.get("/servicios")
async def list_servicios(estado: Optional[EstadoServicio] = None, _=Depends(require_terminal)):
    query = {"estado": estado.value} if estado else {}
    docs = await db.servicios.find(query).sort("timestamp_creacion", -1).to_list(1000)
    return [serialize(d) for d in docs]


@api_router.get("/servicios/hoy")
async def list_servicios_hoy(_=Depends(require_terminal)):
    hoy = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    docs = await db.servicios.find(
        {"timestamp_creacion": {"$regex": f"^{hoy}"}}
    ).sort("timestamp_creacion", -1).to_list(1000)
    ops = {str(o["_id"]): o for o in await db.operadores.find().to_list(1000)}
    out = []
    for d in docs:
        s = serialize(d)
        op = ops.get(s.get("operador_asignado_id"))
        s["operador_nombre"] = op["nombre"] if op else None
        out.append(s)
    return out


@api_router.get("/servicios/mis-activos")
async def mis_servicios_activos(current: dict = Depends(require_operador)):
    """Servicios activos/ofrecidos al conductor actual (para la Driver App)."""
    await _expirar_ofertas_vencidas()
    docs = await db.servicios.find({
        "$or": [
            {"operador_asignado_id": current["id"]},
            {"ofrecido_a": current["id"]},
        ],
        "estado": {"$in": ESTADOS_ACTIVOS_SERVICIO},
    }).sort("timestamp_creacion", -1).to_list(100)
    return [serialize(d) for d in docs]


@api_router.get("/servicios/{servicio_id}")
async def get_servicio(servicio_id: str, request: Request):
    s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    await _auth_servicio(request, s)
    return serialize(s)


@api_router.post("/servicios/{servicio_id}/calificacion")
async def calificar_conductor(
    servicio_id: str,
    body: CalificacionCreate,
    current: dict = Depends(require_pasajero),
):
    """Registra una única calificación del pasajero dueño de un viaje completado."""
    s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    if s.get("pasajero_id") != current["id"]:
        raise HTTPException(status_code=403, detail="No tienes acceso a este servicio")
    if s.get("estado") != EstadoServicio.completado.value:
        raise HTTPException(status_code=409, detail="Solo puedes calificar un servicio completado")
    if s.get("calificacion_conductor"):
        raise HTTPException(status_code=409, detail="Este servicio ya tiene una calificación")

    calificacion = {
        "puntuacion": body.puntuacion,
        "comentario": body.comentario,
        "timestamp": now_iso(),
        "pasajero_id": current["id"],
    }
    # La condición evita calificaciones duplicadas incluso ante solicitudes concurrentes.
    result = await db.servicios.update_one(
        {
            "_id": to_oid(servicio_id),
            "pasajero_id": current["id"],
            "estado": EstadoServicio.completado.value,
            "calificacion_conductor": {"$exists": False},
        },
        {"$set": {"calificacion_conductor": calificacion}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=409, detail="Este servicio ya tiene una calificación")
    s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    return {"calificacion_conductor": calificacion, "servicio": serialize(s)}


@api_router.post("/servicios/{servicio_id}/asignar")
async def asignar_servicio(servicio_id: str, body: AsignarBody, _=Depends(require_terminal)):
    """Asignación manual por el dispatcher (pasa por la lógica atómica)."""
    s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    ok = await _asignar_atomicamente(servicio_id, body.operador_id)
    if not ok:
        raise HTTPException(
            status_code=409,
            detail="El servicio ya fue asignado o el taxi dejó de estar disponible",
        )
    return serialize(await db.servicios.find_one({"_id": to_oid(servicio_id)}))


@api_router.post("/servicios/{servicio_id}/aceptar")
async def aceptar_servicio(servicio_id: str, current: dict = Depends(require_operador_estricto)):
    """El conductor acepta la oferta (carrera atómica: solo uno gana)."""
    s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    if s.get("estado") == "vencido":
        raise HTTPException(status_code=410, detail="La oferta expiró")
    if s.get("estado") not in ("ofrecido", "pendiente"):
        raise HTTPException(status_code=409, detail="El servicio ya no está disponible")
    if s.get("ofrecido_a") and current["id"] not in s.get("ofrecido_a", []):
        raise HTTPException(status_code=403, detail="No tienes una oferta activa para este servicio")
    exp = _parse_iso(s.get("expira_en"))
    if exp:
        exp = exp.replace(tzinfo=timezone.utc) if exp.tzinfo is None else exp
        if exp < datetime.now(timezone.utc):
            await db.servicios.update_one({"_id": s["_id"]},
                                          {"$set": {"estado": "vencido", "ts_vencido": now_iso()}})
            raise HTTPException(status_code=410, detail="La oferta expiró")
    ganador = await _asignar_atomicamente(servicio_id, current["id"],
                                          permitir_estados=["ofrecido", "pendiente"])
    if not ganador:
        logger.info("Problema de concurrencia resuelto: operador=%s perdió la asignación del servicio %s",
                    current["id"], servicio_id)
        raise HTTPException(status_code=409, detail="El servicio ya fue asignado a otro conductor")
    logger.info("servicio aceptado id=%s por operador=%s", servicio_id, current["id"])
    return serialize(await db.servicios.find_one({"_id": to_oid(servicio_id)}))


@api_router.post("/servicios/{servicio_id}/rechazar")
async def rechazar_servicio(servicio_id: str, current: dict = Depends(require_operador_estricto)):
    s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    if s.get("estado") != "ofrecido" or current["id"] not in (s.get("ofrecido_a") or []):
        raise HTTPException(status_code=403, detail="No tienes una oferta activa para este servicio")
    ofrecidos = [o for o in s.get("ofrecido_a", []) if o != current["id"]]
    updates = {
        "rechazados": list(set(s.get("rechazados", []) + [current["id"]])),
        "ofrecido_a": ofrecidos,
    }
    if not ofrecidos:
        updates["estado"] = EstadoServicio.pendiente.value
        updates.pop("expira_en", None)
    await db.servicios.update_one({"_id": to_oid(servicio_id)}, {"$set": updates})
    logger.info("servicio rechazado id=%s por operador=%s (quedan %s)",
                servicio_id, current["id"], len(ofrecidos))
    return serialize(await db.servicios.find_one({"_id": to_oid(servicio_id)}))


async def _cancelar_servicio(servicio_id: str, motivo: Optional[str] = None) -> dict:
    s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    if s.get("estado") in ("completado", "cancelado", "vencido", "rechazado"):
        raise HTTPException(status_code=409, detail="El servicio ya no se puede cancelar")
    ts = now_iso()
    updates = {"estado": "cancelado", "timestamp_cancelado": ts}
    if motivo:
        updates["motivo_cancelacion"] = motivo
    await db.servicios.update_one({"_id": to_oid(servicio_id)}, {"$set": updates})
    s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    oid = s.get("operador_asignado_id")
    if oid:
        await db.operadores.update_one(
            {"_id": to_oid(oid)},
            {"$set": {"estado": EstadoOperador.libre.value, "ultima_actualizacion": ts}},
        )
        estado_msg = {"type": "estado", "operador_id": oid, "estado": EstadoOperador.libre.value, "ts": ts}
        await manager.broadcast_terminal(estado_msg)
        await _notificar_dueno_de_operador(oid, estado_msg)
    await _notificar_servicio(s)
    logger.info("servicio cancelado id=%s", servicio_id)
    return serialize(s)


@api_router.post("/servicios/{servicio_id}/cancelar")
async def cancelar_servicio(servicio_id: str, request: Request, body: Optional[CancelarBody] = None):
    s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    await _auth_pasajero_o_terminal(request, s)
    return await _cancelar_servicio(servicio_id, body.motivo if body else None)


@api_router.post("/servicios/{servicio_id}/iniciar")
async def iniciar_viaje(servicio_id: str, current: dict = Depends(require_operador_estricto)):
    """El conductor inició el recorrido (Irá por el cliente)."""
    s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    if s.get("operador_asignado_id") != current["id"]:
        raise HTTPException(status_code=403, detail="Solo el conductor asignado puede iniciar el servicio")
    if s.get("estado") != "asignado":
        raise HTTPException(status_code=409, detail="El servicio debe estar asignado para iniciarlo")
    ts = now_iso()
    await db.servicios.update_one({"_id": to_oid(servicio_id)},
                                  {"$set": {"estado": "en_curso", "timestamp_inicio": ts}})
    s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    await _notificar_servicio(s)
    return serialize(s)


@api_router.post("/operadores/{operador_id}/servicio")
async def iniciar_servicio_operador(operador_id: str, body: ServicioOperadorBody, request: Request):
    """Radio: el taxista inicia un servicio propio (sin pasajero digital)."""
    await _mismo_o_terminal(request, operador_id)
    op = await db.operadores.find_one({"_id": to_oid(operador_id)})
    if not op:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    if await _tiene_servicio_activo(operador_id):
        raise HTTPException(status_code=409, detail="Ya tienes un servicio en curso")
    ts = now_iso()
    doc = {
        "cliente_id": None, "cliente_nombre": None, "cliente_telefono": None,
        "origen": {"texto": body.origen_texto, "lat": None, "lng": None},
        "destino": {"texto": body.destino_texto, "lat": None, "lng": None},
        "origen_texto": body.origen_texto,
        "destino_texto": body.destino_texto,
        "costo": body.costo,
        "tarifa_id": body.tarifa_id,
        "metodo_pago": "cash",
        "sitio_id": op.get("sitio_id") or DEFAULT_SITIO,
        "tipo": "operador",
        "operador_asignado_id": operador_id,
        "estado": EstadoServicio.en_curso.value,
        "timestamp_creacion": ts,
        "timestamp_asignacion": ts,
    }
    res = await db.servicios.insert_one(doc)
    doc["_id"] = res.inserted_id
    servicio = serialize(doc)
    await db.operadores.update_one(
        {"_id": to_oid(operador_id)},
        {"$set": {"estado": EstadoOperador.ocupado.value, "ultima_actualizacion": ts}},
    )
    estado_msg = {"type": "estado", "operador_id": operador_id, "estado": EstadoOperador.ocupado.value, "ts": ts}
    await manager.broadcast_terminal(estado_msg)
    await manager.broadcast_terminal({"type": "servicio", "servicio": servicio})
    await _notificar_dueno_de_operador(operador_id, estado_msg)
    await _notificar_dueno_de_operador(operador_id, {"type": "servicio", "servicio": servicio})
    return servicio


async def _calcular_metricas_servicio(s: dict, ts_fin: str) -> dict:
    """Distancia/duración reales del viaje (nunca inventadas):
    - duracion_s: tiempo transcurrido real entre timestamp_inicio y el fin.
    - distancia_m: recorrido GPS real del conductor en esa ventana (más fiel que
      cualquier estimación de ruta); si no hay track suficiente, cae a línea
      recta origen→destino; si tampoco hay coordenadas, queda en None.
    """
    metrics = {"distancia_m": None, "duracion_s": None}
    t_inicio = s.get("timestamp_inicio")
    if t_inicio:
        inicio_dt, fin_dt = _parse_iso(t_inicio), _parse_iso(ts_fin)
        if inicio_dt and fin_dt:
            metrics["duracion_s"] = round((fin_dt - inicio_dt).total_seconds())

    oid = s.get("operador_asignado_id")
    dist_m = None
    if oid and t_inicio:
        op = await db.operadores.find_one({"_id": to_oid(oid)}, {"track": 1})
        track = [p for p in (op.get("track") or []) if t_inicio <= p[2] <= ts_fin] if op else []
        if len(track) >= 2:
            dist_m = 0.0
            for i in range(1, len(track)):
                dist_m += haversine_km(track[i - 1][0], track[i - 1][1], track[i][0], track[i][1]) * 1000
    if dist_m is None:
        origen, destino = s.get("origen") or {}, s.get("destino") or {}
        if origen.get("lat") is not None and destino.get("lat") is not None:
            dist_m = haversine_km(origen["lat"], origen["lng"], destino["lat"], destino["lng"]) * 1000
    metrics["distancia_m"] = round(dist_m) if dist_m is not None else None
    return metrics


@api_router.post("/servicios/{servicio_id}/terminar")
async def terminar_servicio(servicio_id: str, request: Request):
    s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    # Puede terminar el conductor asignado o la terminal.
    auth = request.headers.get("Authorization", "")
    payload = None
    if auth.startswith("Bearer "):
        try:
            payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Token inválido")
    if not payload or payload.get("scope") == "terminal":
        await require_terminal(request)
    else:
        op = await require_operador(request)
        if str(op["id"]) != s.get("operador_asignado_id"):
            raise HTTPException(status_code=403, detail="Solo el conductor asignado puede terminar")
    if s.get("estado") not in ("en_curso", "asignado"):
        raise HTTPException(status_code=409, detail="El servicio no está en curso")
    ts = now_iso()
    metricas = await _calcular_metricas_servicio(s, ts)
    await db.servicios.update_one(
        {"_id": to_oid(servicio_id)},
        {"$set": {"estado": EstadoServicio.completado.value, "timestamp_fin": ts, **metricas}},
    )
    oid = s.get("operador_asignado_id")
    if oid:
        await db.operadores.update_one(
            {"_id": to_oid(oid)},
            {"$set": {"estado": EstadoOperador.libre.value, "ultima_actualizacion": ts}},
        )
        estado_msg = {"type": "estado", "operador_id": oid, "estado": EstadoOperador.libre.value, "ts": ts}
        await manager.broadcast_terminal(estado_msg)
        await _notificar_dueno_de_operador(oid, estado_msg)
    s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    await _notificar_servicio(s)
    return serialize(s)


# ---------------------------------------------------------------------------
# Reportes de objetos olvidados
# ---------------------------------------------------------------------------
@api_router.post("/reportes")
async def crear_reporte(
    operador_id: str = Form(...),
    descripcion: Optional[str] = Form(None),
    foto: UploadFile = File(...),
    current: dict = Depends(require_operador_estricto),
):
    if operador_id != current["id"]:
        raise HTTPException(status_code=403, detail="No puedes reportar en nombre de otro conductor")
    ext = (foto.filename or "").split(".")[-1].lower() if "." in (foto.filename or "") else "jpg"
    path = f"{APP_NAME}/reportes/{operador_id}/{uuid.uuid4().hex}.{ext}"
    data = await foto.read()
    result = put_object(path, data, foto.content_type or "image/jpeg")
    doc = {
        "operador_id": operador_id,
        "storage_path": result["path"],
        "foto_url": f"/api/files/{result['path']}",
        "content_type": foto.content_type or "image/jpeg",
        "descripcion": descripcion,
        "timestamp": now_iso(),
        "estado": "pendiente",
    }
    res = await db.reportes_objetos.insert_one(doc)
    doc["_id"] = res.inserted_id
    out = serialize(doc)
    await manager.broadcast_terminal({"type": "reporte", "reporte": out})
    return out


@api_router.get("/files/{path:path}")
async def download_file(path: str):
    record = await db.reportes_objetos.find_one({"storage_path": path}) or await db.archivos.find_one({"storage_path": path})
    if not record:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    data, content_type = get_object(path)
    return Response(content=data, media_type=record.get("content_type", content_type))


@api_router.get("/reportes")
async def list_reportes(_=Depends(require_terminal)):
    docs = await db.reportes_objetos.find().sort("timestamp", -1).to_list(1000)
    ops = {str(o["_id"]): o for o in await db.operadores.find().to_list(1000)}
    out = []
    for d in docs:
        r = serialize(d)
        op = ops.get(r.get("operador_id"))
        r["operador_nombre"] = op["nombre"] if op else "—"
        r["operador_placa"] = op["placa"] if op else "—"
        out.append(r)
    return out


@api_router.patch("/reportes/{reporte_id}/resolver")
async def resolver_reporte(reporte_id: str, _=Depends(require_terminal)):
    res = await db.reportes_objetos.update_one(
        {"_id": to_oid(reporte_id)}, {"$set": {"estado": "resuelto"}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    return {"ok": True, "estado": "resuelto"}


# ---------------------------------------------------------------------------
# Chat (reutiliza el ConnectionManager de ubicación/estado)
# ---------------------------------------------------------------------------
class MensajeCreate(BaseModel):
    operador_id: str
    remitente: str  # "operador" | "terminal"
    texto: str


async def _autor_chat_viaje(request: Request, s: dict):
    """Autoriza y devuelve (actor, remitente) para el chat privado del viaje."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")

    scope = payload.get("scope")
    if scope == "terminal":
        return await require_terminal(request), "terminal"
    if scope in (None, "operador"):
        operador = await _read_operador(payload)
        if operador["id"] != s.get("operador_asignado_id"):
            raise HTTPException(status_code=403, detail="No tienes acceso a este chat")
        return operador, "operador"
    if scope == "pasajero":
        pasajero = await require_pasajero(request)
        if pasajero["id"] != s.get("pasajero_id"):
            raise HTTPException(status_code=403, detail="No tienes acceso a este chat")
        return pasajero, "pasajero"
    raise HTTPException(status_code=403, detail="No autorizado para este chat")


async def _obtener_servicio_para_chat(servicio_id: str) -> dict:
    s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    return s


@api_router.get("/servicios/{servicio_id}/mensajes")
async def list_mensajes_viaje(servicio_id: str, request: Request):
    s = await _obtener_servicio_para_chat(servicio_id)
    await _autor_chat_viaje(request, s)
    docs = await db.mensajes_chat.find(
        {"servicio_id": servicio_id}
    ).sort("timestamp", 1).to_list(2000)
    return [serialize(d) for d in docs]


@api_router.post("/servicios/{servicio_id}/mensajes")
async def crear_mensaje_viaje(
    servicio_id: str,
    body: MensajeViajeCreate,
    request: Request,
):
    s = await _obtener_servicio_para_chat(servicio_id)
    actor, remitente = await _autor_chat_viaje(request, s)
    if s.get("estado") not in (EstadoServicio.asignado.value, EstadoServicio.en_curso.value):
        raise HTTPException(
            status_code=409,
            detail="El chat solo está disponible con el servicio asignado o en curso",
        )

    doc = {
        "servicio_id": servicio_id,
        "pasajero_id": s.get("pasajero_id"),
        "operador_id": s.get("operador_asignado_id"),
        "remitente": remitente,
        "remitente_id": actor["id"],
        "texto": body.texto,
        "timestamp": now_iso(),
    }
    result = await db.mensajes_chat.insert_one(doc)
    doc["_id"] = result.inserted_id
    out = serialize(doc)
    evento = {"type": "mensaje", "servicio_id": servicio_id, "mensaje": out}
    if s.get("pasajero_id"):
        await manager.send_pasajero(s["pasajero_id"], evento)
    if s.get("operador_asignado_id"):
        await manager.send_operador(s["operador_asignado_id"], evento)
    return out


@api_router.post("/mensajes")
async def crear_mensaje(body: MensajeCreate, request: Request):
    # Terminal o el operador dueño del hilo.
    await _autor_chat_o_terminal(request, body.operador_id)
    doc = {
        "operador_id": body.operador_id,
        "remitente": body.remitente,
        "texto": body.texto,
        "timestamp": now_iso(),
    }
    res = await db.mensajes_chat.insert_one(doc)
    doc["_id"] = res.inserted_id
    out = serialize(doc)
    await manager.send_operador(body.operador_id, {"type": "mensaje", "mensaje": out})
    await manager.broadcast_terminal({"type": "mensaje", "mensaje": out})
    return out


@api_router.get("/mensajes")
async def list_mensajes(operador_id: str, request: Request):
    await _autor_chat_o_terminal(request, operador_id)
    docs = await db.mensajes_chat.find(
        {"operador_id": operador_id, "servicio_id": {"$exists": False}}
    ).sort("timestamp", 1).to_list(2000)
    return [serialize(d) for d in docs]


async def _autor_chat_o_terminal(request: Request, operador_id: str):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")
    scope = payload.get("scope")
    if scope == "terminal":
        await require_terminal(request)
        return
    if scope in (None, "operador"):
        op = await _read_operador(payload)
        if str(op["id"]) == operador_id:
            return
    raise HTTPException(status_code=403, detail="No tienes acceso a esta conversación")


@api_router.get("/conversaciones")
async def list_conversaciones(_=Depends(require_terminal)):
    msgs = await db.mensajes_chat.find(
        {"servicio_id": {"$exists": False}}
    ).sort("timestamp", 1).to_list(5000)
    ops = {str(o["_id"]): o for o in await db.operadores.find().to_list(1000)}
    convos: Dict[str, dict] = {}
    for m in msgs:
        oid = m["operador_id"]
        op = ops.get(oid)
        convos[oid] = {
            "operador_id": oid,
            "operador_nombre": op["nombre"] if op else "—",
            "operador_placa": op["placa"] if op else "—",
            "ultimo_texto": m["texto"],
            "ultimo_remitente": m["remitente"],
            "timestamp": m["timestamp"],
        }
    return list(convos.values())


# ---------------------------------------------------------------------------
# Tarifas predefinidas
# ---------------------------------------------------------------------------
class TarifaBody(BaseModel):
    nombre: str
    monto: float
    tipo: str = "fijo"
    orden: int = 0


@api_router.post("/tarifas")
async def crear_tarifa(body: TarifaBody, _=Depends(require_terminal)):
    doc = body.model_dump()
    res = await db.tarifas_predefinidas.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api_router.get("/tarifas")
async def list_tarifas(_=Depends(_any_autenticado)):
    docs = await db.tarifas_predefinidas.find().sort("orden", 1).to_list(1000)
    return [serialize(d) for d in docs]


@api_router.put("/tarifas/{tarifa_id}")
async def update_tarifa(tarifa_id: str, body: TarifaBody, _=Depends(require_terminal)):
    await db.tarifas_predefinidas.update_one({"_id": to_oid(tarifa_id)}, {"$set": body.model_dump()})
    return serialize(await db.tarifas_predefinidas.find_one({"_id": to_oid(tarifa_id)}))


@api_router.delete("/tarifas/{tarifa_id}")
async def delete_tarifa(tarifa_id: str, _=Depends(require_terminal)):
    await db.tarifas_predefinidas.delete_one({"_id": to_oid(tarifa_id)})
    return {"ok": True}


# Configuración de sitio (umbrales GPS, TTL de ofertas, etc.)
class ConfigSetBody(BaseModel):
    key: str
    valor: object = None


@api_router.get("/config/{key}")
async def read_config(key: str, _=Depends(_any_autenticado)):
    doc = await db.config.find_one({"key": key})
    return {"key": key, "valor": doc.get("valor") if doc else None}


@api_router.post("/config/set")
async def set_config(body: ConfigSetBody, _=Depends(require_terminal)):
    await db.config.update_one({"key": body.key}, {"$set": {"key": body.key, "valor": body.valor}}, upsert=True)
    return {"ok": True, "key": body.key, "valor": body.valor}


# ---------------------------------------------------------------------------
# Panel del dueño de flota
#
# Ownership por `vehiculos.propietario_id` (no por `sitio_id`): un dueño ve
# únicamente sus vehículos y, por extensión, a los conductores que los
# manejan y a los servicios que esos conductores atendieron. Todo se filtra
# en backend a partir de este helper — el frontend nunca decide qué es "suyo".
# ---------------------------------------------------------------------------
async def _vehiculos_de_dueno(dueno_id: str) -> List[dict]:
    return await db.vehiculos.find({"propietario_id": dueno_id}).to_list(1000)


async def _operador_ids_de_dueno(dueno_id: str) -> List[str]:
    vehiculos = await _vehiculos_de_dueno(dueno_id)
    return [v["operador_conductor_id"] for v in vehiculos if v.get("operador_conductor_id")]


async def _vehiculo_de_dueno_o_404(vehiculo_id: str, dueno_id: str) -> dict:
    v = await db.vehiculos.find_one({"_id": to_oid(vehiculo_id)})
    if not v or v.get("propietario_id") != dueno_id:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    return v


def _hoy_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


@api_router.get("/dueno/me")
async def dueno_me(current: dict = Depends(require_dueno)):
    return current


@api_router.get("/dueno/dashboard")
async def dueno_dashboard(current: dict = Depends(require_dueno)):
    dueno_id = current["id"]
    vehiculos = await _vehiculos_de_dueno(dueno_id)
    operador_ids = [v["operador_conductor_id"] for v in vehiculos if v.get("operador_conductor_id")]
    op_oids = [to_oid(x) for x in operador_ids]
    operadores = await db.operadores.find({"_id": {"$in": op_oids}}).to_list(1000) if op_oids else []

    counts_estado = {"libre": 0, "ocupado": 0, "no_disponible": 0, "fuera_de_servicio": 0, "averiado": 0}
    conductores_activos = 0
    for op in operadores:
        e = op.get("estado")
        if e in counts_estado:
            counts_estado[e] += 1
        if op.get("activo") is not False:
            conductores_activos += 1

    hoy = _hoy_str()
    servicios_hoy = await db.servicios.find({
        "operador_asignado_id": {"$in": operador_ids},
        "timestamp_creacion": {"$regex": f"^{hoy}"},
    }).to_list(2000) if operador_ids else []
    completados_hoy = [s for s in servicios_hoy if s.get("estado") == "completado"]
    cancelados_hoy = [s for s in servicios_hoy if s.get("estado") == "cancelado"]
    ingresos_hoy = sum(s.get("costo") or 0 for s in completados_hoy)

    return {
        "taxis_registrados": len(vehiculos),
        "taxis_activos": sum(1 for v in vehiculos if v.get("activo") is not False),
        "taxis_disponibles": counts_estado["libre"],
        "taxis_ocupados": counts_estado["ocupado"],
        "taxis_fuera_de_servicio": counts_estado["fuera_de_servicio"] + counts_estado["no_disponible"],
        "taxis_averiados": counts_estado["averiado"],
        "conductores_activos": conductores_activos,
        "servicios_hoy": len(servicios_hoy),
        "servicios_completados_hoy": len(completados_hoy),
        "servicios_cancelados_hoy": len(cancelados_hoy),
        "ingresos_hoy": ingresos_hoy,
    }


@api_router.get("/dueno/flota")
async def dueno_flota(current: dict = Depends(require_dueno)):
    dueno_id = current["id"]
    vehiculos = await _vehiculos_de_dueno(dueno_id)
    operador_ids = [v["operador_conductor_id"] for v in vehiculos if v.get("operador_conductor_id")]
    op_oids = [to_oid(x) for x in operador_ids]
    operadores = {str(o["_id"]): o for o in (await db.operadores.find({"_id": {"$in": op_oids}}).to_list(1000) if op_oids else [])}

    # Conteo de servicios completados por conductor, en una sola consulta (evita N+1).
    conteos: Dict[str, int] = {}
    if operador_ids:
        docs = await db.servicios.find(
            {"operador_asignado_id": {"$in": operador_ids}, "estado": "completado"},
            {"operador_asignado_id": 1},
        ).to_list(20000)
        for d in docs:
            oid = d.get("operador_asignado_id")
            conteos[oid] = conteos.get(oid, 0) + 1

    tipos = await _mapa_tipos_vehiculo()
    out = []
    for v in vehiculos:
        item = _enriquecer_vehiculo(serialize(v), tipos)
        op = operadores.get(v.get("operador_conductor_id"))
        item["conductor"] = {"id": str(op["_id"]), "nombre": op["nombre"], "telefono": op.get("telefono"),
                              "estado": op.get("estado")} if op else None
        item["servicios_realizados"] = conteos.get(v.get("operador_conductor_id"), 0)
        out.append(item)
    return out


@api_router.get("/dueno/flota/{vehiculo_id}")
async def dueno_flota_detalle(vehiculo_id: str, current: dict = Depends(require_dueno)):
    v = await _vehiculo_de_dueno_o_404(vehiculo_id, current["id"])
    out = _enriquecer_vehiculo(serialize(v), await _mapa_tipos_vehiculo())
    op = None
    op_id = v.get("operador_conductor_id")
    if op_id:
        op = await db.operadores.find_one({"_id": to_oid(op_id)})
    if op:
        out["conductor"] = {"id": str(op["_id"]), "nombre": op["nombre"], "telefono": op.get("telefono"),
                            "estado": op.get("estado"), "ultima_actualizacion": op.get("ultima_actualizacion")}
        track = (op.get("track") or [])[-TRACK_MAX_POINTS:]
        out["track"] = [{"lat": p[0], "lng": p[1], "ts": p[2]} for p in track]
        activo = await db.servicios.find_one(
            {"operador_asignado_id": op_id, "estado": {"$in": ["asignado", "en_curso"]}},
            sort=[("timestamp_creacion", -1)],
        )
        out["servicio_activo"] = serialize(activo) if activo else None
        out["servicios_realizados"] = await db.servicios.count_documents(
            {"operador_asignado_id": op_id, "estado": "completado"})
    else:
        out["conductor"] = None
        out["track"] = []
        out["servicio_activo"] = None
        out["servicios_realizados"] = 0
    return out


@api_router.get("/dueno/servicios")
async def dueno_servicios(
    desde: Optional[str] = None, hasta: Optional[str] = None,
    vehiculo_id: Optional[str] = None, operador_id: Optional[str] = None,
    estado: Optional[str] = None,
    current: dict = Depends(require_dueno),
):
    dueno_id = current["id"]
    operador_ids = await _operador_ids_de_dueno(dueno_id)
    if vehiculo_id:
        v = await _vehiculo_de_dueno_o_404(vehiculo_id, dueno_id)
        operador_ids = [v["operador_conductor_id"]] if v.get("operador_conductor_id") else []
    if operador_id:
        if operador_id not in operador_ids:
            raise HTTPException(status_code=403, detail="Ese conductor no pertenece a tu flota")
        operador_ids = [operador_id]
    if not operador_ids:
        return []

    query: Dict[str, object] = {"operador_asignado_id": {"$in": operador_ids}}
    if estado:
        query["estado"] = estado
    if desde or hasta:
        rango: Dict[str, str] = {}
        if desde:
            rango["$gte"] = desde
        if hasta:
            rango["$lte"] = hasta + "￿"
        query["timestamp_creacion"] = rango

    docs = await db.servicios.find(query).sort("timestamp_creacion", -1).to_list(1000)
    operadores = {str(o["_id"]): o for o in await db.operadores.find(
        {"_id": {"$in": [to_oid(x) for x in operador_ids]}}).to_list(1000)}
    vehiculos = {v["operador_conductor_id"]: v for v in await _vehiculos_de_dueno(dueno_id) if v.get("operador_conductor_id")}
    out = []
    for d in docs:
        s = serialize(d)
        op = operadores.get(s.get("operador_asignado_id"))
        veh = vehiculos.get(s.get("operador_asignado_id"))
        s["operador_nombre"] = op["nombre"] if op else None
        s["vehiculo_numero_economico"] = veh.get("numero_economico") if veh else None
        out.append(s)
    return out


@api_router.get("/dueno/servicios/{servicio_id}")
async def dueno_servicio_detalle(servicio_id: str, current: dict = Depends(require_dueno)):
    operador_ids = await _operador_ids_de_dueno(current["id"])
    s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    if not s or s.get("operador_asignado_id") not in operador_ids:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    out = serialize(s)
    op_id = s.get("operador_asignado_id")
    op = await db.operadores.find_one({"_id": to_oid(op_id)}) if op_id else None
    if op:
        out["operador"] = {"id": str(op["_id"]), "nombre": op["nombre"], "telefono": op.get("telefono"),
                           "placa": op.get("placa")}
        v = await db.vehiculos.find_one({"operador_conductor_id": op_id})
        out["vehiculo"] = _vehiculo_resumen(v, await _mapa_tipos_vehiculo()) if v else None
    return out


@api_router.get("/dueno/reportes")
async def dueno_reportes(
    desde: Optional[str] = None, hasta: Optional[str] = None,
    current: dict = Depends(require_dueno),
):
    dueno_id = current["id"]
    vehiculos = await _vehiculos_de_dueno(dueno_id)
    operador_ids = [v["operador_conductor_id"] for v in vehiculos if v.get("operador_conductor_id")]
    if not operador_ids:
        return {"por_dia": [], "por_vehiculo": [], "por_conductor": [], "completados": 0, "cancelados": 0, "ingresos_por_dia": []}

    if not desde:
        desde = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    if not hasta:
        hasta = _hoy_str()
    docs = await db.servicios.find({
        "operador_asignado_id": {"$in": operador_ids},
        "timestamp_creacion": {"$gte": desde, "$lte": hasta + "￿"},
    }).to_list(20000)

    operadores = {str(o["_id"]): o for o in await db.operadores.find(
        {"_id": {"$in": [to_oid(x) for x in operador_ids]}}).to_list(1000)}
    vehiculos_por_operador = {v["operador_conductor_id"]: v for v in vehiculos if v.get("operador_conductor_id")}

    por_dia: Dict[str, Dict[str, object]] = {}
    por_vehiculo: Dict[str, int] = {}
    por_conductor: Dict[str, int] = {}
    completados = 0
    cancelados = 0
    for s in docs:
        dia = (s.get("timestamp_creacion") or "")[:10]
        bucket = por_dia.setdefault(dia, {"fecha": dia, "servicios": 0, "completados": 0, "ingresos": 0})
        bucket["servicios"] += 1
        oid = s.get("operador_asignado_id")
        if s.get("estado") == "completado":
            completados += 1
            bucket["completados"] += 1
            bucket["ingresos"] += s.get("costo") or 0
            v = vehiculos_por_operador.get(oid)
            if v:
                key = v.get("numero_economico") or str(v["_id"])
                por_vehiculo[key] = por_vehiculo.get(key, 0) + 1
            op = operadores.get(oid)
            if op:
                por_conductor[op["nombre"]] = por_conductor.get(op["nombre"], 0) + 1
        elif s.get("estado") == "cancelado":
            cancelados += 1

    dias_ordenados = sorted(por_dia.values(), key=lambda b: b["fecha"])
    return {
        "por_dia": dias_ordenados,
        "por_vehiculo": [{"vehiculo": k, "servicios": v} for k, v in sorted(por_vehiculo.items(), key=lambda kv: -kv[1])],
        "por_conductor": [{"conductor": k, "servicios": v} for k, v in sorted(por_conductor.items(), key=lambda kv: -kv[1])],
        "completados": completados,
        "cancelados": cancelados,
        "ingresos_por_dia": [{"fecha": b["fecha"], "ingresos": b["ingresos"]} for b in dias_ordenados],
    }


# ---------------------------------------------------------------------------
# Fotos de perfil / logo (almacenamiento local)
# ---------------------------------------------------------------------------
async def _guardar_imagen(foto: UploadFile, prefix: str) -> str:
    ext = (foto.filename or "").split(".")[-1].lower() if "." in (foto.filename or "") else "jpg"
    path = f"{APP_NAME}/{prefix}/{uuid.uuid4().hex}.{ext}"
    data = await foto.read()
    result = put_object(path, data, foto.content_type or "image/jpeg")
    await db.archivos.insert_one({"storage_path": result["path"], "content_type": foto.content_type or "image/jpeg"})
    return f"/api/files/{result['path']}"


VEHICULO_IMG_MAX_DIM = 1600
VEHICULO_IMG_MAX_BYTES = 8 * 1024 * 1024  # 8 MB de entrada, antes de optimizar


def _optimizar_imagen_webp(data: bytes) -> bytes:
    """Reescala (máx. `VEHICULO_IMG_MAX_DIM` px de lado mayor) y recodifica a WebP.
    Verifica los magic bytes reales con Pillow — no confía en la extensión/Content-Type
    que envía el cliente (SEC-06 de la auditoría: la validación era solo de nombre)."""
    from PIL import Image
    import io as _io

    try:
        img = Image.open(_io.BytesIO(data))
        img.verify()
        img = Image.open(_io.BytesIO(data))  # verify() deja el objeto inutilizable; reabrir
    except Exception:
        raise HTTPException(status_code=400, detail="El archivo no es una imagen válida")

    img = img.convert("RGBA") if img.mode in ("RGBA", "LA", "P") else img.convert("RGB")
    w, h = img.size
    escala = min(1.0, VEHICULO_IMG_MAX_DIM / max(w, h))
    if escala < 1.0:
        img = img.resize((max(1, int(w * escala)), max(1, int(h * escala))), Image.LANCZOS)

    buf = _io.BytesIO()
    img.save(buf, format="WEBP", quality=82, method=6)
    return buf.getvalue()


async def _guardar_imagen_vehiculo(foto: UploadFile, prefix: str) -> str:
    """Como `_guardar_imagen`, pero para fotos de vehículos/tipos: valida que sea
    una imagen real, la reescala y la recodifica a WebP (tamaño de archivo menor,
    formato uniforme para toda la galería de flota)."""
    data = await foto.read()
    if len(data) > VEHICULO_IMG_MAX_BYTES:
        raise HTTPException(status_code=413, detail="La imagen supera el límite de 8 MB")
    optimizada = _optimizar_imagen_webp(data)
    path = f"{APP_NAME}/{prefix}/{uuid.uuid4().hex}.webp"
    result = put_object(path, optimizada, "image/webp")
    await db.archivos.insert_one({"storage_path": result["path"], "content_type": "image/webp"})
    return f"/api/files/{result['path']}"


@api_router.post("/perfil/{coleccion}/{doc_id}/foto")
async def subir_foto_perfil(coleccion: str, doc_id: str, foto: UploadFile = File(...), request: Request = None):
    if coleccion not in ("operadores", "usuarios_terminal"):
        raise HTTPException(status_code=400, detail="Colección inválida")
    if coleccion == "operadores":
        await _mismo_o_terminal(request, doc_id)
    else:
        await require_terminal(request)
    url = await _guardar_imagen(foto, "perfiles")
    await db[coleccion].update_one({"_id": to_oid(doc_id)}, {"$set": {"foto_url": url}})
    return {"foto_url": url}


@api_router.post("/dev/logo")
async def subir_logo(foto: UploadFile = File(...), _=Depends(require_dev)):
    url = await _guardar_imagen(foto, "logo")
    await db.config.update_one({"key": "logo"}, {"$set": {"key": "logo", "foto_url": url}}, upsert=True)
    return {"foto_url": url}


@api_router.get("/config/logo")
async def get_logo():
    c = await db.config.find_one({"key": "logo"})
    return {"foto_url": c["foto_url"] if c else None}


# ---------------------------------------------------------------------------
# Panel de desarrollador
# ---------------------------------------------------------------------------
class DevLoginBody(BaseModel):
    usuario: str
    contrasena: str


class ActivoBody(BaseModel):
    activo: bool


@api_router.post("/dev/login")
async def dev_login(body: DevLoginBody):
    if body.usuario != os.environ.get("DEV_USER") or body.contrasena != os.environ.get("DEV_PASSWORD"):
        raise HTTPException(status_code=401, detail="Credenciales de desarrollador inválidas")
    token = jwt.encode({"sub": "dev", "scope": "dev", "iat": datetime.now(timezone.utc)}, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {"token": token}


@api_router.get("/dev/cuentas")
async def dev_list_cuentas(_=Depends(require_dev)):
    ops = [serialize(o) for o in await db.operadores.find().to_list(1000)]
    terms = [serialize(u) for u in await db.usuarios_terminal.find().to_list(1000)]
    return {"operadores": ops, "usuarios_terminal": terms}


@api_router.patch("/dev/cuentas/{coleccion}/{doc_id}")
async def dev_toggle_cuenta(coleccion: str, doc_id: str, body: ActivoBody, _=Depends(require_dev)):
    if coleccion not in ("operadores", "usuarios_terminal"):
        raise HTTPException(status_code=400, detail="Colección inválida")
    await db[coleccion].update_one({"_id": to_oid(doc_id)}, {"$set": {"activo": body.activo}})
    return {"ok": True, "activo": body.activo}


@api_router.get("/dev/backup")
async def dev_backup(_=Depends(require_dev)):
    import json
    out = {}
    for col in ["operadores", "vehiculos", "clientes", "rutas", "servicios", "reportes_objetos",
                "mensajes_chat", "usuarios_terminal", "tarifas_predefinidas", "sitios", "config"]:
        docs = await db[col].find().to_list(100000)
        out[col] = [serialize(d) for d in docs]
    content = json.dumps(out, ensure_ascii=False, indent=2, default=str)
    return Response(content=content, media_type="application/json",
                    headers={"Content-Disposition": "attachment; filename=backup_central_taxis.json"})


@api_router.get("/dev/auditoria")
async def dev_auditoria(_=Depends(require_dev)):
    eventos = []
    for s in await db.servicios.find().to_list(2000):
        s = serialize(s)
        eventos.append({"ts": s.get("timestamp_creacion"), "accion": "Servicio creado",
                        "detalle": f"{s.get('origen_texto') or '—'} → {s.get('destino_texto') or '—'} ({s.get('estado')})",
                        "extra": s.get("tipo")})
        if s.get("timestamp_asignacion"):
            eventos.append({"ts": s["timestamp_asignacion"], "accion": "Servicio asignado",
                            "detalle": s.get("operador_asignado_id") or "", "extra": None})
    for r in await db.reportes_objetos.find().to_list(2000):
        r = serialize(r)
        eventos.append({"ts": r.get("timestamp"), "accion": "Objeto reportado",
                        "detalle": r.get("descripcion") or "sin descripción", "extra": None})
    eventos = [e for e in eventos if e.get("ts")]
    eventos.sort(key=lambda e: e["ts"], reverse=True)
    return eventos[:200]


# ---------------------------------------------------------------------------
# Seed (manual)
# ---------------------------------------------------------------------------
@api_router.post("/seed")
async def seed():
    if await db.operadores.count_documents({}) > 0:
        return {"ok": True, "message": "La base ya tiene datos, seed omitido."}

    await _migraciones()

    # Rutas
    rutas = [
        {"nombre": "Palenque - Pakal Ná", "color_hex": "#00b894"},
        {"nombre": "Centro - La Cañada", "color_hex": "#0984e3"},
    ]
    r_ids = [(await db.rutas.insert_one(r)).inserted_id for r in rutas]

    # Clientes (y un pasajero con cuenta)
    clientes = [
        {"nombre": "María López", "telefono": "916-100-0001", "creado": now_iso(), "sitio_id": DEFAULT_SITIO},
        {"nombre": "Juan Pérez", "telefono": "916-100-0002", "creado": now_iso(), "sitio_id": DEFAULT_SITIO},
    ]
    for c in clientes:
        await db.clientes.insert_one(c)

    # Operadores + vehículos vinculados
    operadores = [
        {"nombre": "Carlos Ramírez", "telefono": "916-200-0001", "placa": "TX-101",
         "ruta_asignada": str(r_ids[0]), "usuario": "op1", "password_hash": hash_password("taxi123"),
         "marca": "Nissan", "modelo": "March", "color": "Blanco"},
        {"nombre": "Ana Torres", "telefono": "916-200-0002", "placa": "TX-102",
         "ruta_asignada": None, "usuario": "op2", "password_hash": hash_password("taxi123"),
         "marca": "Chevrolet", "modelo": "Aveo", "color": "Gris"},
        {"nombre": "Luis Méndez", "telefono": "916-200-0003", "placa": "TX-103",
         "ruta_asignada": str(r_ids[1]), "usuario": "op3", "password_hash": hash_password("taxi123"),
         "marca": "Toyota", "modelo": "Yaris", "color": "Café"},
    ]
    tipo_estandar_id = await _tipo_vehiculo_default_id()
    for o in operadores:
        doc = {k: v for k, v in o.items() if k not in ("marca", "modelo", "color")}
        doc.update({"estado": EstadoOperador.fuera_de_servicio.value,
                    "lat": None, "lng": None, "ultima_actualizacion": None,
                    "sitio_id": DEFAULT_SITIO, "activo": True})
        res = await db.operadores.insert_one(doc)
        op_id = str(res.inserted_id)
        v_res = await db.vehiculos.insert_one({
            "numero_economico": o["placa"], "placa": None,
            "marca": o.get("marca"), "modelo": o.get("modelo"), "color": o.get("color"),
            "estado": "activo", "activo": True, "sitio_id": DEFAULT_SITIO,
            "operador_conductor_id": op_id, "lat": None, "lng": None, "ultima_actualizacion": None,
            "tipo_vehiculo_id": tipo_estandar_id, "foto_url": None,
        })
        await db.operadores.update_one({"_id": res.inserted_id}, {"$set": {"vehiculo_id": str(v_res.inserted_id)}})

    return {"ok": True, "message": "Datos de ejemplo creados",
            "operadores": ["op1", "op2", "op3"], "contrasena": "taxi123"}


@api_router.get("/")
async def root():
    return {"message": "Central de Taxis API", "status": "ok"}


# ---------------------------------------------------------------------------
# WebSockets (canales autenticados por token en query string)
# ---------------------------------------------------------------------------
def _ws_payload_valido(token: Optional[str], scope: str, subject_id: Optional[str] = None) -> bool:
    """Valida el JWT del WebSocket: scope correcto y, si aplica, que el `sub`
    corresponda al canal (operador/pasajero solo pueden abrir su propio canal)."""
    if not token:
        return False
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        return False
    actual = payload.get("scope")
    if actual != scope:
        # Compat: los tokens de operador antiguos no traían scope.
        if not (scope == "operador" and actual is None):
            return False
    if subject_id is not None and payload.get("sub") != subject_id:
        return False
    return True


async def ws_autenticar(ws: WebSocket, token: Optional[str], scope: str, subject_id: Optional[str] = None) -> bool:
    """Acepta la conexión y, si el token no es válido, la cierra (1008)."""
    await ws.accept()
    if not _ws_payload_valido(token, scope, subject_id):
        await ws.close(code=1008, reason="No autorizado")
        return False
    return True


@api_router.websocket("/ws/terminal")
async def ws_terminal(ws: WebSocket, token: Optional[str] = Query(None)):
    if not await ws_autenticar(ws, token, "terminal"):
        return
    await manager.connect_terminal(ws)
    try:
        while True:
            await ws.receive_text()  # keepalive
    except WebSocketDisconnect:
        manager.disconnect_terminal(ws)


@api_router.websocket("/ws/operador/{operador_id}")
async def ws_operador(ws: WebSocket, operador_id: str, token: Optional[str] = Query(None)):
    if not await ws_autenticar(ws, token, "operador", subject_id=operador_id):
        return
    await manager.connect_operador(operador_id, ws)
    try:
        while True:
            await ws.receive_text()  # keepalive
    except WebSocketDisconnect:
        manager.disconnect_operador(operador_id, ws)


@api_router.websocket("/ws/pasajero/{pasajero_id}")
async def ws_pasajero(ws: WebSocket, pasajero_id: str, token: Optional[str] = Query(None)):
    if not await ws_autenticar(ws, token, "pasajero", subject_id=pasajero_id):
        return
    await manager.connect_pasajero(pasajero_id, ws)
    try:
        while True:
            await ws.receive_text()  # keepalive
    except WebSocketDisconnect:
        manager.disconnect_pasajero(pasajero_id, ws)


@api_router.websocket("/ws/dueno/{dueno_id}")
async def ws_dueno(ws: WebSocket, dueno_id: str, token: Optional[str] = Query(None)):
    if not await ws_autenticar(ws, token, "dueno", subject_id=dueno_id):
        return
    await manager.connect_dueno(dueno_id, ws)
    try:
        while True:
            await ws.receive_text()  # keepalive
    except WebSocketDisconnect:
        manager.disconnect_dueno(dueno_id, ws)


# ---------------------------------------------------------------------------
# Wire up
# ---------------------------------------------------------------------------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await _migraciones()
    await db.operadores.create_index("usuario", unique=True)
    await db.servicios.create_index("cliente_id")
    await db.servicios.create_index("operador_asignado_id")
    await db.servicios.create_index("estado")
    await db.servicios.create_index("pasajero_id")
    await db.servicios.create_index([("operador_asignado_id", 1), ("estado", 1)])
    await db.vehiculos.create_index("numero_economico", unique=True)
    await db.vehiculos.create_index("operador_conductor_id")
    await db.vehiculos.create_index("propietario_id")
    await db.vehiculos.create_index("tipo_vehiculo_id")
    await db.tipos_vehiculo.create_index("orden")
    await db.clientes.create_index("telefono")
    await db.clientes.create_index("usuario", sparse=True, unique=True)
    if await db.usuarios_terminal.count_documents({}) == 0:
        await db.usuarios_terminal.insert_one(
            {"nombre": "Central", "usuario": "central", "password_hash": hash_password("central123")}
        )
    await db.usuarios_terminal.create_index("usuario", unique=True)
    await db.usuarios_dueno.create_index("usuario", unique=True)
    await db.servicios.create_index("distancia_m", sparse=True)
    await db.mensajes_chat.create_index([("servicio_id", 1), ("timestamp", 1)])
    await db.mensajes_chat.create_index("timestamp")
    (UPLOAD_DIR / "reportes").mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / "perfiles").mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / "logo").mkdir(parents=True, exist_ok=True)
    logger.info("Directorio de archivos listo: %s", UPLOAD_DIR)
    logger.info("Central de Taxis API iniciada")


DEFAULT_TIPOS_VEHICULO = [
    {"nombre": "Taxi estándar", "descripcion": "El taxi clásico del sitio, siempre disponible.",
     "capacidad": 4, "caracteristicas": ["Taxímetro", "4 puertas"], "orden": 1, "slug": "taxi-estandar"},
    {"nombre": "Sedán", "descripcion": "Auto de 4 puertas, cómodo para viajes cortos y medianos.",
     "capacidad": 4, "caracteristicas": ["4 puertas", "Cajuela mediana"], "orden": 2, "slug": "sedan"},
    {"nombre": "SUV", "descripcion": "Mayor espacio y altura, ideal para grupos o equipaje.",
     "capacidad": 6, "caracteristicas": ["5-6 asientos", "Mayor cajuela"], "orden": 3, "slug": "suv"},
    {"nombre": "Van", "descripcion": "Para grupos grandes o traslados con mucho equipaje.",
     "capacidad": 8, "caracteristicas": ["Hasta 8 pasajeros", "Puerta corrediza"], "orden": 4, "slug": "van"},
    {"nombre": "Pickup", "descripcion": "Con caja abierta, útil para carga.",
     "capacidad": 4, "caracteristicas": ["Caja de carga"], "orden": 5, "slug": "pickup"},
    {"nombre": "Ejecutivo", "descripcion": "Unidad premium para servicio ejecutivo o eventos.",
     "capacidad": 4, "caracteristicas": ["Interior premium", "Conductor formal"], "orden": 6, "slug": "ejecutivo"},
]


async def _migraciones():
    """Migraciones seguras (idempotentes): nunca borran datos.

    1) Sitio por defecto en `sitios`.
    2) `sitio_id` en operadores/clientes/servicios/vehículos existentes.
    3) Backfill de vehículos a partir de la `placa` de operadores sin vehículo.
    4) Catálogo de tipos de vehículo (VehicleType) — solo si la colección está vacía.
    5) Backfill de `tipo_vehiculo_id` en vehículos existentes → "Taxi estándar".
    """
    # 1) Sitio por defecto
    if not await db.sitios.find_one({"clave": DEFAULT_SITIO}):
        await db.sitios.insert_one({"clave": DEFAULT_SITIO, "nombre": "Sitio principal", "creado": now_iso()})

    # 2) sitio_id backfill
    for col in ("operadores", "clientes", "servicios", "vehiculos"):
        await db[col].update_many({"sitio_id": {"$exists": False}}, {"$set": {"sitio_id": DEFAULT_SITIO}})
    # activo a True (operadores/clientes antiguos no tenían el campo)
    await db.operadores.update_many({"activo": {"$exists": False}}, {"$set": {"activo": True}})
    await db.clientes.update_many({"activo": {"$exists": False}}, {"$set": {"activo": True}})

    # 3) Vehículo por cada operador que no tenga uno (se reutiliza su `placa`)
    ops = await db.operadores.find({"vehiculo_id": {"$in": [None, ""]}}).to_list(1000)
    for op in ops:
        placa = op.get("placa") or f"V{str(op['_id'])[:6]}"
        existente = await db.vehiculos.find_one({"numero_economico": placa})
        if existente:
            await db.operadores.update_one({"_id": op["_id"]},
                                           {"$set": {"vehiculo_id": str(existente["_id"])}})
        else:
            v_res = await db.vehiculos.insert_one({
                "numero_economico": placa, "placa": None, "marca": "", "modelo": "", "color": "",
                "estado": "activo", "activo": True, "sitio_id": DEFAULT_SITIO,
                "operador_conductor_id": str(op["_id"]),
                "lat": None, "lng": None, "ultima_actualizacion": None,
            })
            await db.operadores.update_one({"_id": op["_id"]},
                                           {"$set": {"vehiculo_id": str(v_res.inserted_id)}})

    # Tarifas y umbrales por defecto en config
    await db.config.update_one({"key": "gps_stale_seconds"}, {"$setOnInsert": {"key": "gps_stale_seconds", "valor": 120}}, upsert=True)
    await db.config.update_one({"key": "oferta_duracion_seg"}, {"$setOnInsert": {"key": "oferta_duracion_seg", "valor": 60}}, upsert=True)

    # 4) Catálogo de tipos de vehículo: se siembra una sola vez (colección vacía).
    # No es una lista hardcodeada en el código de negocio — vive en Mongo, editable
    # desde /api/tipos-vehiculo; esto solo aporta un punto de partida útil.
    if await db.tipos_vehiculo.count_documents({}) == 0:
        for t in DEFAULT_TIPOS_VEHICULO:
            await db.tipos_vehiculo.insert_one({
                "nombre": t["nombre"], "descripcion": t["descripcion"], "capacidad": t["capacidad"],
                "caracteristicas": t["caracteristicas"], "orden": t["orden"], "activo": True,
                "imagen_url": f"/vehicle-types/{t['slug']}.svg",
            })
        logger.info("Catálogo de tipos de vehículo sembrado (%d tipos)", len(DEFAULT_TIPOS_VEHICULO))

    # 5) Backfill: vehículos sin tipo asignado → "Taxi estándar" (nunca se inventa
    # marca/modelo, pero SIEMPRE debe haber una representación visual del vehículo).
    taxi_estandar = await db.tipos_vehiculo.find_one({"nombre": "Taxi estándar"})
    if taxi_estandar:
        await db.vehiculos.update_many(
            {"tipo_vehiculo_id": {"$in": [None, ""]}},
            {"$set": {"tipo_vehiculo_id": str(taxi_estandar["_id"])}},
        )
    await db.vehiculos.update_many({"foto_url": {"$exists": False}}, {"$set": {"foto_url": None}})

    logger.info("Migraciones aplicadas (sitios, sitio_id, vehículos backfill, tipos de vehículo)")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
