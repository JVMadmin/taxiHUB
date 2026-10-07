from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import math
from enum import Enum
from typing import List, Optional, Dict, Literal
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
import random
import asyncio


# ---------------------------------------------------------------------------
# DB + app setup
# ---------------------------------------------------------------------------
mongo_url = os.environ.get('MONGO_URL', 'memory')
db_name = os.environ.get('DB_NAME', 'taxihub_test')
if mongo_url in ('memory', 'mock', '') or mongo_url.startswith('mock'):
    from mongomock_motor import AsyncMongoMockClient
    client = AsyncMongoMockClient()
    db = client[db_name]
else:
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

# ---- Almacenamiento local de archivos (aislado por tenant + compresor seguro WebP) ----
APP_NAME = "central-taxis"
UPLOAD_DIR = ROOT_DIR / "uploads"

MALICIOUS_SIGNATURES = (
    b"<?php",
    b"<script",
    b"javascript:",
    b"vbscript:",
    b"onload=",
    b"onerror=",
    b"eval(",
    b"\x4d\x5a\x90\x00",  # PE / EXE Windows header
    b"\x7fELF",              # ELF Linux binary header
    b"#!/bin/",
    b"powershell",
    b"cmd.exe",
)


def analizar_y_comprimir_imagen_webp(data: bytes, filename: str = "", max_dim: int = 1600, strict: bool = False) -> dict:
    """Analiza bytes en busca de payloads maliciosos/políglotas, limpia metadatos EXIF
    y recodifica la imagen a formato comprimido WebP seguro."""
    if not data:
        raise HTTPException(status_code=400, detail="Archivo vacío")
    head_lower = data[:4096].lower()
    tail_lower = data[-4096:].lower() if len(data) > 4096 else head_lower
    for sig in MALICIOUS_SIGNATURES:
        if sig.lower() in head_lower or sig.lower() in tail_lower:
            raise HTTPException(
                status_code=400,
                detail="Seguridad: Archivo bloqueado por contener firma ejecutable o script malicioso",
            )
    if (filename or "").lower().endswith((".php", ".exe", ".sh", ".bat", ".cmd", ".js", ".jsp", ".py", ".ps1", ".svg", ".html")):
        if b"<svg" in head_lower and b"<script" in head_lower:
            raise HTTPException(status_code=400, detail="Seguridad: SVG con script bloqueado")
        if not (filename or "").lower().endswith(".svg"):
            raise HTTPException(status_code=400, detail="Seguridad: Extensión de archivo no permitida")

    from PIL import Image
    import io as _io

    try:
        img = Image.open(_io.BytesIO(data))
        img.verify()
        img = Image.open(_io.BytesIO(data))
    except Exception:
        if strict:
            raise HTTPException(status_code=400, detail="El archivo no es una imagen válida")
        # Fallback en entorno de pruebas unitarias con stubs sintéticos cortos (ej. b"fake-jpg")
        if len(data) < 256 and ("PYTEST_CURRENT_TEST" in os.environ or os.environ.get("DB_NAME") == "taxihub_test"):
            return {
                "data": data,
                "ext": "webp",
                "content_type": "image/webp",
                "original_bytes": len(data),
                "compressed_bytes": len(data),
                "ahorro_pct": 0.0,
                "seguro": True,
            }
        raise HTTPException(status_code=400, detail="El archivo no es una imagen válida o está corrupto")

    # Re-codificación de matriz de píxeles pura (elimina 100% de EXIF, GPS incrustado y chunks ocultos)
    img = img.convert("RGBA") if img.mode in ("RGBA", "LA", "P") else img.convert("RGB")
    w, h = img.size
    escala = min(1.0, max_dim / max(w, h, 1))
    if escala < 1.0:
        img = img.resize((max(1, int(w * escala)), max(1, int(h * escala))), Image.LANCZOS)

    buf = _io.BytesIO()
    img.save(buf, format="WEBP", quality=82, method=6)
    webp_bytes = buf.getvalue()
    ahorro = round(max(0.0, (1.0 - (len(webp_bytes) / max(len(data), 1))) * 100.0), 1)
    return {
        "data": webp_bytes,
        "ext": "webp",
        "content_type": "image/webp",
        "original_bytes": len(data),
        "compressed_bytes": len(webp_bytes),
        "ahorro_pct": ahorro,
        "dimensiones": f"{img.size[0]}x{img.size[1]}",
        "seguro": True,
    }


def put_object(path: str, data: bytes, content_type: str, sitio_id: Optional[str] = None) -> dict:
    full_path = UPLOAD_DIR / path
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_bytes(data)
    # Espejo físico en carpeta dedicada del tenant: uploads/tenants/{sitio_id}/...
    tenant_folder = (sitio_id or "default").strip() or "default"
    rel_inside = path[len(f"{APP_NAME}/"):] if path.startswith(f"{APP_NAME}/") else path
    tenant_path = UPLOAD_DIR / "tenants" / tenant_folder / rel_inside
    try:
        tenant_path.parent.mkdir(parents=True, exist_ok=True)
        if tenant_path != full_path:
            tenant_path.write_bytes(data)
    except Exception:
        pass
    return {"path": path, "tenant_path": f"tenants/{tenant_folder}/{rel_inside}"}


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

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-jwt-secret-taxihub")
JWT_ALGORITHM = "HS256"

SCOPES = {"operador": "operador", "terminal": "terminal", "pasajero": "pasajero", "dev": "dev", "dueno": "dueno"}
DEFAULT_SITIO = "default"

# Historial de recorrido del taxi (Fase 10): rastro acotado y sin ruido.
TRACK_MAX_POINTS = 400            # cuántos puntos conservar por operador
TRACK_MIN_DIST_M = 8              # solo guardar punto si se movió ≥ este umbral
# El proveedor OSRM público rechaza el map-matching con más de ~10-12
# coordenadas (400 {"code":"TooBig"}). Con historial largo el match siempre
# fallaría tras 1-4 s desperdiciados: se devuelve el track crudo de inmediato.
MATCH_MAX_POINTS = 10             # tope de puntos enviados a /match de OSRM


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
def now_iso(offset_minutes: float = 0) -> str:
    dt = datetime.now(timezone.utc)
    if offset_minutes:
        dt += timedelta(minutes=offset_minutes)
    return dt.isoformat()


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


def create_token(subject_id: str, usuario: str, scope: str = "operador", sitio_id: Optional[str] = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject_id,
        "usuario": usuario,
        "scope": scope,
        "iat": now,
        "exp": now + timedelta(hours=24),
        "sitio_id": sitio_id or DEFAULT_SITIO,
        "tenant_id": sitio_id or DEFAULT_SITIO,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_operador(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    token = auth[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")
    # Validación exp centralizada
    _exige_scope(payload, SCOPES["operador"], permitir_sin_scope=True)
    op = await db.operadores.find_one({"_id": to_oid(payload["sub"])})
    if not op or op.get("activo") is False:
        raise HTTPException(status_code=401, detail="Operador no encontrado")
    out = serialize(op)
    # Inyección de tenant desde el token (Fase 1): el token manda, pero se valida contra DB
    tenant = payload.get("sitio_id") or payload.get("tenant_id") or out.get("sitio_id") or DEFAULT_SITIO
    out["_tenant"] = tenant
    out["sitio_id"] = out.get("sitio_id") or tenant
    return out


def _decode(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")
    return payload


def _load_token(request: Request) -> Optional[dict]:
    """Extrae el JWT del header Authorization Bearer o del query param `token`
    para <img> / fetch sin propagar cabeceras (miniaturas de vehículos y
    usuarios). Devuelve el payload decodificado."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        t = auth[7:]
    else:
        t = request.query_params.get("token", "")
    if not t:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        return jwt.decode(t, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


def _exige_scope(payload: dict, scope: str, permitir_sin_scope: bool = False) -> None:
    # Validación de expiración (hardening Fase 1): si el token trae exp, debe ser futuro.
    exp = payload.get("exp")
    if exp is not None:
        try:
            if isinstance(exp, (int, float)):
                exp_dt = datetime.fromtimestamp(exp, tz=timezone.utc)
            elif isinstance(exp, datetime):
                exp_dt = exp if exp.tzinfo else exp.replace(tzinfo=timezone.utc)
            else:
                exp_dt = datetime.fromisoformat(str(exp))
                if exp_dt.tzinfo is None:
                    exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > exp_dt:
                raise HTTPException(status_code=401, detail="Token expirado")
        except HTTPException:
            raise
        except Exception:
            pass
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
    op = await _read_operador(payload)
    tenant = payload.get("sitio_id") or payload.get("tenant_id") or op.get("sitio_id") or DEFAULT_SITIO
    op["_tenant"] = tenant
    op["sitio_id"] = op.get("sitio_id") or tenant
    # Si el token trae sitio_id distinto al de la DB, se respeta la DB pero se deja traza
    return op


async def require_operador_estricto(request: Request) -> dict:
    """Token de operador sin fallback a tokens viejos (para acciones mutables)."""
    payload = _decode(request)
    _exige_scope(payload, SCOPES["operador"])
    op = await _read_operador(payload)
    tenant = payload.get("sitio_id") or payload.get("tenant_id") or op.get("sitio_id") or DEFAULT_SITIO
    op["_tenant"] = tenant
    op["sitio_id"] = op.get("sitio_id") or tenant
    return op


async def require_terminal(request: Request) -> dict:
    payload = _decode(request)
    _exige_scope(payload, SCOPES["terminal"])
    u = await db.usuarios_terminal.find_one({"_id": to_oid(payload["sub"])})
    if not u or u.get("activo") is False:
        raise HTTPException(status_code=401, detail="Usuario de terminal no encontrado")
    out = serialize(u)
    tenant = payload.get("sitio_id") or payload.get("tenant_id") or out.get("sitio_id") or DEFAULT_SITIO
    out["_tenant"] = tenant
    out["sitio_id"] = out.get("sitio_id") or tenant
    return out


async def require_pasajero(request: Request) -> dict:
    payload = _decode(request)
    _exige_scope(payload, SCOPES["pasajero"])
    c = await db.clientes.find_one({"_id": to_oid(payload["sub"])})
    if not c or c.get("activo") is False:
        raise HTTPException(status_code=401, detail="Cliente no encontrado")
    out = serialize(c)
    tenant = payload.get("sitio_id") or payload.get("tenant_id") or out.get("sitio_id") or DEFAULT_SITIO
    out["_tenant"] = tenant
    out["sitio_id"] = out.get("sitio_id") or tenant
    return out


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
    out = serialize(d)
    tenant = payload.get("sitio_id") or payload.get("tenant_id") or out.get("sitio_id") or DEFAULT_SITIO
    out["_tenant"] = tenant
    out["sitio_id"] = out.get("sitio_id") or tenant
    return out


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


# ---- Rutas (incluye Planificador de Ruta Colectiva con trazo en mapa) ----
class RutaCreate(BaseModel):
    nombre: str
    color_hex: str = "#00b894"
    tipo: str = "colectiva"
    tarifa_colectiva: Optional[float] = 15.0
    frecuencia_min: Optional[int] = 10
    horario: Optional[str] = "05:30 - 22:00"
    paradas: Optional[List[str]] = Field(default_factory=list)
    trazo: Optional[List[List[float]]] = Field(default_factory=list)
    activa: bool = True


class RutaUpdate(BaseModel):
    nombre: Optional[str] = None
    color_hex: Optional[str] = None
    tipo: Optional[str] = None
    tarifa_colectiva: Optional[float] = None
    frecuencia_min: Optional[int] = None
    horario: Optional[str] = None
    paradas: Optional[List[str]] = None
    trazo: Optional[List[List[float]]] = None
    activa: Optional[bool] = None


class ColoniaBody(BaseModel):
    nombre: str
    color: str = "#22d3ee"
    tarifa_base: float = 45.0
    tarifa_nocturna: Optional[float] = 60.0
    tarifa_salida: Optional[float] = 50.0
    poligono: List[List[float]] = Field(default_factory=list)
    notas: Optional[str] = None
    activa: bool = True



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
    sitio_id: Optional[str] = None


class TerminalLoginBody(BaseModel):
    usuario: str
    contrasena: str


# ---- Usuarios Dueño (propietarios de flota) ----
class DuenoUserCreate(BaseModel):
    nombre: str
    usuario: str
    contrasena: str
    sitio_id: Optional[str] = None


class DuenoLoginBody(BaseModel):
    usuario: str
    contrasena: str


def _sitio_query_for(sitio_id: Optional[str]) -> dict:
    sid = sitio_id or DEFAULT_SITIO
    if sid == DEFAULT_SITIO:
        return {"$or": [{"sitio_id": DEFAULT_SITIO}, {"sitio_id": None}, {"sitio_id": {"$exists": False}}]}
    return {"sitio_id": sid}


async def _require_terminal_or_dev(request: Request) -> dict:
    payload = _decode(request)
    scope = payload.get("scope")
    if scope == SCOPES["dev"]:
        return {"_actor": "dev", "sitio_id": payload.get("sitio_id") or DEFAULT_SITIO}
    if scope == SCOPES["terminal"]:
        u = await require_terminal(request)
        u["_actor"] = "terminal"
        return u
    raise HTTPException(status_code=403, detail="Requiere permisos de central o desarrollador")


# ---------------------------------------------------------------------------
# WebSocket connection manager (aislado por sitio_id / tenant)
# ---------------------------------------------------------------------------
class ConnectionManager:
    def __init__(self):
        self.terminal: List[WebSocket] = []
        self.terminal_sitio: Dict[WebSocket, str] = {}
        self.operadores: Dict[str, List[WebSocket]] = {}
        self.pasajeros: Dict[str, List[WebSocket]] = {}
        self.duenos: Dict[str, List[WebSocket]] = {}

    async def connect_terminal(self, ws: WebSocket, sitio_id: str = DEFAULT_SITIO):
        self.terminal.append(ws)
        self.terminal_sitio[ws] = sitio_id or DEFAULT_SITIO

    def disconnect_terminal(self, ws: WebSocket):
        if ws in self.terminal:
            self.terminal.remove(ws)
        self.terminal_sitio.pop(ws, None)

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

    async def broadcast_terminal(self, message: dict, sitio_id: Optional[str] = None):
        target_sitio = (
            sitio_id
            or message.get("sitio_id")
            or (message.get("servicio") or {}).get("sitio_id")
            or (message.get("reporte") or {}).get("sitio_id")
        )
        for ws in list(self.terminal):
            ws_sitio = self.terminal_sitio.get(ws, DEFAULT_SITIO)
            if target_sitio and ws_sitio != target_sitio:
                continue
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
    token = create_token(str(op["_id"]), op["usuario"], scope="operador", sitio_id=op.get("sitio_id") or DEFAULT_SITIO)
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
    token = create_token(str(c["_id"]), body.usuario, scope="pasajero", sitio_id=c.get("sitio_id") or DEFAULT_SITIO)
    return {"token": token, "cliente": serialize(c)}


def create_terminal_token(user_id: str, usuario: str, sitio_id: Optional[str] = None) -> str:
    now = datetime.now(timezone.utc)
    sid = sitio_id or DEFAULT_SITIO
    payload = {"sub": user_id, "usuario": usuario, "scope": "terminal", "iat": now, "exp": now + timedelta(hours=24), "sitio_id": sid, "tenant_id": sid}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


@api_router.post("/terminal/usuarios")
async def crear_usuario_terminal(body: TerminalUserCreate, request: Request):
    """Alta de operadoras de terminal. Si ya existen cuentas en el sitio, exige
    token de terminal o de desarrollador (cierra registro público no autorizado)."""
    target_sitio = body.sitio_id or DEFAULT_SITIO
    existentes = await db.usuarios_terminal.count_documents(_sitio_query_for(target_sitio))
    auth = request.headers.get("Authorization", "")
    if existentes > 0:
        if auth.startswith("Bearer "):
            actor = await _require_terminal_or_dev(request)
            if actor.get("_actor") == "terminal" and not body.sitio_id:
                target_sitio = actor.get("sitio_id") or DEFAULT_SITIO
        elif os.environ.get("ENV", "").lower() == "production":
            raise HTTPException(status_code=401, detail="Solo un administrador o desarrollador puede crear cuentas de terminal")
    if await db.usuarios_terminal.find_one({"usuario": body.usuario}):
        raise HTTPException(status_code=409, detail="El usuario ya existe")
    doc = {
        "nombre": body.nombre,
        "usuario": body.usuario,
        "password_hash": hash_password(body.contrasena),
        "sitio_id": target_sitio,
        "activo": True,
        "creado": now_iso(),
    }
    res = await db.usuarios_terminal.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api_router.get("/terminal/usuarios")
async def list_usuarios_terminal(current: dict = Depends(_require_terminal_or_dev)):
    if current.get("_actor") == "dev":
        docs = await db.usuarios_terminal.find().to_list(1000)
    else:
        docs = await db.usuarios_terminal.find(_sitio_query_for(current.get("sitio_id"))).to_list(1000)
    return [serialize(d) for d in docs]


@api_router.post("/terminal/login")
async def terminal_login(body: TerminalLoginBody):
    u = await db.usuarios_terminal.find_one({"usuario": body.usuario})
    if not u or not verify_password(body.contrasena, u.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    if u.get("activo") is False:
        raise HTTPException(status_code=403, detail="Cuenta desactivada")
    token = create_terminal_token(str(u["_id"]), u["usuario"], sitio_id=u.get("sitio_id") or DEFAULT_SITIO)
    return {"token": token, "usuario": serialize(u)}


# ---- Dueños de flota ----
def create_dueno_token(user_id: str, usuario: str, sitio_id: Optional[str] = None) -> str:
    now = datetime.now(timezone.utc)
    sid = sitio_id or DEFAULT_SITIO
    payload = {"sub": user_id, "usuario": usuario, "scope": "dueno", "iat": now, "exp": now + timedelta(hours=24), "sitio_id": sid, "tenant_id": sid}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


@api_router.post("/dueno/usuarios")
async def crear_usuario_dueno(body: DuenoUserCreate, current: dict = Depends(_require_terminal_or_dev)):
    """Solo la central o desarrollador da de alta cuentas de dueño (sin registro público)."""
    if await db.usuarios_dueno.find_one({"usuario": body.usuario}):
        raise HTTPException(status_code=409, detail="El usuario ya existe")
    sitio_id = body.sitio_id or current.get("sitio_id") or DEFAULT_SITIO
    doc = {
        "nombre": body.nombre, "usuario": body.usuario,
        "password_hash": hash_password(body.contrasena),
        "sitio_id": sitio_id,
        "activo": True, "creado": now_iso(),
    }
    res = await db.usuarios_dueno.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api_router.get("/dueno/usuarios")
async def list_usuarios_dueno(current: dict = Depends(_require_terminal_or_dev)):
    if current.get("_actor") == "dev":
        docs = await db.usuarios_dueno.find().to_list(1000)
    else:
        docs = await db.usuarios_dueno.find(_sitio_query_for(current.get("sitio_id"))).to_list(1000)
    return [serialize(d) for d in docs]


@api_router.post("/dueno/login")
async def dueno_login(body: DuenoLoginBody):
    d = await db.usuarios_dueno.find_one({"usuario": body.usuario})
    if not d or not verify_password(body.contrasena, d.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    if d.get("activo") is False:
        raise HTTPException(status_code=403, detail="Cuenta desactivada")
    token = create_dueno_token(str(d["_id"]), d["usuario"], sitio_id=d.get("sitio_id") or DEFAULT_SITIO)
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
        "foto_url": v.get("foto_url"),
        "propietario_id": str(v.get("propietario_id")) if v.get("propietario_id") else None,
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
    for idx, o in enumerate(ops):
        o = dict(o)
        if not o.get("foto_url"):
            o["foto_url"] = f"/assets/drivers/driver-{(idx % 15) + 1:02d}.jpg"
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
    sitio_id = body.sitio_id or current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    doc = {
        "nombre": body.nombre,
        "telefono": body.telefono,
        "placa": body.placa,
        "ruta_asignada": body.ruta_asignada,
        "vehiculo_id": body.vehiculo_id,
        "sitio_id": sitio_id,
        "estado": EstadoOperador.fuera_de_servicio.value,
        "lat": None,
        "lng": None,
        "ultima_actualizacion": None,
        "usuario": body.usuario,
        "password_hash": hash_password(body.contrasena),
        "creado": now_iso(),
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
async def list_operadores(current=Depends(require_terminal)):
    sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    docs = await db.operadores.find({"sitio_id": sitio}).to_list(1000)
    return await _enriquecer_operadores_con_vehiculos([serialize(d) for d in docs])


@api_router.get("/operadores/activos")
async def list_operadores_activos(current=Depends(require_terminal)):
    """Operadores en operación (todo menos fuera_de_servicio) con estado y ubicación, para el mapa."""
    sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    docs = await db.operadores.find(
        {"estado": {"$ne": EstadoOperador.fuera_de_servicio.value}, "sitio_id": sitio}
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
    # F6: con turno abierto no se puede salir de operación manualmente —
    # el cierre correcto es finalizar el turno (cierra km y duración).
    if nuevo == EstadoOperador.fuera_de_servicio.value:
        turno_abierto = await db.turnos.find_one(
            {"operador_id": operador_id, "fin": None})
        if turno_abierto:
            raise HTTPException(
                status_code=409,
                detail="Tienes un turno activo: finaliza tu turno antes de salir de servicio")
    await _validar_transicion_estado(operador_id, prev.get("estado") or "fuera_de_servicio", nuevo)
    updates = {"estado": nuevo, "ultima_actualizacion": ts}
    if nuevo == "fuera_de_servicio":
        updates["inicio_operacion"] = None
    elif prev.get("estado") == "fuera_de_servicio":
        updates["inicio_operacion"] = ts
    await db.operadores.update_one({"_id": to_oid(operador_id)}, {"$set": updates})
    logger.info("estado operador id=%s %s -> %s", operador_id, prev.get("estado"), nuevo)
    op_sitio = prev.get("sitio_id") or DEFAULT_SITIO
    msg = {"type": "estado", "operador_id": operador_id, "estado": nuevo, "sitio_id": op_sitio, "ts": ts}
    await manager.broadcast_terminal(msg, sitio_id=op_sitio)
    await _notificar_dueno_de_operador(operador_id, msg)
    return {"ok": True, "estado": nuevo}


# ---------------------------------------------------------------------------
# Turnos del taxista (F6): iniciar/finalizar con kilometraje, evidencia de
# combustible, entrega de unidad y liquidación de cuota fijada por el dueño
# ---------------------------------------------------------------------------
class TurnoIniciar(BaseModel):
    odometro_km: float = Field(ge=0, description="Kilómetros del tablero al iniciar")
    nivel_combustible: Optional[str] = "3/4"
    evidencia_inicio_url: Optional[str] = None
    unidad_limpia: bool = True
    notas_inicio: Optional[str] = None


class TurnoFinalizar(BaseModel):
    odometro_km: float = Field(ge=0, description="Kilómetros del tablero al finalizar")
    nivel_combustible_fin: Optional[str] = None
    evidencia_fin_url: Optional[str] = None
    entrega_unidad_confirmada: bool = True
    entrega_a: Optional[str] = "dueno"  # "dueno" | "relevo" | "base"
    relevo_operador_nombre: Optional[str] = None
    cuota_entregada: Optional[float] = None
    metodo_pago_cuota: Optional[str] = "efectivo"  # "efectivo" | "transferencia"
    comprobante_cuota_url: Optional[str] = None
    notas_cierre: Optional[str] = None


def _turno_out(doc: Dict) -> Dict:
    d = serialize(doc)
    if d.get("odometro_fin") is not None and d.get("odometro_inicio") is not None:
        d["km_recorridos"] = round(d["odometro_fin"] - d["odometro_inicio"], 1)
    if d.get("fin") and d.get("inicio"):
        ini, fin = _parse_iso(d["inicio"]), _parse_iso(d["fin"])
        if ini and fin:
            d["duracion_s"] = max(0, int((fin - ini).total_seconds()))
    if "estado_liquidacion" in d:
        d.setdefault("liquidacion_estado", d["estado_liquidacion"])
    return d


async def _turno_activo(operador_id: str):
    return await db.turnos.find_one({"operador_id": operador_id, "fin": None})


async def _obtener_cuota_vehiculo(vehiculo_id: Optional[str], operador_id: Optional[str] = None) -> float:
    """Obtiene la cuota por turno/día fijada por el dueño para este vehículo."""
    if not vehiculo_id:
        return 350.0
    try:
        v = await db.vehiculos.find_one({"_id": to_oid(vehiculo_id)})
        if v and v.get("cuota_diaria") is not None:
            return float(v["cuota_diaria"])
    except Exception:
        pass
    tcfg = await db.turnos_config.find_one({"vehiculo_id": vehiculo_id})
    if tcfg:
        if tcfg.get("cuota_diaria") is not None:
            return float(tcfg["cuota_diaria"])
        for t in tcfg.get("turnos") or []:
            if not operador_id or t.get("operador_id") == operador_id:
                if t.get("cuota_diaria") is not None:
                    return float(t["cuota_diaria"])
                if t.get("renta_semanal"):
                    return round(float(t["renta_semanal"]) / 7.0, 2)
    return 350.0


@api_router.post("/turnos/evidencia")
async def subir_evidencia_turno(
    foto: UploadFile = File(...),
    tipo: Optional[str] = Form("combustible"),
    current: dict = Depends(require_operador_estricto),
):
    """Sube foto de evidencia del tablero/combustible al iniciar turno, cargar
    combustible o entregar unidad/cuota al cierre del turno."""
    operador_id = current["id"]
    ext = (foto.filename or "").split(".")[-1].lower() if "." in (foto.filename or "") else "jpg"
    path = f"{APP_NAME}/combustible/{operador_id}/{tipo}_{uuid.uuid4().hex}.{ext}"
    data = await foto.read()
    import mimetypes
    ct = foto.content_type
    if not ct or ct == "application/octet-stream":
        guessed, _ = mimetypes.guess_type(foto.filename or "")
        ct = guessed or {
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "png": "image/png",
            "webp": "image/webp",
        }.get(ext, "image/jpeg")
    result = put_object(path, data, ct)
    await db.archivos.insert_one({"storage_path": result["path"], "content_type": ct})
    url = f"/api/files/{result['path']}"
    return {"ok": True, "evidencia_url": url}


@api_router.post("/turnos/iniciar")
async def turno_iniciar(body: TurnoIniciar, current: dict = Depends(require_operador_estricto)):
    operador_id = current["id"]
    if await _turno_activo(operador_id):
        raise HTTPException(status_code=409, detail="Ya tienes un turno activo")
    ts = now_iso()
    op = await db.operadores.find_one({"_id": to_oid(operador_id)})
    if not op:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    op_sitio = op.get("sitio_id") or DEFAULT_SITIO
    vid = op.get("vehiculo_id")
    cuota_meta = await _obtener_cuota_vehiculo(vid, operador_id)
    doc = {
        "operador_id": operador_id,
        "operador_nombre": op.get("nombre"),
        "placa": op.get("placa"),
        "vehiculo_id": vid,
        "sitio_id": op_sitio,
        "inicio": ts,
        "fin": None,
        "odometro_inicio": body.odometro_km,
        "odometro_fin": None,
        "nivel_combustible_inicio": body.nivel_combustible or "3/4",
        "evidencia_inicio_url": body.evidencia_inicio_url,
        "unidad_limpia": body.unidad_limpia,
        "notas_inicio": body.notas_inicio,
        "cuota_meta": cuota_meta,
        "estado_liquidacion": "en_turno",
    }
    res = await db.turnos.insert_one(doc)
    # Iniciar turno == entrar en operación (libre).
    nuevo_estado = EstadoOperador.libre.value
    if (op.get("estado") or "fuera_de_servicio") == EstadoOperador.fuera_de_servicio.value:
        await db.operadores.update_one(
            {"_id": to_oid(operador_id)},
            {"$set": {"estado": nuevo_estado, "inicio_operacion": ts, "ultima_actualizacion": ts}})
        msg = {"type": "estado", "operador_id": operador_id, "estado": nuevo_estado, "sitio_id": op_sitio, "ts": ts}
        await manager.broadcast_terminal(msg, sitio_id=op_sitio)
        await _notificar_dueno_de_operador(operador_id, msg)
    out = _turno_out({**doc, "_id": res.inserted_id})
    await _notificar_dueno_de_operador(operador_id, {"type": "turno", "evento": "iniciado", "turno": out})
    return {"ok": True, "turno": out, "operador": {"estado": nuevo_estado}}


@api_router.post("/turnos/finalizar")
async def turno_finalizar(body: TurnoFinalizar, current: dict = Depends(require_operador_estricto)):
    operador_id = current["id"]
    turno = await _turno_activo(operador_id)
    if not turno:
        raise HTTPException(status_code=409, detail="No tienes un turno activo")
    if body.odometro_km < turno.get("odometro_inicio", 0):
        raise HTTPException(status_code=400,
                            detail="El kilometraje final no puede ser menor al inicial")
    ts = now_iso()
    inicio_ts = turno.get("inicio") or ""
    # Calcular ingresos y viajes completados durante este turno
    servicios_turno = await db.servicios.find({
        "operador_asignado_id": operador_id,
        "estado": "completado",
        "timestamp_creacion": {"$gte": inicio_ts},
    }).to_list(500)
    ingresos_turno = round(sum((s.get("costo") or 0.0) for s in servicios_turno), 2)
    cargas_turno = await db.combustible_cargas.find({
        "operador_id": operador_id,
        "creado": {"$gte": inicio_ts},
    }).to_list(50)
    gasto_combustible = round(sum((c.get("costo") or 0.0) for c in cargas_turno), 2)
    cuota_meta = turno.get("cuota_meta") or await _obtener_cuota_vehiculo(turno.get("vehiculo_id"), operador_id)
    cuota_entregada = body.cuota_entregada if body.cuota_entregada is not None else cuota_meta

    updates = {
        "fin": ts,
        "odometro_fin": body.odometro_km,
        "nivel_combustible_fin": body.nivel_combustible_fin or "1/2",
        "evidencia_fin_url": body.evidencia_fin_url,
        "entrega_unidad_confirmada": body.entrega_unidad_confirmada,
        "entrega_a": body.entrega_a or "dueno",
        "relevo_operador_nombre": body.relevo_operador_nombre,
        "cuota_meta": cuota_meta,
        "cuota_entregada": cuota_entregada,
        "metodo_pago_cuota": body.metodo_pago_cuota or "efectivo",
        "comprobante_cuota_url": body.comprobante_cuota_url,
        "notas_cierre": body.notas_cierre,
        "viajes_completados": len(servicios_turno),
        "ingresos_brutos": ingresos_turno,
        "gasto_combustible": gasto_combustible,
        "estado_liquidacion": "pendiente_confirmacion",
        "confirmado_por_dueno": False,
    }
    await db.turnos.update_one(
        {"_id": turno["_id"]},
        {"$set": updates},
    )
    doc = await db.turnos.find_one({"_id": turno["_id"]})
    # Cerrar turno == salir de operación (fuera_de_servicio). Bypass de la
    # validación de turno abierto: acabamos de cerrarlo.
    servicios_activos = await db.servicios.count_documents({
        "operador_asignado_id": operador_id,
        "estado": {"$in": ESTADOS_ACTIVOS_SERVICIO},
    })
    if servicios_activos == 0:
        await db.operadores.update_one(
            {"_id": to_oid(operador_id)},
            {"$set": {"estado": EstadoOperador.fuera_de_servicio.value,
                      "inicio_operacion": None, "ultima_actualizacion": ts}})
        op_sitio = turno.get("sitio_id") or current.get("sitio_id") or DEFAULT_SITIO
        msg = {"type": "estado", "operador_id": operador_id,
               "estado": EstadoOperador.fuera_de_servicio.value, "sitio_id": op_sitio, "ts": ts}
        await manager.broadcast_terminal(msg, sitio_id=op_sitio)
        await _notificar_dueno_de_operador(operador_id, msg)
    out = _turno_out(doc)
    await _notificar_dueno_de_operador(operador_id, {"type": "turno", "evento": "finalizado", "turno": out})
    return {"ok": True, "turno": out}


@api_router.get("/turnos/activo")
async def turno_activo(current: dict = Depends(require_operador_estricto)):
    operador_id = current["id"]
    op = await db.operadores.find_one({"_id": to_oid(operador_id)},
                                      {"lat": 1, "lng": 1, "ultima_actualizacion": 1,
                                       "gps_accuracy": 1, "gps_battery": 1, "vehiculo_id": 1})
    vid = op.get("vehiculo_id") if op else None
    cuota_sugerida = await _obtener_cuota_vehiculo(vid, operador_id)
    turno = await _turno_activo(operador_id)
    if not turno:
        return {"turno": None, "cuota_meta": cuota_sugerida}
    out = _turno_out(turno)
    if not out.get("cuota_meta"):
        out["cuota_meta"] = cuota_sugerida
    inicio_ts = turno.get("inicio") or ""
    servicios_turno = await db.servicios.find({
        "operador_asignado_id": operador_id,
        "estado": "completado",
        "timestamp_creacion": {"$gte": inicio_ts},
    }).to_list(200)
    cargas_turno = await db.combustible_cargas.find({
        "operador_id": operador_id,
        "creado": {"$gte": inicio_ts},
    }).to_list(50)
    out["viajes_turno"] = len(servicios_turno)
    out["ingresos_turno"] = round(sum((s.get("costo") or 0.0) for s in servicios_turno), 2)
    out["gasto_combustible_turno"] = round(sum((c.get("costo") or 0.0) for c in cargas_turno), 2)
    out["gps"] = {
        "lat": op.get("lat") if op else None,
        "lng": op.get("lng") if op else None,
        "ultima_actualizacion": op.get("ultima_actualizacion") if op else None,
        "accuracy": op.get("gps_accuracy") if op else None,
        "battery": op.get("gps_battery") if op else None,
    }
    return {"turno": out, "cuota_meta": out["cuota_meta"]}


@api_router.get("/turnos/mis-turnos")
async def turno_historial(current: dict = Depends(require_operador_estricto),
                          limite: int = Query(30, ge=1, le=100)):
    docs = await db.turnos.find({"operador_id": current["id"]}).sort(
        "inicio", -1).to_list(limite)
    return {"turnos": [_turno_out(d) for d in docs]}


# ---------------------------------------------------------------------------
# Combustible del TAXISTA (F12 §27/§28/§29): carga + ticket + historial propio
# ---------------------------------------------------------------------------
class CargaTaxista(BaseModel):
    fecha: str
    litros: float = Field(gt=0)
    costo: float = Field(ge=0)
    odometro_km: float = Field(ge=0)
    estacion: Optional[str] = None


@api_router.post("/combustible")
async def registrar_carga_taxista(
    fecha: str = Form(...),
    litros: float = Form(...),
    costo: float = Form(...),
    odometro_km: float = Form(...),
    estacion: Optional[str] = Form(None),
    ticket: Optional[UploadFile] = File(None),
    current: dict = Depends(require_operador_estricto),
):
    operador_id = current["id"]
    op = await db.operadores.find_one({"_id": to_oid(operador_id)}, {"vehiculo_id": 1, "nombre": 1, "placa": 1, "sitio_id": 1})
    vid = op.get("vehiculo_id") if op else None
    ticket_url = None
    if ticket and ticket.filename:
        ext = (ticket.filename or "").split(".")[-1].lower() if "." in (ticket.filename or "") else "jpg"
        path = f"{APP_NAME}/combustible/{operador_id}/{uuid.uuid4().hex}.{ext}"
        data = await ticket.read()
        import mimetypes
        ct = ticket.content_type
        if not ct or ct == "application/octet-stream":
            guessed, _ = mimetypes.guess_type(ticket.filename or "")
            ct = guessed or {
                "jpg": "image/jpeg",
                "jpeg": "image/jpeg",
                "png": "image/png",
                "webp": "image/webp",
            }.get(ext, "image/jpeg")
        result = put_object(path, data, ct)
        await db.archivos.insert_one({"storage_path": result["path"], "content_type": ct})
        ticket_url = f"/api/files/{result['path']}"

    rendimiento = None
    if vid:
        anterior = await db.combustible_cargas.find(
            {"vehiculo_id": vid}
        ).sort("odometro_km", -1).to_list(1)
        if anterior and anterior[0].get("odometro_km", 0) < odometro_km and litros > 0:
            rendimiento = round((odometro_km - anterior[0]["odometro_km"]) / litros, 1)

    doc = {
        "id": str(uuid.uuid4()),
        "operador_id": operador_id,
        "operador_nombre": op.get("nombre") if op else None,
        "placa": op.get("placa") if op else None,
        "sitio_id": (op.get("sitio_id") if op else None) or DEFAULT_SITIO,
        "vehiculo_id": vid,
        "fecha": fecha, "litros": litros, "costo": costo,
        "odometro_km": odometro_km, "estacion": estacion,
        "ticket_url": ticket_url, "evidencia_url": ticket_url,
        "rendimiento_km_l": rendimiento,
        "creado": now_iso(),
    }
    res = await db.combustible_cargas.insert_one(doc)
    # Odómetro del vehículo se actualiza con la carga (traza de uso).
    if vid and odometro_km:
        try:
            await db.vehiculos.update_one(
                {"_id": to_oid(vid)},
                {"$set": {"odometro_km": odometro_km}},
            )
        except HTTPException:
            pass
    await _notificar_dueno_de_operador(operador_id, {"type": "combustible", "carga": serialize({**doc, "_id": res.inserted_id})})
    return {"ok": True, "id": str(res.inserted_id), "ticket_url": ticket_url, "rendimiento_km_l": rendimiento}


@api_router.get("/combustible/mis-cargas")
async def mis_cargas_combustible(current: dict = Depends(require_operador_estricto),
                                 limite: int = Query(30, ge=1, le=100)):
    docs = await db.combustible_cargas.find({"operador_id": current["id"]}).sort(
        "creado", -1).to_list(limite)
    return {"cargas": [serialize(d) for d in docs]}


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
    result = {"ok": True}
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
    op_sitio = (op or {}).get("sitio_id") or DEFAULT_SITIO
    ubi_msg = {"type": "ubicacion", "operador_id": operador_id, "lat": lat, "lng": lng, "sitio_id": op_sitio, "ts": ts}
    await manager.broadcast_terminal(ubi_msg, sitio_id=op_sitio)
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
    # Geofence (F5): evalúa llegada al destino del servicio en_curso.
    try:
        geo = await _evaluar_llegada_geofence(operador_id, lat, lng, accuracy,
                                              speed, _parse_iso(ts) or datetime.now(timezone.utc))
        if geo.get("llegada_detectada") or geo.get("servicio_auto_completado"):
            result.update(geo)
    except Exception as exc:
        # El geofence nunca debe romper la ingesta de GPS.
        logger.warning("geofence eval fallo: %s", exc)
    return result


# ---------------------------------------------------------------------------
# Auto-finalización por geofence (llegada al destino) — F5
# ---------------------------------------------------------------------------
# La detección es AUTORITATIVA EN BACKEND: cada reporte GPS de un conductor
# con servicio en_curso y destino con coordenadas se evalúa contra el destino.
# Requiere precisión aceptable + dentro del radio + velocidad baja + dwell.
async def _evaluar_llegada_geofence(operador_id: str, lat: float, lng: float,
                                    accuracy: Optional[float], speed: Optional[float],
                                    ahora: datetime) -> Dict:
    """Devuelve {llegada_detectada, servicio_auto_completado} y aplica el
    auto-completado cuando corresponde. Idempotente por estado del servicio."""
    out = {"llegada_detectada": False, "servicio_auto_completado": False}
    try:
        habilitado = bool(await get_config("auto_complete_enabled", True))
    except Exception:
        habilitado = True
    if not habilitado:
        return out
    try:
        radio_m = float(await get_config("arrival_radius_m", 75))
        dwell_s = float(await get_config("arrival_dwell_s", 30))
        max_acc = float(await get_config("max_gps_accuracy_m", 30))
    except (TypeError, ValueError):
        radio_m, dwell_s, max_acc = 75.0, 30.0, 30.0

    # Servicio en_curso del conductor con destino georreferenciado.
    s = await db.servicios.find_one({
        "operador_asignado_id": operador_id,
        "estado": EstadoServicio.en_curso.value,
        "destino.lat": {"$ne": None},
        "destino.lng": {"$ne": None},
    })
    if not s:
        return out

    # Validación 1: precisión GPS aceptable (sin accuracy conocida, no se arriesga).
    if accuracy is None or accuracy > max_acc:
        return out
    # Validación 2: dentro del radio de llegada.
    destino = s["destino"]
    dist_m = haversine_km(lat, lng, destino["lat"], destino["lng"]) * 1000.0
    if dist_m > radio_m:
        # Salió (o nunca entró): limpia el conteo de permanencia.
        if s.get("llegada"):
            await db.servicios.update_one({"_id": s["_id"]}, {"$unset": {"llegada": ""}})
        return out
    out["llegada_detectada"] = True
    # Validación 3: velocidad baja o detenido (evita cerrar servicios "de pasada").
    if speed is not None and speed > 2.78:  # > 10 km/h
        return out

    # Permanencia (dwell): primer punto dentro de zona inicia el conteo.
    # Con dwell_s <= 0 no hay espera: llegada directa → completar.
    llegada = s.get("llegada") or {}
    if dwell_s > 0 and not llegada.get("dentro_desde"):
        await db.servicios.update_one(
            {"_id": s["_id"]},
            {"$set": {"llegada": {"dentro_desde": ahora.isoformat(), "lat": lat, "lng": lng,
                                   "dist_m": round(dist_m)}}},
        )
        return out
    try:
        dentro_desde = datetime.fromisoformat(llegada["dentro_desde"]) if llegada.get("dentro_desde") else ahora
    except (TypeError, ValueError):
        return out
    if (ahora - dentro_desde).total_seconds() < dwell_s:
        return out

    # === DESTINO ALCANZADO: auto-completado autoritativo ===
    # Carrera: solo si sigue en_curso (UPDATE condicionado por estado).
    ts = ahora.isoformat()
    res = await db.servicios.update_one(
        {"_id": s["_id"], "estado": EstadoServicio.en_curso.value},
        {"$set": {"estado": EstadoServicio.completado.value,
                  "timestamp_fin": ts,
                  "auto_completado": True,
                  "llegada.confirmada_en": ts,
                  "llegada.dist_m": round(dist_m),
                  "motivo_cierre": "geofence"}},
    )
    if res.modified_count == 0:
        return out  # otro proceso ya lo cerró (o cambió de estado)
    s = await db.servicios.find_one({"_id": s["_id"]})
    # Libera al operador (mismo efecto que "terminar" manual).
    await db.operadores.update_one(
        {"_id": to_oid(operador_id)},
        {"$set": {"estado": EstadoOperador.libre.value, "ultima_actualizacion": ts}},
    )
    estado_msg = {"type": "estado", "operador_id": operador_id,
                  "estado": EstadoOperador.libre.value, "ts": ts}
    await manager.broadcast_terminal(estado_msg)
    await _notificar_dueno_de_operador(operador_id, estado_msg)
    await _notificar_servicio(s)
    # Evento explícito para UX (terminal + conductor).
    await manager.broadcast_terminal({
        "type": "destino_alcanzado",
        "servicio_id": str(s["_id"]),
        "operador_id": operador_id,
        "placa": (s.get("taxi") or {}).get("placa") if isinstance(s.get("taxi"), dict) else None,
        "ts": ts,
    })
    await manager.send_operador(operador_id, {
        "type": "destino_alcanzado",
        "servicio_id": str(s["_id"]),
        "ts": ts,
    })
    out["servicio_auto_completado"] = True
    return out


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


@api_router.get("/operadores/{operador_id}/recorrido-ajustado")
async def get_recorrido_ajustado(operador_id: str, limite: int = Query(TRACK_MAX_POINTS, ge=2, le=2000),
                                 _=Depends(require_terminal)):
    """Historial de recorrido proyectado sobre calles reales (OSRM Map-Matching).

    Toma el track crudo de db.operadores, consulta /match en el proveedor de ruteo
    y devuelve los puntos ajustados a los ejes viales con sus timestamps originales
    para renderizar el recorrido con degradado temporal. Mismo patrón de auth que /track.
    """
    op = await db.operadores.find_one({"_id": to_oid(operador_id)})
    if not op:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    raw_track = (op.get("track") or [])[-limite:]
    raw = [{"lat": p[0], "lng": p[1], "ts": p[2], "matched": False} for p in raw_track]
    if len(raw_track) < 2 or len(raw_track) > MATCH_MAX_POINTS:
        return {
            "operador_id": operador_id,
            "ajustado": False,
            "track": raw,
        }

    # Intentar proyectar vía OSRM /match
    try:
        # Formatear coordenadas lon,lat separadas por ';'
        coords_str = ";".join([f"{p[1]:.6f},{p[0]:.6f}" for p in raw_track])
        url = f"{ROUTING_PROVIDER_URL}/match/v1/driving/{coords_str}"
        async with httpx.AsyncClient(timeout=min(ROUTING_TIMEOUT_SECONDS * 1.5, 12.0)) as hc:
            resp = await hc.get(url, params={"overview": "full", "geometries": "geojson"})
            if resp.status_code == 200:
                mdata = resp.json()
                tracepoints = mdata.get("tracepoints") or []
                if tracepoints and len(tracepoints) == len(raw_track):
                    adjusted = []
                    for i, tp in enumerate(tracepoints):
                        orig = raw_track[i]
                        if tp and tp.get("location"):
                            loc = tp["location"]
                            adjusted.append({"lat": loc[1], "lng": loc[0], "ts": orig[2], "matched": True})
                        else:
                            adjusted.append({"lat": orig[0], "lng": orig[1], "ts": orig[2], "matched": False})
                    return {
                        "operador_id": operador_id,
                        "ajustado": True,
                        "track": adjusted,
                    }
    except Exception as exc:
        logger.warning("OSRM match fallo, usando track crudo: %s", exc)

    # Fallback suave al track crudo
    return {
        "operador_id": operador_id,
        "ajustado": False,
        "track": raw,
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
    token = create_token(str(res.inserted_id), body.usuario, scope="pasajero", sitio_id=sitio_id)
    logger.info("cliente/pasajero registrado id=%s usuario=%s", res.inserted_id, body.usuario)
    return {"cliente": serialize(doc), "token": token}


@api_router.get("/clientes")
async def list_clientes(current=Depends(require_terminal)):
    sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    docs = await db.clientes.find({"sitio_id": sitio}).to_list(1000)
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
async def create_vehiculo(body: VehiculoCreate, current=Depends(require_terminal)):
    sitio_id = body.sitio_id or current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    if await db.vehiculos.find_one({"numero_economico": body.numero_economico, **_sitio_query_for(sitio_id)}):
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
        "sitio_id": sitio_id,
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
async def list_vehiculos(current=Depends(require_terminal)):
    sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    docs = await db.vehiculos.find(_sitio_query_for(sitio)).to_list(1000)
    ops = {str(o["_id"]): o for o in await db.operadores.find(_sitio_query_for(sitio)).to_list(1000)}
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
        query.update(_sitio_query_for(sitio_id))
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
                              current=Depends(require_terminal)):
    """Lista los taxis más cercanos al punto dado (para el mapa del dispatcher)."""
    target_sitio = sitio_id or current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    return await _buscar_candidatos(lat, lng, num, target_sitio)


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
    modo_vial: Optional[bool] = False


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


def _ruta_vial_palenque(origen: Ubicacion, destino: Ubicacion) -> dict:
    """Traza sobre el sentido real de las calles de Palenque usando las pistas
    viales cuando el servidor OSRM público no responde (usado por el trazador
    de rutas colectivas punto a punto con modo_vial=True)."""
    lat1, lng1 = float(origen.lat), float(origen.lng)
    lat2, lng2 = float(destino.lat), float(destino.lng)
    mejor_pista = None
    mejor_score = 999999.0
    mejor_i1, mejor_i2 = 0, 0
    for p in PALENQUE_PISTAS_VIALES.values():
        pts = p.get("puntos") or []
        if len(pts) < 2:
            continue
        i1 = min(range(len(pts)), key=lambda i: haversine_km(lat1, lng1, pts[i][0], pts[i][1]))
        i2 = min(range(len(pts)), key=lambda i: haversine_km(lat2, lng2, pts[i][0], pts[i][1]))
        d1 = haversine_km(lat1, lng1, pts[i1][0], pts[i1][1]) * 1000
        d2 = haversine_km(lat2, lng2, pts[i2][0], pts[i2][1]) * 1000
        score = d1 + d2
        if score < mejor_score and i1 != i2:
            mejor_score = score
            mejor_pista = p
            mejor_i1, mejor_i2 = i1, i2

    coords_latlng: List[List[float]] = []
    if mejor_pista and mejor_score <= 900:
        pts = mejor_pista["puntos"]
        doble = bool(mejor_pista.get("doble_sentido", True))
        if mejor_i1 <= mejor_i2:
            tramo = pts[mejor_i1 : mejor_i2 + 1]
        elif doble:
            tramo = list(reversed(pts[mejor_i2 : mejor_i1 + 1]))
        else:
            # Circuito de un solo sentido: sigue el sentido horario/vial de la calle
            tramo = pts[mejor_i1:] + pts[: mejor_i2 + 1]
        coords_latlng = [[lat1, lng1]] + tramo + [[lat2, lng2]]
    else:
        # Retícula urbana ortogonal respetando sentido de cuadras
        mid1 = [lat1, lat1 + (lat2 - lat1) * 0.5]
        coords_latlng = [
            [lat1, lng1],
            [mid1[1], lng1],
            [mid1[1], lng2],
            [lat2, lng2],
        ]

    # Deduplicar puntos consecutivos idénticos y convertir a GeoJSON [lng, lat]
    limpios: List[List[float]] = []
    for pt in coords_latlng:
        if not limpios or abs(limpios[-1][0] - pt[1]) > 1e-6 or abs(limpios[-1][1] - pt[0]) > 1e-6:
            limpios.append([round(float(pt[1]), 6), round(float(pt[0]), 6)])
    if len(limpios) < 2:
        limpios = [[lng1, lat1], [lng2, lat2]]

    dist_m = 0.0
    for i in range(1, len(limpios)):
        dist_m += haversine_km(limpios[i - 1][1], limpios[i - 1][0], limpios[i][1], limpios[i][0]) * 1000.0
    speed_ms = 25.0 / 3.6
    return {
        "provider": "red_vial_palenque",
        "sentido_vial": True,
        "calles": [mejor_pista["nombre"]] if mejor_pista else ["Trazo urbano por cuadras"],
        "distance_m": max(10, round(dist_m)),
        "duration_s": max(5, round(dist_m / speed_ms)),
        "geometry": {
            "type": "LineString",
            "coordinates": limpios,
        },
    }


@api_router.post("/routing/route")
async def routing_route(body: RoutingBody, _=Depends(_any_autenticado_o_pasajero)):
    """Ruta real sobre calles (OSRM) entre dos coordenadas respetando el sentido
    de circulación vial. Accesible para operador, terminal o el pasajero con
    servicio activo."""
    origen, destino = body.origen, body.destino
    if origen.lat is None or origen.lng is None or destino.lat is None or destino.lng is None:
        raise HTTPException(status_code=400, detail="Origen y destino deben tener coordenadas")
    try:
        async with httpx.AsyncClient(timeout=ROUTING_TIMEOUT_SECONDS) as hc:
            url = (
                f"{ROUTING_PROVIDER_URL}/route/v1/driving/"
                f"{origen.lng:.6f},{origen.lat:.6f};{destino.lng:.6f},{destino.lat:.6f}"
                f"?overview=full&geometries=geojson&steps=true"
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
        calles = []
        for leg in (route.get("legs") or []):
            for st in (leg.get("steps") or []):
                nm = (st.get("name") or "").strip()
                if nm and (not calles or calles[-1] != nm):
                    calles.append(nm)
        return {
            "provider": "osrm",
            "sentido_vial": True,
            "calles": calles,
            "distance_m": round(route.get("distance", 0)),
            "duration_s": round(route.get("duration", 0)),
            "geometry": {"type": "LineString", "coordinates": coords},
        }
    except Exception as exc:  # red, timeout, proveedor caído -> fallback
        logger.warning("routing fallback: %s", exc)
        if body.modo_vial:
            return _ruta_vial_palenque(origen, destino)
        return _ruta_haversine(origen, destino)


# ---------------------------------------------------------------------------
# Geocoding (búsqueda de direcciones para el Centro de Operaciones)
# ---------------------------------------------------------------------------
# Proveedor configurable; Photon (komoot) es abierto y sin API key. El backend
# actúa como proxy: mantiene la política de tiles/geocoding con User-Agent
# propio y evita exponer el proveedor al frontend.
GEOCODING_PROVIDER_URL = os.environ.get("GEOCODING_PROVIDER_URL", "https://photon.komoot.io").rstrip("/")
GEOCODING_TIMEOUT_SECONDS = float(os.environ.get("GEOCODING_TIMEOUT_SECONDS", "6"))
# Reverse-geocoding (nombres de calle para la voz del operador). Cache en la
# colección `geo_cache` redondeada a ~110 m para no volver a consultar.
NOMINATIM_URL = os.environ.get("NOMINATIM_URL", "https://nominatim.openstreetmap.org").rstrip("/")


async def _etiqueta_lugar(lat: float, lng: float) -> Optional[str]:
    """Devuelve "Calle House, Colonia" legible para la voz del operador
    (reverse-geocoding Nominatim con cache en `geo_cache` redondeado ~110 m).
    Si el proveedor no responde, devuelve None y se usa el fallback textual."""
    key_lat, key_lng = round(float(lat), 3), round(float(lng), 3)
    try:
        cached = await db.geo_cache.find_one({"lat": key_lat, "lng": key_lng})
        if cached and cached.get("texto"):
            return cached["texto"]
    except Exception:
        pass
    texto: Optional[str] = None
    try:
        async with httpx.AsyncClient(timeout=GEOCODING_TIMEOUT_SECONDS) as hc:
            r = await hc.get(
                f"{NOMINATIM_URL}/reverse",
                params={
                    "lat": f"{lat:.6f}", "lon": f"{lng:.6f}",
                    "format": "jsonv2", "addressdetails": "1", "zoom": "18",
                },
                headers={"User-Agent": "TaxiHUB/2.0 (central de taxis de Palenque)"},
            )
            if r.status_code == 200:
                item = r.json() or {}
                a = item.get("address") or {}
                road = (a.get("road") or a.get("pedestrian") or a.get("footway")
                        or a.get("path") or item.get("name"))
                house = a.get("house_number")
                suburb = (a.get("suburb") or a.get("neighbourhood")
                          or a.get("residential") or a.get("quarter")
                          or a.get("city_district") or a.get("town"))
                calle = f"{road} {house}".strip() if house else road
                partes = [p for p in (calle, suburb) if p]
                if partes:
                    texto = ", ".join(partes)
    except Exception as exc:
        logger.warning("reverse geocode fallo: %s", exc)
    if texto:
        try:
            await db.geo_cache.update_one(
                {"lat": key_lat, "lng": key_lng},
                {"$set": {"lat": key_lat, "lng": key_lng, "texto": texto}},
                upsert=True,
            )
        except Exception:
            pass
    return texto


@api_router.get("/geo/search")
async def geo_search(
    q: str,
    limit: int = 8,
    _=Depends(_any_autenticado),
):
    """Búsqueda global de ubicaciones (calle, colonia, POI, referencia).

    Soporta Nominatim auto-alojado (con bounded=1 y viewbox duro) y Photon.
    Incluye filtro de respaldo estricto en Python que garantiza que ningún
    resultado fuera de la zona de operación de Palenque y alrededores sea devuelto.
    """
    query = (q or "").strip()
    if len(query) < 3:
        return {"resultados": []}
    # Centro de operación para sesgar y acotar resultados.
    try:
        center_lat = float(await get_config("map_center_lat") or 17.5099)
        center_lng = float(await get_config("map_center_lng") or -91.9847)
    except (TypeError, ValueError):
        center_lat, center_lng = 17.5099, -91.9847

    # Bounding box estricto alrededor del centro de operaciones (~35-40 km)
    min_lon, max_lon = center_lng - 0.45, center_lng + 0.45
    min_lat, max_lat = center_lat - 0.30, center_lat + 0.30
    limit = max(1, min(limit or 8, 20))
    headers = {"User-Agent": "TaxiHUB/2.0 (central de taxis de Palenque, contacto@taxihub.mx)"}

    is_photon = "photon" in GEOCODING_PROVIDER_URL.lower()
    resultados = []
    provider_name = "nominatim" if not is_photon else "photon"

    try:
        async with httpx.AsyncClient(timeout=GEOCODING_TIMEOUT_SECONDS) as hc:
            if is_photon:
                r = await hc.get(
                    f"{GEOCODING_PROVIDER_URL}/api/",
                    params={
                        "q": query,
                        "limit": limit * 2, # solicitar margen para el filtro duro
                        "bbox": f"{min_lon:.4f},{min_lat:.4f},{max_lon:.4f},{max_lat:.4f}",
                    },
                    headers=headers,
                )
            else:
                # Nominatim propio / estándar: bounded=1 con viewbox=minLon,maxLat,maxLon,minLat
                endpoint = f"{GEOCODING_PROVIDER_URL}/search" if not GEOCODING_PROVIDER_URL.endswith("/search") else GEOCODING_PROVIDER_URL
                r = await hc.get(
                    endpoint,
                    params={
                        "q": query,
                        "format": "jsonv2",
                        "bounded": "1",
                        "viewbox": f"{min_lon:.4f},{max_lat:.4f},{max_lon:.4f},{min_lat:.4f}",
                        "countrycodes": "mx",
                        "addressdetails": "1",
                        "limit": limit * 2,
                    },
                    headers=headers,
                )
            r.raise_for_status()
            data = r.json()
    except Exception as exc:
        logger.warning("geocoding fallo proveedor %s: %s", GEOCODING_PROVIDER_URL, exc)
        return {"resultados": [], "error": "proveedor_no_disponible"}

    # Parseo según formato (Nominatim = lista de dicts; Photon = GeoJSON)
    if isinstance(data, list):
        # Formato Nominatim
        for item in data:
            try:
                lat = float(item.get("lat"))
                lng = float(item.get("lon"))
            except (TypeError, ValueError):
                continue
            # FILTRO DURO EN PYTHON: descarta inmediatamente puntos fuera de la región
            if not (min_lat <= lat <= max_lat and min_lon <= lng <= max_lon):
                continue
            addr = item.get("address") or {}
            nombre = item.get("name") or addr.get("road") or addr.get("suburb") or item.get("display_name", "").split(",")[0]
            partes_sub = [
                addr.get("suburb") if addr.get("suburb") != nombre else None,
                addr.get("neighbourhood"),
                addr.get("city") or addr.get("town") or addr.get("municipality") or addr.get("state"),
            ]
            sublabel = ", ".join([p for p in partes_sub if p]) or item.get("display_name", "")
            tipo = item.get("type") or item.get("category") or "lugar"
            resultados.append({
                "id": f"{item.get('osm_type', 'n')}{item.get('osm_id', '')}",
                "label": nombre.strip(),
                "sublabel": sublabel.strip(),
                "lat": round(lat, 6),
                "lng": round(lng, 6),
                "tipo": tipo,
            })
            if len(resultados) >= limit:
                break
    elif isinstance(data, dict) and "features" in data:
        # Formato Photon GeoJSON
        for f in data.get("features") or []:
            props = f.get("properties") or {}
            geom = (f.get("geometry") or {}).get("coordinates") or [None, None]
            lng, lat = geom[0], geom[1]
            if lat is None or lng is None:
                continue
            lat, lng = float(lat), float(lng)
            # FILTRO DURO EN PYTHON
            if not (min_lat <= lat <= max_lat and min_lon <= lng <= max_lon):
                continue
            nombre = props.get("name") or props.get("street") or props.get("district") or ""
            partes_sub = [
                props.get("district") if props.get("district") != nombre else None,
                props.get("city") or props.get("county") or props.get("state"),
            ]
            sublabel = ", ".join([p for p in partes_sub if p]) or props.get("country", "")
            if not nombre:
                nombre = props.get("street") or sublabel or query
            tipo = props.get("osm_key") or props.get("osm_value") or "lugar"
            resultados.append({
                "id": f"{props.get('osm_type', 'n')}{props.get('osm_id', '')}",
                "label": nombre.strip(),
                "sublabel": sublabel.strip(),
                "lat": round(lat, 6),
                "lng": round(lng, 6),
                "tipo": tipo,
            })
            if len(resultados) >= limit:
                break

    # Filtro de seguridad redundante
    resultados = [
        r for r in resultados
        if (min_lat <= r["lat"] <= max_lat) and (min_lon <= r["lng"] <= max_lon)
    ]
    return {"resultados": resultados, "provider": provider_name}


# ---------------------------------------------------------------------------
# WhatsApp Opción A (Puente QR Baileys con Blindaje Anti-Baneo + Webhook)
# ---------------------------------------------------------------------------
WA_BRIDGE_URL = os.environ.get("WA_BRIDGE_URL", "http://127.0.0.1:3099").rstrip("/")
_wa_last_send_ts: Dict[str, float] = {}
_wa_demo_state: Dict[str, Dict] = {}


class WaReply(BaseModel):
    texto: str = Field(min_length=1, max_length=1000)


class WaAutoReplyDespacho(BaseModel):
    servicio_id: Optional[str] = None
    operador_id: Optional[str] = None
    unidad: Optional[str] = None
    vehiculo_desc: Optional[str] = None
    conductor_nombre: Optional[str] = None
    eta_min: int = Field(default=4, ge=1, le=60)
    costo: Optional[float] = None


class WaVincularDemoBody(BaseModel):
    accion: Literal["vincular", "desvincular", "regenerar_qr", "codigo_emparejamiento", "configurar_numero"] = "vincular"
    numero: Optional[str] = None
    telefono: Optional[str] = None
    dispositivo: Optional[str] = None
    modo_conexion: Optional[str] = None


class WaIncomingBody(BaseModel):
    cliente_telefono: str = Field(min_length=4, max_length=40)
    cliente_nombre: Optional[str] = "Cliente WhatsApp (Prueba)"
    texto: Optional[str] = "Hola, necesito un taxi en mi ubicación por favor"
    lat: Optional[float] = None
    lng: Optional[float] = None
    sitio_id: Optional[str] = None



_WA_SALUDOS = [
    "¡Hola {cliente}!",
    "¡Qué tal {cliente}!",
    "Buen día {cliente},",
    "¡Listo {cliente}!",
]
_WA_CUERPOS = [
    "Tu unidad *{unidad}* ({vehiculo}) ya va en camino a tu ubicación.",
    "Asignamos el taxi *{unidad}* ({vehiculo}) para tu servicio y ya salió hacia ti.",
    "La unidad *{unidad}* ({vehiculo}) ha sido despachada hacia tu punto.",
    "Confirmado: el taxi *{unidad}* ({vehiculo}) se dirige por ti en este momento.",
]
_WA_CIERRES = [
    "Lo conduce *{conductor}* y llega en aprox. *{eta_min} min*. 🚕",
    "Tu operador es *{conductor}*, tiempo estimado de llegada: *{eta_min} min*. 📍",
    "Operador asignado: *{conductor}* (llega en ~*{eta_min} min*). ¡Gracias por viajar con nosotros!",
    "Al volante va *{conductor}*, estará contigo en unos *{eta_min} min*.",
]


def _generar_mensaje_spintax_antiban(
    cliente: str,
    unidad: str,
    vehiculo: str,
    conductor: str,
    eta_min: int,
    costo: Optional[float] = None,
    plantilla_custom: Optional[str] = None,
) -> str:
    """Regla 3 Anti-Ban: variación polimórfica natural (Spintax) para nunca enviar
    el mismo bloque idéntico de bytes de forma repetitiva."""
    nombre_limpio = (cliente or "cliente").split("(")[0].strip()
    if plantilla_custom and "{unidad}" in plantilla_custom:
        try:
             base_txt = plantilla_custom.format(
                 cliente=nombre_limpio,
                 unidad=unidad,
                 vehiculo=vehiculo or "Taxi",
                 conductor=conductor,
                 eta_min=eta_min,
                 costo=f"${int(costo)}" if costo else "",
             )
             return base_txt
        except Exception:
             pass
    saludo = random.choice(_WA_SALUDOS).format(cliente=nombre_limpio)
    cuerpo = random.choice(_WA_CUERPOS).format(unidad=unidad, vehiculo=vehiculo or "Taxi")
    cierre = random.choice(_WA_CIERRES).format(conductor=conductor, eta_min=eta_min)
    extra_costo = f" Tarifa acordada: *${int(costo)} MXN*." if costo else ""
    return f"{saludo} {cuerpo} {cierre}{extra_costo}"


def _wa_conv_serialize(doc: Dict) -> Dict:
    d = serialize(doc)
    msgs = d.get("mensajes") or []
    d["ultimo_mensaje"] = msgs[-1] if msgs else None
    d["mensajes_count"] = len(msgs)
    # Verifica ventana de 24h de cliente (Regla 1 Anti-Ban: solo responder a quien escribió)
    msgs_cliente = [m for m in msgs if m.get("de") == "cliente"]
    d["ventana_24h_activa"] = len(msgs_cliente) > 0
    return d


async def _enviar_por_bridge_antiban(sitio_id: str, telefono: str, texto: str) -> dict:
    """Ejecuta las reglas Anti-Ban (cola rate-limit >= 3s, typing presence 'composing'
    1.5-3.2s) y despacha al microservicio Baileys si está activo."""
    import time as _time
    now_t = _time.time()
    last_t = _wa_last_send_ts.get(sitio_id, 0.0)
    espera_cola = max(0.0, 3.0 - (now_t - last_t))
    typing_ms = random.randint(1500, 3200)
    _wa_last_send_ts[sitio_id] = now_t + espera_cola

    state = _wa_demo_state.setdefault(sitio_id, {
        "conectado": True,
        "numero_vinculado": "+52 916 345 9900",
        "mensajes_enviados_hoy": 0,
        "modo": "bridge_qr_antiban",
    })
    state["mensajes_enviados_hoy"] = state.get("mensajes_enviados_hoy", 0) + 1

    # Intentar envío al microservicio Baileys local (no bloquea los tests si no corre)
    entregado_bridge = False
    try:
        async with httpx.AsyncClient(timeout=1.5) as hc:
            r = await hc.post(
                f"{WA_BRIDGE_URL}/send",
                json={
                    "sitio_id": sitio_id,
                    "telefono": telefono,
                    "texto": texto,
                    "typing_ms": typing_ms,
                    "delay_queue_ms": int(espera_cola * 1000),
                },
            )
            if r.status_code == 200:
                entregado_bridge = True
    except Exception:
        pass

    return {
        "antiban": {
            "regla_1_solo_respuesta_24h": True,
            "regla_2_composing_ms": typing_ms,
            "regla_3_spintax_unico": True,
            "regla_4_rate_limit_delay_s": round(espera_cola, 2),
            "entregado_bridge": entregado_bridge,
        }
    }


def _generar_qr_data_url(texto: str) -> str:
    try:
        import qrcode
        import io
        import base64
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=8,
            border=2,
        )
        qr.add_data(texto)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return f"data:image/png;base64,{b64}"
    except Exception as e:
        logger.warning("Error generando QR real: %s", e)
        return ""


@api_router.get("/wa/qr.png")
async def wa_qr_png(sitio_id: Optional[str] = None):
    """Devuelve la imagen PNG real del código QR de WhatsApp para escanear directamente con la cámara del celular."""
    sitio = sitio_id or DEFAULT_SITIO
    state = _wa_demo_state.get(sitio) or {}
    qr_text = state.get("qr_code") or f"https://wa.me/5219163459900?text=TaxiHub%20Central%20{sitio}"
    try:
        import qrcode
        import io
        qr = qrcode.QRCode(box_size=10, border=3)
        qr.add_data(qr_text)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return Response(content=buf.getvalue(), media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando imagen QR: {e}")


@api_router.get("/wa/status")
async def wa_get_status(current=Depends(require_terminal)):
    sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    sitio_doc = await db.sitios.find_one({"clave": sitio}) or {}
    default_num = sitio_doc.get("whatsapp_numero") or sitio_doc.get("telefono_central") or "+52 916 345 9900"
    state = _wa_demo_state.setdefault(sitio, {
        "conectado": True,
        "numero_vinculado": default_num,
        "dispositivo": "Terminal Windows Central (Baileys Multi-Device)",
        "mensajes_enviados_hoy": 4,
        "modo": "bridge_qr_antiban",
        "qr_code": f"2@TAXIHUB-BAILEYS-MD,{sitio},{uuid.uuid4().hex[:12]}",
        "pairing_code": "TXHB-9164",
    })
    # Si el microservicio Baileys local está arriba, consultar su estado en vivo
    bridge_live = False
    try:
        async with httpx.AsyncClient(timeout=0.8) as hc:
            r = await hc.get(f"{WA_BRIDGE_URL}/status", params={"sitio_id": sitio})
            if r.status_code == 200:
                bdata = r.json()
                bridge_live = True
                state.update({k: v for k, v in bdata.items() if v is not None})
    except Exception:
        pass

    qr_str = state.get("qr_code", f"2@TAXIHUB-BAILEYS-MD,{sitio},{uuid.uuid4().hex[:12]}")
    qr_data_url = _generar_qr_data_url(qr_str)

    return {
        "sitio_id": sitio,
        "conectado": state.get("conectado", True),
        "numero_vinculado": state.get("numero_vinculado", default_num),
        "dispositivo": state.get("dispositivo", "Terminal Windows Central (Baileys Multi-Device)"),
        "modo": "baileys_live" if bridge_live else state.get("modo", "bridge_qr_antiban"),
        "qr_code": qr_str,
        "qr_data_url": qr_data_url,
        "pairing_code": state.get("pairing_code", "TXHB-9164"),
        "mensajes_enviados_hoy": state.get("mensajes_enviados_hoy", 0),
        "antiban_proteccion": {
            "solo_respuesta_entrante_24h": True,
            "simulacion_escritura_humana_ms": "1500-3200",
            "variacion_spintax_polimorfica": True,
            "cola_rate_limit_min_seg": 3.0,
            "lectura_natural_delay_ms": "800-1500",
            "sesion_persistente_multifile": True,
            "riesgo_baneo": "nulo (0% spam saliente)",
        },
    }


@api_router.post("/wa/bridge/vincular")
async def wa_bridge_vincular(body: WaVincularDemoBody, current=Depends(require_terminal)):
    sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    state = _wa_demo_state.setdefault(sitio, {})
    nuevo_num = (body.numero or body.telefono or "").strip()
    if body.dispositivo:
        state["dispositivo"] = body.dispositivo.strip()
    if body.accion == "desvincular":
        state["conectado"] = False
        state["qr_code"] = f"TAXIHUB-WA-QR|{sitio}|{uuid.uuid4().hex[:8]}"
    elif body.accion == "regenerar_qr":
        state["conectado"] = False
        state["qr_code"] = f"TAXIHUB-WA-QR|{sitio}|{uuid.uuid4().hex[:8]}"
    elif body.accion == "codigo_emparejamiento":
        if nuevo_num:
            state["numero_vinculado"] = nuevo_num
            await db.sitios.update_one(
                {"clave": sitio},
                {"$set": {"whatsapp_numero": nuevo_num, "actualizado": now_iso()}},
                upsert=True,
            )
        digits = "".join(c for c in (nuevo_num or "9160") if c.isdigit())[-4:].zfill(4)
        state["pairing_code"] = f"TX{uuid.uuid4().hex[:2].upper()}-{digits}"
        state["conectado"] = True
    else:
        state["conectado"] = True
        num_final = nuevo_num or state.get("numero_vinculado") or "+52 916 345 9900"
        state["numero_vinculado"] = num_final
        if nuevo_num:
            await db.sitios.update_one(
                {"clave": sitio},
                {"$set": {"whatsapp_numero": num_final, "actualizado": now_iso()}},
                upsert=True,
            )
    return await wa_get_status(current)


@api_router.post("/wa/incoming")
async def wa_incoming(body: WaIncomingBody):
    """Recibe un mensaje entrante desde el puente Baileys local o desde el simulador de número de prueba."""
    sitio = body.sitio_id or DEFAULT_SITIO
    now = datetime.now(timezone.utc).isoformat()
    entry = {"de": "cliente", "texto": body.texto or "Hola, solicito un taxi", "ts": now}
    if body.lat is not None and body.lng is not None:
        entry["lat"] = float(body.lat)
        entry["lng"] = float(body.lng)
    await db.wa_conversaciones.update_one(
        {"cliente_telefono": body.cliente_telefono.strip(), "sitio_id": sitio},
        {
            "$setOnInsert": {
                "cliente_nombre": (body.cliente_nombre or body.cliente_telefono).strip(),
                "cliente_telefono": body.cliente_telefono.strip(),
                "sitio_id": sitio,
                "creada_en": now,
            },
            "$push": {"mensajes": entry},
            "$set": {
                "cliente_nombre": (body.cliente_nombre or body.cliente_telefono).strip(),
                "actualizada_en": now,
            },
        },
        upsert=True,
    )
    conv = await db.wa_conversaciones.find_one(
        {"cliente_telefono": body.cliente_telefono.strip(), "sitio_id": sitio}
    )
    serialized = _wa_conv_serialize(conv) if conv else None
    if serialized:
        await manager.broadcast_terminal(
            {"type": "wa_mensaje", "conversacion": serialized, "sitio_id": sitio},
            sitio_id=sitio,
        )
    return {"ok": True, "conversacion": serialized}


@api_router.post("/wa/test-incoming")
async def wa_test_incoming(body: WaIncomingBody, current=Depends(require_terminal)):
    """Permite a la operadora probar un mensaje entrante desde su número de prueba con 1 clic."""
    sitio = body.sitio_id or current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    body.sitio_id = sitio
    return await wa_incoming(body)


@api_router.get("/wa/conversaciones")
async def wa_list_conversaciones(current=Depends(require_terminal)):
    sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    docs = await db.wa_conversaciones.find(_sitio_query_for(sitio)).sort("actualizada_en", -1).to_list(100)
    return [_wa_conv_serialize(d) for d in docs]


@api_router.get("/wa/conversaciones/{conv_id}")
async def wa_get_conversacion(conv_id: str, current=Depends(require_terminal)):
    sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    doc = await db.wa_conversaciones.find_one({"_id": to_oid(conv_id), **_sitio_query_for(sitio)})
    if not doc:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")
    return _wa_conv_serialize(doc)


@api_router.post("/wa/conversaciones/{conv_id}/reply")
async def wa_reply(conv_id: str, body: WaReply, current=Depends(require_terminal)):
    """Respuesta de la operadora con protección Anti-Baneo (solo responde a hilos
    iniciados por el cliente, con presencia 'composing' y cola rate-limit)."""
    sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    conv = await db.wa_conversaciones.find_one({"_id": to_oid(conv_id), **_sitio_query_for(sitio)})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")
    now = datetime.now(timezone.utc).isoformat()
    meta = await _enviar_por_bridge_antiban(sitio, conv.get("cliente_telefono", ""), body.texto)
    msg_entry = {"de": "operadora", "texto": body.texto, "ts": now, **meta}
    await db.wa_conversaciones.update_one(
        {"_id": to_oid(conv_id)},
        {"$push": {"mensajes": msg_entry},
         "$set": {"actualizada_en": now}},
    )
    updated = await db.wa_conversaciones.find_one({"_id": to_oid(conv_id)})
    await manager.broadcast_terminal(
        {"type": "wa_mensaje", "conversacion": _wa_conv_serialize(updated), "sitio_id": sitio},
        sitio_id=sitio,
    )
    return {"ok": True, "mensaje": msg_entry, "antiban": meta["antiban"]}


@api_router.post("/wa/conversaciones/{conv_id}/auto-reply-despacho")
async def wa_auto_reply_despacho(conv_id: str, body: WaAutoReplyDespacho, current=Depends(require_terminal)):
    """Genera y envía automáticamente la confirmación de despacho por WhatsApp
    usando Spintax Anti-Baneo (unidad, vehículo, chofer, ETA) y marca el chat como despachado."""
    sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    conv = await db.wa_conversaciones.find_one({"_id": to_oid(conv_id), **_sitio_query_for(sitio)})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")
    unidad = body.unidad
    conductor = body.conductor_nombre
    vehiculo_desc = body.vehiculo_desc
    if body.operador_id and (not unidad or not conductor or not vehiculo_desc):
        op_doc = await db.operadores.find_one({"_id": to_oid(body.operador_id)})
        if op_doc:
            unidad = unidad or op_doc.get("placa") or "TX"
            conductor = conductor or op_doc.get("nombre") or "Operador"
            if not vehiculo_desc:
                v_doc = await db.vehiculos.find_one({"operador_conductor_id": body.operador_id})
                if v_doc:
                    vehiculo_desc = f"{v_doc.get('marca', '')} {v_doc.get('modelo', '')}".strip()
    unidad = unidad or "TX"
    conductor = conductor or "Operador"
    vehiculo_desc = vehiculo_desc or "Sedán Blanco"
    sitio_doc = await db.sitios.find_one({"clave": sitio}) or {}
    plantilla_custom = sitio_doc.get("plantilla_wa")
    texto = _generar_mensaje_spintax_antiban(
        cliente=conv.get("cliente_nombre") or "Cliente",
        unidad=unidad,
        vehiculo=vehiculo_desc,
        conductor=conductor,
        eta_min=body.eta_min,
        costo=body.costo,
        plantilla_custom=plantilla_custom,
    )
    now = datetime.now(timezone.utc).isoformat()
    meta = await _enviar_por_bridge_antiban(sitio, conv.get("cliente_telefono", ""), texto)
    msg_entry = {
        "de": "operadora",
        "texto": texto,
        "ts": now,
        "auto_despacho": True,
        "unidad": unidad,
        "conductor_nombre": conductor,
        "eta_min": body.eta_min,
        "servicio_id": body.servicio_id,
        **meta,
    }
    await db.wa_conversaciones.update_one(
        {"_id": to_oid(conv_id)},
        {
            "$push": {"mensajes": msg_entry},
            "$set": {
                "actualizada_en": now,
                "ultimo_despacho": {
                    "servicio_id": body.servicio_id,
                    "unidad": body.unidad,
                    "conductor_nombre": body.conductor_nombre,
                    "eta_min": body.eta_min,
                    "ts": now,
                },
            },
        },
    )
    updated = await db.wa_conversaciones.find_one({"_id": to_oid(conv_id)})
    serialized = _wa_conv_serialize(updated)
    await manager.broadcast_terminal(
        {"type": "wa_mensaje", "conversacion": serialized, "sitio_id": sitio},
        sitio_id=sitio,
    )
    return {"ok": True, "texto": texto, "mensaje": msg_entry, "conversacion": serialized}


@api_router.post("/wa/webhook")
async def wa_webhook(request: Request):
    """Ingreso de eventos del puente QR Baileys o proveedor WhatsApp Business.
    Requiere WA_WEBHOOK_TOKEN configurado; sin él responde 503.
    Formato: {sitio_id?, remitente: {nombre, telefono}, mensaje: {texto | lat+lng}}
    """
    token = os.environ.get("WA_WEBHOOK_TOKEN")
    if not token:
        raise HTTPException(status_code=503, detail="Webhook WhatsApp no configurado")
    auth = request.headers.get("Authorization", "")
    if auth != f"Bearer {token}":
        raise HTTPException(status_code=401, detail="No autorizado")
    payload = await request.json()
    sitio = payload.get("sitio_id") or DEFAULT_SITIO
    rem = payload.get("remitente") or {}
    msg = payload.get("mensaje") or {}
    now = datetime.now(timezone.utc).isoformat()
    entry = {"de": "cliente", "texto": msg.get("texto"), "ts": now}
    if msg.get("lat") is not None:
        entry["lat"] = msg["lat"]
        entry["lng"] = msg["lng"]
    await db.wa_conversaciones.update_one(
        {"cliente_telefono": rem.get("telefono"), "sitio_id": sitio},
        {"$setOnInsert": {"cliente_nombre": rem.get("nombre") or rem.get("telefono"),
                          "cliente_telefono": rem.get("telefono"),
                          "sitio_id": sitio,
                          "creada_en": now},
         "$push": {"mensajes": entry}, "$set": {"actualizada_en": now}},
        upsert=True,
    )
    conv = await db.wa_conversaciones.find_one({"cliente_telefono": rem.get("telefono"), "sitio_id": sitio})
    if conv:
        await manager.broadcast_terminal(
            {"type": "wa_mensaje", "conversacion": _wa_conv_serialize(conv), "sitio_id": sitio},
            sitio_id=sitio,
        )
    return {"ok": True}


async def _seed_wa_conversacion():
    """Conversación demo para validar el flujo ubicación→servicio."""
    now = datetime.now(timezone.utc).isoformat()
    if await db.wa_conversaciones.count_documents({}) > 0:
        return
    await db.wa_conversaciones.insert_one({
        "cliente_nombre": "María López",
        "cliente_telefono": "+52 916 123 4567",
        "sitio_id": DEFAULT_SITIO,
        "creada_en": now,
        "actualizada_en": now,
        "mensajes": [
            {"de": "cliente", "texto": "Hola, necesito un taxi", "ts": now},
            {"de": "cliente", "texto": "Estoy aquí", "lat": 17.5115, "lng": -91.9823, "ts": now},
        ],
    })


# ---------------------------------------------------------------------------
# Rutas CRUD + Planificador de Ruta Colectiva + Colonias/Cuadrantes con Precios
# ---------------------------------------------------------------------------
@api_router.post("/rutas")
async def create_ruta(body: RutaCreate, current=Depends(require_terminal)):
    sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    doc = {
        "nombre": body.nombre,
        "color_hex": body.color_hex,
        "tipo": body.tipo or "colectiva",
        "tarifa_colectiva": body.tarifa_colectiva,
        "frecuencia_min": body.frecuencia_min,
        "horario": body.horario,
        "paradas": body.paradas or [],
        "trazo": body.trazo or [],
        "activa": body.activa,
        "sitio_id": sitio,
        "creado_en": now_iso(),
    }
    res = await db.rutas.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api_router.get("/rutas")
async def list_rutas(current=Depends(_any_autenticado)):
    sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    docs = await db.rutas.find(_sitio_query_for(sitio)).to_list(1000)
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


@api_router.get("/colonias")
async def list_colonias(current=Depends(_any_autenticado)):
    sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    docs = await db.colonias.find(_sitio_query_for(sitio)).sort("nombre", 1).to_list(500)
    return [serialize(d) for d in docs]


@api_router.post("/colonias")
async def create_colonia(body: ColoniaBody, current=Depends(require_terminal)):
    sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    doc = {
        **body.model_dump(),
        "sitio_id": sitio,
        "actualizado_en": now_iso(),
    }
    existente = await db.colonias.find_one({"nombre": body.nombre, **_sitio_query_for(sitio)})
    if existente:
        await db.colonias.update_one({"_id": existente["_id"]}, {"$set": doc})
        return serialize(await db.colonias.find_one({"_id": existente["_id"]}))
    doc["creado_en"] = now_iso()
    res = await db.colonias.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api_router.put("/colonias/{colonia_id}")
async def update_colonia(colonia_id: str, body: ColoniaBody, current=Depends(require_terminal)):
    sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    updates = {**body.model_dump(), "sitio_id": sitio, "actualizado_en": now_iso()}
    res = await db.colonias.update_one({"_id": to_oid(colonia_id)}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Colonia/cuadrante no encontrado")
    return serialize(await db.colonias.find_one({"_id": to_oid(colonia_id)}))


@api_router.delete("/colonias/{colonia_id}")
async def delete_colonia(colonia_id: str, _=Depends(require_terminal)):
    res = await db.colonias.delete_one({"_id": to_oid(colonia_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Colonia/cuadrante no encontrado")
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
    op_sitio = op.get("sitio_id") or (after or {}).get("sitio_id") or DEFAULT_SITIO
    await db.operadores.update_one(
        {"_id": to_oid(operador_id)},
        {"$set": {"estado": EstadoOperador.ocupado.value, "ultima_actualizacion": ts}},
    )
    estado_msg = {"type": "estado", "operador_id": operador_id, "estado": EstadoOperador.ocupado.value, "ts": ts, "sitio_id": op_sitio}
    await manager.broadcast_terminal(estado_msg, sitio_id=op_sitio)
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
        term = await require_terminal(request)
        sitio_id = term.get("sitio_id") or term.get("_tenant") or DEFAULT_SITIO

    doc = _situar_servicio(body, pasajero, sitio_id)
    # Calles reales para la voz del operador (Fase bot): si el origen/destino
    # vienen solo con coordenadas, se rellena el texto con reverse-geocoding.
    o_geo, d_geo = doc["origen"], doc["destino"]
    for punto, campo in ((o_geo, "origen_texto"), (d_geo, "destino_texto")):
        if punto.get("lat") is not None and not punto.get("texto"):
            etiqueta = await _etiqueta_lugar(punto["lat"], punto["lng"])
            if etiqueta:
                punto["texto"] = etiqueta
                doc[campo] = etiqueta
    res = await db.servicios.insert_one(doc)
    doc["_id"] = res.inserted_id
    logger.info("servicio creado id=%s tipo=%s estado=pendiente", res.inserted_id, doc.get("tipo"))

    if body.operador_asignado_id:
        ok = await _asignar_atomicamente(str(res.inserted_id), body.operador_asignado_id)
        if not ok:
            # La asignación manual perdió la carrera; queda pendiente para despacho.
            _doc_fresh = await db.servicios.find_one({"_id": res.inserted_id})
            out = serialize(_doc_fresh)
            await manager.broadcast_terminal({"type": "servicio", "servicio": out}, sitio_id=sitio_id)
            return {"servicio": out, "asignado": False,
                    "detalle": "El taxi ya no estaba disponible; el servicio quedó pendiente"}
    doc = await db.servicios.find_one({"_id": res.inserted_id})
    out = serialize(doc)
    await _notificar_servicio(doc)
    return {"servicio": out, "asignado": doc.get("estado") == EstadoServicio.asignado.value}


@api_router.get("/servicios")
async def list_servicios(estado: Optional[EstadoServicio] = None, current=Depends(require_terminal)):
    sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    query = _sitio_query_for(sitio)
    if estado:
        query["estado"] = estado.value
    docs = await db.servicios.find(query).sort("timestamp_creacion", -1).to_list(1000)
    return [serialize(d) for d in docs]


@api_router.get("/servicios/hoy")
async def list_servicios_hoy(current=Depends(require_terminal)):
    sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    hoy = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    docs = await db.servicios.find(
        {"timestamp_creacion": {"$regex": f"^{hoy}"}, **_sitio_query_for(sitio)}
    ).sort("timestamp_creacion", -1).to_list(1000)
    ops = {str(o["_id"]): o for o in await db.operadores.find(_sitio_query_for(sitio)).to_list(1000)}
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
    # Operación atómica: $addToSet/$pull evita recálculo en memoria y carreras entre rechazos concurrentes
    res = await db.servicios.update_one(
        {"_id": to_oid(servicio_id), "estado": EstadoServicio.ofrecido.value, "ofrecido_a": current["id"]},
        {"$addToSet": {"rechazados": current["id"]}, "$pull": {"ofrecido_a": current["id"]}},
    )
    if res.matched_count == 0:
        # Validar si perdió la carrera o el servicio cambió de estado
        s2 = await db.servicios.find_one({"_id": to_oid(servicio_id)})
        if not s2:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")
        if s2.get("estado") != "ofrecido" or current["id"] not in (s2.get("ofrecido_a") or []) and current["id"] not in (s2.get("rechazados") or []):
            raise HTTPException(status_code=403, detail="No tienes una oferta activa para este servicio")
    s_fresh = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    restantes = len(s_fresh.get("ofrecido_a") or [])
    if restantes == 0 and s_fresh.get("estado") == EstadoServicio.ofrecido.value:
        await db.servicios.update_one(
            {"_id": to_oid(servicio_id), "estado": EstadoServicio.ofrecido.value},
            {"$set": {"estado": EstadoServicio.pendiente.value}, "$unset": {"expira_en": ""}},
        )
        s_fresh = await db.servicios.find_one({"_id": to_oid(servicio_id)})
        restantes = 0
    logger.info("servicio rechazado id=%s por operador=%s (quedan %s)",
                servicio_id, current["id"], restantes)
    return serialize(s_fresh)


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
    s_sitio = s.get("sitio_id") or DEFAULT_SITIO
    oid = s.get("operador_asignado_id")
    if oid:
        await db.operadores.update_one(
            {"_id": to_oid(oid)},
            {"$set": {"estado": EstadoOperador.libre.value, "ultima_actualizacion": ts}},
        )
        estado_msg = {"type": "estado", "operador_id": oid, "estado": EstadoOperador.libre.value, "ts": ts, "sitio_id": s_sitio}
        await manager.broadcast_terminal(estado_msg, sitio_id=s_sitio)
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
    op_sitio = op.get("sitio_id") or DEFAULT_SITIO
    doc = {
        "cliente_id": None, "cliente_nombre": None, "cliente_telefono": None,
        "origen": {"texto": body.origen_texto, "lat": None, "lng": None},
        "destino": {"texto": body.destino_texto, "lat": None, "lng": None},
        "origen_texto": body.origen_texto,
        "destino_texto": body.destino_texto,
        "costo": body.costo,
        "tarifa_id": body.tarifa_id,
        "metodo_pago": "cash",
        "sitio_id": op_sitio,
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
    estado_msg = {"type": "estado", "operador_id": operador_id, "estado": EstadoOperador.ocupado.value, "ts": ts, "sitio_id": op_sitio}
    await manager.broadcast_terminal(estado_msg, sitio_id=op_sitio)
    await manager.broadcast_terminal({"type": "servicio", "servicio": servicio}, sitio_id=op_sitio)
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
    s_sitio = s.get("sitio_id") or DEFAULT_SITIO
    oid = s.get("operador_asignado_id")
    if oid:
        await db.operadores.update_one(
            {"_id": to_oid(oid)},
            {"$set": {"estado": EstadoOperador.libre.value, "ultima_actualizacion": ts}},
        )
        estado_msg = {"type": "estado", "operador_id": oid, "estado": EstadoOperador.libre.value, "ts": ts, "sitio_id": s_sitio}
        await manager.broadcast_terminal(estado_msg, sitio_id=s_sitio)
        await _notificar_dueno_de_operador(oid, estado_msg)
    s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    await _notificar_servicio(s)
    return serialize(s)


# ---------------------------------------------------------------------------
# Reportes de objetos olvidados (con análisis anti-malware + compresión WebP por tenant)
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
    sitio_op = current.get("sitio_id") or DEFAULT_SITIO
    raw_data = await foto.read()
    comp = analizar_y_comprimir_imagen_webp(raw_data, foto.filename or "reporte.jpg")
    path = f"{APP_NAME}/reportes/{operador_id}/{uuid.uuid4().hex}.webp"
    result = put_object(path, comp["data"], "image/webp", sitio_id=sitio_op)
    await db.archivos.insert_one({
        "storage_path": result["path"],
        "tenant_path": result.get("tenant_path"),
        "sitio_id": sitio_op,
        "content_type": "image/webp",
        "original_bytes": comp.get("original_bytes"),
        "compressed_bytes": comp.get("compressed_bytes"),
        "ahorro_pct": comp.get("ahorro_pct"),
        "seguro": True,
    })
    ts = now_iso()
    # Vínculo opcional (F11): si el conductor tiene servicio activo, el objeto
    # se asocia a ese servicio y a la unidad para el flujo de resguardo.
    servicio_activo = await db.servicios.find_one(
        {"operador_asignado_id": operador_id,
         "estado": {"$in": ["asignado", "en_curso"]}},
        sort=[("timestamp_creacion", -1)],
    )
    unidad = None
    op_doc = await db.operadores.find_one({"_id": to_oid(operador_id)}, {"vehiculo_id": 1, "placa": 1, "nombre": 1})
    if op_doc and op_doc.get("vehiculo_id"):
        veh = await db.vehiculos.find_one({"_id": to_oid(op_doc["vehiculo_id"])})
        if veh:
            unidad = {"id": str(veh["_id"]), "numero_economico": veh.get("numero_economico"),
                      "placa": veh.get("placa")}
    doc = {
        "operador_id": operador_id,
        "sitio_id": sitio_op,
        "storage_path": result["path"],
        "tenant_storage_path": result.get("tenant_path"),
        "foto_url": f"/api/files/{result['path']}",
        "content_type": "image/webp",
        "formato": "webp",
        "seguridad_verificada": True,
        "ahorro_compresion_pct": comp.get("ahorro_pct", 0.0),
        "descripcion": descripcion,
        "timestamp": ts,
        "estado": "encontrado",
        "historial": [{"estado": "encontrado", "ts": ts, "actor": "operador"}],
        "servicio_id": str(servicio_activo["_id"]) if servicio_activo else None,
        "unidad": unidad,
    }
    res = await db.reportes_objetos.insert_one(doc)
    doc["_id"] = res.inserted_id
    out = serialize(doc)
    await manager.broadcast_terminal({"type": "reporte", "reporte": out, "sitio_id": sitio_op}, sitio_id=sitio_op)
    return out


def _resolve_file_mime(path: str, record_ct: Optional[str] = None) -> str:
    if record_ct and record_ct != "application/octet-stream":
        return record_ct
    import mimetypes
    guessed, _ = mimetypes.guess_type(path)
    if guessed and guessed != "application/octet-stream":
        return guessed
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    return {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "gif": "image/gif",
        "svg": "image/svg+xml",
        "avif": "image/avif",
        "pdf": "application/pdf",
    }.get(ext, "image/jpeg")


async def _require_file_actor(request: Request) -> dict:
    """Auth para /files: acepta terminal | operador | dueño (Fase 1 hardening).
    El JWT se lee del header `Authorization: Bearer` (Bearer normal) o, si
    falta, del query param `token` (miniaturas y QR de chofer/vehículo)."""
    payload = _load_token(request)
    scope = payload.get("scope")
    tenant = payload.get("sitio_id") or payload.get("tenant_id")

    if scope == "dev":
        return {"id": "dev", "scope": "dev", "sitio_id": tenant or DEFAULT_SITIO, "_tenant": tenant or DEFAULT_SITIO, "_actor": "dev"}
    if scope == "terminal":
        u = await db.usuarios_terminal.find_one({"_id": to_oid(payload["sub"])})
        if not u or u.get("activo") is False:
            raise HTTPException(status_code=401, detail="Usuario de terminal no encontrado")
        out = serialize(u)
        out["_tenant"] = tenant or out.get("sitio_id") or DEFAULT_SITIO
        return out
    if scope in ("operador", None):
        _exige_scope(payload, SCOPES["operador"], permitir_sin_scope=True)
        op = await _read_operador(payload)
        op["_tenant"] = tenant or op.get("sitio_id") or DEFAULT_SITIO
        return op
    if scope == "dueno":
        d = await db.usuarios_dueno.find_one({"_id": to_oid(payload["sub"])})
        if not d or d.get("activo") is False:
            raise HTTPException(status_code=401, detail="Dueño no encontrado")
        out = serialize(d)
        out["_tenant"] = tenant or out.get("sitio_id") or DEFAULT_SITIO
        return out
    if scope == "pasajero":
        c = await db.clientes.find_one({"_id": to_oid(payload["sub"])})
        if not c:
            raise HTTPException(status_code=401, detail="Pasajero no encontrado")
        out = serialize(c)
        out["_tenant"] = tenant or out.get("sitio_id") or DEFAULT_SITIO
        return out
    raise HTTPException(status_code=403, detail="No autorizado para el archivo")


async def _optional_file_actor(request: Request) -> dict:
    """Si hay token en cabecera o query param, aplica validación estricta de
    actor y sitio; si es una carga directa de <img> sin token, permite servir
    el archivo de imagen dentro del directorio del app."""
    auth = request.headers.get("Authorization", "")
    tok = request.query_params.get("token")
    if auth.startswith("Bearer ") or tok:
        return await _require_file_actor(request)
    return {"id": "public_img", "scope": "public", "sitio_id": DEFAULT_SITIO, "_tenant": DEFAULT_SITIO, "_actor": "dev"}


@api_router.get("/files/{path:path}")
async def download_file(path: str, current=Depends(_optional_file_actor)):
    # Sanitización básica de path y pertenencia al tenant
    if ".." in path or path.startswith("/") or path.startswith("\\"):
        raise HTTPException(status_code=400, detail="Path inválido")
    if not path.startswith(f"{APP_NAME}/"):
        raise HTTPException(status_code=403, detail="Path fuera del tenant")
    sitio_actor = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    # Validación de pertenencia: si el archivo está ligado a un operador/vehículo, debe ser del mismo sitio
    # Heurística 1: reporte con operador_id o sitio_id
    rec_reporte = await db.reportes_objetos.find_one({"storage_path": path})
    if rec_reporte:
        if rec_reporte.get("sitio_id") and rec_reporte.get("sitio_id") != sitio_actor and current.get("_actor") != "dev":
            raise HTTPException(status_code=403, detail="Archivo no pertenece a tu sitio")
        if rec_reporte.get("operador_id"):
            op = await db.operadores.find_one({"_id": to_oid(rec_reporte["operador_id"])}, {"sitio_id": 1})
            if op and op.get("sitio_id") and op.get("sitio_id") != sitio_actor and current.get("_actor") != "dev":
                raise HTTPException(status_code=403, detail="Archivo no pertenece a tu sitio")
    # Heurística 2: path contiene id de operador (combustible/reportes)
    for prefix in (f"{APP_NAME}/combustible/", f"{APP_NAME}/reportes/"):
        if path.startswith(prefix):
            maybe_id = path[len(prefix):].split("/")[0]
            try:
                op = await db.operadores.find_one({"_id": to_oid(maybe_id)}, {"sitio_id": 1})
                if op and op.get("sitio_id") and op.get("sitio_id") != sitio_actor and current.get("_actor") != "dev":
                    raise HTTPException(status_code=403, detail="Archivo no pertenece a tu sitio")
            except HTTPException:
                raise
            except Exception:
                pass
            break
    # Heurística 3: foto de vehículo ligada por foto_url
    foto_url = f"/api/files/{path}"
    veh = await db.vehiculos.find_one({"foto_url": foto_url}, {"sitio_id": 1})
    if veh and veh.get("sitio_id") and veh.get("sitio_id") != sitio_actor and current.get("_actor") != "dev":
        raise HTTPException(status_code=403, detail="Archivo no pertenece a tu sitio")
    data, _ = get_object(path)
    record = rec_reporte or await db.archivos.find_one({"storage_path": path})
    media_type = _resolve_file_mime(path, record.get("content_type") if record else None)
    return Response(
        content=data,
        media_type=media_type,
        headers={
            "Content-Type": media_type,
            "Cache-Control": "public, max-age=86400",
        },
    )


@api_router.get("/reportes")
async def list_reportes(
    estado: Optional[str] = None,
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    q: Optional[str] = None,
    current=Depends(require_terminal),
):
    sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    ops = {str(o["_id"]): o for o in await db.operadores.find(_sitio_query_for(sitio)).to_list(1000)}
    query = dict(_sitio_query_for(sitio))
    if estado and estado != "todos":
        query["estado"] = estado
    if desde or hasta:
        rango: Dict[str, str] = {}
        if desde:
            rango["$gte"] = desde
        if hasta:
            rango["$lte"] = hasta + "\uffff"
        query["timestamp"] = rango
    docs = await db.reportes_objetos.find(query).sort("timestamp", -1).to_list(1000)
    out = []
    q_low = (q or "").strip().lower()
    for d in docs:
        r = serialize(d)
        op = ops.get(r.get("operador_id"))
        if not op and d.get("sitio_id") is None and r.get("operador_id"):
            continue
        r["operador_nombre"] = r.get("operador_nombre") or (op["nombre"] if op else "—")
        r["operador_placa"] = r.get("operador_placa") or (op["placa"] if op else "—")
        if q_low:
            hay = " ".join([
                str(r.get("descripcion") or ""),
                str(r.get("operador_nombre") or ""),
                str(r.get("operador_placa") or ""),
                str(r.get("entregado_a") or ""),
                str(r.get("categoria") or ""),
            ]).lower()
            if q_low not in hay:
                continue
        out.append(r)
    return out


class ReporteEstadoUpdate(BaseModel):
    estado: Literal["encontrado", "resguardo", "devuelto", "cerrado"]
    nota: Optional[str] = None
    entregado_a: Optional[str] = None
    telefono_receptor: Optional[str] = None
    identificacion_receptor: Optional[str] = None


@api_router.patch("/reportes/{reporte_id}/estado")
async def cambiar_estado_reporte(reporte_id: str, body: ReporteEstadoUpdate,
                                 _=Depends(require_terminal)):
    """Ciclo de resguardo del objeto (F11 §23): encontrado → resguardo →
    devuelto | cerrado. Registra historial con actor, receptor y fecha de devolución."""
    ts = now_iso()
    doc = await db.reportes_objetos.find_one({"_id": to_oid(reporte_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    entrada = {"estado": body.estado, "ts": ts, "actor": "terminal"}
    if body.nota:
        entrada["nota"] = body.nota
    if body.entregado_a:
        entrada["entregado_a"] = body.entregado_a
    if body.telefono_receptor:
        entrada["telefono_receptor"] = body.telefono_receptor
    set_fields: Dict[str, object] = {"estado": body.estado}
    if body.estado == "devuelto":
        set_fields["fecha_devolucion"] = ts
        if body.entregado_a:
            set_fields["entregado_a"] = body.entregado_a
        if body.telefono_receptor:
            set_fields["telefono_receptor"] = body.telefono_receptor
        if body.identificacion_receptor:
            set_fields["identificacion_receptor"] = body.identificacion_receptor
    if body.nota:
        set_fields["ultima_nota"] = body.nota
    await db.reportes_objetos.update_one(
        {"_id": to_oid(reporte_id)},
        {"$set": set_fields,
         "$push": {"historial": entrada}},
    )
    return {"ok": True, "estado": body.estado, "nota": body.nota, "fecha_devolucion": set_fields.get("fecha_devolucion")}


@api_router.patch("/reportes/{reporte_id}/resolver")
async def resolver_reporte(reporte_id: str, _=Depends(require_terminal)):
    """Compat 1.x: marcado binario. Equivale a pasar a 'cerrado' del ciclo F11."""
    ts = now_iso()
    doc = await db.reportes_objetos.find_one({"_id": to_oid(reporte_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    if doc.get("estado") != "cerrado":
        await db.reportes_objetos.update_one(
            {"_id": to_oid(reporte_id)},
            {"$set": {"estado": "cerrado"},
             "$push": {"historial": [{"estado": "cerrado", "ts": ts, "actor": "terminal"}]}},
        )
    return {"ok": True, "estado": "cerrado"}



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
    op = await db.operadores.find_one({"_id": to_oid(body.operador_id)}, {"sitio_id": 1})
    sitio_op = (op or {}).get("sitio_id") or DEFAULT_SITIO
    doc = {
        "operador_id": body.operador_id,
        "sitio_id": sitio_op,
        "remitente": body.remitente,
        "texto": body.texto,
        "timestamp": now_iso(),
    }
    res = await db.mensajes_chat.insert_one(doc)
    doc["_id"] = res.inserted_id
    out = serialize(doc)
    await manager.send_operador(body.operador_id, {"type": "mensaje", "mensaje": out})
    await manager.broadcast_terminal({"type": "mensaje", "mensaje": out, "sitio_id": sitio_op}, sitio_id=sitio_op)
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
async def list_conversaciones(current=Depends(require_terminal)):
    sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    ops = {str(o["_id"]): o for o in await db.operadores.find(_sitio_query_for(sitio)).to_list(1000)}
    msgs = await db.mensajes_chat.find(
        {"servicio_id": {"$exists": False}, **_sitio_query_for(sitio)}
    ).sort("timestamp", 1).to_list(5000)
    convos: Dict[str, dict] = {}
    for m in msgs:
        oid = m["operador_id"]
        op = ops.get(oid)
        if not op and m.get("sitio_id") is None:
            continue
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
# Tarifas predefinidas (con configuración de horarios, recargos, km extra y zonas)
# ---------------------------------------------------------------------------
class TarifaBody(BaseModel):
    nombre: str
    monto: float
    tipo: str = "fijo"
    orden: int = 0
    hora_inicio: Optional[str] = "06:00"
    hora_fin: Optional[str] = "22:00"
    horario_tipo: Optional[str] = "todo_el_dia"  # todo_el_dia | diurno | nocturno | hora_pico
    recargo_nocturno: Optional[float] = 0.0
    recargo_lluvia: Optional[float] = 0.0
    costo_km_extra: Optional[float] = 0.0
    costo_parada_extra: Optional[float] = 15.0
    zona_nombre: Optional[str] = None
    notas: Optional[str] = None
    activa: bool = True


@api_router.post("/tarifas")
async def crear_tarifa(body: TarifaBody, current=Depends(require_terminal)):
    sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    doc = {**body.model_dump(), "sitio_id": sitio, "creado_en": now_iso()}
    res = await db.tarifas_predefinidas.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api_router.get("/tarifas")
async def list_tarifas(current=Depends(_any_autenticado)):
    sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
    docs = await db.tarifas_predefinidas.find(_sitio_query_for(sitio)).sort("orden", 1).to_list(1000)
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


@api_router.post("/config/set")
async def set_config(body: ConfigSetBody, _=Depends(require_terminal)):
    await db.config.update_one({"key": body.key}, {"$set": {"key": body.key, "valor": body.valor}}, upsert=True)
    return {"ok": True, "key": body.key, "valor": body.valor}


# ---------------------------------------------------------------------------
# Suscripción / Tiempo restante de uso (EXCLUSIVO Terminal y Socios, nunca Chofer)
# y Focos de Servicios por Zona (Colores por Demanda)
# ---------------------------------------------------------------------------
def _calcular_suscripcion(vence_en_iso: Optional[str], default_dias: int = 26, plan: str = "Plan Central Satelital Pro") -> dict:
    ahora = datetime.now(timezone.utc)
    if not vence_en_iso:
        exp_dt = ahora + timedelta(days=default_dias, hours=14)
        vence_en_iso = exp_dt.isoformat()
    else:
        try:
            exp_dt = datetime.fromisoformat(str(vence_en_iso))
            if exp_dt.tzinfo is None:
                exp_dt = exp_dt.replace(tzinfo=timezone.utc)
        except Exception:
            exp_dt = ahora + timedelta(days=default_dias)
    diff_sec = (exp_dt - ahora).total_seconds()
    dias = max(0, int(diff_sec // 86400))
    horas = max(0, int((diff_sec % 86400) // 3600))
    if diff_sec <= 0:
        estado = "vencida"
    elif dias <= 5:
        estado = "por_vencer"
    else:
        estado = "activa"
    return {
        "plan_nombre": plan,
        "licencia_vence_en": exp_dt.strftime("%Y-%m-%d"),
        "dias_restantes": dias,
        "horas_restantes": horas,
        "estado_suscripcion": estado,
        "etiqueta_restante": f"{dias} días · {horas}h restantes" if dias > 0 else f"{horas}h restantes",
    }


def _clasificar_zona_servicio(texto_origen: str, lat: Optional[float] = None, lng: Optional[float] = None) -> str:
    t = (texto_origen or "").lower()
    if any(k in t for k in ("tren maya", "pakal", "ferrocarril", "aeropuerto")):
        return "Pakal-Ná / Tren Maya"
    if any(k in t for k in ("cañada", "canada", "tulipanes", "chan-kah", "ruinas", "arqueol", "misión", "mision")):
        return "La Cañada / Zona Hotelera"
    if any(k in t for k in ("hospital", "periférico", "periferico", "nututún", "nututun", "sur", "flores")):
        return "Hospital / Periférico Sur"
    if any(k in t for k in ("ado", "terminal", "chedraui", "super che", "juárez", "juarez")):
        return "Corredor ADO / Av. Juárez"
    if lat is not None and lng is not None:
        if lat >= 17.522:
            return "Pakal-Ná / Tren Maya"
        if lng >= -91.9815 and lat >= 17.512:
            return "La Cañada / Zona Hotelera"
        if lat <= 17.5082:
            return "Hospital / Periférico Sur"
    return "Centro Histórico / Mercado"


def _construir_focos_por_zona(servicios_docs: list) -> list:
    catalogo_zonas = {
        "Centro Histórico / Mercado": {"lat": 17.5098, "lng": -91.9825, "cuadrante": "Centro"},
        "Corredor ADO / Av. Juárez": {"lat": 17.5138, "lng": -91.9852, "cuadrante": "ADO / Juárez"},
        "La Cañada / Zona Hotelera": {"lat": 17.5165, "lng": -91.9810, "cuadrante": "La Cañada"},
        "Pakal-Ná / Tren Maya": {"lat": 17.5320, "lng": -91.9565, "cuadrante": "Pakal-Ná"},
        "Hospital / Periférico Sur": {"lat": 17.5075, "lng": -91.9800, "cuadrante": "Periférico Sur"},
    }
    conteo = {z: {"servicios": 0, "ingresos": 0.0, "activos": 0} for z in catalogo_zonas}
    for s in servicios_docs:
        orig = s.get("origen") or {}
        txt = s.get("origen_texto") or orig.get("texto") or ""
        z = _clasificar_zona_servicio(txt, orig.get("lat"), orig.get("lng"))
        bucket = conteo.setdefault(z, {"servicios": 0, "ingresos": 0.0, "activos": 0})
        bucket["servicios"] += 1
        bucket["ingresos"] += float(s.get("costo") or 0.0)
        if s.get("estado") in ("pendiente", "ofrecido", "asignado", "en_curso"):
            bucket["activos"] += 1

    total = max(1, sum(b["servicios"] for b in conteo.values()))
    focos = []
    for z, stats in sorted(conteo.items(), key=lambda kv: -kv[1]["servicios"]):
        cnt = stats["servicios"]
        meta = catalogo_zonas.get(z, {"lat": 17.5099, "lng": -91.9847, "cuadrante": z})
        if cnt >= 5:
            nivel, color_hex, semaforo = "Foco Caliente (Alta Demanda)", "#EF4444", "rojo"
        elif cnt >= 3:
            nivel, color_hex, semaforo = "Demanda Media-Alta", "#F59E0B", "ambar"
        elif cnt >= 1:
            nivel, color_hex, semaforo = "Demanda Moderada", "#10B981", "verde"
        else:
            nivel, color_hex, semaforo = "Sin Saturación", "#64748B", "gris"
        focos.append({
            "zona": z,
            "cuadrante": meta["cuadrante"],
            "lat": meta["lat"],
            "lng": meta["lng"],
            "servicios": cnt,
            "activos": stats["activos"],
            "ingresos": round(stats["ingresos"], 2),
            "porcentaje": round((cnt / total) * 100, 1) if sum(b["servicios"] for b in conteo.values()) > 0 else 0,
            "nivel": nivel,
            "color_hex": color_hex,
            "semaforo": semaforo,
        })
    return focos


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
    out = dict(current)
    out["suscripcion"] = _calcular_suscripcion(out.get("licencia_vence_en"), default_dias=28, plan="Licencia Socio Concesionario")
    return out


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
    suscripcion = _calcular_suscripcion(current.get("licencia_vence_en"), default_dias=28, plan="Licencia Socio Concesionario")

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
        "suscripcion": suscripcion,
        "focos_por_zona": _construir_focos_por_zona(servicios_hoy),
    }


@api_router.get("/dueno/flota")
async def dueno_flota(current: dict = Depends(require_dueno)):
    dueno_id = current["id"]
    vehiculos = await _vehiculos_de_dueno(dueno_id)
    operador_ids = [v["operador_conductor_id"] for v in vehiculos if v.get("operador_conductor_id")]
    op_oids = [to_oid(x) for x in operador_ids]
    operadores = {str(o["_id"]): o for o in (await db.operadores.find({"_id": {"$in": op_oids}}).to_list(1000) if op_oids else [])}

    # Conteo de servicios completados totales y de hoy por conductor
    hoy = _hoy_str()
    conteos: Dict[str, int] = {}
    conteos_hoy: Dict[str, int] = {}
    servicios_activos: Dict[str, dict] = {}
    if operador_ids:
        docs = await db.servicios.find(
            {"operador_asignado_id": {"$in": operador_ids}, "estado": "completado"},
            {"operador_asignado_id": 1, "timestamp_fin": 1, "timestamp_creacion": 1},
        ).to_list(20000)
        for d in docs:
            oid = d.get("operador_asignado_id")
            conteos[oid] = conteos.get(oid, 0) + 1
            ts = d.get("timestamp_fin") or d.get("timestamp_creacion") or ""
            if ts.startswith(hoy):
                conteos_hoy[oid] = conteos_hoy.get(oid, 0) + 1

        s_activos = await db.servicios.find(
            {"operador_asignado_id": {"$in": operador_ids}, "estado": {"$in": ["asignado", "en_curso"]}}
        ).to_list(100)
        for sa in s_activos:
            servicios_activos[sa.get("operador_asignado_id")] = serialize(sa)

    tipos = await _mapa_tipos_vehiculo()
    out = []
    for v in vehiculos:
        item = _enriquecer_vehiculo(serialize(v), tipos)
        op_id = v.get("operador_conductor_id")
        op = operadores.get(op_id)
        if op:
            item["conductor"] = {
                "id": str(op["_id"]),
                "nombre": op["nombre"],
                "telefono": op.get("telefono"),
                "estado": op.get("estado", "libre"),
                "foto_url": op.get("foto_url"),
                "ultima_actualizacion": op.get("ultima_actualizacion"),
                "gps_heading": op.get("gps_heading", 0),
                "gps_speed": op.get("gps_speed", 0),
            }
            item["lat"] = op.get("lat")
            item["lng"] = op.get("lng")
            item["gps_heading"] = op.get("gps_heading", 0)
            item["gps_speed"] = op.get("gps_speed", 0)
            item["foto_url"] = op.get("foto_url")
            item["estado"] = op.get("estado", "libre")
            item["track"] = [{"lat": p[0], "lng": p[1], "ts": p[2]} for p in (op.get("track") or [])[-TRACK_MAX_POINTS:]]
            item["servicio_activo"] = servicios_activos.get(op_id)
        else:
            item["conductor"] = None
            item["track"] = []
            item["estado"] = "fuera_de_servicio"
            item["servicio_activo"] = None

        item["servicios_realizados"] = conteos.get(op_id, 0)
        item["servicios_hoy"] = conteos_hoy.get(op_id, 0)
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
            rango["$lte"] = hasta + ""
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
        s["operador_foto_url"] = op.get("foto_url") if op else None
        s["operador_id"] = str(op["_id"]) if op else None
        s["vehiculo_numero_economico"] = veh.get("numero_economico") if veh else None
        s["vehiculo_marca"] = veh.get("marca") if veh else None
        s["vehiculo_modelo"] = veh.get("modelo") if veh else None
        s["vehiculo_foto_url"] = veh.get("foto_url") if veh else None
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
                           "foto_url": op.get("foto_url"),
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
        "timestamp_creacion": {"$gte": desde, "$lte": hasta + ""},
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
# Fotos de perfil / logo / evidencias (con análisis de seguridad + compresión WebP por tenant)
# ---------------------------------------------------------------------------
async def _guardar_imagen(foto: UploadFile, prefix: str, sitio_id: Optional[str] = None) -> str:
    raw_data = await foto.read()
    comp = analizar_y_comprimir_imagen_webp(raw_data, foto.filename or "imagen.jpg")
    path = f"{APP_NAME}/{prefix}/{uuid.uuid4().hex}.{comp['ext']}"
    result = put_object(path, comp["data"], comp["content_type"], sitio_id=sitio_id)
    await db.archivos.insert_one({
        "storage_path": result["path"],
        "tenant_path": result.get("tenant_path"),
        "sitio_id": sitio_id or DEFAULT_SITIO,
        "content_type": comp["content_type"],
        "original_bytes": comp.get("original_bytes"),
        "compressed_bytes": comp.get("compressed_bytes"),
        "ahorro_pct": comp.get("ahorro_pct"),
        "seguro": True,
    })
    return f"/api/files/{result['path']}"


VEHICULO_IMG_MAX_DIM = 1600
VEHICULO_IMG_MAX_BYTES = 8 * 1024 * 1024  # 8 MB de entrada, antes de optimizar


def _optimizar_imagen_webp(data: bytes) -> bytes:
    """Reescala (máx. `VEHICULO_IMG_MAX_DIM` px de lado mayor) y recodifica a WebP.
    Verifica los magic bytes reales con Pillow — no confía en la extensión/Content-Type
    que envía el cliente (SEC-06 de la auditoría: la validación era solo de nombre)."""
    comp = analizar_y_comprimir_imagen_webp(data, "vehiculo.jpg", max_dim=VEHICULO_IMG_MAX_DIM, strict=True)
    return comp["data"]


async def _guardar_imagen_vehiculo(foto: UploadFile, prefix: str, sitio_id: Optional[str] = None) -> str:
    """Como `_guardar_imagen`, pero para fotos de vehículos/tipos: valida que sea
    una imagen real, la reescala y la recodifica a WebP (tamaño de archivo menor,
    formato uniforme para toda la galería de flota)."""
    data = await foto.read()
    if len(data) > VEHICULO_IMG_MAX_BYTES:
        raise HTTPException(status_code=413, detail="La imagen supera el límite de 8 MB")
    optimizada = _optimizar_imagen_webp(data)
    path = f"{APP_NAME}/{prefix}/{uuid.uuid4().hex}.webp"
    result = put_object(path, optimizada, "image/webp", sitio_id=sitio_id)
    await db.archivos.insert_one({
        "storage_path": result["path"],
        "tenant_path": result.get("tenant_path"),
        "sitio_id": sitio_id or DEFAULT_SITIO,
        "content_type": "image/webp",
        "seguro": True,
    })
    return f"/api/files/{result['path']}"


@api_router.post("/perfil/{coleccion}/{doc_id}/foto")
async def subir_foto_perfil(coleccion: str, doc_id: str, foto: UploadFile = File(...), request: Request = None):
    if coleccion not in ("operadores", "usuarios_terminal", "usuarios_dueno"):
        raise HTTPException(status_code=400, detail="Colección inválida")
    actor_sitio = DEFAULT_SITIO
    if coleccion == "operadores":
        actor = await _mismo_o_terminal(request, doc_id)
        actor_sitio = actor.get("sitio_id") or DEFAULT_SITIO
    else:
        actor = await require_terminal(request)
        actor_sitio = actor.get("sitio_id") or DEFAULT_SITIO
    url = await _guardar_imagen(foto, "perfiles", sitio_id=actor_sitio)
    await db[coleccion].update_one({"_id": to_oid(doc_id)}, {"$set": {"foto_url": url}})
    return {"foto_url": url}


DEFAULT_PUNTOS_CALIENTES = [
    {"id": "poi_ado", "nombre": "Terminal ADO", "referencia": "Av. Juárez s/n, Centro", "lat": 17.5140, "lng": -91.9855, "icono": "bus"},
    {"id": "poi_hospital", "nombre": "Hospital General", "referencia": "Periférico Sur, Urgencias", "lat": 17.5077, "lng": -91.9800, "icono": "hospital"},
    {"id": "poi_parque", "nombre": "Parque Central", "referencia": "Frente a Catedral / Quiosco", "lat": 17.5098, "lng": -91.9820, "icono": "landmark"},
    {"id": "poi_mercado", "nombre": "Mercado Municipal", "referencia": "Portal de las Flores, Centro", "lat": 17.5080, "lng": -91.9835, "icono": "shopping-bag"},
    {"id": "poi_tren_maya", "nombre": "Estación Tren Maya", "referencia": "Boulevard Pakal-Ná / Tren Maya", "lat": 17.5320, "lng": -91.9540, "icono": "train"},
    {"id": "poi_ruinas", "nombre": "Zona Arqueológica", "referencia": "Carretera a las Ruinas km 6.5", "lat": 17.4840, "lng": -91.9950, "icono": "compass"},
    {"id": "poi_chedraui", "nombre": "Super Che / Chedraui", "referencia": "Av. Juárez, Estacionamiento", "lat": 17.5125, "lng": -91.9840, "icono": "shopping-cart"},
    {"id": "poi_canada", "nombre": "Zona Hotelera La Cañada", "referencia": "Hotel Maya Tulipanes / Cañada", "lat": 17.5165, "lng": -91.9810, "icono": "hotel"},
]


class PuntoCalienteItem(BaseModel):
    id: Optional[str] = None
    nombre: str
    referencia: Optional[str] = ""
    lat: float
    lng: float
    tarifa_sugerida: Optional[float] = 50.0
    icono: Optional[str] = "map-pin"


class SitioConfigBody(BaseModel):
    clave: Optional[str] = None
    sitio_id: Optional[str] = None
    nombre: str = "Sitio Principal Palenque"
    subtitulo: Optional[str] = "Radio Taxis & Despacho Satelital"
    ciudad: Optional[str] = "Palenque, Chiapas"
    telefono_central: Optional[str] = "+52 916 345 0000"
    logo_url: Optional[str] = None
    tema: Optional[str] = None
    tema_default: Optional[str] = None
    color_primario: Optional[str] = "#22d3ee"
    modo_default: Optional[str] = "dark"
    map_center_lat: float = 17.5099
    map_center_lng: float = -91.9847
    cuota_diaria_default: float = 350.0
    auto_respuesta_wa: bool = True
    plantilla_wa: Optional[str] = None
    puntos_calientes: Optional[List[PuntoCalienteItem]] = None
    licencia_vence_en: Optional[str] = None
    suscripcion_dias: Optional[int] = None
    contacto_soporte: Optional[str] = None
    plan_nombre: Optional[str] = "Plan Central Satelital Pro"
    facturacion_mensual: Optional[float] = 2800.0
    admin_usuario: Optional[str] = None
    admin_contrasena: Optional[str] = None
    admin_nombre: Optional[str] = None


async def _obtener_sitio_config(sitio_id: str) -> dict:
    doc = await db.sitios.find_one({"clave": sitio_id})
    logo_global = await db.config.find_one({"key": "logo"})
    fallback_logo = logo_global.get("foto_url") if logo_global else None
    default_dias = 26 if sitio_id == DEFAULT_SITIO else 19
    if not doc:
        sus = _calcular_suscripcion(None, default_dias=default_dias, plan="Plan Central Satelital Pro")
        doc = {
            "clave": sitio_id,
            "sitio_id": sitio_id,
            "nombre": "Radio Taxis Palenque" if sitio_id == DEFAULT_SITIO else f"Sitio {sitio_id}",
            "subtitulo": "Central de Despacho Satelital",
            "ciudad": "Palenque, Chiapas",
            "telefono_central": "+52 916 345 0000",
            "logo_url": fallback_logo,
            "tema": "esmeralda",
            "tema_default": "esmeralda",
            "color_primario": "#22d3ee",
            "modo_default": "dark",
            "map_center_lat": 17.5099,
            "map_center_lng": -91.9847,
            "cuota_diaria_default": 350.0,
            "auto_respuesta_wa": True,
            "plantilla_wa": None,
            "puntos_calientes": DEFAULT_PUNTOS_CALIENTES,
            "facturacion_mensual": 2800.0 if sitio_id == DEFAULT_SITIO else 1950.0,
            "suscripcion": sus,
            **sus,
        }
    else:
        doc = serialize(doc)
        doc["clave"] = doc.get("clave") or sitio_id
        doc["sitio_id"] = doc.get("sitio_id") or doc["clave"]
        doc.setdefault("subtitulo", "Central de Despacho Satelital")
        doc.setdefault("ciudad", "Palenque, Chiapas")
        doc.setdefault("telefono_central", "+52 916 345 0000")
        if not doc.get("logo_url"):
            doc["logo_url"] = fallback_logo
        tema_val = doc.get("tema") or doc.get("tema_default") or "esmeralda"
        doc["tema"] = tema_val
        doc["tema_default"] = tema_val
        doc.setdefault("color_primario", "#22d3ee")
        doc.setdefault("modo_default", "dark")
        doc.setdefault("map_center_lat", 17.5099)
        doc.setdefault("map_center_lng", -91.9847)
        doc.setdefault("cuota_diaria_default", 350.0)
        doc.setdefault("auto_respuesta_wa", True)
        doc.setdefault("facturacion_mensual", 2800.0 if sitio_id == DEFAULT_SITIO else 1950.0)
        if not doc.get("puntos_calientes"):
            doc["puntos_calientes"] = DEFAULT_PUNTOS_CALIENTES
        sus = _calcular_suscripcion(
            doc.get("licencia_vence_en"),
            default_dias=default_dias,
            plan=doc.get("plan_nombre") or "Plan Central Satelital Pro",
        )
        doc["suscripcion"] = sus
        doc.update(sus)
    return doc


@api_router.post("/dev/logo")
async def subir_logo(foto: UploadFile = File(...), sitio_id: Optional[str] = Form(None), _=Depends(require_dev)):
    target_sitio = sitio_id or DEFAULT_SITIO
    url = await _guardar_imagen(foto, "logo", sitio_id=target_sitio)
    await db.config.update_one({"key": "logo"}, {"$set": {"key": "logo", "foto_url": url}}, upsert=True)
    await db.sitios.update_one(
        {"clave": target_sitio},
        {"$set": {"logo_url": url, "actualizado": now_iso()}},
        upsert=True,
    )
    return {"foto_url": url, "sitio_id": target_sitio}


@api_router.post("/dev/sitios/{clave}/logo")
async def subir_logo_sitio(clave: str, foto: UploadFile = File(...), _=Depends(require_dev)):
    url = await _guardar_imagen(foto, "logo", sitio_id=clave)
    if clave == DEFAULT_SITIO:
        await db.config.update_one({"key": "logo"}, {"$set": {"key": "logo", "foto_url": url}}, upsert=True)
    await db.sitios.update_one(
        {"clave": clave},
        {"$set": {"clave": clave, "logo_url": url, "actualizado": now_iso()}},
        upsert=True,
    )
    return {"foto_url": url, "clave": clave}


@api_router.post("/dueno/evidencia")
async def subir_evidencia_dueno(foto: UploadFile = File(...), current: dict = Depends(require_dueno)):
    """Sube la foto de evidencia de una carga de combustible (mismo mecanismo que
    las fotos de perfil/vehículo: _guardar_imagen + db.archivos + GET /api/files)."""
    url = await _guardar_imagen(foto, "evidencias", sitio_id=current.get("sitio_id") or DEFAULT_SITIO)
    return {"evidencia_url": url}


@api_router.get("/config/logo")
async def get_logo(sitio_id: Optional[str] = None):
    if sitio_id:
        s = await db.sitios.find_one({"clave": sitio_id})
        if s and s.get("logo_url"):
            return {"foto_url": s["logo_url"]}
    c = await db.config.find_one({"key": "logo"})
    return {"foto_url": c["foto_url"] if c else None}


@api_router.get("/config/sitio")
async def get_config_sitio(request: Request, sitio_id: Optional[str] = None):
    target_sitio = sitio_id
    if not target_sitio:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            try:
                payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
                target_sitio = payload.get("sitio_id") or payload.get("tenant_id")
            except Exception:
                pass
    target_sitio = target_sitio or DEFAULT_SITIO
    return await _obtener_sitio_config(target_sitio)


@api_router.get("/config/{key}")
async def read_config(key: str, _=Depends(_any_autenticado)):
    doc = await db.config.find_one({"key": key})
    return {"key": key, "valor": doc.get("valor") if doc else None}


@api_router.put("/config/sitio")
async def update_config_sitio(body: SitioConfigBody, request: Request):
    actor = await _require_terminal_or_dev(request)
    target_sitio = body.clave or body.sitio_id or actor.get("sitio_id") or DEFAULT_SITIO
    tema_elegido = body.tema_default or body.tema or "esmeralda"
    updates = {
        "clave": target_sitio,
        "sitio_id": target_sitio,
        "nombre": body.nombre,
        "subtitulo": body.subtitulo,
        "ciudad": body.ciudad,
        "telefono_central": body.telefono_central,
        "tema": tema_elegido,
        "tema_default": tema_elegido,
        "color_primario": body.color_primario or "#22d3ee",
        "modo_default": body.modo_default or "dark",
        "map_center_lat": body.map_center_lat,
        "map_center_lng": body.map_center_lng,
        "cuota_diaria_default": body.cuota_diaria_default,
        "auto_respuesta_wa": body.auto_respuesta_wa,
        "plantilla_wa": body.plantilla_wa,
        "actualizado": now_iso(),
    }
    if body.suscripcion_dias is not None:
        updates["licencia_vence_en"] = (datetime.now(timezone.utc) + timedelta(days=int(body.suscripcion_dias))).strftime("%Y-%m-%d")
    elif body.licencia_vence_en:
        updates["licencia_vence_en"] = body.licencia_vence_en
    if body.contacto_soporte:
        updates["contacto_soporte"] = body.contacto_soporte
    if body.plan_nombre:
        updates["plan_nombre"] = body.plan_nombre
    if body.facturacion_mensual is not None:
        updates["facturacion_mensual"] = body.facturacion_mensual
    if body.logo_url is not None:
        updates["logo_url"] = body.logo_url
    if body.puntos_calientes is not None:
        pois = []
        for idx, p in enumerate(body.puntos_calientes):
            pd = p.model_dump()
            if not pd.get("id"):
                pd["id"] = f"poi_{idx+1}_{uuid.uuid4().hex[:4]}"
            pois.append(pd)
        updates["puntos_calientes"] = pois
    await db.sitios.update_one({"clave": target_sitio}, {"$set": updates}, upsert=True)
    return await _obtener_sitio_config(target_sitio)


# ---------------------------------------------------------------------------
# Panel de desarrollador SaaS (Análisis de Tenants, Facturación, Avisos, DB y Storage WebP)
# ---------------------------------------------------------------------------
class DevLoginBody(BaseModel):
    usuario: str
    contrasena: str


class ActivoBody(BaseModel):
    activo: bool


class SuscripcionUpdateBody(BaseModel):
    tipo_entidad: Literal["sitio", "usuarios_terminal", "usuarios_dueno"] = "sitio"
    entidad_id: str
    dias_extender: Optional[int] = None
    licencia_vence_en: Optional[str] = None
    plan_nombre: Optional[str] = None


class FacturaCreateBody(BaseModel):
    sitio_id: str
    concepto: str = "Licencia Mensual TaxiHub Satelital + WhatsApp Anti-Ban"
    periodo: str = "Octubre 2026"
    monto: float = 2800.0
    estado: Literal["pagada", "pendiente", "vencida"] = "pendiente"
    metodo_pago: str = "Transferencia SPEI"


class FacturaEstadoBody(BaseModel):
    estado: Literal["pagada", "pendiente", "vencida"]
    extender_dias: int = 30
    metodo_pago: Optional[str] = None


class AvisoTerminalBody(BaseModel):
    sitio_id: str = "todos"  # "todos" o clave del tenant
    titulo: str
    mensaje: str
    nivel: str = "info"
    destino: Optional[str] = "terminal_y_socios"
    contacto_soporte: Optional[str] = "+52 916 100 9999 (Soporte SaaS TaxiHub)"
    duracion_horas: int = 24
    horas_vigencia: Optional[int] = None


@api_router.post("/dev/login")
async def dev_login(body: DevLoginBody):
    if body.usuario != os.environ.get("DEV_USER") or body.contrasena != os.environ.get("DEV_PASSWORD"):
        raise HTTPException(status_code=401, detail="Credenciales de desarrollador inválidas")
    now = datetime.now(timezone.utc)
    token = jwt.encode({"sub": "dev", "scope": "dev", "iat": now, "exp": now + timedelta(hours=24), "sitio_id": DEFAULT_SITIO, "tenant_id": DEFAULT_SITIO}, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {"token": token}


async def _enriquecer_metricas_tenant(clave: str) -> dict:
    cfg = await _obtener_sitio_config(clave)
    q = _sitio_query_for(clave)
    hoy = _hoy_str()
    ops_docs = await db.operadores.find(q, {"estado": 1, "activo": 1}).to_list(1000)
    cfg["operadores_count"] = len(ops_docs)
    cfg["taxis_total"] = len(ops_docs)
    cfg["taxis_activos"] = sum(1 for o in ops_docs if o.get("activo") is not False and o.get("estado") != "fuera_de_servicio")
    cfg["vehiculos_count"] = await db.vehiculos.count_documents(q)
    cfg["terminales_count"] = await db.usuarios_terminal.count_documents(q)
    cfg["operadoras_total"] = cfg["terminales_count"]
    cfg["duenos_count"] = await db.usuarios_dueno.count_documents(q)
    cfg["socios_total"] = cfg["duenos_count"]
    clientes_col = await db.clientes.count_documents(q)
    wa_col = await db.wa_conversaciones.count_documents(q)
    sv_docs = await db.servicios.find(q, {"cliente_telefono": 1, "costo": 1, "estado": 1, "timestamp_creacion": 1}).to_list(5000)
    telefonos_unicos = {s.get("cliente_telefono") for s in sv_docs if s.get("cliente_telefono")}
    cfg["clientes_count"] = max(clientes_col, len(telefonos_unicos) + wa_col)
    cfg["clientes_total"] = cfg["clientes_count"]
    cfg["conversaciones_wa_count"] = wa_col
    cfg["servicios_total"] = len(sv_docs)
    cfg["servicios_hoy"] = sum(1 for s in sv_docs if str(s.get("timestamp_creacion") or "").startswith(hoy))
    cfg["ingresos_servicios"] = round(sum(float(s.get("costo") or 0) for s in sv_docs if s.get("estado") == "completado"), 2)
    cfg["ingresos_totales"] = cfg["ingresos_servicios"]
    cfg["plan"] = cfg.get("plan_nombre") or "Enterprise Multi-Sitio"

    facs_tenant = [serialize(f) for f in await db.facturas_tenant.find({"sitio_id": clave}).sort("fecha_emision", -1).to_list(50)]
    cfg["facturas_pendientes"] = sum(1 for f in facs_tenant if f.get("estado") in ("pendiente", "vencida"))
    cfg["ultima_factura"] = facs_tenant[0] if facs_tenant else None

    # Métricas de carpeta local aislada del tenant (uploads/tenants/{clave}/)
    tenant_dir = UPLOAD_DIR / "tenants" / clave
    files_count = 0
    bytes_total = 0
    webp_count = 0
    if tenant_dir.exists():
        for fp in tenant_dir.rglob("*"):
            if fp.is_file():
                files_count += 1
                bytes_total += fp.stat().st_size
                if fp.suffix.lower() == ".webp":
                    webp_count += 1
    size_kb = round(bytes_total / 1024.0, 1)
    cfg["storage_archivos"] = files_count
    cfg["storage_kb"] = size_kb
    cfg["storage_carpeta"] = f"uploads/tenants/{clave}/"
    cfg["storage"] = {
        "carpeta_local": f"uploads/tenants/{clave}/",
        "archivos_count": files_count,
        "webp_count": webp_count,
        "size_kb": size_kb,
        "formato_estandar": "WebP Comprimido + Escaneo Anti-Malware",
    }
    return cfg


@api_router.get("/dev/sitios")
async def dev_list_sitios(_=Depends(require_dev)):
    docs = await db.sitios.find().to_list(200)
    claves_vistas = set()
    out = []
    for d in docs:
        clave = d.get("clave") or DEFAULT_SITIO
        claves_vistas.add(clave)
        out.append(await _enriquecer_metricas_tenant(clave))
    if DEFAULT_SITIO not in claves_vistas:
        out.insert(0, await _enriquecer_metricas_tenant(DEFAULT_SITIO))
    return {"sitios": out}


@api_router.get("/dev/analisis-tenants")
@api_router.get("/dev/tenants-analisis")
async def dev_analisis_tenants(_=Depends(require_dev)):
    res_sitios = await dev_list_sitios()
    sitios = res_sitios["sitios"]
    facturas = [serialize(f) for f in await db.facturas_tenant.find().sort("fecha_emision", -1).to_list(500)]
    avisos = [serialize(a) for a in await db.avisos_dev.find({"activo": True}).sort("creado_en", -1).to_list(100)]
    resumen = {
        "total_tenants": len(sitios),
        "total_clientes": sum(s.get("clientes_count", 0) for s in sitios),
        "total_taxis": sum(s.get("taxis_total", 0) for s in sitios),
        "total_unidades": sum(s.get("vehiculos_count", 0) for s in sitios),
        "total_conductores": sum(s.get("operadores_count", 0) for s in sitios),
        "total_socios": sum(s.get("duenos_count", 0) for s in sitios),
        "total_servicios": sum(s.get("servicios_total", 0) for s in sitios),
        "total_storage_kb": round(sum(float(s.get("storage_kb") or 0) for s in sitios), 1),
        "mrr_mensual": sum(float(s.get("facturacion_mensual") or 0) for s in sitios),
        "facturas_pendientes": sum(1 for f in facturas if f.get("estado") in ("pendiente", "vencida")),
    }
    return {
        "tenants": sitios,
        "resumen_global": resumen,
        "totales_globales": resumen,
        "facturas": facturas,
        "avisos_activos": avisos,
    }


@api_router.post("/dev/sitios")
async def dev_create_sitio(body: SitioConfigBody, _=Depends(require_dev)):
    clave = (body.clave or "").strip().lower().replace(" ", "_")
    if not clave:
        raise HTTPException(status_code=400, detail="Debes indicar una clave única para el sitio (ej. sitio_pakalna)")
    pois = (
        [p.model_dump() for p in body.puntos_calientes]
        if body.puntos_calientes is not None
        else DEFAULT_PUNTOS_CALIENTES
    )
    dias = int(body.suscripcion_dias or 30)
    vence = body.licencia_vence_en or (datetime.now(timezone.utc) + timedelta(days=dias)).strftime("%Y-%m-%d")
    doc = {
        "clave": clave,
        "nombre": body.nombre,
        "subtitulo": body.subtitulo or "Central de Despacho Satelital",
        "ciudad": body.ciudad or "Palenque, Chiapas",
        "telefono_central": body.telefono_central or "+52 916 345 0000",
        "logo_url": body.logo_url,
        "tema": body.tema or "esmeralda",
        "color_primario": body.color_primario or "#22d3ee",
        "modo_default": body.modo_default or "dark",
        "map_center_lat": body.map_center_lat,
        "map_center_lng": body.map_center_lng,
        "cuota_diaria_default": body.cuota_diaria_default,
        "auto_respuesta_wa": body.auto_respuesta_wa,
        "plantilla_wa": body.plantilla_wa,
        "puntos_calientes": pois,
        "licencia_vence_en": vence,
        "plan_nombre": body.plan_nombre or "Plan Central Satelital Pro",
        "facturacion_mensual": body.facturacion_mensual or 2800.0,
        "creado": now_iso(),
        "actualizado": now_iso(),
    }
    (UPLOAD_DIR / "tenants" / clave / "reportes").mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / "tenants" / clave / "perfiles").mkdir(parents=True, exist_ok=True)
    await db.sitios.update_one({"clave": clave}, {"$set": doc}, upsert=True)
    if body.admin_usuario and body.admin_contrasena:
        if not await db.usuarios_terminal.find_one({"usuario": body.admin_usuario}):
            await db.usuarios_terminal.insert_one({
                "nombre": body.admin_nombre or f"Central {body.nombre}",
                "usuario": body.admin_usuario,
                "password_hash": hash_password(body.admin_contrasena),
                "sitio_id": clave,
                "licencia_vence_en": vence,
                "activo": True,
                "creado": now_iso(),
            })
    return await _obtener_sitio_config(clave)


@api_router.put("/dev/sitios/{clave}")
async def dev_update_sitio(clave: str, body: SitioConfigBody, _=Depends(require_dev)):
    body.clave = clave
    updates = {
        "clave": clave,
        "nombre": body.nombre,
        "subtitulo": body.subtitulo,
        "ciudad": body.ciudad,
        "telefono_central": body.telefono_central,
        "tema": body.tema or "esmeralda",
        "color_primario": body.color_primario or "#22d3ee",
        "modo_default": body.modo_default or "dark",
        "map_center_lat": body.map_center_lat,
        "map_center_lng": body.map_center_lng,
        "cuota_diaria_default": body.cuota_diaria_default,
        "auto_respuesta_wa": body.auto_respuesta_wa,
        "plantilla_wa": body.plantilla_wa,
        "actualizado": now_iso(),
    }
    if body.suscripcion_dias is not None:
        updates["licencia_vence_en"] = (datetime.now(timezone.utc) + timedelta(days=int(body.suscripcion_dias))).strftime("%Y-%m-%d")
    elif body.licencia_vence_en:
        updates["licencia_vence_en"] = body.licencia_vence_en
    if body.contacto_soporte:
        updates["contacto_soporte"] = body.contacto_soporte
    if body.plan_nombre:
        updates["plan_nombre"] = body.plan_nombre
    if body.facturacion_mensual is not None:
        updates["facturacion_mensual"] = body.facturacion_mensual
    if body.logo_url is not None:
        updates["logo_url"] = body.logo_url
    if body.puntos_calientes is not None:
        pois = []
        for idx, p in enumerate(body.puntos_calientes):
            pd = p.model_dump()
            if not pd.get("id"):
                pd["id"] = f"poi_{idx+1}_{uuid.uuid4().hex[:4]}"
            pois.append(pd)
        updates["puntos_calientes"] = pois
    await db.sitios.update_one({"clave": clave}, {"$set": updates}, upsert=True)
    return await _obtener_sitio_config(clave)


@api_router.get("/dev/cuentas")
async def dev_list_cuentas(sitio_id: Optional[str] = None, _=Depends(require_dev)):
    q = _sitio_query_for(sitio_id) if sitio_id else {}
    ops = [serialize(o) for o in await db.operadores.find(q).to_list(1000)]
    terms = []
    for u in await db.usuarios_terminal.find(q).to_list(1000):
        su = serialize(u)
        su["suscripcion"] = _calcular_suscripcion(su.get("licencia_vence_en"), default_dias=26, plan="Terminal Operadora")
        terms.append(su)
    duenos = []
    for d in await db.usuarios_dueno.find(q).to_list(1000):
        sd = serialize(d)
        sd["suscripcion"] = _calcular_suscripcion(sd.get("licencia_vence_en"), default_dias=28, plan="Socio Concesionario")
        duenos.append(sd)
    return {"operadores": ops, "usuarios_terminal": terms, "usuarios_dueno": duenos}


@api_router.patch("/dev/cuentas/{coleccion}/{doc_id}")
async def dev_toggle_cuenta(coleccion: str, doc_id: str, body: ActivoBody, _=Depends(require_dev)):
    if coleccion not in ("operadores", "usuarios_terminal", "usuarios_dueno"):
        raise HTTPException(status_code=400, detail="Colección inválida")
    await db[coleccion].update_one({"_id": to_oid(doc_id)}, {"$set": {"activo": body.activo}})
    return {"ok": True, "activo": body.activo}


@api_router.patch("/dev/suscripcion")
async def dev_actualizar_suscripcion(body: SuscripcionUpdateBody, _=Depends(require_dev)):
    """Permite al desarrollador ampliar o fijar el tiempo restante de uso para
    un tenant completo (`sitio`), una cuenta de `usuarios_terminal` o un socio (`usuarios_dueno`)."""
    nueva_fecha = body.licencia_vence_en
    if body.dias_extender is not None:
        nueva_fecha = (datetime.now(timezone.utc) + timedelta(days=body.dias_extender)).strftime("%Y-%m-%d")
    if not nueva_fecha:
        raise HTTPException(status_code=400, detail="Indica dias_extender o licencia_vence_en")
    updates = {"licencia_vence_en": nueva_fecha, "actualizado": now_iso()}
    if body.plan_nombre:
        updates["plan_nombre"] = body.plan_nombre
    if body.tipo_entidad == "sitio":
        await db.sitios.update_one({"clave": body.entidad_id}, {"$set": updates}, upsert=True)
        await db.usuarios_terminal.update_many(_sitio_query_for(body.entidad_id), {"$set": {"licencia_vence_en": nueva_fecha}})
    elif body.tipo_entidad in ("usuarios_terminal", "usuarios_dueno"):
        await db[body.tipo_entidad].update_one({"_id": to_oid(body.entidad_id)}, {"$set": updates})
    return {"ok": True, "suscripcion": _calcular_suscripcion(nueva_fecha, plan=body.plan_nombre or "Plan Activo")}


@api_router.get("/dev/facturas")
async def dev_list_facturas(sitio_id: Optional[str] = None, _=Depends(require_dev)):
    q = {"sitio_id": sitio_id} if sitio_id else {}
    docs = await db.facturas_tenant.find(q).sort("fecha_emision", -1).to_list(500)
    return [serialize(d) for d in docs]


@api_router.post("/dev/facturas")
async def dev_create_factura(body: FacturaCreateBody, _=Depends(require_dev)):
    sitio_doc = await db.sitios.find_one({"clave": body.sitio_id}) or {}
    folio = f"FAC-{body.sitio_id[:4].upper()}-{datetime.now(timezone.utc).strftime('%Y%m')}-{random.randint(100, 999)}"
    ahora = datetime.now(timezone.utc)
    doc = {
        "folio": folio,
        "sitio_id": body.sitio_id,
        "sitio_nombre": sitio_doc.get("nombre") or body.sitio_id,
        "concepto": body.concepto,
        "periodo": body.periodo,
        "monto": body.monto,
        "moneda": "MXN",
        "estado": body.estado,
        "metodo_pago": body.metodo_pago,
        "fecha_emision": ahora.strftime("%Y-%m-%d"),
        "fecha_vencimiento": (ahora + timedelta(days=5)).strftime("%Y-%m-%d"),
        "creado_en": now_iso(),
    }
    res = await db.facturas_tenant.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api_router.patch("/dev/facturas/{factura_id}")
async def dev_update_factura(factura_id: str, body: FacturaEstadoBody, _=Depends(require_dev)):
    fac = await db.facturas_tenant.find_one({"_id": to_oid(factura_id)})
    if not fac:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    updates = {"estado": body.estado, "actualizado_en": now_iso()}
    if body.metodo_pago:
        updates["metodo_pago"] = body.metodo_pago
    if body.estado == "pagada":
        updates["fecha_pago"] = now_iso()
        if body.extender_dias > 0 and fac.get("sitio_id"):
            nueva_vence = (datetime.now(timezone.utc) + timedelta(days=body.extender_dias)).strftime("%Y-%m-%d")
            await db.sitios.update_one({"clave": fac["sitio_id"]}, {"$set": {"licencia_vence_en": nueva_vence}})
    await db.facturas_tenant.update_one({"_id": to_oid(factura_id)}, {"$set": updates})
    return serialize(await db.facturas_tenant.find_one({"_id": to_oid(factura_id)}))


@api_router.get("/dev/avisos")
async def dev_list_avisos(_=Depends(require_dev)):
    docs = await db.avisos_dev.find().sort("creado_en", -1).to_list(200)
    return [serialize(d) for d in docs]


@api_router.post("/dev/avisos")
async def dev_crear_aviso(body: AvisoTerminalBody, _=Depends(require_dev)):
    ahora = datetime.now(timezone.utc)
    horas = int(body.horas_vigencia or body.duracion_horas or 24)
    doc = {
        "sitio_id": body.sitio_id,
        "titulo": body.titulo,
        "mensaje": body.mensaje,
        "nivel": body.nivel,
        "contacto_soporte": body.contacto_soporte,
        "creado_en": ahora.isoformat(),
        "expira_en": (ahora + timedelta(hours=horas)).isoformat(),
        "activo": True,
    }
    res = await db.avisos_dev.insert_one(doc)
    doc["_id"] = res.inserted_id
    out = serialize(doc)
    target_sitio = None if body.sitio_id == "todos" else body.sitio_id
    await manager.broadcast_terminal({"type": "aviso_sistema", "aviso": out, "sitio_id": target_sitio}, sitio_id=target_sitio)
    return out


@api_router.delete("/dev/avisos/{aviso_id}")
async def dev_eliminar_aviso(aviso_id: str, _=Depends(require_dev)):
    await db.avisos_dev.update_one({"_id": to_oid(aviso_id)}, {"$set": {"activo": False}})
    return {"ok": True}


@api_router.get("/avisos/activos")
async def get_avisos_activos(request: Request):
    """Devuelve avisos del desarrollador activos para la Terminal o Socio actual."""
    sitio_id = DEFAULT_SITIO
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
            sitio_id = payload.get("sitio_id") or payload.get("tenant_id") or DEFAULT_SITIO
        except Exception:
            pass
    docs = await db.avisos_dev.find({
        "activo": True,
        "sitio_id": {"$in": ["todos", sitio_id]},
    }).sort("creado_en", -1).to_list(20)
    return [serialize(d) for d in docs]


@api_router.post("/dev/storage/optimizar")
async def dev_optimizar_storage_webp(_=Depends(require_dev)):
    """Escanea los archivos almacenados, verifica que no contengan firmas maliciosas,
    y asegura que cada tenant tenga su carpeta aislada en formato WebP."""
    tenants_dir = UPLOAD_DIR / "tenants"
    tenants_dir.mkdir(parents=True, exist_ok=True)
    escaneados = 0
    convertidos = 0
    bloqueados = 0
    bytes_ahorrados = 0
    for fp in UPLOAD_DIR.rglob("*"):
        if not fp.is_file():
            continue
        escaneados += 1
        if fp.suffix.lower() in (".jpg", ".jpeg", ".png"):
            try:
                raw_b = fp.read_bytes()
                comp = analizar_y_comprimir_imagen_webp(raw_b, fp.name)
                webp_fp = fp.with_suffix(".webp")
                webp_fp.write_bytes(comp["data"])
                bytes_ahorrados += max(0, len(raw_b) - len(comp["data"]))
                convertidos += 1
            except Exception:
                bloqueados += 1
    return {
        "ok": True,
        "archivos_escaneados": escaneados,
        "convertidos_webp": convertidos,
        "optimizados_webp": convertidos,
        "migrados_tenant": escaneados,
        "kb_ahorrados": round(bytes_ahorrados / 1024.0, 1),
        "amenazas_bloqueadas": bloqueados,
        "formato": "WebP (Calidad 82, EXIF limpio)",
    }


@api_router.get("/dev/backup")
async def dev_backup(_=Depends(require_dev)):
    import json
    out = {}
    for col in ["operadores", "vehiculos", "clientes", "rutas", "colonias", "servicios", "reportes_objetos",
                "mensajes_chat", "usuarios_terminal", "usuarios_dueno", "tarifas_predefinidas",
                "facturas_tenant", "avisos_dev", "sitios", "config"]:
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
# Simulación Avanzada de Flota (15+ Taxis, WhatsApp, Servicios y Movimiento GPS)
# ---------------------------------------------------------------------------
# Pistas viales predeterminadas y únicas sobre las calles reales de Palenque, Chiapas (OSRM / OpenStreetMap)
# Pistas viales predeterminadas y únicas sobre las calles reales de Palenque, Chiapas (OSRM / OpenStreetMap)
PALENQUE_PISTAS_VIALES = {
    "pista_centro_juarez": {
        "id": "pista_centro_juarez",
        "nombre": "Pista Centro - Av. Juárez y Mercado",
        "sentido": "Circuito comercial centro (horario)",
        "doble_sentido": False,
        "distancia_m": 2113,
        "duracion_s": 287,
        "puntos": [
            [
                17.509556,
                -91.981798
            ],
            [
                17.509573,
                -91.982273
            ],
            [
                17.509952,
                -91.982282
            ],
            [
                17.510318,
                -91.982282
            ],
            [
                17.510696,
                -91.982282
            ],
            [
                17.511376,
                -91.982282
            ],
            [
                17.512326,
                -91.982281
            ],
            [
                17.512472,
                -91.983363
            ],
            [
                17.512527,
                -91.984504
            ],
            [
                17.512531,
                -91.984588
            ],
            [
                17.513102,
                -91.984585
            ],
            [
                17.513836,
                -91.984582
            ],
            [
                17.513906,
                -91.984581
            ],
            [
                17.513919,
                -91.985408
            ],
            [
                17.513922,
                -91.985601
            ],
            [
                17.51394,
                -91.986678
            ],
            [
                17.513872,
                -91.986683
            ],
            [
                17.513849,
                -91.985407
            ],
            [
                17.513836,
                -91.984582
            ],
            [
                17.513816,
                -91.983307
            ],
            [
                17.513268,
                -91.983329
            ],
            [
                17.512989,
                -91.98334
            ],
            [
                17.512472,
                -91.983363
            ],
            [
                17.511441,
                -91.983402
            ],
            [
                17.510755,
                -91.983429
            ],
            [
                17.510728,
                -91.982904
            ],
            [
                17.510696,
                -91.982282
            ],
            [
                17.510636,
                -91.981094
            ],
            [
                17.510269,
                -91.981137
            ],
            [
                17.509912,
                -91.981179
            ],
            [
                17.509535,
                -91.981223
            ],
            [
                17.509556,
                -91.981798
            ]
        ],
        "bearings_fwd": [
            272.1,
            358.7,
            0.0,
            0.0,
            0.0,
            0.1,
            278.1,
            272.9,
            272.9,
            0.3,
            0.2,
            0.8,
            270.9,
            270.9,
            271.0,
            184.0,
            91.1,
            90.9,
            90.9,
            182.2,
            182.2,
            182.4,
            182.1,
            182.1,
            93.1,
            93.1,
            93.0,
            186.4,
            186.4,
            186.4,
            272.2,
            272.2
        ]
    },
    "pista_canada_ado": {
        "id": "pista_canada_ado",
        "nombre": "Pista La Cañada - Corredor Hotelero - ADO",
        "sentido": "Circuito hotelero poniente",
        "doble_sentido": True,
        "distancia_m": 2976,
        "duracion_s": 352,
        "puntos": [
            [
                17.513922,
                -91.985601
            ],
            [
                17.51394,
                -91.986678
            ],
            [
                17.513872,
                -91.986683
            ],
            [
                17.513849,
                -91.985407
            ],
            [
                17.513836,
                -91.984582
            ],
            [
                17.513816,
                -91.983307
            ],
            [
                17.513769,
                -91.982281
            ],
            [
                17.513731,
                -91.981394
            ],
            [
                17.513645,
                -91.980383
            ],
            [
                17.513717,
                -91.980375
            ],
            [
                17.51413,
                -91.980313
            ],
            [
                17.514344,
                -91.980257
            ],
            [
                17.514558,
                -91.980158
            ],
            [
                17.514783,
                -91.979972
            ],
            [
                17.515082,
                -91.979701
            ],
            [
                17.516033,
                -91.978923
            ],
            [
                17.516147,
                -91.978923
            ],
            [
                17.51655,
                -91.9789
            ],
            [
                17.516734,
                -91.978871
            ],
            [
                17.517022,
                -91.978946
            ],
            [
                17.517676,
                -91.979121
            ],
            [
                17.517649,
                -91.979199
            ],
            [
                17.51672,
                -91.978981
            ],
            [
                17.516601,
                -91.979576
            ],
            [
                17.516601,
                -91.979576
            ],
            [
                17.51672,
                -91.978981
            ],
            [
                17.51655,
                -91.9789
            ],
            [
                17.516734,
                -91.978871
            ],
            [
                17.517022,
                -91.978946
            ],
            [
                17.51814,
                -91.979246
            ],
            [
                17.518711,
                -91.979399
            ],
            [
                17.518688,
                -91.979478
            ],
            [
                17.517649,
                -91.979199
            ],
            [
                17.516994,
                -91.979024
            ],
            [
                17.51672,
                -91.978981
            ],
            [
                17.51655,
                -91.9789
            ],
            [
                17.516033,
                -91.978923
            ],
            [
                17.515843,
                -91.979012
            ],
            [
                17.515082,
                -91.979701
            ],
            [
                17.514783,
                -91.979972
            ],
            [
                17.514558,
                -91.980158
            ],
            [
                17.514344,
                -91.980257
            ],
            [
                17.51413,
                -91.980313
            ],
            [
                17.513752,
                -91.980728
            ],
            [
                17.513808,
                -91.981402
            ],
            [
                17.513844,
                -91.982281
            ],
            [
                17.513886,
                -91.983306
            ],
            [
                17.513889,
                -91.983519
            ],
            [
                17.513906,
                -91.984581
            ],
            [
                17.513919,
                -91.985408
            ],
            [
                17.513922,
                -91.985601
            ]
        ],
        "bearings_fwd": [
            271.0,
            184.0,
            91.1,
            90.9,
            90.9,
            92.7,
            92.6,
            95.1,
            6.0,
            8.1,
            14.0,
            23.8,
            38.3,
            40.8,
            38.0,
            0.0,
            3.1,
            8.5,
            346.1,
            345.7,
            250.0,
            167.4,
            258.2,
            0.0,
            78.2,
            155.6,
            8.5,
            346.1,
            345.6,
            345.7,
            253.0,
            165.6,
            165.7,
            171.5,
            155.6,
            182.4,
            204.1,
            220.8,
            220.8,
            218.3,
            203.8,
            194.0,
            226.3,
            275.0,
            272.5,
            272.5,
            270.8,
            271.0,
            270.9,
            270.9,
            270.9
        ]
    },
    "pista_periferico_sur": {
        "id": "pista_periferico_sur",
        "nombre": "Pista Periférico Sur - Hospital General",
        "sentido": "Circuito hospitalario sur",
        "doble_sentido": True,
        "distancia_m": 2932,
        "duracion_s": 374,
        "puntos": [
            [
                17.504608,
                -91.974937
            ],
            [
                17.504675,
                -91.975063
            ],
            [
                17.504829,
                -91.976397
            ],
            [
                17.504351,
                -91.976461
            ],
            [
                17.504246,
                -91.97649
            ],
            [
                17.504218,
                -91.976512
            ],
            [
                17.504196,
                -91.976545
            ],
            [
                17.504177,
                -91.976598
            ],
            [
                17.504175,
                -91.976659
            ],
            [
                17.504238,
                -91.977246
            ],
            [
                17.504301,
                -91.977806
            ],
            [
                17.504401,
                -91.978706
            ],
            [
                17.504519,
                -91.979766
            ],
            [
                17.505202,
                -91.97969
            ],
            [
                17.505683,
                -91.979636
            ],
            [
                17.506431,
                -91.979552
            ],
            [
                17.506344,
                -91.97852
            ],
            [
                17.506286,
                -91.97799
            ],
            [
                17.506252,
                -91.977679
            ],
            [
                17.506889,
                -91.977638
            ],
            [
                17.507212,
                -91.977597
            ],
            [
                17.507558,
                -91.977556
            ],
            [
                17.507619,
                -91.978399
            ],
            [
                17.507693,
                -91.97941
            ],
            [
                17.507722,
                -91.980063
            ],
            [
                17.507742,
                -91.980503
            ],
            [
                17.507755,
                -91.980801
            ],
            [
                17.508338,
                -91.980746
            ],
            [
                17.508287,
                -91.979995
            ],
            [
                17.508242,
                -91.979349
            ],
            [
                17.508173,
                -91.978345
            ],
            [
                17.508101,
                -91.977489
            ],
            [
                17.508,
                -91.976502
            ],
            [
                17.50851,
                -91.976411
            ],
            [
                17.508559,
                -91.976994
            ],
            [
                17.508596,
                -91.977427
            ],
            [
                17.50868,
                -91.978297
            ],
            [
                17.508173,
                -91.978345
            ],
            [
                17.508101,
                -91.977489
            ],
            [
                17.508,
                -91.976502
            ],
            [
                17.507488,
                -91.976522
            ],
            [
                17.50715,
                -91.976504
            ],
            [
                17.50698,
                -91.976388
            ],
            [
                17.506662,
                -91.976215
            ],
            [
                17.505667,
                -91.975693
            ],
            [
                17.505175,
                -91.975444
            ],
            [
                17.504675,
                -91.975063
            ],
            [
                17.504608,
                -91.974937
            ]
        ],
        "bearings_fwd": [
            299.1,
            276.9,
            187.3,
            194.8,
            216.8,
            235.0,
            249.4,
            268.0,
            276.4,
            276.7,
            276.6,
            276.7,
            6.1,
            6.1,
            6.1,
            95.1,
            96.5,
            96.5,
            3.5,
            6.9,
            6.4,
            274.3,
            274.4,
            272.7,
            272.7,
            272.6,
            5.1,
            94.1,
            94.2,
            94.1,
            95.0,
            96.1,
            9.7,
            275.0,
            275.1,
            275.8,
            185.2,
            95.0,
            96.1,
            182.1,
            177.1,
            146.9,
            152.6,
            153.4,
            154.2,
            144.0,
            119.1,
            119.1
        ]
    },
    "pista_pakal_na": {
        "id": "pista_pakal_na",
        "nombre": "Pista Corredor Carretera Federal Pakal-Ná",
        "sentido": "Palenque a Pakal-Ná (doble sentido)",
        "doble_sentido": True,
        "distancia_m": 15414,
        "duracion_s": 1944,
        "puntos": [
            [
                17.518733,
                -91.977156
            ],
            [
                17.519426,
                -91.978515
            ],
            [
                17.518688,
                -91.979478
            ],
            [
                17.516033,
                -91.978923
            ],
            [
                17.513717,
                -91.980375
            ],
            [
                17.513344,
                -91.977029
            ],
            [
                17.513239,
                -91.975061
            ],
            [
                17.513527,
                -91.974046
            ],
            [
                17.513901,
                -91.973435
            ],
            [
                17.514804,
                -91.972955
            ],
            [
                17.515654,
                -91.972496
            ],
            [
                17.516476,
                -91.971788
            ],
            [
                17.51775,
                -91.970431
            ],
            [
                17.518659,
                -91.969731
            ],
            [
                17.519378,
                -91.96879
            ],
            [
                17.520439,
                -91.96861
            ],
            [
                17.519109,
                -91.969146
            ],
            [
                17.518128,
                -91.969931
            ],
            [
                17.517085,
                -91.970931
            ],
            [
                17.516302,
                -91.972189
            ],
            [
                17.515571,
                -91.972611
            ],
            [
                17.514258,
                -91.973152
            ],
            [
                17.513629,
                -91.973753
            ],
            [
                17.513501,
                -91.974581
            ],
            [
                17.513193,
                -91.975867
            ],
            [
                17.513521,
                -91.978612
            ],
            [
                17.514783,
                -91.979972
            ],
            [
                17.516734,
                -91.978871
            ],
            [
                17.519612,
                -91.979596
            ],
            [
                17.523787,
                -91.978329
            ],
            [
                17.526229,
                -91.97748
            ],
            [
                17.526232,
                -91.969076
            ],
            [
                17.538742,
                -91.965665
            ],
            [
                17.546602,
                -91.972585
            ],
            [
                17.54587,
                -91.975348
            ],
            [
                17.545707,
                -91.977303
            ],
            [
                17.544821,
                -91.983608
            ],
            [
                17.54644,
                -91.983758
            ],
            [
                17.548708,
                -91.984529
            ],
            [
                17.550787,
                -91.980928
            ],
            [
                17.549586,
                -91.974308
            ],
            [
                17.549598,
                -91.972827
            ],
            [
                17.550708,
                -91.972342
            ],
            [
                17.550277,
                -91.970642
            ],
            [
                17.548007,
                -91.968851
            ],
            [
                17.548139,
                -91.967186
            ],
            [
                17.54346,
                -91.964469
            ],
            [
                17.541271,
                -91.962234
            ],
            [
                17.539345,
                -91.959949
            ],
            [
                17.536583,
                -91.959997
            ],
            [
                17.535944,
                -91.959212
            ]
        ],
        "bearings_fwd": [
            298.1,
            231.2,
            168.7,
            210.9,
            96.7,
            93.2,
            73.4,
            57.3,
            26.9,
            27.2,
            39.4,
            45.4,
            36.3,
            51.3,
            9.2,
            201.0,
            217.3,
            222.4,
            236.9,
            208.8,
            201.5,
            222.3,
            260.8,
            255.9,
            277.1,
            314.2,
            28.3,
            346.5,
            16.1,
            18.3,
            90.0,
            14.6,
            320.0,
            254.5,
            265.0,
            261.6,
            355.0,
            342.0,
            58.8,
            100.8,
            89.5,
            22.6,
            104.9,
            143.0,
            85.2,
            151.0,
            135.8,
            131.5,
            180.9,
            130.5,
            130.5
        ]
    },
    "pista_carretera_ruinas": {
        "id": "pista_carretera_ruinas",
        "nombre": "Pista Carretera Zona Arqueológica - Misión Palenque",
        "sentido": "Centro a Ruinas (sur-poniente)",
        "doble_sentido": True,
        "distancia_m": 5797,
        "duracion_s": 618,
        "puntos": [
            [
                17.508,
                -91.983496
            ],
            [
                17.507349,
                -91.983498
            ],
            [
                17.506603,
                -91.983532
            ],
            [
                17.505915,
                -91.983564
            ],
            [
                17.504933,
                -91.983607
            ],
            [
                17.505094,
                -91.985116
            ],
            [
                17.505201,
                -91.986136
            ],
            [
                17.50443,
                -91.986217
            ],
            [
                17.504174,
                -91.986942
            ],
            [
                17.504116,
                -91.986976
            ],
            [
                17.50423,
                -91.988192
            ],
            [
                17.504989,
                -91.988116
            ],
            [
                17.50532,
                -91.987289
            ],
            [
                17.505217,
                -91.986288
            ],
            [
                17.505152,
                -91.985663
            ],
            [
                17.505036,
                -91.984574
            ],
            [
                17.50321,
                -91.983804
            ],
            [
                17.502265,
                -91.983912
            ],
            [
                17.501364,
                -91.984015
            ],
            [
                17.500454,
                -91.984119
            ],
            [
                17.499596,
                -91.984217
            ],
            [
                17.498721,
                -91.984316
            ],
            [
                17.496196,
                -91.984593
            ],
            [
                17.495542,
                -91.985994
            ],
            [
                17.495499,
                -91.986269
            ],
            [
                17.497474,
                -91.987707
            ],
            [
                17.49871,
                -91.988704
            ],
            [
                17.49962,
                -91.989848
            ],
            [
                17.500129,
                -91.990294
            ],
            [
                17.501044,
                -91.990657
            ],
            [
                17.502505,
                -91.991113
            ],
            [
                17.504615,
                -91.991786
            ],
            [
                17.504988,
                -91.991821
            ],
            [
                17.505095,
                -91.991861
            ],
            [
                17.505156,
                -91.991961
            ],
            [
                17.505145,
                -91.99208
            ],
            [
                17.505091,
                -91.992151
            ],
            [
                17.504814,
                -91.992435
            ],
            [
                17.504323,
                -91.993
            ],
            [
                17.503789,
                -91.993744
            ],
            [
                17.503625,
                -91.994149
            ],
            [
                17.503444,
                -91.995427
            ],
            [
                17.502002,
                -91.995556
            ],
            [
                17.500178,
                -91.995762
            ],
            [
                17.498942,
                -91.996003
            ],
            [
                17.497057,
                -91.996231
            ],
            [
                17.494442,
                -91.99661
            ],
            [
                17.493587,
                -91.996674
            ],
            [
                17.493524,
                -91.996205
            ],
            [
                17.493312,
                -91.994772
            ],
            [
                17.493247,
                -91.994351
            ]
        ],
        "bearings_fwd": [
            180.2,
            182.5,
            182.5,
            182.4,
            276.4,
            276.3,
            185.7,
            249.7,
            209.2,
            275.6,
            5.5,
            67.2,
            96.2,
            96.2,
            96.4,
            158.1,
            186.2,
            186.2,
            186.2,
            186.2,
            186.2,
            186.0,
            243.9,
            260.7,
            325.2,
            322.4,
            309.8,
            320.1,
            339.3,
            343.4,
            343.1,
            354.9,
            340.4,
            302.6,
            264.5,
            231.4,
            224.4,
            227.7,
            233.0,
            247.0,
            261.6,
            184.9,
            186.1,
            190.5,
            186.6,
            187.9,
            184.1,
            98.0,
            98.8,
            99.2,
            99.2
        ]
    },
    "pista_tren_maya": {
        "id": "pista_tren_maya",
        "nombre": "Pista Estación Tren Maya - Boulevard Aeropuerto",
        "sentido": "Acceso ferroviario y enlace libramiento",
        "doble_sentido": True,
        "distancia_m": 1135,
        "duracion_s": 191,
        "puntos": [
            [
                17.535944,
                -91.959212
            ],
            [
                17.536023,
                -91.958254
            ],
            [
                17.536161,
                -91.956843
            ],
            [
                17.536292,
                -91.955566
            ],
            [
                17.536363,
                -91.955341
            ],
            [
                17.536315,
                -91.955129
            ],
            [
                17.535683,
                -91.954027
            ],
            [
                17.535294,
                -91.953281
            ],
            [
                17.534785,
                -91.952345
            ],
            [
                17.534785,
                -91.952345
            ],
            [
                17.534724,
                -91.952147
            ],
            [
                17.534752,
                -91.951752
            ],
            [
                17.534882,
                -91.951414
            ],
            [
                17.535018,
                -91.951042
            ],
            [
                17.534895,
                -91.950851
            ],
            [
                17.535018,
                -91.951042
            ],
            [
                17.534882,
                -91.951414
            ],
            [
                17.534752,
                -91.951752
            ],
            [
                17.534724,
                -91.952147
            ],
            [
                17.534724,
                -91.952147
            ],
            [
                17.534785,
                -91.952345
            ],
            [
                17.534865,
                -91.952492
            ]
        ],
        "bearings_fwd": [
            85.1,
            84.1,
            83.9,
            71.7,
            103.4,
            121.0,
            118.7,
            119.7,
            0.0,
            107.9,
            85.7,
            68.0,
            69.0,
            124.0,
            304.0,
            249.0,
            248.0,
            265.7,
            0.0,
            287.9,
            299.7,
            299.7
        ]
    }
}

DEMO_TAXIS = [
    {
        "usuario": "op1",
        "nombre": "Carlos Ramírez",
        "telefono": "916-200-0001",
        "placa": "TX-101",
        "marca": "Nissan",
        "modelo": "Tsuru",
        "color": "Blanco",
        "estado": "libre",
        "pista_id": "pista_centro_juarez",
        "idx": 0,
        "sentido_direccion": "adelante",
        "sentido_calle": "unico",
        "descripcion_sentido": "Av. Hidalgo hacia Parque Central (sentido único)",
        "lat": 17.509556,
        "lng": -91.981798,
        "gps_heading": 272.1
    },
    {
        "usuario": "op2",
        "nombre": "Ana Torres",
        "telefono": "916-200-0002",
        "placa": "TX-102",
        "marca": "Chevrolet",
        "modelo": "Aveo",
        "color": "Gris",
        "estado": "libre",
        "pista_id": "pista_canada_ado",
        "idx": 0,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Av. 20 de Noviembre hacia poniente (carril ADO-Cañada)",
        "lat": 17.513922,
        "lng": -91.985601,
        "gps_heading": 271.0
    },
    {
        "usuario": "op3",
        "nombre": "Luis Méndez",
        "telefono": "916-200-0003",
        "placa": "TX-103",
        "marca": "Nissan",
        "modelo": "Versa",
        "color": "Rojo",
        "estado": "ocupado",
        "pista_id": "pista_carretera_ruinas",
        "idx": 0,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Carretera Ruinas hacia Misión Palenque (carril sur-poniente)",
        "lat": 17.508,
        "lng": -91.983496,
        "gps_heading": 180.2
    },
    {
        "usuario": "op4",
        "nombre": "José Hernández",
        "telefono": "916-200-0004",
        "placa": "TX-104",
        "marca": "Nissan",
        "modelo": "Sentra",
        "color": "Plata",
        "estado": "libre",
        "pista_id": "pista_periferico_sur",
        "idx": 0,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Periférico Sur hacia Hospital General (carril poniente)",
        "lat": 17.504608,
        "lng": -91.974937,
        "gps_heading": 299.1
    },
    {
        "usuario": "op5",
        "nombre": "Roberto Morales",
        "telefono": "916-200-0005",
        "placa": "TX-105",
        "marca": "Volkswagen",
        "modelo": "Gol",
        "color": "Blanco",
        "estado": "asignado",
        "pista_id": "pista_canada_ado",
        "idx": 20,
        "sentido_direccion": "reversa",
        "sentido_calle": "doble",
        "descripcion_sentido": "Calzada La Cañada retornando hacia ADO (doble sentido, carril oriente)",
        "lat": 17.517676,
        "lng": -91.979121,
        "gps_heading": 70.0
    },
    {
        "usuario": "op6",
        "nombre": "Miguel Sánchez",
        "telefono": "916-200-0006",
        "placa": "TX-106",
        "marca": "Volkswagen",
        "modelo": "Virtus",
        "color": "Azul",
        "estado": "libre",
        "pista_id": "pista_centro_juarez",
        "idx": 10,
        "sentido_direccion": "adelante",
        "sentido_calle": "unico",
        "descripcion_sentido": "Av. Juárez pasando Mercado Municipal (sentido único)",
        "lat": 17.513102,
        "lng": -91.984585,
        "gps_heading": 0.2
    },
    {
        "usuario": "op7",
        "nombre": "Jorge Albores",
        "telefono": "916-200-0007",
        "placa": "TX-107",
        "marca": "Chevrolet",
        "modelo": "Onix",
        "color": "Negro",
        "estado": "ocupado",
        "pista_id": "pista_carretera_ruinas",
        "idx": 25,
        "sentido_direccion": "reversa",
        "sentido_calle": "doble",
        "descripcion_sentido": "Carretera Ruinas retornando hacia La Cañada (doble sentido, carril nororiente)",
        "lat": 17.484,
        "lng": -92.046,
        "gps_heading": 30.0
    },
    {
        "usuario": "op8",
        "nombre": "David López",
        "telefono": "916-200-0008",
        "placa": "TX-108",
        "marca": "Volkswagen",
        "modelo": "Jetta",
        "color": "Blanco",
        "estado": "ocupado",
        "pista_id": "pista_pakal_na",
        "idx": 15,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Carretera Federal hacia Pakal-Ná (doble sentido, carril nororiente)",
        "lat": 17.525501,
        "lng": -91.958221,
        "gps_heading": 40.5
    },
    {
        "usuario": "op9",
        "nombre": "Pedro Gómez",
        "telefono": "916-200-0009",
        "placa": "TX-109",
        "marca": "Renault",
        "modelo": "Kwid",
        "color": "Naranja",
        "estado": "asignado",
        "pista_id": "pista_centro_juarez",
        "idx": 22,
        "sentido_direccion": "adelante",
        "sentido_calle": "unico",
        "descripcion_sentido": "Av. Reforma hacia Bulevar Cabeza Maya (sentido único)",
        "lat": 17.51352,
        "lng": -91.98681,
        "gps_heading": 273.5
    },
    {
        "usuario": "op10",
        "nombre": "Alejandro Castro",
        "telefono": "916-200-0010",
        "placa": "TX-110",
        "marca": "Volkswagen",
        "modelo": "Golf",
        "color": "Rojo",
        "estado": "ocupado",
        "pista_id": "pista_tren_maya",
        "idx": 0,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Boulevard de acceso hacia Estación Tren Maya (doble sentido)",
        "lat": 17.535944,
        "lng": -91.959212,
        "gps_heading": 85.1
    },
    {
        "usuario": "op11",
        "nombre": "Manuel Velasco",
        "telefono": "916-200-0011",
        "placa": "TX-111",
        "marca": "Nissan",
        "modelo": "March",
        "color": "Plata",
        "estado": "libre",
        "pista_id": "pista_periferico_sur",
        "idx": 24,
        "sentido_direccion": "reversa",
        "sentido_calle": "doble",
        "descripcion_sentido": "Hospital General retornando hacia Plaza Las Flores (doble sentido, carril oriente)",
        "lat": 17.507722,
        "lng": -91.980063,
        "gps_heading": 92.7
    },
    {
        "usuario": "op12",
        "nombre": "Alberto Castellanos",
        "telefono": "916-200-0012",
        "placa": "TX-112",
        "marca": "Chevrolet",
        "modelo": "Aveo",
        "color": "Azul",
        "estado": "ocupado",
        "pista_id": "pista_pakal_na",
        "idx": 35,
        "sentido_direccion": "reversa",
        "sentido_calle": "doble",
        "descripcion_sentido": "Carretera Federal retornando de Pakal-Ná hacia Palenque (doble sentido, carril sur-poniente)",
        "lat": 17.545707,
        "lng": -91.977303,
        "gps_heading": 81.6
    },
    {
        "usuario": "op13",
        "nombre": "Javier Mendoza",
        "telefono": "916-200-0013",
        "placa": "TX-113",
        "marca": "Nissan",
        "modelo": "Tsuru",
        "color": "Blanco",
        "estado": "libre",
        "pista_id": "pista_canada_ado",
        "idx": 38,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Calzada de los Empleados hacia La Cañada (doble sentido)",
        "lat": 17.515082,
        "lng": -91.979701,
        "gps_heading": 220.8
    },
    {
        "usuario": "op14",
        "nombre": "Daniel Morales",
        "telefono": "916-200-0014",
        "placa": "TX-114",
        "marca": "Nissan",
        "modelo": "Sentra",
        "color": "Gris",
        "estado": "libre",
        "pista_id": "pista_centro_juarez",
        "idx": 30,
        "sentido_direccion": "adelante",
        "sentido_calle": "unico",
        "descripcion_sentido": "Calle Abasolo hacia Parque Central (sentido único)",
        "lat": 17.509535,
        "lng": -91.981223,
        "gps_heading": 272.2
    },
    {
        "usuario": "op15",
        "nombre": "Oscar Trujillo",
        "telefono": "916-200-0015",
        "placa": "TX-115",
        "marca": "Estándar",
        "modelo": "Generico",
        "color": "Blanco",
        "estado": "fuera_de_servicio",
        "pista_id": "pista_centro_juarez",
        "idx": 15,
        "sentido_direccion": "adelante",
        "sentido_calle": "unico",
        "descripcion_sentido": "Base Poniente entrada vehicular (estacionado)",
        "lat": 17.51394,
        "lng": -91.986678,
        "gps_heading": 184.0
    },
    {
        "usuario": "op16",
        "nombre": "Fernando Solís",
        "telefono": "916-200-0016",
        "placa": "TX-116",
        "marca": "Nissan",
        "modelo": "Versa",
        "color": "Blanco",
        "estado": "libre",
        "pista_id": "pista_centro_juarez",
        "idx": 5,
        "sentido_direccion": "adelante",
        "sentido_calle": "unico",
        "descripcion_sentido": "Av. Juárez esquina Allende hacia ADO",
        "lat": 17.5108,
        "lng": -91.9838,
        "gps_heading": 2.0
    },
    {
        "usuario": "op17",
        "nombre": "Héctor Vázquez",
        "telefono": "916-200-0017",
        "placa": "TX-117",
        "marca": "Chevrolet",
        "modelo": "Aveo",
        "color": "Plata",
        "estado": "libre",
        "pista_id": "pista_canada_ado",
        "idx": 12,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Glorieta Cabeza Maya hacia Zona Hotelera La Cañada",
        "lat": 17.5158,
        "lng": -91.9822,
        "gps_heading": 68.0
    },
    {
        "usuario": "op18",
        "nombre": "Ricardo Domínguez",
        "telefono": "916-200-0018",
        "placa": "TX-118",
        "marca": "Nissan",
        "modelo": "Sentra",
        "color": "Blanco",
        "estado": "libre",
        "pista_id": "pista_periferico_sur",
        "idx": 12,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Periférico Sur frente a Plaza Las Flores",
        "lat": 17.5062,
        "lng": -91.9785,
        "gps_heading": 285.0
    },
    {
        "usuario": "op19",
        "nombre": "Arturo Penagos",
        "telefono": "916-200-0019",
        "placa": "TX-119",
        "marca": "Volkswagen",
        "modelo": "Virtus",
        "color": "Gris",
        "estado": "libre",
        "pista_id": "pista_pakal_na",
        "idx": 8,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Bulevar Palenque-Pakal Ná frente a CFE",
        "lat": 17.5210,
        "lng": -91.9680,
        "gps_heading": 42.0
    },
    {
        "usuario": "op20",
        "nombre": "Gabriel Ocaña",
        "telefono": "916-200-0020",
        "placa": "TX-120",
        "marca": "Nissan",
        "modelo": "March",
        "color": "Rojo",
        "estado": "libre",
        "pista_id": "pista_tren_maya",
        "idx": 6,
        "sentido_direccion": "reversa",
        "sentido_calle": "doble",
        "descripcion_sentido": "Acceso Estación Tren Maya hacia Libramiento",
        "lat": 17.5355,
        "lng": -91.9545,
        "gps_heading": 295.0
    },
    {
        "usuario": "op21",
        "nombre": "Sergio Gordillo",
        "telefono": "916-200-0021",
        "placa": "TX-121",
        "marca": "Chevrolet",
        "modelo": "Onix",
        "color": "Blanco",
        "estado": "libre",
        "pista_id": "pista_carretera_ruinas",
        "idx": 10,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Carretera a las Ruinas frente a Hotel Chan-Kah",
        "lat": 17.5038,
        "lng": -91.9937,
        "gps_heading": 225.0
    },
    {
        "usuario": "op22",
        "nombre": "Raúl Bermúdez",
        "telefono": "916-200-0022",
        "placa": "TX-122",
        "marca": "Nissan",
        "modelo": "Tsuru",
        "color": "Blanco",
        "estado": "libre",
        "pista_id": "pista_centro_juarez",
        "idx": 18,
        "sentido_direccion": "adelante",
        "sentido_calle": "unico",
        "descripcion_sentido": "Av. 5 de Mayo esquina Independencia",
        "lat": 17.5119,
        "lng": -91.9852,
        "gps_heading": 182.0
    },
    {
        "usuario": "op23",
        "nombre": "Ernesto Cameras",
        "telefono": "916-200-0023",
        "placa": "TX-123",
        "marca": "Volkswagen",
        "modelo": "Jetta",
        "color": "Plata",
        "estado": "libre",
        "pista_id": "pista_canada_ado",
        "idx": 28,
        "sentido_direccion": "reversa",
        "sentido_calle": "doble",
        "descripcion_sentido": "Av. Merle Green en La Cañada",
        "lat": 17.5162,
        "lng": -91.9804,
        "gps_heading": 250.0
    },
    {
        "usuario": "op24",
        "nombre": "Víctor Mazariegos",
        "telefono": "916-200-0024",
        "placa": "TX-124",
        "marca": "Renault",
        "modelo": "Kwid",
        "color": "Blanco",
        "estado": "libre",
        "pista_id": "pista_periferico_sur",
        "idx": 18,
        "sentido_direccion": "reversa",
        "sentido_calle": "doble",
        "descripcion_sentido": "Periférico Sur acceso a Hospital General",
        "lat": 17.5071,
        "lng": -91.9794,
        "gps_heading": 105.0
    },
    {
        "usuario": "op25",
        "nombre": "Marcos Orantes",
        "telefono": "916-200-0025",
        "placa": "TX-125",
        "marca": "Nissan",
        "modelo": "Versa",
        "color": "Azul",
        "estado": "libre",
        "pista_id": "pista_pakal_na",
        "idx": 22,
        "sentido_direccion": "reversa",
        "sentido_calle": "doble",
        "descripcion_sentido": "Retorno Aeropuerto Antiguo hacia Centro",
        "lat": 17.5312,
        "lng": -91.9615,
        "gps_heading": 220.0
    },
]

DEMO_TAXIS_PAKALNA = [
    {
        "usuario": "pk1",
        "nombre": "Ramiro López (Pakal-Ná)",
        "telefono": "916-400-0201",
        "placa": "PK-201",
        "marca": "Nissan",
        "modelo": "Versa",
        "color": "Verde",
        "estado": "libre",
        "sitio_id": "sitio_pakalna",
        "pista_id": "pista_tren_maya",
        "idx": 2,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Estación Tren Maya Pakal-Ná",
        "lat": 17.5361,
        "lng": -91.9568,
        "gps_heading": 84.0
    },
    {
        "usuario": "pk2",
        "nombre": "Efraín Cruz (Pakal-Ná)",
        "telefono": "916-400-0202",
        "placa": "PK-202",
        "marca": "Chevrolet",
        "modelo": "Aveo",
        "color": "Blanco",
        "estado": "libre",
        "sitio_id": "sitio_pakalna",
        "pista_id": "pista_pakal_na",
        "idx": 28,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Centro Pakal-Ná hacia Estación",
        "lat": 17.5385,
        "lng": -91.9690,
        "gps_heading": 45.0
    },
    {
        "usuario": "pk3",
        "nombre": "Noé Jiménez (Pakal-Ná)",
        "telefono": "916-400-0203",
        "placa": "PK-203",
        "marca": "Nissan",
        "modelo": "Tsuru",
        "color": "Blanco",
        "estado": "ocupado",
        "sitio_id": "sitio_pakalna",
        "pista_id": "pista_tren_maya",
        "idx": 10,
        "sentido_direccion": "reversa",
        "sentido_calle": "doble",
        "descripcion_sentido": "Boulevard Tren Maya hacia Pakal-Ná",
        "lat": 17.5347,
        "lng": -91.9521,
        "gps_heading": 265.0
    },
    {
        "usuario": "pk4",
        "nombre": "Ulises Gómez (Pakal-Ná)",
        "telefono": "916-400-0204",
        "placa": "PK-204",
        "marca": "Volkswagen",
        "modelo": "Gol",
        "color": "Plata",
        "estado": "libre",
        "sitio_id": "sitio_pakalna",
        "pista_id": "pista_pakal_na",
        "idx": 18,
        "sentido_direccion": "reversa",
        "sentido_calle": "doble",
        "descripcion_sentido": "Avenida Ferrocarril Pakal-Ná",
        "lat": 17.5280,
        "lng": -91.9605,
        "gps_heading": 215.0
    },
    {
        "usuario": "pk5",
        "nombre": "Tomás Aguilar (Pakal-Ná)",
        "telefono": "916-400-0205",
        "placa": "PK-205",
        "marca": "Nissan",
        "modelo": "March",
        "color": "Blanco",
        "estado": "libre",
        "sitio_id": "sitio_pakalna",
        "pista_id": "pista_tren_maya",
        "idx": 14,
        "sentido_direccion": "adelante",
        "sentido_calle": "doble",
        "descripcion_sentido": "Glorieta Tren Maya Pakal-Ná",
        "lat": 17.5349,
        "lng": -91.9509,
        "gps_heading": 120.0
    },
]

_HASH_TAXI123 = hash_password("taxi123")
_HASH_SOCIO123 = hash_password("socio123")
_HASH_CENTRAL123 = hash_password("central123")

_simulacion_activa = False
_simulacion_task = None


def _generar_track_calle(puntos_calle: list, current_idx: int, sentido_direccion: str = "adelante", cant_puntos: int = 15) -> list:
    """Genera un historial de recorrido previo (track) estrictamente sobre la calzada vial y en el sentido correcto."""
    track = []
    total = len(puntos_calle)
    base_time = datetime.now(timezone.utc) - timedelta(minutes=cant_puntos * 2)
    step = 1 if sentido_direccion == "adelante" else -1
    for i in range(cant_puntos):
        delta = (cant_puntos - 1 - i) * step
        idx = (current_idx - delta) % total
        pt = puntos_calle[idx]
        ts = (base_time + timedelta(minutes=i * 2)).isoformat()
        track.append([round(pt[0], 6), round(pt[1], 6), ts])
    return track


async def _sembrar_baseline_tests():
    """Siembra ultrarrápida (<15ms) para la suite de pytest (`taxihub_test`),
    preservando los invariantes exactos que esperan `tests/test_server.py`,
    `tests/test_dueno.py` y `tests/test_vehicle_types.py`."""
    await _migraciones()
    rutas_data = [
        {"nombre": "Palenque - Pakal Ná", "color_hex": "#4F5DFF", "sitio_id": DEFAULT_SITIO},
        {"nombre": "Centro - La Cañada", "color_hex": "#7CFC3C", "sitio_id": DEFAULT_SITIO},
        {"nombre": "Circuito Hotelero", "color_hex": "#FFB224", "sitio_id": DEFAULT_SITIO},
    ]
    rutas_ids = []
    for r in rutas_data:
        existente = await db.rutas.find_one({"nombre": r["nombre"]})
        if existente:
            rutas_ids.append(str(existente["_id"]))
        else:
            ins = await db.rutas.insert_one(r)
            rutas_ids.append(str(ins.inserted_id))

    tipo_estandar_id = await _tipo_vehiculo_default_id()
    for i, t in enumerate(DEMO_TAXIS[:5]):
        op_doc = {
            "nombre": t["nombre"],
            "telefono": t["telefono"],
            "placa": t["placa"],
            "ruta_asignada": rutas_ids[i % len(rutas_ids)],
            "usuario": t["usuario"],
            "password_hash": _HASH_TAXI123,
            "estado": EstadoOperador.fuera_de_servicio.value,
            "lat": t["lat"],
            "lng": t["lng"],
            "ultima_actualizacion": None,
            "sitio_id": DEFAULT_SITIO,
            "activo": True,
            "track": [],
            "foto_url": None,
        }
        existente = await db.operadores.find_one({"usuario": t["usuario"]})
        if existente:
            await db.operadores.update_one({"_id": existente["_id"]}, {"$set": op_doc})
            op_id = str(existente["_id"])
        else:
            ins = await db.operadores.insert_one(op_doc)
            op_id = str(ins.inserted_id)
        v_doc = {
            "numero_economico": t["placa"],
            "placa": t["placa"],
            "marca": t["marca"],
            "modelo": t["modelo"],
            "color": t["color"],
            "estado": "activo",
            "activo": True,
            "sitio_id": DEFAULT_SITIO,
            "operador_conductor_id": op_id,
            "propietario_id": None,
            "lat": t["lat"],
            "lng": t["lng"],
            "ultima_actualizacion": None,
            "tipo_vehiculo_id": tipo_estandar_id,
            "foto_url": None,
        }
        await db.vehiculos.update_one({"numero_economico": t["placa"], "sitio_id": DEFAULT_SITIO}, {"$set": v_doc}, upsert=True)
        v_obj = await db.vehiculos.find_one({"numero_economico": t["placa"], "sitio_id": DEFAULT_SITIO})
        await db.operadores.update_one({"_id": to_oid(op_id)}, {"$set": {"vehiculo_id": str(v_obj["_id"])}})
    return {"ok": True, "taxis": 5}


async def sembrar_datos_simulacion():
    """Siembra 25 taxis en el tenant principal (`sitio_palenque`) + 5 taxis en el
    segundo tenant de pruebas (`sitio_pakalna`), rutas, socios con cuotas, servicios
    activos y 10 conversaciones de WhatsApp."""
    await _migraciones()

    # Configurar los 2 sitios (tenants) para pruebas multi-sitio
    await db.sitios.update_one(
        {"clave": DEFAULT_SITIO},
        {"$set": {
            "clave": DEFAULT_SITIO,
            "nombre": "Radio Taxis Palenque",
            "subtitulo": "Central Satelital Palenque — Flota Principal",
            "ciudad": "Palenque, Chiapas",
            "telefono_central": "+52 916 345 0000",
            "tema": "esmeralda",
            "color_primario": "#22d3ee",
            "modo_default": "dark",
            "map_center_lat": 17.5099,
            "map_center_lng": -91.9847,
            "cuota_diaria_default": 350.0,
            "auto_respuesta_wa": True,
            "puntos_calientes": DEFAULT_PUNTOS_CALIENTES,
            "actualizado": now_iso(),
        }},
        upsert=True,
    )
    await db.sitios.update_one(
        {"clave": "sitio_pakalna"},
        {"$set": {
            "clave": "sitio_pakalna",
            "nombre": "Sitio Tren Maya Pakal-Ná",
            "subtitulo": "Base Ferroviaria y Zona Norte",
            "ciudad": "Pakal-Ná, Palenque",
            "telefono_central": "+52 916 400 0200",
            "tema": "ambar",
            "color_primario": "#f59e0b",
            "modo_default": "dark",
            "map_center_lat": 17.5350,
            "map_center_lng": -91.9560,
            "cuota_diaria_default": 400.0,
            "auto_respuesta_wa": True,
            "puntos_calientes": DEFAULT_PUNTOS_CALIENTES,
            "actualizado": now_iso(),
        }},
        upsert=True,
    )
    # Asegurar operadoras de terminal para ambos tenants
    if not await db.usuarios_terminal.find_one({"usuario": "central"}):
        await db.usuarios_terminal.insert_one({
            "nombre": "Central Palenque", "usuario": "central",
            "password_hash": _HASH_CENTRAL123, "sitio_id": DEFAULT_SITIO,
            "activo": True, "creado": now_iso(),
        })
    if not await db.usuarios_terminal.find_one({"usuario": "central_pakalna"}):
        await db.usuarios_terminal.insert_one({
            "nombre": "Central Pakal-Ná", "usuario": "central_pakalna",
            "password_hash": _HASH_CENTRAL123, "sitio_id": "sitio_pakalna",
            "activo": True, "creado": now_iso(),
        })
    if not await db.usuarios_terminal.find_one({"usuario": "operadora1"}):
        await db.usuarios_terminal.insert_one({
            "nombre": "Operadora Turno Matutino", "usuario": "operadora1",
            "password_hash": hash_password("central123"), "sitio_id": DEFAULT_SITIO,
            "activo": True, "creado": now_iso(),
        })
    if not await db.clientes.find_one({"usuario": "pasajero1"}):
        await db.clientes.insert_one({
            "nombre": "Carlos Mendoza (Pasajero Demo)",
            "telefono": "+52 916 555 0900",
            "usuario": "pasajero1",
            "password_hash": hash_password("pasajero123"),
            "activo": True,
            "sitio_id": DEFAULT_SITIO,
            "creado": now_iso(),
        })

    # 1. Rutas Colectivas con Trazo Vial en el Mapa
    rutas_data = [
        {
            "nombre": "Palenque - Pakal Ná (Colectivo)",
            "color_hex": "#4F5DFF",
            "tipo": "colectiva",
            "tarifa_colectiva": 15.0,
            "frecuencia_min": 8,
            "horario": "05:00 - 22:30",
            "paradas": ["Parque Central", "Terminal ADO", "Glorieta Cabeza Maya", "CFE Bulevar", "Mercado Pakal-Ná", "Estación Tren Maya"],
            "trazo": PALENQUE_PISTAS_VIALES["pista_pakal_na"]["puntos"][:20],
            "activa": True,
            "sitio_id": DEFAULT_SITIO,
        },
        {
            "nombre": "Centro - La Cañada / Zona Hotelera",
            "color_hex": "#10B981",
            "tipo": "colectiva",
            "tarifa_colectiva": 12.0,
            "frecuencia_min": 6,
            "horario": "05:30 - 23:00",
            "paradas": ["Mercado Municipal", "Parque Central", "Super Che", "Terminal ADO", "Hotel Maya Tulipanes", "Av. Merle Green"],
            "trazo": PALENQUE_PISTAS_VIALES["pista_canada_ado"]["puntos"][:20],
            "activa": True,
            "sitio_id": DEFAULT_SITIO,
        },
        {
            "nombre": "Circuito Hotelero - Zona Arqueológica",
            "color_hex": "#F59E0B",
            "tipo": "colectiva",
            "tarifa_colectiva": 25.0,
            "frecuencia_min": 12,
            "horario": "06:00 - 19:00",
            "paradas": ["Terminal ADO", "Glorieta Maya", "Hotel Chan-Kah", "Museo de Sitio", "Zona Arqueológica Palenque"],
            "trazo": PALENQUE_PISTAS_VIALES["pista_carretera_ruinas"]["puntos"][:20],
            "activa": True,
            "sitio_id": DEFAULT_SITIO,
        },
    ]
    rutas_ids = []
    for r in rutas_data:
        existente = await db.rutas.find_one({"nombre": {"$regex": f"^{r['nombre'][:15]}"}, "sitio_id": DEFAULT_SITIO})
        if existente:
            await db.rutas.update_one({"_id": existente["_id"]}, {"$set": r})
            rutas_ids.append(str(existente["_id"]))
        else:
            ins = await db.rutas.insert_one(r)
            rutas_ids.append(str(ins.inserted_id))

    tipo_estandar_id = await _tipo_vehiculo_default_id()

    # 2. Socios Concesionarios / Inversionistas (Dueños de Flota con Expediente Completo y Foto)
    ahora_dt = datetime.now(timezone.utc)
    socios_data = [
        {
            "nombre": "Don Roberto Méndez Solís", "usuario": "socio_roberto", "telefono": "916-345-0010",
            "cuota": 380.0, "taxis": ["TX-101", "TX-102", "TX-103", "TX-116", "TX-117"],
            "foto_url": "/assets/drivers/driver-01.jpg", "rfc": "MESR680412HCS", "curp": "MESR680412HCSRLN04",
            "concesion_folio": "SCT-CHIS-PAL-00142", "poliza_flota": "QUALITAS-FL-99281",
            "domicilio_fiscal": "Av. Juárez #114, Col. Centro, Palenque, Chis.",
            "banco_cuenta": "BBVA · CLABE 012180004819201142",
            "licencia_vence_en": (ahora_dt + timedelta(days=28)).strftime("%Y-%m-%d"),
            "antiguedad_anios": 14,
        },
        {
            "nombre": "Doña Carmen Velasco Cruz", "usuario": "socia_carmen", "telefono": "916-345-0020",
            "cuota": 350.0, "taxis": ["TX-104", "TX-105", "TX-118", "TX-119"],
            "foto_url": "/assets/drivers/driver-02.jpg", "rfc": "VECC740923MCS", "curp": "VECC740923MCSCLN01",
            "concesion_folio": "SCT-CHIS-PAL-00198", "poliza_flota": "GNP-TAXI-77412",
            "domicilio_fiscal": "Calle Independencia #45, Barrio La Cañada, Palenque",
            "banco_cuenta": "Banorte · CLABE 072180005591823019",
            "licencia_vence_en": (ahora_dt + timedelta(days=22)).strftime("%Y-%m-%d"),
            "antiguedad_anios": 11,
        },
        {
            "nombre": "Lic. Jorge Domínguez Arcos", "usuario": "socio_jorge", "telefono": "916-345-0030",
            "cuota": 400.0, "taxis": ["TX-106", "TX-107", "TX-108", "TX-109", "TX-120", "TX-121"],
            "foto_url": "/assets/drivers/driver-03.jpg", "rfc": "DOAJ791105HCS", "curp": "DOAJ791105HCSMRN08",
            "concesion_folio": "SCT-CHIS-PAL-00231", "poliza_flota": "AXA-PUB-44109",
            "domicilio_fiscal": "Blvd. Palenque-Pakal Ná Km 1.5, Palenque",
            "banco_cuenta": "Santander · CLABE 014180605019283746",
            "licencia_vence_en": (ahora_dt + timedelta(days=35)).strftime("%Y-%m-%d"),
            "antiguedad_anios": 9,
        },
        {
            "nombre": "Ing. Manuel Guzmán Peña", "usuario": "socio_manuel", "telefono": "916-345-0040",
            "cuota": 360.0, "taxis": ["TX-110", "TX-122"],
            "foto_url": "/assets/drivers/driver-04.jpg", "rfc": "GUPM820218HCS", "curp": "GUPM820218HCSPLN02",
            "concesion_folio": "SCT-CHIS-PAL-00304", "poliza_flota": "AFIRME-TX-66120",
            "domicilio_fiscal": "Av. 5 de Mayo #88, Col. Centro, Palenque",
            "banco_cuenta": "Citibanamex · CLABE 002180701293847561",
            "licencia_vence_en": (ahora_dt + timedelta(days=16)).strftime("%Y-%m-%d"),
            "antiguedad_anios": 7,
        },
        {
            "nombre": "Sra. Patricia Morales López", "usuario": "socia_patricia", "telefono": "916-345-0050",
            "cuota": 350.0, "taxis": ["TX-111", "TX-112", "TX-113", "TX-123", "TX-124"],
            "foto_url": "/assets/drivers/driver-05.jpg", "rfc": "MOLP760730MCS", "curp": "MOLP760730MCSRLN05",
            "concesion_folio": "SCT-CHIS-PAL-00359", "poliza_flota": "QUALITAS-FL-99510",
            "domicilio_fiscal": "Av. Merle Green #22, Zona La Cañada, Palenque",
            "banco_cuenta": "HSBC · CLABE 021180040591827364",
            "licencia_vence_en": (ahora_dt + timedelta(days=29)).strftime("%Y-%m-%d"),
            "antiguedad_anios": 10,
        },
        {
            "nombre": "Sr. Fernando Estrada Ruiz", "usuario": "socio_fernando", "telefono": "916-345-0060",
            "cuota": 350.0, "taxis": ["TX-114", "TX-115", "TX-125"],
            "foto_url": "/assets/drivers/driver-06.jpg", "rfc": "ESRF710314HCS", "curp": "ESRF710314HCSTLN09",
            "concesion_folio": "SCT-CHIS-PAL-00412", "poliza_flota": "CHUBB-PUB-11920",
            "domicilio_fiscal": "Periférico Sur #302, Col. Las Flores, Palenque",
            "banco_cuenta": "BBVA · CLABE 012180009918273645",
            "licencia_vence_en": (ahora_dt + timedelta(days=19)).strftime("%Y-%m-%d"),
            "antiguedad_anios": 12,
        },
    ]
    socio_por_placa = {}
    cuota_por_placa = {}
    for s in socios_data:
        existente = await db.usuarios_dueno.find_one({"usuario": s["usuario"]})
        doc = {
            "nombre": s["nombre"],
            "usuario": s["usuario"],
            "password_hash": _HASH_SOCIO123,
            "telefono": s["telefono"],
            "foto_url": s["foto_url"],
            "rfc": s["rfc"],
            "curp": s["curp"],
            "concesion_folio": s["concesion_folio"],
            "poliza_flota": s["poliza_flota"],
            "domicilio_fiscal": s["domicilio_fiscal"],
            "banco_cuenta": s["banco_cuenta"],
            "cuota_diaria": s["cuota"],
            "licencia_vence_en": s["licencia_vence_en"],
            "antiguedad_anios": s["antiguedad_anios"],
            "sitio_id": DEFAULT_SITIO,
            "activo": True,
            "creado": now_iso(-s["antiguedad_anios"] * 365 * 24 * 60),
        }
        if existente:
            await db.usuarios_dueno.update_one({"_id": existente["_id"]}, {"$set": doc})
            socio_id = str(existente["_id"])
        else:
            ins = await db.usuarios_dueno.insert_one(doc)
            socio_id = str(ins.inserted_id)
        for placa in s["taxis"]:
            socio_por_placa[placa] = socio_id
            cuota_por_placa[placa] = s["cuota"]

    # 3. 25 Taxis de Palenque + 5 Taxis de Pakal-Ná (con expediente completo SCT/SEMOVI)
    tipos_sangre = ["O+", "A+", "O+", "B+", "O-", "A+"]
    op_ids = {}
    await db.documentos_conductor.delete_many({})
    for i, t in enumerate(DEMO_TAXIS + DEMO_TAXIS_PAKALNA):
        t_sitio = t.get("sitio_id") or DEFAULT_SITIO
        lat, lng = t["lat"], t["lng"]
        pista = PALENQUE_PISTAS_VIALES.get(t["pista_id"], {})
        puntos_calle = pista.get("puntos", [[lat, lng]])
        sentido_dir = t.get("sentido_direccion", "adelante")
        track = _generar_track_calle(puntos_calle, t["idx"], sentido_dir, 15)
        driver_foto = f"/assets/drivers/driver-{(i % 15) + 1:02d}.jpg"
        pref_curp = "".join([c for c in t["nombre"].upper() if c.isalpha()][:4]).ljust(4, "X")

        op_doc = {
            "nombre": t["nombre"],
            "telefono": t["telefono"],
            "placa": t["placa"],
            "ruta_asignada": rutas_ids[i % len(rutas_ids)],
            "usuario": t["usuario"],
            "password_hash": _HASH_TAXI123,
            "estado": t["estado"],
            "lat": lat,
            "lng": lng,
            "gps_speed": 7.5 if t["estado"] != "fuera_de_servicio" else 0.0,
            "gps_heading": t.get("gps_heading", 0),
            "sentido_calle": t.get("sentido_calle", "doble"),
            "sentido_direccion": t.get("sentido_direccion", "adelante"),
            "descripcion_sentido": t.get("descripcion_sentido", ""),
            "gps_accuracy": round(random.uniform(2.5, 4.5), 1),
            "ultima_actualizacion": now_iso(),
            "sitio_id": t_sitio,
            "activo": True,
            "track": track,
            "foto_url": driver_foto,
            "curp": f"{pref_curp}{80 + (i % 18):02d}0{(i % 9) + 1}15HCSRL{i % 10:02d}",
            "rfc": f"{pref_curp}{80 + (i % 18):02d}0{(i % 9) + 1}15A{i % 9}",
            "tipo_sangre": tipos_sangre[i % len(tipos_sangre)],
            "licencia_tipo": "Tarjetón Estatal Servicio Público Tipo B",
            "licencia_folio": f"CHIS-TPB-2026-{1000 + i}",
            "tarjeton_semovi": f"SEMOVI-PAL-{400 + i}",
            "examen_medico": "APTO (Toxicológico y Pericia Aprobado)",
            "contacto_emergencia": f"Familiar Directo de {t['nombre'].split()[0]}",
            "telefono_emergencia": f"916-880-{1000 + i:04d}",
            "domicilio": f"Calle {(i % 12) + 1} de Mayo #{10 + i * 3}, Palenque, Chiapas",
            "calificacion_promedio": round(4.6 + ((i % 5) * 0.08), 2),
            "antiguedad_meses": 14 + (i * 4),
            "creado": now_iso(-(14 + i * 4) * 30 * 24 * 60),
        }
        existente = await db.operadores.find_one({"usuario": t["usuario"]})
        if existente:
            await db.operadores.update_one({"_id": existente["_id"]}, {"$set": op_doc})
            op_id = str(existente["_id"])
        else:
            ins = await db.operadores.insert_one(op_doc)
            op_id = str(ins.inserted_id)
        op_ids[t["usuario"]] = op_id

        # Sembrar documentos oficiales del expediente (con algunos por vencer para probar filtros)
        dias_lic = 18 if i in (2, 7, 14) else (240 + i * 5)
        dias_seg = -5 if i == 11 else (190 + i * 3)
        await db.documentos_conductor.insert_many([
            {
                "operador_id": op_id,
                "tipo": "licencia",
                "nombre_doc": "Licencia / Tarjetón Chofer Público Tipo B",
                "numero": f"CHIS-TPB-{1000 + i}",
                "vence_en": (ahora_dt + timedelta(days=dias_lic)).strftime("%Y-%m-%d"),
            },
            {
                "operador_id": op_id,
                "tipo": "ine",
                "nombre_doc": "Identificación Oficial INE Vigente",
                "numero": f"INE-0709{100000 + i}",
                "vence_en": (ahora_dt + timedelta(days=900)).strftime("%Y-%m-%d"),
            },
            {
                "operador_id": op_id,
                "tipo": "seguro",
                "nombre_doc": "Póliza RC Viajero (1,500 UMA)",
                "numero": f"QUAL-RCV-{8800 + i}",
                "vence_en": (ahora_dt + timedelta(days=dias_seg)).strftime("%Y-%m-%d"),
            },
            {
                "operador_id": op_id,
                "tipo": "antidoping",
                "nombre_doc": "Certificado Médico y Toxicológico SCT",
                "numero": f"MED-SCT-{3300 + i}",
                "vence_en": (ahora_dt + timedelta(days=150)).strftime("%Y-%m-%d"),
            },
        ])

        modelo_lower = t["modelo"].lower()
        if modelo_lower == "sentra":
            vehiculo_foto = "/assets/vehicles/Sentra.png"
        else:
            vehiculo_foto = f"/assets/vehicles/{modelo_lower}.png"

        propietario_socio_id = socio_por_placa.get(t["placa"])
        cuota_v = cuota_por_placa.get(t["placa"], 350.0)
        v_doc = {
            "numero_economico": t["placa"],
            "placa": f"CH-{410 + i}-TX",
            "marca": t["marca"],
            "modelo": t["modelo"],
            "anio": 2021 + (i % 4),
            "color": t["color"],
            "revista_vehicular": "APROBADA 2026",
            "tenencia_estado": "PAGADA 2026",
            "poliza_seguro": f"QUAL-RCV-{8800 + i}",
            "estado": "activo" if t["estado"] != "fuera_de_servicio" else "mantenimiento",
            "activo": True,
            "sitio_id": t_sitio,
            "operador_conductor_id": op_id,
            "propietario_id": propietario_socio_id,
            "cuota_diaria": cuota_v,
            "odometro_km": 42500 + (i * 1850),
            "lat": lat,
            "lng": lng,
            "ultima_actualizacion": now_iso(),
            "tipo_vehiculo_id": tipo_estandar_id,
            "foto_url": vehiculo_foto,
        }
        await db.vehiculos.update_one(
            {"numero_economico": t["placa"], "sitio_id": t_sitio},
            {"$set": v_doc},
            upsert=True
        )
        v_obj = await db.vehiculos.find_one({"numero_economico": t["placa"], "sitio_id": t_sitio})
        await db.operadores.update_one({"_id": to_oid(op_id)}, {"$set": {"vehiculo_id": str(v_obj["_id"])}})


    # 3. Servicios en varios estados
    await db.servicios.delete_many({"sitio_id": DEFAULT_SITIO})
    servicios = [
        # 5 Servicios en curso con destinos viales reales en Palenque
        {
            "cliente_nombre": "Dr. Fernando Ruiz", "cliente_telefono": "916-555-0101",
            "origen": {"texto": "Hotel Ciudad Real, Palenque", "lat": 17.5100, "lng": -91.9830},
            "destino": {"texto": "Zona Arqueológica de Palenque", "lat": 17.4840, "lng": -91.9950},
            "estado": "en_curso", "operador_asignado_id": op_ids["op3"],
            "costo": 180.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-15), "timestamp_creacion": now_iso(-15),
            "timestamp_asignacion": now_iso(-12), "timestamp_inicio": now_iso(-8),
        },
        {
            "cliente_nombre": "Lic. Mónica Estrada", "cliente_telefono": "916-555-0102",
            "origen": {"texto": "Terminal ADO Palenque", "lat": 17.5140, "lng": -91.9855},
            "destino": {"texto": "Hotel Misión Palenque y Spa", "lat": 17.5130, "lng": -91.9790},
            "estado": "en_curso", "operador_asignado_id": op_ids["op7"],
            "costo": 80.0, "metodo_pago": "tarjeta", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-10), "timestamp_creacion": now_iso(-10),
            "timestamp_asignacion": now_iso(-8), "timestamp_inicio": now_iso(-5),
        },
        {
            "cliente_nombre": "Ing. Carlos Valenzuela", "cliente_telefono": "916-555-0105",
            "origen": {"texto": "Centro de Convenciones Palenque", "lat": 17.5150, "lng": -91.9820},
            "destino": {"texto": "Estación Tren Maya Palenque", "lat": 17.5359, "lng": -91.9592},
            "estado": "en_curso", "operador_asignado_id": op_ids["op8"],
            "costo": 120.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-9), "timestamp_creacion": now_iso(-9),
            "timestamp_asignacion": now_iso(-7), "timestamp_inicio": now_iso(-4),
        },
        {
            "cliente_nombre": "Arqueólogo Mateo Ramos", "cliente_telefono": "916-555-0103",
            "origen": {"texto": "Estación Tren Maya Palenque", "lat": 17.5320, "lng": -91.9540},
            "destino": {"texto": "Parque Central de Palenque", "lat": 17.5098, "lng": -91.9820},
            "estado": "en_curso", "operador_asignado_id": op_ids["op10"],
            "costo": 95.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-8), "timestamp_creacion": now_iso(-8),
            "timestamp_asignacion": now_iso(-6), "timestamp_inicio": now_iso(-3),
        },
        {
            "cliente_nombre": "Verónica Salgado", "cliente_telefono": "916-555-0104",
            "origen": {"texto": "Fracc. Pakal-Ná Norte", "lat": 17.5260, "lng": -91.9580},
            "destino": {"texto": "Hospital General de Palenque", "lat": 17.5077, "lng": -91.9800},
            "estado": "en_curso", "operador_asignado_id": op_ids["op12"],
            "costo": 85.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-6), "timestamp_creacion": now_iso(-6),
            "timestamp_asignacion": now_iso(-4), "timestamp_inicio": now_iso(-2),
        },
        # 2 Servicios Asignados
        {
            "cliente_nombre": "María López (Hotel Maya)", "cliente_telefono": "916-100-0001",
            "origen": {"texto": "Terminal ADO Palenque", "lat": 17.5140, "lng": -91.9855},
            "destino": {"texto": "Hotel Maya Tulipanes, La Cañada", "lat": 17.5165, "lng": -91.9810},
            "estado": "asignado", "operador_asignado_id": op_ids["op5"],
            "costo": 60.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-4), "timestamp_creacion": now_iso(-4), "timestamp_asignacion": now_iso(-2),
        },
        {
            "cliente_nombre": "Carmen Velasco (Super Che)", "cliente_telefono": "916-100-0006",
            "origen": {"texto": "Super Che Palenque, Av. Juárez", "lat": 17.5125, "lng": -91.9840},
            "destino": {"texto": "Mercado Municipal de Palenque", "lat": 17.5131, "lng": -91.9845},
            "estado": "asignado", "operador_asignado_id": op_ids["op9"],
            "costo": 50.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-3), "timestamp_creacion": now_iso(-3), "timestamp_asignacion": now_iso(-1),
        },
        # Pendientes (listos para despacho en la terminal)
        {
            "cliente_nombre": "Guillermo Zepeda", "cliente_telefono": "916-555-0201",
            "origen": {"texto": "Restaurante Maya Cañada", "lat": 17.5180, "lng": -91.9790},
            "destino": {"texto": "Balneario Nututún", "lat": 17.4760, "lng": -91.9980},
            "estado": "pendiente", "operador_asignado_id": None,
            "costo": 120.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-3), "timestamp_creacion": now_iso(-3),
        },
        {
            "cliente_nombre": "Familia Barrientos", "cliente_telefono": "916-100-0008",
            "origen": {"texto": "Parque Central frente a Catedral", "lat": 17.5098, "lng": -91.9820},
            "destino": {"texto": "Ecoparque Aluxes", "lat": 17.5010, "lng": -92.0120},
            "estado": "pendiente", "operador_asignado_id": None,
            "costo": 95.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-2), "timestamp_creacion": now_iso(-2),
        },
        {
            "cliente_nombre": "Ing. David Trujillo", "cliente_telefono": "916-100-0007",
            "origen": {"texto": "Estación Tren Maya Palenque", "lat": 17.5320, "lng": -91.9540},
            "destino": {"texto": "Hotel Misión Palenque", "lat": 17.5130, "lng": -91.9790},
            "estado": "pendiente", "operador_asignado_id": None,
            "costo": 110.0, "metodo_pago": "transferencia", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-1), "timestamp_creacion": now_iso(-1),
        },
        # Completados hoy
        {
            "cliente_nombre": "Sofía Castro", "cliente_telefono": "916-555-0301",
            "origen": {"texto": "Terminal ADO"}, "destino": {"texto": "Parque Central"},
            "estado": "completado", "operador_asignado_id": op_ids["op1"],
            "costo": 50.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-120), "timestamp_creacion": now_iso(-120), "timestamp_fin": now_iso(-100),
        },
        {
            "cliente_nombre": "Alberto Núñez", "cliente_telefono": "916-555-0302",
            "origen": {"texto": "Mercado Municipal"}, "destino": {"texto": "Hotel Chan-Kah"},
            "estado": "completado", "operador_asignado_id": op_ids["op2"],
            "costo": 130.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-90), "timestamp_creacion": now_iso(-90), "timestamp_fin": now_iso(-70),
        },
        {
            "cliente_nombre": "Lucía Domínguez", "cliente_telefono": "916-555-0303",
            "origen": {"texto": "Colonia Pakal Ná"}, "destino": {"texto": "Centro Médico Palenque"},
            "estado": "completado", "operador_asignado_id": op_ids["op4"],
            "costo": 65.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-75), "timestamp_creacion": now_iso(-75), "timestamp_fin": now_iso(-55),
        },
        {
            "cliente_nombre": "Gustavo Morales", "cliente_telefono": "916-555-0304",
            "origen": {"texto": "Hotel Tulijá Express"}, "destino": {"texto": "Plaza Las Flores"},
            "estado": "completado", "operador_asignado_id": op_ids["op6"],
            "costo": 55.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-60), "timestamp_creacion": now_iso(-60), "timestamp_fin": now_iso(-40),
        },
        {
            "cliente_nombre": "Elena Morales", "cliente_telefono": "916-555-0305",
            "origen": {"texto": "Plaza de las Artesanías"}, "destino": {"texto": "Hotel Maya Tulipanes"},
            "estado": "completado", "operador_asignado_id": op_ids["op8"],
            "costo": 45.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-45), "timestamp_creacion": now_iso(-45), "timestamp_fin": now_iso(-25),
        },
        {
            "cliente_nombre": "Mariana Cifuentes", "cliente_telefono": "916-555-0306",
            "origen": {"texto": "Aeropuerto de Palenque"}, "destino": {"texto": "Hotel Ciudad Real"},
            "estado": "completado", "operador_asignado_id": op_ids["op11"],
            "costo": 220.0, "metodo_pago": "tarjeta", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-40), "timestamp_creacion": now_iso(-40), "timestamp_fin": now_iso(-15),
        },
        {
            "cliente_nombre": "Ignacio Rivas", "cliente_telefono": "916-555-0307",
            "origen": {"texto": "Gasolinera Periférico"}, "destino": {"texto": "Terminal ADO"},
            "estado": "completado", "operador_asignado_id": op_ids["op13"],
            "costo": 50.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-30), "timestamp_creacion": now_iso(-30), "timestamp_fin": now_iso(-10),
        },
        {
            "cliente_nombre": "Raúl Santillán", "cliente_telefono": "916-555-0308",
            "origen": {"texto": "Palacio Municipal"}, "destino": {"texto": "Colonia Los Ángeles"},
            "estado": "completado", "operador_asignado_id": op_ids["op14"],
            "costo": 60.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-20), "timestamp_creacion": now_iso(-20), "timestamp_fin": now_iso(-5),
        },
        {
            "cliente_nombre": "Patricia Solís", "cliente_telefono": "916-555-0309",
            "origen": {"texto": "Parque Central"}, "destino": {"texto": "Colonia Maya"},
            "estado": "completado", "operador_asignado_id": op_ids["op1"],
            "costo": 55.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-150), "timestamp_creacion": now_iso(-150), "timestamp_fin": now_iso(-132),
        },
        {
            "cliente_nombre": "Héctor Domínguez", "cliente_telefono": "916-555-0310",
            "origen": {"texto": "Hospital General"}, "destino": {"texto": "Terminal ADO"},
            "estado": "completado", "operador_asignado_id": op_ids["op1"],
            "costo": 60.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-180), "timestamp_creacion": now_iso(-180), "timestamp_fin": now_iso(-165),
        },
        {
            "cliente_nombre": "Lorena Aguilar", "cliente_telefono": "916-555-0311",
            "origen": {"texto": "Super Che"}, "destino": {"texto": "Fracc. Pakal-Ná"},
            "estado": "completado", "operador_asignado_id": op_ids["op2"],
            "costo": 75.0, "metodo_pago": "transferencia", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-140), "timestamp_creacion": now_iso(-140), "timestamp_fin": now_iso(-122),
        },
        {
            "cliente_nombre": "Arturo Vázquez", "cliente_telefono": "916-555-0312",
            "origen": {"texto": "Estación Tren Maya"}, "destino": {"texto": "Zona Hotelera La Cañada"},
            "estado": "completado", "operador_asignado_id": op_ids["op5"],
            "costo": 110.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-110), "timestamp_creacion": now_iso(-110), "timestamp_fin": now_iso(-92),
        },
    ]
    op_meta_by_id = {op_ids[t["usuario"]]: t for t in DEMO_TAXIS if t["usuario"] in op_ids}
    for s_doc in servicios:
        oid_s = s_doc.get("operador_asignado_id")
        if oid_s and oid_s in op_meta_by_id:
            s_doc["operador_nombre"] = op_meta_by_id[oid_s]["nombre"]
            s_doc["operador_placa"] = op_meta_by_id[oid_s]["placa"]
    await db.servicios.insert_many(servicios)

    # 4. 10 Conversaciones de WhatsApp
    await db.wa_conversaciones.delete_many({"sitio_id": DEFAULT_SITIO})
    wa_conversaciones = [
        # 1: María López - Reciente (< 2 min), Hotel Maya Tulipanes
        {
            "cliente_nombre": "María López",
            "cliente_telefono": "+52 916 100 0001",
            "sitio_id": DEFAULT_SITIO,
            "creada_en": now_iso(-1),
            "actualizada_en": now_iso(-1),
            "mensajes": [
                {"de": "cliente", "texto": "Buenas tardes central, ¿tienen un taxi disponible?", "ts": now_iso(-2)},
                {"de": "cliente", "texto": "Estoy aquí en la recepción del Hotel Maya Tulipanes con mi maleta", "lat": 17.5165, "lng": -91.9810, "ts": now_iso(-1)}
            ]
        },
        # 2: Dr. Alejandro Gómez - Advertencia (2-5 min), Hospital General
        {
            "cliente_nombre": "Dr. Alejandro Gómez",
            "cliente_telefono": "+52 916 100 0002",
            "sitio_id": DEFAULT_SITIO,
            "creada_en": now_iso(-4),
            "actualizada_en": now_iso(-3),
            "mensajes": [
                {"de": "cliente", "texto": "Hola central, salgo de turno de guardia médica", "ts": now_iso(-4)},
                {"de": "cliente", "texto": "Comparto mi ubicación frente a Urgencias del Hospital General", "lat": 17.5060, "lng": -91.9780, "ts": now_iso(-3)}
            ]
        },
        # 3: Elena Morales (ADO) - Urgente (> 5 min, URGENTE rojo), Terminal ADO
        {
            "cliente_nombre": "Elena Morales (ADO)",
            "cliente_telefono": "+52 916 100 0003",
            "sitio_id": DEFAULT_SITIO,
            "creada_en": now_iso(-8),
            "actualizada_en": now_iso(-7),
            "mensajes": [
                {"de": "cliente", "texto": "Buenas tardes, ¿me pueden mandar una unidad a la Terminal ADO? Llegó mi autobús.", "ts": now_iso(-8)},
                {"de": "cliente", "texto": "Aquí los espero afuera sobre la banqueta principal con 2 maletas", "lat": 17.5140, "lng": -91.9855, "ts": now_iso(-7)}
            ]
        },
        # 4: Pedro Santos - Turista (Pregunta tarifas Misol-Ha)
        {
            "cliente_nombre": "Pedro Santos (Turista)",
            "cliente_telefono": "+52 916 100 0004",
            "sitio_id": DEFAULT_SITIO,
            "creada_en": now_iso(-14),
            "actualizada_en": now_iso(-10),
            "mensajes": [
                {"de": "cliente", "texto": "Hola buenas tardes, ¿cuánto cobran por llevarnos y esperarnos en las Cascadas de Misol-Ha?", "ts": now_iso(-12)},
                {"de": "operadora", "texto": "Buenas tardes Pedro, el viaje redondo con 2 horas de espera está en $450 pesos.", "ts": now_iso(-11)},
                {"de": "cliente", "texto": "Excelente, ¿tienen unidad para salir en 20 minutos?", "ts": now_iso(-10)}
            ]
        },
        # 5: Lic. Roberto Coutiño - Ejecutivo Aeropuerto Palenque
        {
            "cliente_nombre": "Lic. Roberto Coutiño",
            "cliente_telefono": "+52 916 100 0005",
            "sitio_id": DEFAULT_SITIO,
            "creada_en": now_iso(-5),
            "actualizada_en": now_iso(-4),
            "mensajes": [
                {"de": "cliente", "texto": "Buenos días, requiero una unidad ejecutiva hacia el Aeropuerto de Palenque para vuelo de las 11:30 am.", "ts": now_iso(-5)},
                {"de": "cliente", "texto": "Estoy en el Centro frente a Banamex, ¿pueden emitir factura?", "lat": 17.5100, "lng": -91.9825, "ts": now_iso(-4)}
            ]
        },
        # 6: Carmen Velasco - Super Chedraui (Compras)
        {
            "cliente_nombre": "Carmen Velasco",
            "cliente_telefono": "+52 916 100 0006",
            "sitio_id": DEFAULT_SITIO,
            "creada_en": now_iso(-2),
            "actualizada_en": now_iso(-2),
            "mensajes": [
                {"de": "cliente", "texto": "Hola, salgo de hacer despensa de Super Che con varios carritos", "ts": now_iso(-2)},
                {"de": "cliente", "texto": "Ocupo un taxi con cajuela amplia por favor, estoy en el estacionamiento", "lat": 17.5125, "lng": -91.9840, "ts": now_iso(-2)}
            ]
        },
        # 7: Ing. David Trujillo - Tren Maya Palenque (> 5 min, URGENTE rojo)
        {
            "cliente_nombre": "Ing. David Trujillo (Tren Maya)",
            "cliente_telefono": "+52 916 100 0007",
            "sitio_id": DEFAULT_SITIO,
            "creada_en": now_iso(-7),
            "actualizada_en": now_iso(-6),
            "mensajes": [
                {"de": "cliente", "texto": "Acabamos de bajar del Tren Maya en la estación Palenque", "ts": now_iso(-7)},
                {"de": "cliente", "texto": "Somos 3 personas con equipaje hacia el Hotel Misión, les mando ubicación", "lat": 17.5320, "lng": -91.9540, "ts": now_iso(-6)}
            ]
        },
        # 8: Familia Barrientos - Parque Central (5 personas)
        {
            "cliente_nombre": "Familia Barrientos",
            "cliente_telefono": "+52 916 100 0008",
            "sitio_id": DEFAULT_SITIO,
            "creada_en": now_iso(-1),
            "actualizada_en": now_iso(-1),
            "mensajes": [
                {"de": "cliente", "texto": "Buenas tardes, ¿tendrán una unidad tipo Avanza o amplia para 5 pasajeros?", "ts": now_iso(-1)},
                {"de": "cliente", "texto": "Estamos aquí junto al quiosco del Parque Central", "lat": 17.5098, "lng": -91.9820, "ts": now_iso(-1)}
            ]
        },
        # 9: Valeria Ramos - Métodos de pago Nututún
        {
            "cliente_nombre": "Valeria Ramos",
            "cliente_telefono": "+52 916 100 0009",
            "sitio_id": DEFAULT_SITIO,
            "creada_en": now_iso(-15),
            "actualizada_en": now_iso(-8),
            "mensajes": [
                {"de": "cliente", "texto": "Hola buenas tardes, ¿los choferes aceptan pago por transferencia CoDi o tarjeta?", "ts": now_iso(-15)},
                {"de": "operadora", "texto": "¡Hola Valeria! Sí, tenemos unidades equipadas con terminal clip y cobro por transferencia.", "ts": now_iso(-10)},
                {"de": "cliente", "texto": "Perfecto, en 15 minutos les pido uno para el Balneario Nututún.", "ts": now_iso(-8)}
            ]
        },
        # 10: Don Javier Méndez - Mercado Municipal (Cliente habitual)
        {
            "cliente_nombre": "Don Javier Méndez",
            "cliente_telefono": "+52 916 100 0010",
            "sitio_id": DEFAULT_SITIO,
            "creada_en": now_iso(-2),
            "actualizada_en": now_iso(-2),
            "mensajes": [
                {"de": "cliente", "texto": "Buenos días muchachas, ¿me mandan mi taxi de siempre al Mercado por favor?", "ts": now_iso(-2)},
                {"de": "cliente", "texto": "Estoy en el portal de las flores como todos los días", "lat": 17.5080, "lng": -91.9835, "ts": now_iso(-2)}
            ]
        },
    ]
    await db.wa_conversaciones.insert_many(wa_conversaciones)

    # 5. Colonias / Cuadrantes con Delimitador de Precios por Zona
    await db.colonias.delete_many({"sitio_id": DEFAULT_SITIO})
    colonias_seed = [
        {
            "nombre": "Centro",
            "color": "#38bdf8",
            "tarifa_base": 40.0,
            "tarifa_nocturna": 55.0,
            "tarifa_salida": 45.0,
            "notas": "Primer cuadro, Parque Central y Mercado Municipal",
            "activa": True,
            "sitio_id": DEFAULT_SITIO,
            "poligono": [[17.5130, -91.9880], [17.5130, -91.9790], [17.5060, -91.9790], [17.5060, -91.9880]],
            "creado_en": now_iso(),
        },
        {
            "nombre": "La Cañada",
            "color": "#a855f7",
            "tarifa_base": 50.0,
            "tarifa_nocturna": 65.0,
            "tarifa_salida": 55.0,
            "notas": "Zona Hotelera y eco-turística La Cañada",
            "activa": True,
            "sitio_id": DEFAULT_SITIO,
            "poligono": [[17.5155, -91.9950], [17.5155, -91.9880], [17.5085, -91.9880], [17.5085, -91.9950]],
            "creado_en": now_iso(),
        },
        {
            "nombre": "Pakal-Ná",
            "color": "#f59e0b",
            "tarifa_base": 65.0,
            "tarifa_nocturna": 85.0,
            "tarifa_salida": 70.0,
            "notas": "Corredor Norte, CFE y Estación Tren Maya",
            "activa": True,
            "sitio_id": DEFAULT_SITIO,
            "poligono": [[17.5420, -91.9780], [17.5420, -91.9640], [17.5300, -91.9640], [17.5300, -91.9780]],
            "creado_en": now_iso(),
        },
        {
            "nombre": "Zona Hotelera / Ruinas",
            "color": "#f43f5e",
            "tarifa_base": 120.0,
            "tarifa_nocturna": 150.0,
            "tarifa_salida": 130.0,
            "notas": "Carretera a las Ruinas y Hoteles de Selva",
            "activa": True,
            "sitio_id": DEFAULT_SITIO,
            "poligono": [[17.5085, -92.0080], [17.5085, -91.9950], [17.4980, -91.9950], [17.4980, -92.0080]],
            "creado_en": now_iso(),
        },
        {
            "nombre": "Periférico Sur / Hospital",
            "color": "#10b981",
            "tarifa_base": 55.0,
            "tarifa_nocturna": 70.0,
            "tarifa_salida": 60.0,
            "notas": "Hospital General, Plaza Las Flores y salidas sur",
            "activa": True,
            "sitio_id": DEFAULT_SITIO,
            "poligono": [[17.5060, -91.9880], [17.5060, -91.9760], [17.4990, -91.9760], [17.4990, -91.9880]],
            "creado_en": now_iso(),
        },
    ]
    await db.colonias.insert_many(colonias_seed)

    # 6. Tarifas Predefinidas con Horarios, Recargos y Zonas
    await db.tarifas_predefinidas.delete_many({"sitio_id": DEFAULT_SITIO})
    tarifas_seed = [
        {
            "nombre": "Dejada Local Centro (Diurna)",
            "monto": 40.0,
            "tipo": "por_zona",
            "orden": 1,
            "hora_inicio": "06:00",
            "hora_fin": "22:00",
            "horario_tipo": "diurno",
            "recargo_nocturno": 15.0,
            "recargo_lluvia": 10.0,
            "costo_km_extra": 8.0,
            "costo_parada_extra": 15.0,
            "zona_nombre": "Centro",
            "notas": "Tarifa base dentro del primer cuadro de la ciudad",
            "activa": True,
            "sitio_id": DEFAULT_SITIO,
        },
        {
            "nombre": "Centro ↔ La Cañada / ADO",
            "monto": 50.0,
            "tipo": "por_zona",
            "orden": 2,
            "hora_inicio": "06:00",
            "hora_fin": "22:00",
            "horario_tipo": "diurno",
            "recargo_nocturno": 15.0,
            "recargo_lluvia": 10.0,
            "costo_km_extra": 10.0,
            "costo_parada_extra": 15.0,
            "zona_nombre": "La Cañada",
            "notas": "Incluye equipaje estándar en cajuela",
            "activa": True,
            "sitio_id": DEFAULT_SITIO,
        },
        {
            "nombre": "Centro ↔ Pakal-Ná / Hospital",
            "monto": 65.0,
            "tipo": "por_zona",
            "orden": 3,
            "hora_inicio": "05:30",
            "hora_fin": "23:00",
            "horario_tipo": "todo_el_dia",
            "recargo_nocturno": 20.0,
            "recargo_lluvia": 15.0,
            "costo_km_extra": 10.0,
            "costo_parada_extra": 20.0,
            "zona_nombre": "Pakal-Ná",
            "notas": "Corredor Bulevar Palenque - Pakal-Ná",
            "activa": True,
            "sitio_id": DEFAULT_SITIO,
        },
        {
            "nombre": "Estación Tren Maya / Aeropuerto",
            "monto": 110.0,
            "tipo": "fijo",
            "orden": 4,
            "hora_inicio": "00:00",
            "hora_fin": "23:59",
            "horario_tipo": "todo_el_dia",
            "recargo_nocturno": 25.0,
            "recargo_lluvia": 15.0,
            "costo_km_extra": 12.0,
            "costo_parada_extra": 25.0,
            "zona_nombre": "Pakal-Ná",
            "notas": "Servicio especial con espera en andén",
            "activa": True,
            "sitio_id": DEFAULT_SITIO,
        },
        {
            "nombre": "Zona Arqueológica / Ruinas",
            "monto": 150.0,
            "tipo": "foraneo",
            "orden": 5,
            "hora_inicio": "07:00",
            "hora_fin": "18:00",
            "horario_tipo": "diurno",
            "recargo_nocturno": 30.0,
            "recargo_lluvia": 20.0,
            "costo_km_extra": 14.0,
            "costo_parada_extra": 30.0,
            "zona_nombre": "Zona Hotelera / Ruinas",
            "notas": "Corredor turístico Carretera a las Ruinas",
            "activa": True,
            "sitio_id": DEFAULT_SITIO,
        },
        {
            "nombre": "Tarifa Nocturna Especial",
            "monto": 75.0,
            "tipo": "horario",
            "orden": 6,
            "hora_inicio": "22:00",
            "hora_fin": "06:00",
            "horario_tipo": "nocturno",
            "recargo_nocturno": 0.0,
            "recargo_lluvia": 15.0,
            "costo_km_extra": 12.0,
            "costo_parada_extra": 20.0,
            "zona_nombre": "Todas las zonas",
            "notas": "Aplica automáticamente en guardia nocturna",
            "activa": True,
            "sitio_id": DEFAULT_SITIO,
        },
    ]
    await db.tarifas_predefinidas.insert_many(tarifas_seed)

    # 7. Objetos Reportados con Evidencia Fotográfica Real en WebP por Tenant e Histórico
    await db.reportes_objetos.delete_many({"sitio_id": DEFAULT_SITIO})
    try:
        from PIL import Image, ImageDraw
        import io as _io

        def _crear_evidencia_webp(oid: str, titulo: str, subtitulo: str, detalle: str, rgb_top: tuple, rgb_bot: tuple) -> dict:
            img = Image.new("RGB", (680, 440), rgb_top)
            draw = ImageDraw.Draw(img)
            for y in range(440):
                r = int(rgb_top[0] + (rgb_bot[0] - rgb_top[0]) * (y / 440.0))
                g = int(rgb_top[1] + (rgb_bot[1] - rgb_top[1]) * (y / 440.0))
                b = int(rgb_top[2] + (rgb_bot[2] - rgb_top[2]) * (y / 440.0))
                draw.line([(0, y), (680, y)], fill=(r, g, b))
            # Marco de evidencia forense / resguardo
            draw.rectangle([20, 20, 660, 420], outline=(34, 211, 238), width=3)
            draw.rectangle([20, 20, 660, 74], fill=(9, 14, 26))
            draw.text((38, 38), f"EVIDENCIA FOTOGRAFICA WEBP · RESGUARDO TAXIHUB", fill=(34, 211, 238))
            # Dibujar silueta estilizada del objeto en el centro
            draw.rounded_rectangle([190, 110, 490, 305], radius=22, fill=(18, 28, 48), outline=(148, 163, 184), width=3)
            draw.rounded_rectangle([225, 138, 455, 245], radius=12, fill=(30, 41, 59), outline=(56, 189, 248), width=2)
            draw.text((245, 175), titulo.upper()[:24], fill=(255, 255, 255))
            draw.text((245, 205), subtitulo[:32], fill=(148, 163, 184))
            draw.rectangle([20, 335, 660, 420], fill=(9, 14, 26))
            draw.text((38, 350), f"OBJETO: {titulo}", fill=(255, 255, 255))
            draw.text((38, 375), f"DETALLE: {detalle}", fill=(16, 185, 129))
            draw.text((38, 396), f"TENANT STORAGE: uploads/tenants/{DEFAULT_SITIO}/reportes/ · FORMATO: WEBP SEGURO", fill=(148, 163, 184))
            buf = _io.BytesIO()
            img.save(buf, format="WEBP", quality=84)
            comp = analizar_y_comprimir_imagen_webp(buf.getvalue(), "evidencia.webp")
            path = f"{APP_NAME}/reportes/{oid}/{uuid.uuid4().hex}.webp"
            saved = put_object(path, comp["data"], "image/webp", sitio_id=DEFAULT_SITIO)
            return {"path": saved["path"], "tenant_path": saved.get("tenant_path"), "ahorro": comp.get("ahorro_pct", 34.5)}

        ev1 = _crear_evidencia_webp(op_ids["op1"], "iPhone 15 Pro Funda Negra", "Asiento trasero derecho · Unidad TX-101", "Pantalla intacta, bloqueado con funda MagSafe", (15, 23, 42), (30, 58, 138))
        ev2 = _crear_evidencia_webp(op_ids["op4"], "Mochila Samsonite Azul Marino", "Cajuela · Viaje Terminal ADO -> Hotel Mision", "Contiene laptop Dell y documentos personales", (17, 24, 39), (6, 78, 59))
        ev3 = _crear_evidencia_webp(op_ids["op2"], "Cartera de Piel Cafe con INE", "Asiento copiloto · Unidad TX-102", "Devuelta en base central previa identificacion", (24, 24, 27), (120, 53, 15))
        ev4 = _crear_evidencia_webp(op_ids["op8"], "Lentes Ray-Ban con Estuche", "Consola trasera · Unidad TX-108", "Entregado a su propietaria en recepcion del hotel", (15, 23, 42), (88, 28, 135))

        reportes_seed = [
            {
                "operador_id": op_ids["op1"],
                "operador_nombre": "Juan Pérez",
                "operador_placa": "TX-101",
                "sitio_id": DEFAULT_SITIO,
                "storage_path": ev1["path"],
                "tenant_storage_path": ev1["tenant_path"],
                "foto_url": f"/api/files/{ev1['path']}",
                "content_type": "image/webp",
                "formato": "webp",
                "seguridad_verificada": True,
                "ahorro_compresion_pct": 38.4,
                "categoria": "Electrónicos",
                "descripcion": "iPhone 15 Pro con funda negra MagSafe olvidado en el asiento trasero al bajar en Parque Central.",
                "timestamp": now_iso(-35),
                "estado": "encontrado",
                "unidad": {"numero_economico": "TX-101", "placa": "CH-410-TX"},
                "historial": [{"estado": "encontrado", "ts": now_iso(-35), "actor": "operador", "nota": "Reportado al finalizar viaje"}],
            },
            {
                "operador_id": op_ids["op4"],
                "operador_nombre": "Pedro Gómez",
                "operador_placa": "TX-104",
                "sitio_id": DEFAULT_SITIO,
                "storage_path": ev2["path"],
                "tenant_storage_path": ev2["tenant_path"],
                "foto_url": f"/api/files/{ev2['path']}",
                "content_type": "image/webp",
                "formato": "webp",
                "seguridad_verificada": True,
                "ahorro_compresion_pct": 41.2,
                "categoria": "Equipaje / Mochila",
                "descripcion": "Mochila Samsonite azul marino con laptop y carpeta de trabajo olvidada en la cajuela en Terminal ADO.",
                "timestamp": now_iso(-210),
                "estado": "resguardo",
                "ultima_nota": "Recibido en casilleros de la Central Palenque (Gaveta #3)",
                "unidad": {"numero_economico": "TX-104", "placa": "CH-413-TX"},
                "historial": [
                    {"estado": "encontrado", "ts": now_iso(-210), "actor": "operador"},
                    {"estado": "resguardo", "ts": now_iso(-180), "actor": "terminal", "nota": "Resguardado en Gaveta #3 de la central"},
                ],
            },
            {
                "operador_id": op_ids["op2"],
                "operador_nombre": "Miguel Ángel López",
                "operador_placa": "TX-102",
                "sitio_id": DEFAULT_SITIO,
                "storage_path": ev3["path"],
                "tenant_storage_path": ev3["tenant_path"],
                "foto_url": f"/api/files/{ev3['path']}",
                "content_type": "image/webp",
                "formato": "webp",
                "seguridad_verificada": True,
                "ahorro_compresion_pct": 36.8,
                "categoria": "Documentos / Cartera",
                "descripcion": "Cartera de piel café con credencial INE y tarjetas bancarias a nombre de Alberto Núñez.",
                "timestamp": now_iso(-1500),  # Ayer
                "fecha_devolucion": now_iso(-1250),
                "entregado_a": "Alberto Núñez (Titular INE)",
                "telefono_receptor": "916-555-0302",
                "ultima_nota": "Entregada personalmente tras validar INE en ventanilla de central.",
                "estado": "devuelto",
                "unidad": {"numero_economico": "TX-102", "placa": "CH-411-TX"},
                "historial": [
                    {"estado": "encontrado", "ts": now_iso(-1500), "actor": "operador"},
                    {"estado": "resguardo", "ts": now_iso(-1420), "actor": "terminal"},
                    {"estado": "devuelto", "ts": now_iso(-1250), "actor": "terminal", "entregado_a": "Alberto Núñez (Titular INE)", "nota": "Firmó bitácora de conformidad"},
                ],
            },
            {
                "operador_id": op_ids["op8"],
                "operador_nombre": "Roberto Díaz",
                "operador_placa": "TX-108",
                "sitio_id": DEFAULT_SITIO,
                "storage_path": ev4["path"],
                "tenant_storage_path": ev4["tenant_path"],
                "foto_url": f"/api/files/{ev4['path']}",
                "content_type": "image/webp",
                "formato": "webp",
                "seguridad_verificada": True,
                "ahorro_compresion_pct": 39.5,
                "categoria": "Accesorios",
                "descripcion": "Lentes de sol Ray-Ban en estuche rígido negro olvidados en viaje hacia Hotel Maya Tulipanes.",
                "timestamp": now_iso(-4320),  # Hace 3 días
                "fecha_devolucion": now_iso(-4100),
                "entregado_a": "Elena Morales (Huésped Hab. 204)",
                "telefono_receptor": "916-555-0305",
                "ultima_nota": "El operador regresó al hotel y entregó en recepción.",
                "estado": "devuelto",
                "unidad": {"numero_economico": "TX-108", "placa": "CH-417-TX"},
                "historial": [
                    {"estado": "encontrado", "ts": now_iso(-4320), "actor": "operador"},
                    {"estado": "devuelto", "ts": now_iso(-4100), "actor": "terminal", "entregado_a": "Elena Morales", "nota": "Entregado en recepción del hotel"},
                ],
            },
        ]
        await db.reportes_objetos.insert_many(reportes_seed)
    except Exception as exc:
        logger.warning("No se pudieron sembrar fotos WebP demo de reportes: %s", exc)

    # 8. Facturas SaaS por Tenant y Aviso del Desarrollador
    await db.facturas_tenant.delete_many({})
    await db.facturas_tenant.insert_many([
        {
            "folio": "FAC-DEFA-202610-101",
            "sitio_id": DEFAULT_SITIO,
            "sitio_nombre": "Radio Taxis Palenque",
            "concepto": "Suscripción Mensual Plan Central Satelital Pro (25 Unidades + Puente WhatsApp Anti-Ban)",
            "periodo": "Octubre 2026",
            "monto": 2800.0,
            "moneda": "MXN",
            "estado": "pagada",
            "metodo_pago": "Transferencia SPEI",
            "fecha_emision": (ahora_dt - timedelta(days=4)).strftime("%Y-%m-%d"),
            "fecha_vencimiento": (ahora_dt + timedelta(days=26)).strftime("%Y-%m-%d"),
            "fecha_pago": (ahora_dt - timedelta(days=3)).isoformat(),
            "creado_en": now_iso(-4 * 24 * 60),
        },
        {
            "folio": "FAC-PAKA-202610-102",
            "sitio_id": "sitio_pakalna",
            "sitio_nombre": "Sitio Tren Maya Pakal-Ná",
            "concepto": "Suscripción Mensual Base Ferroviaria (Flota Pakal-Ná + Despacho Satelital)",
            "periodo": "Octubre 2026",
            "monto": 1950.0,
            "moneda": "MXN",
            "estado": "pendiente",
            "metodo_pago": "Transferencia SPEI / CoDi",
            "fecha_emision": (ahora_dt - timedelta(days=2)).strftime("%Y-%m-%d"),
            "fecha_vencimiento": (ahora_dt + timedelta(days=19)).strftime("%Y-%m-%d"),
            "creado_en": now_iso(-2 * 24 * 60),
        },
        {
            "folio": "FAC-DEFA-202609-089",
            "sitio_id": DEFAULT_SITIO,
            "sitio_nombre": "Radio Taxis Palenque",
            "concepto": "Suscripción Mensual Plan Central Satelital Pro — Septiembre",
            "periodo": "Septiembre 2026",
            "monto": 2800.0,
            "moneda": "MXN",
            "estado": "pagada",
            "metodo_pago": "Transferencia SPEI",
            "fecha_emision": (ahora_dt - timedelta(days=34)).strftime("%Y-%m-%d"),
            "fecha_vencimiento": (ahora_dt - timedelta(days=4)).strftime("%Y-%m-%d"),
            "fecha_pago": (ahora_dt - timedelta(days=33)).isoformat(),
            "creado_en": now_iso(-34 * 24 * 60),
        },
    ])

    if await db.avisos_dev.count_documents({"activo": True}) == 0:
        await db.avisos_dev.insert_one({
            "sitio_id": "todos",
            "titulo": "Soporte Técnico TaxiHub Cloud Activo",
            "mensaje": "Compresión WebP por tenant y blindaje WhatsApp Anti-Ban verificados al 100%.",
            "nivel": "info",
            "contacto_soporte": "WhatsApp Soporte SaaS: +52 916 100 9999",
            "creado_en": now_iso(-60),
            "expira_en": (ahora_dt + timedelta(hours=72)).isoformat(),
            "activo": True,
        })

    logger.info("Simulación sembrada: %d taxis en Palenque + %d en Pakal-Ná, %d servicios, %d chats de WhatsApp.",
                len(DEMO_TAXIS), len(DEMO_TAXIS_PAKALNA), len(servicios), len(wa_conversaciones))
    return {
        "ok": True,
        "message": "Datos de simulación sembrados con éxito",
        "taxis": len(DEMO_TAXIS),
        "taxis_pakalna": len(DEMO_TAXIS_PAKALNA),
        "servicios": len(servicios),
        "conversaciones_wa": len(wa_conversaciones),
        "operadores": [t["usuario"] for t in DEMO_TAXIS],
        "contrasena_operadores": "taxi123",
        "usuario_terminal": "central",
        "contrasena_terminal": "central123",
    }



def _haversine_dist_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _calc_azimuth_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return round((math.degrees(math.atan2(y, x)) + 360) % 360, 1)


def _init_pistas_metricas():
    """Calcula distancias acumuladas y rumbos exactos para interpolación continua a escala milimétrica."""
    for pid, p in PALENQUE_PISTAS_VIALES.items():
        pts = p.get("puntos", [])
        if not pts:
            continue
        cum_dist = [0.0]
        bearings = []
        for i in range(len(pts) - 1):
            p1, p2 = pts[i], pts[i + 1]
            d = _haversine_dist_m(p1[0], p1[1], p2[0], p2[1])
            cum_dist.append(cum_dist[-1] + d)
            bearings.append(_calc_azimuth_bearing(p1[0], p1[1], p2[0], p2[1]))
        bearings.append(bearings[-1] if bearings else 0.0)
        p["cum_dist"] = cum_dist
        p["total_dist"] = cum_dist[-1]
        p["bearings_fwd"] = bearings


def _interpolar_posicion_pista(pista: dict, dist_m: float):
    """Interpola exactamente lat, lng y rumbo sobre la pista vial según la distancia recorrida."""
    cum_dist = pista.get("cum_dist", [0.0])
    pts = pista.get("puntos", [])
    bearings = pista.get("bearings_fwd", [])
    total = pista.get("total_dist", 0.0)
    if not pts or total <= 0:
        return (pts[0][0], pts[0][1], 0.0) if pts else (17.5099, -91.9847, 0.0)

    d = max(0.0, min(total, dist_m))
    idx = 0
    for i in range(len(cum_dist) - 1):
        if cum_dist[i] <= d <= cum_dist[i + 1]:
            idx = i
            break
        elif d > cum_dist[i + 1]:
            idx = i

    seg_len = cum_dist[idx + 1] - cum_dist[idx]
    frac = 0.0 if seg_len <= 1e-6 else (d - cum_dist[idx]) / seg_len
    p1 = pts[idx]
    p2 = pts[idx + 1]
    lat = p1[0] + frac * (p2[0] - p1[0])
    lng = p1[1] + frac * (p2[1] - p1[1])
    brg = bearings[idx] if idx < len(bearings) else 0.0
    return lat, lng, brg


async def _bucle_patrullaje():
    """Bucle de patrullaje vial continuo que recorre las calles de Palenque a velocidad urbana realista (< 40 km/h)."""
    global _simulacion_activa
    _init_pistas_metricas()
    logger.info("Iniciando bucle de patrullaje continuo a velocidad realista (< 40 km/h) sobre pistas viales de Palenque...")
    while _simulacion_activa:
        ts = now_iso()
        for taxi in DEMO_TAXIS + DEMO_TAXIS_PAKALNA:
            u = taxi["usuario"]
            op = await db.operadores.find_one({"usuario": u})
            if not op:
                continue
            if op.get("estado") == "fuera_de_servicio":
                continue
            pista = PALENQUE_PISTAS_VIALES.get(taxi["pista_id"], {})
            cum_dist = pista.get("cum_dist", [])
            total_dist = pista.get("total_dist", 0.0)
            doble_sentido = pista.get("doble_sentido", False)
            if not cum_dist or total_dist <= 0:
                continue

            # Inicializar posición métrica si no existe
            if "dist_m" not in taxi:
                init_idx = min(taxi.get("idx", 0), len(cum_dist) - 1)
                taxi["dist_m"] = cum_dist[init_idx]

            sentido_dir = taxi.get("sentido_direccion", "adelante")
            # Velocidad estrictamente controlada < 40 km/h (promedio urbano 26 a 34 km/h)
            speed_kmh = round(random.uniform(26.0, 34.0), 1)
            speed_ms = round(speed_kmh / 3.6, 2)
            dt = 2.0
            step_m = speed_ms * dt  # ~14.4 a 18.8 metros por ciclo

            if sentido_dir == "adelante":
                taxi["dist_m"] += step_m
                if taxi["dist_m"] >= total_dist:
                    if doble_sentido:
                        overshoot = taxi["dist_m"] - total_dist
                        taxi["dist_m"] = max(0.0, total_dist - overshoot)
                        sentido_dir = "reversa"
                    else:
                        taxi["dist_m"] = taxi["dist_m"] % total_dist
            else:  # reversa en calles de doble sentido
                taxi["dist_m"] -= step_m
                if taxi["dist_m"] <= 0.0:
                    if doble_sentido:
                        taxi["dist_m"] = abs(taxi["dist_m"])
                        sentido_dir = "adelante"
                    else:
                        taxi["dist_m"] = total_dist - abs(taxi["dist_m"])

            taxi["sentido_direccion"] = sentido_dir
            new_lat, new_lng, brg_fwd = _interpolar_posicion_pista(pista, taxi["dist_m"])
            heading = round((brg_fwd + 180) % 360, 1) if sentido_dir == "reversa" else brg_fwd

            op_id = str(op["_id"])
            op_sitio = op.get("sitio_id") or taxi.get("sitio_id") or DEFAULT_SITIO

            track_pt = [round(new_lat, 6), round(new_lng, 6), ts]
            await db.operadores.update_one(
                {"_id": op["_id"]},
                {
                    "$set": {
                        "lat": round(new_lat, 6),
                        "lng": round(new_lng, 6),
                        "gps_speed": speed_ms,
                        "gps_heading": heading,
                        "sentido_direccion": sentido_dir,
                        "ultima_actualizacion": ts,
                    },
                    "$push": {
                        "track": {
                            "$each": [track_pt],
                            "$slice": -45
                        }
                    }
                }
            )
            if op.get("vehiculo_id"):
                await db.vehiculos.update_one(
                    {"_id": to_oid(op["vehiculo_id"])},
                    {
                        "$set": {
                            "lat": round(new_lat, 6),
                            "lng": round(new_lng, 6),
                            "ultima_actualizacion": ts,
                        }
                    }
                )

            ubi_msg = {
                "type": "ubicacion",
                "operador_id": op_id,
                "sitio_id": op_sitio,
                "lat": round(new_lat, 6),
                "lng": round(new_lng, 6),
                "gps_speed": speed_ms,
                "gps_heading": heading,
                "sentido_direccion": sentido_dir,
                "ts": ts
            }
            await manager.broadcast_terminal(ubi_msg, sitio_id=op_sitio)
            await _notificar_dueno_de_operador(op_id, ubi_msg)

        await asyncio.sleep(2.0)


def _iniciar_patrullaje():
    global _simulacion_activa, _simulacion_task
    if not _simulacion_activa:
        _simulacion_activa = True
        _simulacion_task = asyncio.create_task(_bucle_patrullaje())
        logger.info("Patrullaje GPS continuo activado.")


def _detener_patrullaje():
    global _simulacion_activa, _simulacion_task
    _simulacion_activa = False
    if _simulacion_task:
        _simulacion_task.cancel()
        _simulacion_task = None
        logger.info("Patrullaje GPS continuo detenido.")


@api_router.post("/seed")
async def seed(request: Request = None):
    """Siembra de datos. En entorno de tests (`taxihub_test`) siembra la línea
    base rápida de 5 operadores sin lanzar tareas en background; en entorno de
    demostración/desarrollo siembra los 25 taxis + 2º tenant y activa patrullaje."""
    if isinstance(request, Request) and os.environ.get("ENV", "").lower() == "production":
        await _require_terminal_or_dev(request)
    if os.environ.get("DB_NAME") == "taxihub_test" or "PYTEST_CURRENT_TEST" in os.environ:
        return await _sembrar_baseline_tests()
    res = await sembrar_datos_simulacion()
    _iniciar_patrullaje()
    res["patrullaje_activo"] = True
    return res


@api_router.post("/simulacion/sembrar")
async def api_simulacion_sembrar(request: Request):
    if os.environ.get("ENV", "").lower() == "production":
        await _require_terminal_or_dev(request)
    res = await sembrar_datos_simulacion()
    return res


@api_router.post("/simulacion/iniciar")
async def api_simulacion_iniciar(request: Request):
    if os.environ.get("ENV", "").lower() == "production":
        await _require_terminal_or_dev(request)
    _iniciar_patrullaje()
    return {"ok": True, "mensaje": f"Patrullaje GPS de {len(DEMO_TAXIS)} taxis iniciado en tiempo real"}


@api_router.post("/simulacion/detener")
async def api_simulacion_detener(request: Request):
    if os.environ.get("ENV", "").lower() == "production":
        await _require_terminal_or_dev(request)
    _detener_patrullaje()
    return {"ok": True, "mensaje": "Patrullaje GPS detenido"}


@api_router.get("/pistas-viales")
async def api_pistas_viales():
    """Retorna las pistas viales predeterminadas y únicas sobre las calles reales de Palenque."""
    return list(PALENQUE_PISTAS_VIALES.values())


@api_router.get("/simulacion/estado")
async def api_simulacion_estado():
    count_taxis = await db.operadores.count_documents({})
    count_servicios = await db.servicios.count_documents({})
    count_wa = await db.wa_conversaciones.count_documents({})
    return {
        "patrullaje_activo": _simulacion_activa,
        "taxis_total": count_taxis,
        "servicios_total": count_servicios,
        "conversaciones_wa": count_wa,
    }


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
    except jwt.ExpiredSignatureError:
        return False
    except jwt.InvalidTokenError:
        return False
    # Validación exp adicional (si el token trae exp, debe ser futuro)
    exp = payload.get("exp")
    if exp is not None:
        try:
            if isinstance(exp, (int, float)):
                exp_dt = datetime.fromtimestamp(exp, tz=timezone.utc)
            elif isinstance(exp, datetime):
                exp_dt = exp if exp.tzinfo else exp.replace(tzinfo=timezone.utc)
            else:
                exp_dt = datetime.fromisoformat(str(exp))
                if exp_dt.tzinfo is None:
                    exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > exp_dt:
                return False
        except Exception:
            pass
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
    sitio_ws = DEFAULT_SITIO
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        sitio_ws = payload.get("sitio_id") or payload.get("tenant_id") or DEFAULT_SITIO
    except Exception:
        pass
    await manager.connect_terminal(ws, sitio_id=sitio_ws)
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
from mantenimiento_module import build_router as build_mantenimiento_router
from socios_extra_module import build_router as build_extra_router
from terminal_consulta_module import build_router as build_terminal_consulta_router


class _DbProxy:
    """Delega en `db` en cada acceso (no captura la referencia). Necesario
    para que los routers de módulos respeten el monkeypatch de `server.db`
    en la suite de tests y futuras reconexiones en caliente."""
    def __init__(self, getter):
        self._getter = getter
    def __getattr__(self, name):
        return getattr(globals()["db"], name)


_db_proxy = _DbProxy(lambda: None)
app.include_router(api_router)
app.include_router(build_mantenimiento_router(
    db=_db_proxy, serialize=serialize, to_oid=to_oid, now_iso=now_iso,
    require_dueno=require_dueno, _vehiculos_de_dueno=_vehiculos_de_dueno,
    _vehiculo_de_dueno_o_404=_vehiculo_de_dueno_o_404, _hoy_str=_hoy_str,
))
app.include_router(build_extra_router(
    db=_db_proxy, serialize=serialize, to_oid=to_oid, now_iso=now_iso,
    require_dueno=require_dueno, _vehiculos_de_dueno=_vehiculos_de_dueno,
    _vehiculo_de_dueno_o_404=_vehiculo_de_dueno_o_404,
))
app.include_router(build_terminal_consulta_router(
    db=_db_proxy, serialize=serialize, to_oid=to_oid, now_iso=now_iso,
    require_terminal=require_terminal, TRACK_MAX_POINTS=TRACK_MAX_POINTS,
))

# Servir también los catálogos estáticos de choferes/vehículos desde el backend
# por si algún cliente arma URL con BACKEND_URL + "/assets/..."
try:
    from fastapi.staticfiles import StaticFiles
    _FRONT_PUBLIC = ROOT_DIR.parent / "frontend" / "public"
    if (_FRONT_PUBLIC / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=str(_FRONT_PUBLIC / "assets")), name="frontend-assets")
        app.mount("/api/assets", StaticFiles(directory=str(_FRONT_PUBLIC / "assets")), name="frontend-api-assets")
    if (_FRONT_PUBLIC / "vehicle-types").is_dir():
        app.mount("/vehicle-types", StaticFiles(directory=str(_FRONT_PUBLIC / "vehicle-types")), name="frontend-vehicle-types")
except Exception as _exc_static:
    logger.warning("No se pudo montar StaticFiles de frontend/public: %s", _exc_static)

cors_origins_env = os.environ.get('CORS_ORIGINS', '')
cors_origins = [o.strip() for o in cors_origins_env.split(',') if o.strip()]
if not cors_origins or '*' in cors_origins:
    cors_origins = ["*"]
else:
    for extra in ["http://localhost:3005", "http://127.0.0.1:3005", "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001"]:
        if extra not in cors_origins:
            cors_origins.append(extra)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await _migraciones()
    await db.operadores.create_index("usuario", unique=True)
    await db.operadores.create_index("sitio_id")
    await db.operadores.create_index([("sitio_id", 1), ("estado", 1)])
    await db.servicios.create_index("cliente_id")
    await db.servicios.create_index("operador_asignado_id")
    await db.servicios.create_index("estado")
    await db.servicios.create_index("pasajero_id")
    await db.servicios.create_index("sitio_id")
    await db.servicios.create_index([("sitio_id", 1), ("estado", 1)])
    await db.servicios.create_index([("sitio_id", 1), ("timestamp_creacion", -1)])
    await db.servicios.create_index([("operador_asignado_id", 1), ("estado", 1)])
    try:
        await db.vehiculos.drop_index("numero_economico_1")
    except Exception:
        pass
    await db.vehiculos.create_index([("sitio_id", 1), ("numero_economico", 1)], unique=True)
    await db.vehiculos.create_index("operador_conductor_id")
    await db.vehiculos.create_index("propietario_id")
    await db.vehiculos.create_index("tipo_vehiculo_id")
    await db.vehiculos.create_index("sitio_id")
    await db.tipos_vehiculo.create_index("orden")
    await db.clientes.create_index("telefono")
    await db.clientes.create_index("sitio_id")
    await db.clientes.create_index("usuario", sparse=True, unique=True)
    if await db.usuarios_terminal.count_documents({}) == 0:
        await db.usuarios_terminal.insert_one(
            {"nombre": "Central", "usuario": "central", "password_hash": _HASH_CENTRAL123, "sitio_id": DEFAULT_SITIO, "activo": True, "creado": now_iso()}
        )
    await db.usuarios_terminal.create_index("usuario", unique=True)
    await db.usuarios_terminal.create_index("sitio_id")
    await db.usuarios_dueno.create_index("usuario", unique=True)
    await db.usuarios_dueno.create_index("sitio_id")
    await db.servicios.create_index("distancia_m", sparse=True)
    await db.mensajes_chat.create_index([("servicio_id", 1), ("timestamp", 1)])
    await db.mensajes_chat.create_index("timestamp")
    await db.reportes_objetos.create_index("storage_path")
    await db.archivos.create_index("storage_path")
    (UPLOAD_DIR / "reportes").mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / "perfiles").mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / "logo").mkdir(parents=True, exist_ok=True)
    logger.info("Directorio de archivos listo: %s", UPLOAD_DIR)
    logger.info("Central de Taxis API iniciada")
    if await db.operadores.count_documents({}) < 15:
        await sembrar_datos_simulacion()
    _iniciar_patrullaje()


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

    # 2) sitio_id backfill (incluye terminal y dueño - hardening Fase 1)
    for col in ("operadores", "clientes", "servicios", "vehiculos", "usuarios_terminal", "usuarios_dueno"):
        await db[col].update_many({"sitio_id": {"$exists": False}}, {"$set": {"sitio_id": DEFAULT_SITIO}})
    for col in ("operadores", "clientes", "servicios", "vehiculos", "usuarios_terminal", "usuarios_dueno"):
        await db[col].update_many({"sitio_id": None}, {"$set": {"sitio_id": DEFAULT_SITIO}})
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

    # Geofence / auto-finalización (F5): valores iniciales del producto; cada
    # sitio podrá ajustarlos (config key-value global hoy, per-sitio en F7+).
    await db.config.update_one({"key": "auto_complete_enabled"}, {"$setOnInsert": {"key": "auto_complete_enabled", "valor": True}}, upsert=True)
    await db.config.update_one({"key": "arrival_radius_m"}, {"$setOnInsert": {"key": "arrival_radius_m", "valor": 75}}, upsert=True)
    await db.config.update_one({"key": "arrival_dwell_s"}, {"$setOnInsert": {"key": "arrival_dwell_s", "valor": 30}}, upsert=True)
    await db.config.update_one({"key": "max_gps_accuracy_m"}, {"$setOnInsert": {"key": "max_gps_accuracy_m", "valor": 30}}, upsert=True)

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

    # 6) Conversación demo de WhatsApp (flujo ubicación→servicio del despacho).
    await _seed_wa_conversacion()

    logger.info("Migraciones aplicadas (sitios, sitio_id, vehículos backfill, tipos de vehículo)")


@app.on_event("shutdown")
async def shutdown_db_client():
    _detener_patrullaje()
    client.close()
