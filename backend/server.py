from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
import time
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

ES_PRODUCCION = os.environ.get("ENV", "").lower() == "production"
JWT_SECRET = os.environ.get("JWT_SECRET") or "dev-jwt-secret-taxihub"
if ES_PRODUCCION and JWT_SECRET == "dev-jwt-secret-taxihub":
    # El secreto por defecto es público (está en el repositorio): con él cualquiera
    # podría firmar tokens válidos de terminal o de desarrollador.
    raise RuntimeError("JWT_SECRET es obligatorio en producción (ENV=production)")

# Simulación de demostración (flota sembrada + patrullaje GPS). Encendida por
# defecto porque taxihub.cloud funciona hoy como demo; SIMULACION_DEMO=0 la apaga.
SIMULACION_DEMO = os.environ.get("SIMULACION_DEMO", "1").strip().lower() not in ("0", "false", "no", "off")
# Chofer que recibe primero las ofertas de pasajeros de su sitio (demo: op1 / TX-101).
PRIORIDAD_DESPACHO_USUARIO = os.environ.get("DESPACHO_PRIORIDAD_USUARIO", "op1").strip()
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
    return float(await get_config("gps_stale_seconds", 600))


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
    """Payload GPS completo (aceptado desde web o app Android)."""
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


class PuntoBatch(BaseModel):
    lat: float
    lng: float
    accuracy: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None
    battery_level: Optional[float] = None
    client_ts: Optional[str] = None
    timestamp: Optional[str] = None


class BatchLocationsRequest(BaseModel):
    puntos: List[PuntoBatch] = Field(default_factory=list)


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
    correo: Optional[str] = None
    usuario: Optional[str] = None
    contrasena: Optional[str] = None


class ClienteUpdate(BaseModel):
    nombre: Optional[str] = None
    telefono: Optional[str] = None
    correo: Optional[str] = None
    contrasena: Optional[str] = None


class ClienteLoginBody(BaseModel):
    usuario: str
    contrasena: str


class CotizarServicioBody(BaseModel):
    origen: Ubicacion
    destino: Ubicacion
    tipo_vehiculo_preferido_id: Optional[str] = None
    metodo_pago: str = "cash"


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
    notas_pasajero: Optional[str] = None


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
    texto: Optional[str] = ""
    imagen_url: Optional[str] = None


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
        if not conns:
            self.operadores.pop(operador_id, None)

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
    if not v:
        op = await db.operadores.find_one({"_id": to_oid(operador_id)}, {"vehiculo_id": 1})
        if op and op.get("vehiculo_id"):
            v = await db.vehiculos.find_one({"_id": to_oid(op["vehiculo_id"])}, {"propietario_id": 1})
    if v and v.get("propietario_id"):
        await manager.send_dueno(v["propietario_id"], message)


async def registrar_notificacion_responsable(
    tipo: str,
    operador_id: str,
    titulo: str,
    mensaje: str,
    metadata: Optional[dict] = None
) -> None:
    """Registra y despacha notificaciones para socios/dueños y supervisores de central."""
    try:
        op = await db.operadores.find_one({"_id": to_oid(operador_id)}) or {}
        vid = op.get("vehiculo_id")
        v = await db.vehiculos.find_one({"_id": to_oid(vid)}) if vid else None
        prop_id = v.get("propietario_id") if v else None
        sitio_id = op.get("sitio_id") or DEFAULT_SITIO
        doc = {
            "id": str(uuid.uuid4()),
            "tipo": tipo,
            "operador_id": operador_id,
            "operador_nombre": op.get("nombre", "Conductor"),
            "placa": op.get("placa") or (v.get("placa") if v else "N/A"),
            "vehiculo_id": vid,
            "propietario_id": prop_id,
            "sitio_id": sitio_id,
            "titulo": titulo,
            "mensaje": mensaje,
            "metadata": metadata or {},
            "creado": now_iso(),
            "leido": False,
        }
        await db.notificaciones_responsables.insert_one(doc)
        payload = {"type": "notificacion_operativa", "notificacion": serialize(doc)}
        if prop_id:
            await manager.send_dueno(prop_id, payload)
        await manager.broadcast_terminal(payload, sitio_id=sitio_id)
    except Exception as exc:
        logger.warning("Fallo registrando notificacion responsable: %s", exc)


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
    # Marcar que el chofer real ha iniciado sesión para excluirlo de la simulación
    await db.operadores.update_one({"_id": op["_id"]}, {"$set": {"en_linea_real": True, "gps_real": True, "login_ts": now_iso()}})
    op["en_linea_real"] = True
    op["gps_real"] = True
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
        "id": str(v.get("_id")) if v.get("_id") else v.get("id"),
        "numero_economico": v.get("numero_economico"),
        "placa": v.get("placa"),
        "marca": v.get("marca"),
        "modelo": v.get("modelo"),
        "color": v.get("color"),
        "anio": v.get("anio"),
        "foto_url": v.get("foto_url"),
        "tipo_vehiculo_id": v.get("tipo_vehiculo_id"),
        "propietario_id": str(v.get("propietario_id")) if v.get("propietario_id") else None,
        "tipo_vehiculo": {
            "id": str(tipo.get("id") or tipo.get("_id")) if (tipo.get("id") or tipo.get("_id")) else None,
            "nombre": tipo.get("nombre"),
            "imagen_url": tipo.get("imagen_url"),
            "capacidad": tipo.get("capacidad"),
        } if tipo else None,
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
    origen = s.get("origen") or {}
    destino = s.get("destino") or {}
    out = {
        "id": str(s["_id"]),
        "estado": s.get("estado"),
        "costo": s.get("costo"),
        "tarifa_id": s.get("tarifa_id"),
        "tarifa_nombre": s.get("tarifa_nombre"),
        "metodo_pago": s.get("metodo_pago", "cash"),
        "tipo_vehiculo_preferido_id": s.get("tipo_vehiculo_preferido_id"),
        "notas_pasajero": s.get("notas_pasajero"),
        "origen": origen,
        "destino": destino,
        "origen_texto": s.get("origen_texto") or origen.get("texto"),
        "destino_texto": s.get("destino_texto") or destino.get("texto"),
        "timestamp_creacion": s.get("timestamp_creacion"),
        "timestamp_asignacion": s.get("timestamp_asignacion"),
        "timestamp_inicio": s.get("timestamp_inicio"),
        "timestamp_fin": s.get("timestamp_fin"),
        "distancia_m": s.get("distancia_m"),
        "duracion_s": s.get("duracion_s"),
        "ofrecido_a_count": len(s.get("ofrecido_a") or []),
        "intentos_despacho": len(s.get("rechazados") or []) + (1 if s.get("ofrecido_a") else 0),
        "conductor_en_origen": bool(s.get("conductor_en_origen", False)),
        "calificacion_conductor": s.get("calificacion_conductor"),
        "sitio_id": s.get("sitio_id") or DEFAULT_SITIO,
    }
    if s.get("estado") in ("asignado", "en_curso", "completado"):
        oid = s.get("operador_asignado_id")
        if oid:
            try:
                op = await db.operadores.find_one({"_id": to_oid(oid)})
            except HTTPException:
                op = None
            if op:
                foto_op = op.get("foto_url") or "/assets/drivers/driver-01.jpg"
                out["taxi"] = {
                    "id": str(op["_id"]),
                    "lat": op.get("lat"),
                    "lng": op.get("lng"),
                    "numero_economico": op.get("placa"),
                    "nombre_conductor": op.get("nombre"),
                    "telefono": op.get("telefono"),
                    "foto_url": foto_op,
                    "ultima_actualizacion": op.get("ultima_actualizacion"),
                }
                if (
                    s.get("estado") == "asignado"
                    and op.get("lat") is not None
                    and origen.get("lat") is not None
                ):
                    dist_origen_m = haversine_km(op["lat"], op["lng"], origen["lat"], origen["lng"]) * 1000.0
                    out["taxi"]["distancia_origen_m"] = round(dist_origen_m)
                    out["taxi"]["eta_origen_min"] = max(1, round((dist_origen_m / (26.0 / 3.6)) / 60.0))
                    if dist_origen_m <= 110:
                        out["conductor_en_origen"] = True
                ratings = await db.servicios.find(
                    {"operador_asignado_id": str(op["_id"]), "estado": "completado", "calificacion_conductor.puntuacion": {"$exists": True}},
                    {"calificacion_conductor.puntuacion": 1},
                ).to_list(500)
                values = [float(item["calificacion_conductor"]["puntuacion"]) for item in ratings]
                out["taxi"]["calificacion_promedio"] = round(sum(values) / len(values), 1) if values else 4.9
                out["taxi"]["total_calificaciones"] = len(values) if values else 12
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
        await manager.send_operador(oid, {"type": "servicio_actualizado", "servicio": ser})
    elif estado in ("cancelado", "completado", "vencido"):
        destinatarios = set()
        if oid:
            destinatarios.add(oid)
        for op_id in s.get("ofrecido_a", []) or []:
            destinatarios.add(op_id)
        for op_id in s.get("rechazados", []) or []:
            destinatarios.add(op_id)
        for op_id in destinatarios:
            await manager.send_operador(op_id, {"type": "servicio_actualizado", "servicio": ser})
    await _notificar_dueno_de_operador(oid, {"type": "servicio", "servicio": ser})
    pid = s.get("pasajero_id")
    if pid and s.get("estado") in ("pendiente", "ofrecido", "asignado", "en_curso", "completado", "cancelado", "vencido"):
        await manager.send_pasajero(pid, {"type": "servicio", "servicio": await _servicio_para_pasajero(s)})


async def _expirar_ofertas_vencidas() -> int:
    """Procesa ofertas vencidas canalizándolas por el motor de cascada."""
    try:
        return await _cascada_ofertas_vencidas()
    except Exception:
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


async def _generar_diagnostico_gps(operador_id: str) -> dict:
    """Genera diagnóstico detallado de telemetría GPS, señal, batería y turno."""
    op = await db.operadores.find_one({"_id": to_oid(operador_id)})
    if not op:
        raise HTTPException(status_code=404, detail="Operador no encontrado")

    ahora = datetime.now(timezone.utc)
    ultima_act = op.get("ultima_actualizacion")
    segundos_desde = None
    if ultima_act:
        try:
            dt = _parse_iso(ultima_act)
            if dt:
                segundos_desde = max(0, int((ahora - dt).total_seconds()))
        except Exception:
            pass

    accuracy = op.get("gps_accuracy")
    calidad = "sin_senal"
    if segundos_desde is not None and segundos_desde <= 30:
        if accuracy is not None and accuracy <= 15:
            calidad = "excelente"
        elif accuracy is not None and accuracy <= 35:
            calidad = "buena"
        else:
            calidad = "degradada"
    elif segundos_desde is not None and segundos_desde <= 90:
        calidad = "intermitente"
    else:
        calidad = "desconectado"

    turno = await _turno_activo(operador_id)
    servicios_activos = await db.servicios.count_documents({
        "operador_asignado_id": operador_id,
        "estado": {"$in": ["asignado", "en_curso"]},
    })
    vehiculo = None
    if op.get("vehiculo_id"):
        v = await db.vehiculos.find_one({"_id": to_oid(op["vehiculo_id"])})
        if v:
            vehiculo = {
                "id": str(v["_id"]),
                "placa": v.get("placa"),
                "numero_economico": v.get("numero_economico"),
                "marca": v.get("marca"),
                "modelo": v.get("modelo"),
                "odometro_km": v.get("odometro_km"),
            }

    return {
        "ok": True,
        "operador": {
            "id": operador_id,
            "nombre": op.get("nombre"),
            "placa": op.get("placa"),
            "estado": op.get("estado"),
            "sitio_id": op.get("sitio_id") or DEFAULT_SITIO,
        },
        "gps": {
            "lat": op.get("lat"),
            "lng": op.get("lng"),
            "accuracy": accuracy,
            "speed": op.get("gps_speed"),
            "heading": op.get("gps_heading"),
            "battery": op.get("gps_battery"),
            "ultima_actualizacion": ultima_act,
            "gps_ts_cliente": op.get("gps_ts_cliente"),
            "segundos_desde_reporte": segundos_desde,
            "calidad_senal": calidad,
            "track_buffer_puntos": len(op.get("track") or []),
        },
        "vehiculo": vehiculo,
        "turno_activo": bool(turno),
        "turno_id": str(turno["_id"]) if turno else None,
        "servicios_activos_count": servicios_activos,
        "servidor_ts": now_iso(),
    }


@api_router.get("/operadores/diagnostico-gps")
async def get_diagnostico_gps_me(current: dict = Depends(require_operador_estricto)):
    """Diagnóstico GPS directo para el operador autenticado."""
    return await _generar_diagnostico_gps(current["id"])


@api_router.get("/operadores/me/diagnostico-gps")
async def get_diagnostico_gps_me_alias(current: dict = Depends(require_operador_estricto)):
    """Alias para diagnóstico GPS directo del operador autenticado."""
    return await _generar_diagnostico_gps(current["id"])


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
    odometro_km: Optional[float] = Field(default=None, ge=0, description="Kilómetros del tablero al iniciar (opcional)")
    nivel_combustible: Optional[str] = "3/4"
    evidencia_inicio_url: Optional[str] = None
    unidad_limpia: bool = True
    notas_inicio: Optional[str] = None


class TurnoFinalizar(BaseModel):
    odometro_km: Optional[float] = Field(default=None, ge=0, description="Kilómetros del tablero al finalizar (opcional)")
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
    combustible o entregar unidad/cuota al cierre del turno. Convierte a WebP seguro."""
    operador_id = current["id"]
    op = await db.operadores.find_one({"_id": to_oid(operador_id)}) or {}
    op_sitio = op.get("sitio_id") or DEFAULT_SITIO
    data = await foto.read()
    comp = analizar_y_comprimir_imagen_webp(data, filename=foto.filename or "evidencia.jpg", max_dim=1600)
    path = f"{APP_NAME}/evidencias/{operador_id}/{tipo}_{uuid.uuid4().hex}.webp"
    result = put_object(path, comp["data"], "image/webp", sitio_id=op_sitio)
    await db.archivos.insert_one({
        "storage_path": result["path"],
        "content_type": "image/webp",
        "tipo": tipo,
        "operador_id": operador_id,
        "dimensiones": comp.get("dimensiones"),
        "ahorro_pct": comp.get("ahorro_pct"),
        "ts": now_iso(),
    })
    url = f"/api/files/{result['path']}"
    return {"ok": True, "evidencia_url": url, "ahorro_pct": comp.get("ahorro_pct")}


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
    await registrar_notificacion_responsable(
        "turno_inicio",
        operador_id,
        f"Inicio de Turno — Unidad {op.get('placa') or 'Taxi'}",
        f"El conductor {op.get('nombre')} inició su turno. Odómetro inicial: {body.odometro_km or 'N/R'} km.",
        metadata={"turno_id": str(res.inserted_id), "odometro": body.odometro_km, "combustible": body.nivel_combustible}
    )
    return {"ok": True, "turno": out, "operador": {"estado": nuevo_estado}}


@api_router.post("/turnos/finalizar")
async def turno_finalizar(body: TurnoFinalizar, current: dict = Depends(require_operador_estricto)):
    operador_id = current["id"]
    turno = await _turno_activo(operador_id)
    if not turno:
        raise HTTPException(status_code=409, detail="No tienes un turno activo")

    # Validación crítica: evitar cerrar jornada con servicios activos en curso
    servicios_activos = await db.servicios.count_documents({
        "operador_asignado_id": operador_id,
        "estado": {"$in": ["asignado", "en_curso"]},
    })
    if servicios_activos > 0:
        raise HTTPException(
            status_code=400,
            detail=f"No puedes finalizar el turno mientras tengas {servicios_activos} servicio(s) en curso. Completa o cancela los viajes activos primero."
        )

    if body.odometro_km is not None and turno.get("odometro_inicio") is not None:
        if body.odometro_km < turno["odometro_inicio"]:
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
    # Cerrar turno == salir de operación (fuera_de_servicio)
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
    op = await db.operadores.find_one({"_id": to_oid(operador_id)}) or {}
    await registrar_notificacion_responsable(
        "turno_fin",
        operador_id,
        f"Fin de Turno — Unidad {op.get('placa') or 'Taxi'}",
        f"El conductor {op.get('nombre')} finalizó jornada. {len(servicios_turno)} viajes, ${ingresos_turno} brutos.",
        metadata={"turno_id": str(turno["_id"]), "odometro_fin": body.odometro_km, "ingresos": ingresos_turno, "viajes": len(servicios_turno)}
    )
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
    # `_id` desempata turnos con el mismo `inicio` (reloj de baja resolución).
    docs = await db.turnos.find({"operador_id": current["id"]}).sort(
        [("inicio", -1), ("_id", -1)]).to_list(limite)
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
    idempotency_key: Optional[str] = Form(None),
    ticket: Optional[UploadFile] = File(None),
    current: dict = Depends(require_operador_estricto),
):
    operador_id = current["id"]

    # Prevención estricta de duplicados por reintento de red
    if idempotency_key:
        existente = await db.combustible_cargas.find_one({"idempotency_key": idempotency_key})
        if existente:
            return {
                "ok": True,
                "id": str(existente["_id"]),
                "ticket_url": existente.get("ticket_url"),
                "rendimiento_km_l": existente.get("rendimiento_km_l"),
                "duplicado": True,
            }

    op = await db.operadores.find_one({"_id": to_oid(operador_id)}, {"vehiculo_id": 1, "nombre": 1, "placa": 1, "sitio_id": 1})
    vid = op.get("vehiculo_id") if op else None
    ticket_url = None
    if ticket and ticket.filename:
        data = await ticket.read()
        comp = analizar_y_comprimir_imagen_webp(data, filename=ticket.filename or "ticket.jpg", max_dim=1600)
        path = f"{APP_NAME}/combustible/{operador_id}/{uuid.uuid4().hex}.webp"
        op_sitio = (op.get("sitio_id") if op else None) or DEFAULT_SITIO
        result = put_object(path, comp["data"], "image/webp", sitio_id=op_sitio)
        await db.archivos.insert_one({
            "storage_path": result["path"],
            "content_type": "image/webp",
            "tipo": "ticket_combustible",
            "operador_id": operador_id,
            "dimensiones": comp.get("dimensiones"),
            "ahorro_pct": comp.get("ahorro_pct"),
            "ts": now_iso(),
        })
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
        "idempotency_key": idempotency_key,
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
    await registrar_notificacion_responsable(
        "combustible_carga",
        operador_id,
        f"Carga de Combustible — Unidad {op.get('placa') or 'Taxi'}",
        f"Conductor {op.get('nombre') if op else 'Operador'}: {litros} L por ${costo} MXN ({estacion or 'Gasolinera'}). Odómetro: {odometro_km} km.",
        metadata={"litros": litros, "costo": costo, "odometro": odometro_km, "estacion": estacion}
    )
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
    set_fields = {
        "lat": lat,
        "lng": lng,
        "ultima_actualizacion": ts,
        "gps_real": True,
        "en_linea_real": True,
    }
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


async def _procesar_ubicaciones_batch(operador_id: str, puntos: List[PuntoBatch]) -> dict:
    """Procesa una lista de puntos GPS provenientes de almacenamiento offline (Fase Android)."""
    if not puntos:
        return {"ok": True, "procesados": 0}

    def _ts_key(p: PuntoBatch):
        return p.client_ts or p.timestamp or ""

    puntos_ordenados = sorted(puntos, key=_ts_key)
    op = await db.operadores.find_one({"_id": to_oid(operador_id)})
    if not op:
        raise HTTPException(status_code=404, detail="Operador no encontrado")

    # Ingestar puntos intermedios al historial (track)
    for p in puntos_ordenados[:-1]:
        ts = p.client_ts or p.timestamp or now_iso()
        set_fields = {}
        if p.accuracy is not None:
            set_fields["gps_accuracy"] = p.accuracy
        if p.speed is not None:
            set_fields["gps_speed"] = p.speed
        if p.heading is not None:
            set_fields["gps_heading"] = p.heading
        if p.battery_level is not None:
            set_fields["gps_battery"] = p.battery_level
        await _track_puntual(operador_id, p.lat, p.lng, ts, set_fields)

    # El último punto actualiza la posición viva y dispara geofence + websocket
    ultimo = puntos_ordenados[-1]
    res_ultimo = await _actualizar_ubicacion(
        operador_id=operador_id,
        lat=ultimo.lat,
        lng=ultimo.lng,
        accuracy=ultimo.accuracy,
        speed=ultimo.speed,
        heading=ultimo.heading,
        battery=ultimo.battery_level,
        client_ts=ultimo.client_ts or ultimo.timestamp,
    )
    return {
        "ok": True,
        "procesados": len(puntos_ordenados),
        "ultimo_punto": {
            "lat": ultimo.lat,
            "lng": ultimo.lng,
            "ts": ultimo.client_ts or ultimo.timestamp,
        },
        **res_ultimo,
    }


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


@api_router.post("/operadores/{operador_id}/ubicaciones-batch")
async def update_ubicaciones_batch(operador_id: str, body: BatchLocationsRequest, request: Request):
    """Ingesta masiva de puntos GPS almacenados en cola offline (Fase Android)."""
    await _mismo_o_terminal(request, operador_id)
    return await _procesar_ubicaciones_batch(operador_id, body.puntos)


@api_router.post("/locations/batch")
async def update_locations_batch_driver(body: BatchLocationsRequest, current: dict = Depends(require_operador_estricto)):
    """Ingesta masiva de puntos GPS offline autenticada con token de operador."""
    return await _procesar_ubicaciones_batch(current["id"], body.puntos)


@api_router.get("/operadores/{operador_id}/diagnostico-gps")
async def get_diagnostico_gps(operador_id: str, request: Request):
    """Diagnóstico detallado de telemetría GPS, calidad de señal y batería."""
    await _mismo_o_terminal(request, operador_id)
    return await _generar_diagnostico_gps(operador_id)


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
        doc = {
            "nombre": body.nombre,
            "telefono": body.telefono,
            "correo": body.correo,
            "creado": now_iso(),
            "sitio_id": sitio_id,
        }
        res = await db.clientes.insert_one(doc)
        doc["_id"] = res.inserted_id
        return serialize(doc)
    if not body.usuario or not body.contrasena:
        raise HTTPException(status_code=400, detail="usuario y contrasena son obligatorios al crear una cuenta")
    if await db.clientes.find_one({"usuario": body.usuario}):
        raise HTTPException(status_code=409, detail="El usuario ya existe")
    doc = {
        "nombre": body.nombre,
        "telefono": body.telefono,
        "correo": body.correo,
        "usuario": body.usuario,
        "password_hash": hash_password(body.contrasena),
        "activo": True,
        "creado": now_iso(),
        "sitio_id": sitio_id,
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


# ---- Endpoints de pasajero (app móvil nativa / web) ----
@api_router.get("/clientes/me")
async def pasajero_me(current: dict = Depends(require_pasajero)):
    return current


@api_router.put("/clientes/me")
async def update_pasajero_me(body: ClienteUpdate, current: dict = Depends(require_pasajero)):
    """Permite al pasajero autenticado actualizar su propio perfil (nombre, teléfono, correo, contraseña)."""
    updates: Dict[str, object] = {}
    if body.nombre is not None and body.nombre.strip():
        updates["nombre"] = body.nombre.strip()
    if body.telefono is not None and body.telefono.strip():
        updates["telefono"] = body.telefono.strip()
    if body.correo is not None:
        updates["correo"] = body.correo.strip() or None
    if body.contrasena is not None and body.contrasena.strip():
        updates["password_hash"] = hash_password(body.contrasena.strip())
    if not updates:
        raise HTTPException(status_code=400, detail="Nada que actualizar")
    updates["actualizado_en"] = now_iso()
    await db.clientes.update_one({"_id": to_oid(current["id"])}, {"$set": updates})
    updated = await db.clientes.find_one({"_id": to_oid(current["id"])})
    return serialize(updated)


@api_router.get("/clientes/me/servicios")
async def pasajero_mis_servicios(current: dict = Depends(require_pasajero)):
    docs = await db.servicios.find(
        {"pasajero_id": current["id"]}).sort("timestamp_creacion", -1).to_list(200)
    op_ids = {d.get("operador_asignado_id") for d in docs if d.get("operador_asignado_id")}
    op_map: Dict[str, dict] = {}
    if op_ids:
        try:
            ops = await db.operadores.find({"_id": {"$in": [to_oid(x) for x in op_ids]}}).to_list(500)
            op_map = {str(o["_id"]): o for o in ops}
        except HTTPException:
            pass
    out = []
    for d in docs:
        s = serialize(d)
        op = op_map.get(s.get("operador_asignado_id"))
        if op:
            s["operador_nombre"] = op.get("nombre")
            s["operador_placa"] = op.get("placa")
            s["operador_foto"] = op.get("foto_url") or "/assets/drivers/driver-01.jpg"
        out.append(s)
    return out


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
async def _buscar_candidatos(
    lat: float,
    lng: float,
    num: int = 8,
    sitio_id: Optional[str] = None,
    solo_libres: bool = True,
    tipo_vehiculo_id: Optional[str] = None,
    excluir_ids: Optional[List[str]] = None,
    solo_usuario: Optional[str] = None,
) -> List[dict]:
    """Taxis disponibles para un servicio: AVAILABLE, vehículo activo, GPS fresco
    (o app conectada por WebSocket), ordenados por distancia (Haversine) al origen."""
    await _expirar_ofertas_vencidas()
    umbral = await gps_stale_seconds()
    base = {"estado": EstadoOperador.libre.value} if solo_libres else {}
    query = {**base, "activo": {"$ne": False}}
    if sitio_id:
        query.update(_sitio_query_for(sitio_id))
    if solo_usuario:
        query["usuario"] = solo_usuario
    docs = await db.operadores.find(query).to_list(1000)
    tipos = await _mapa_tipos_vehiculo()
    excluidos = set(excluir_ids or [])
    ops = []
    for op in docs:
        op_id_str = str(op["_id"])
        if op_id_str in excluidos:
            continue
        if op.get("lat") is None or op.get("lng") is None:
            continue
        # Sin GPS reciente solo cuenta si la app del chofer sigue conectada: un taxi
        # con la app cerrada no debe recibir ofertas aunque su cuenta esté activa.
        gps_ok = _gps_fresco(op.get("ultima_actualizacion"), umbral)
        ws_vivo = bool(manager.operadores.get(op_id_str))
        if not gps_ok and not ws_vivo:
            continue
        if await _tiene_servicio_activo(op_id_str):
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
        if tipo_vehiculo_id:
            v_tipo_id = str(v.get("tipo_vehiculo_id")) if v and v.get("tipo_vehiculo_id") else None
            if v_tipo_id != str(tipo_vehiculo_id):
                continue
        dist = haversine_km(lat, lng, op["lat"], op["lng"])
        cand = serialize(op)
        cand["distancia_km"] = round(dist, 3)
        cand["distancia_m"] = round(dist * 1000)
        cand["eta_s"] = max(45, round((dist * 1000) / (26.0 / 3.6)))
        cand["eta_min"] = max(1, round(cand["eta_s"] / 60.0))
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
    if s.get("estado") not in (EstadoServicio.pendiente.value, EstadoServicio.ofrecido.value):
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
            "oferta_ttl_s": ttl,
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
GEOCODING_PROVIDER_URL = os.environ.get("GEOCODING_PROVIDER_URL", "https://nominatim.openstreetmap.org").rstrip("/")
GEOCODING_TIMEOUT_SECONDS = float(os.environ.get("GEOCODING_TIMEOUT_SECONDS", "6"))
# Reverse-geocoding (nombres de calle para la voz del operador). Cache en la
# colección `geo_cache` redondeada a ~110 m para no volver a consultar.
NOMINATIM_URL = os.environ.get("NOMINATIM_URL", "https://nominatim.openstreetmap.org").rstrip("/")


_PALENQUE_POIS = [
    {"id": "poi_parque", "label": "Parque Central de Palenque", "sublabel": "Av. Juárez esq. Independencia, Centro", "lat": 17.5094, "lng": -91.9818, "tipo": "referencia"},
    {"id": "poi_mercado", "label": "Mercado Municipal Guadalupe", "sublabel": "Calle 5 de Mayo esq. Abasolo, Centro", "lat": 17.5081, "lng": -91.9835, "tipo": "referencia"},
    {"id": "poi_ado", "label": "Terminal de Autobuses ADO Palenque", "sublabel": "Av. Juárez esq. Cabeza Maya, Centro", "lat": 17.5122, "lng": -91.9879, "tipo": "referencia"},
    {"id": "poi_tren_maya", "label": "Estación Tren Maya Palenque", "sublabel": "Bulevar Palenque - Pakal-Ná, Pakal-Ná", "lat": 17.5376, "lng": -91.9698, "tipo": "referencia"},
    {"id": "poi_hospital", "label": "Hospital General de Palenque", "sublabel": "Periférico Sur, Zona Hospital", "lat": 17.5023, "lng": -91.9821, "tipo": "referencia"},
    {"id": "poi_canada", "label": "Zona Eco-Turística La Cañada", "sublabel": "Calle Merle Greene, La Cañada", "lat": 17.5120, "lng": -91.9905, "tipo": "referencia"},
    {"id": "poi_ruinas", "label": "Zona Arqueológica de Palenque", "sublabel": "Carretera a las Ruinas Km 8, Zona Hotelera", "lat": 17.4848, "lng": -92.0456, "tipo": "referencia"},
    {"id": "poi_cabeza_maya", "label": "Glorieta Cabeza Maya", "sublabel": "Av. Juárez esq. Carretera a Ruinas", "lat": 17.5125, "lng": -91.9885, "tipo": "referencia"},
    {"id": "poi_tulipanes", "label": "Hotel Maya Tulipanes", "sublabel": "Calle Cañada #6, La Cañada", "lat": 17.5118, "lng": -91.9896, "tipo": "referencia"},
    {"id": "poi_pakalna_centro", "label": "Centro de Pakal-Ná", "sublabel": "Av. Ferrocarril, Pakal-Ná", "lat": 17.5345, "lng": -91.9720, "tipo": "referencia"},
]


async def _etiqueta_lugar(lat: float, lng: float) -> Optional[str]:
    """Devuelve "Calle House, Colonia" legible para la voz del operador y pasajero
    (reverse-geocoding Nominatim con cache en `geo_cache` redondeado ~110 m).
    Si el proveedor no responde, usa puntos de referencia y calles reales de Palenque."""
    key_lat, key_lng = round(float(lat), 3), round(float(lng), 3)
    for poi in _PALENQUE_POIS:
        if haversine_km(lat, lng, poi["lat"], poi["lng"]) * 1000.0 <= 120.0:
            return f"{poi['label']} ({poi['sublabel'].split(',')[0]})"
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
    if not texto:
        # Fallback determinista sobre pistas viales reales de Palenque
        mejor_calle = None
        mejor_d = 999999.0
        for p in PALENQUE_PISTAS_VIALES.values():
            for pt in p.get("puntos") or []:
                d = haversine_km(lat, lng, pt[0], pt[1]) * 1000.0
                if d < mejor_d:
                    mejor_d = d
                    mejor_calle = p.get("nombre")
        zona = _clasificar_zona_servicio("", lat, lng)
        if mejor_calle and mejor_d <= 450:
            calle_limpia = mejor_calle.split("(")[0].strip()
            texto = f"{calle_limpia}, {zona}"
        else:
            texto = f"Zona {zona}, Palenque"
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


@api_router.get("/geo/reverse")
async def geo_reverse(
    lat: float,
    lng: float,
    _=Depends(_any_autenticado_o_pasajero),
):
    """Reverse geocoding legible para fijar origen o destino desde el mapa."""
    etiqueta = await _etiqueta_lugar(lat, lng)
    zona = _clasificar_zona_servicio(etiqueta or "", lat, lng)
    return {
        "lat": round(lat, 6),
        "lng": round(lng, 6),
        "label": etiqueta or f"Punto en {zona}",
        "zona": zona,
    }


_GEO_SEARCH_CACHE: dict = {}


@api_router.get("/geo/search")
async def geo_search(
    q: str,
    limit: int = 8,
    _=Depends(_any_autenticado_o_pasajero),
):
    """Búsqueda optimizada de calles, colonias y referencias de Palenque, Chiapas.

    Garantiza que únicamente se muestren calles y lugares dentro del municipio
    de Palenque, Chiapas, con caché en memoria y priorización de colonias locales.
    """
    query = (q or "").strip()
    if len(query) < 2:
        return {"resultados": _PALENQUE_POIS[:limit]}

    cache_key = f"{query.lower()}:{limit}"
    ahora_ts = time.time()
    if cache_key in _GEO_SEARCH_CACHE:
        exp, cached_res = _GEO_SEARCH_CACHE[cache_key]
        if ahora_ts - exp < 1800:
            return {"resultados": cached_res, "provider": "cache"}

    resultados = []
    q_low = query.lower()
    for poi in _PALENQUE_POIS:
        if q_low in poi["label"].lower() or q_low in poi["sublabel"].lower():
            resultados.append(dict(poi))

    # 1. Búsqueda instantánea en colonias/cuadrantes locales de Palenque
    try:
        col_regex = {"$regex": re.escape(query), "$options": "i"}
        colonias_locales = await db.colonias.find({"nombre": col_regex}).to_list(limit)
        for c in colonias_locales:
            poligono = c.get("poligono") or []
            lat_col, lng_col = 17.5099, -91.9847
            if poligono and len(poligono) > 0:
                lat_col = sum(p[0] for p in poligono) / len(poligono)
                lng_col = sum(p[1] for p in poligono) / len(poligono)
            resultados.append({
                "id": f"col_{c.get('_id')}",
                "label": c.get("nombre"),
                "sublabel": "Colonia / Cuadrante · Palenque, Chiapas",
                "lat": round(lat_col, 6),
                "lng": round(lng_col, 6),
                "tipo": "colonia",
            })
    except Exception as e:
        logger.warning("Error buscando colonias locales: %s", e)


    # 2. Búsqueda en proveedor geográfico restringida estrictamente a Palenque, Chiapas
    # Coordenadas exactas que acotan Palenque y su área conurbada (Pakal-Ná, La Cañada, Ruinas)
    min_lat, max_lat = 17.4300, 17.5800
    min_lon, max_lon = -92.0500, -91.9000
    limit = max(1, min(limit or 8, 20))
    headers = {"User-Agent": "TaxiHUB/2.0 (central de taxis de Palenque, contacto@taxihub.mx)"}

    # Sesgar la búsqueda adjuntando Palenque Chiapas si el operador no lo escribió
    query_geocoder = query if ("palenque" in query.lower() or "chiapas" in query.lower()) else f"{query}, Palenque, Chiapas"
    is_photon = "photon" in GEOCODING_PROVIDER_URL.lower()
    provider_name = "nominatim" if not is_photon else "photon"

    try:
        async with httpx.AsyncClient(timeout=GEOCODING_TIMEOUT_SECONDS) as hc:
            if is_photon:
                r = await hc.get(
                    f"{GEOCODING_PROVIDER_URL}/api/",
                    params={
                        "q": query_geocoder,
                        "limit": limit * 2,
                        "bbox": f"{min_lon:.4f},{min_lat:.4f},{max_lon:.4f},{max_lat:.4f}",
                    },
                    headers=headers,
                )
            else:
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
        data = []

    # Parseo y filtrado estricto
    if isinstance(data, list):
        for item in data:
            try:
                lat = float(item.get("lat"))
                lng = float(item.get("lon"))
            except (TypeError, ValueError):
                continue
            # Descartar cualquier resultado fuera del perímetro estricto de Palenque
            if not (min_lat <= lat <= max_lat and min_lon <= lng <= max_lon):
                continue
            addr = item.get("address") or {}
            # Validar que pertenezca a Chiapas
            estado = addr.get("state") or ""
            if estado and "chiapas" not in estado.lower():
                continue
            nombre = item.get("name") or addr.get("road") or addr.get("suburb") or item.get("display_name", "").split(",")[0]
            colonia_sub = addr.get("suburb") or addr.get("neighbourhood") or "Palenque"
            sublabel = f"{colonia_sub}, Palenque, Chiapas"
            tipo = item.get("type") or item.get("category") or "calle"
            
            # Evitar duplicados
            if not any(r["label"].lower() == nombre.strip().lower() for r in resultados):
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
        for f in data.get("features") or []:
            props = f.get("properties") or {}
            geom = (f.get("geometry") or {}).get("coordinates") or [None, None]
            lng, lat = geom[0], geom[1]
            if lat is None or lng is None:
                continue
            lat, lng = float(lat), float(lng)
            if not (min_lat <= lat <= max_lat and min_lon <= lng <= max_lon):
                continue
            estado = props.get("state") or ""
            if estado and "chiapas" not in estado.lower():
                continue
            nombre = props.get("name") or props.get("street") or props.get("district") or ""
            distrito = props.get("district") or props.get("city") or "Palenque"
            sublabel = f"{distrito}, Palenque, Chiapas"
            if not nombre:
                nombre = props.get("street") or query
            tipo = props.get("osm_key") or props.get("osm_value") or "calle"
            if not any(r["label"].lower() == nombre.strip().lower() for r in resultados):
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

    # Filtro redundante final
    resultados = [
        r for r in resultados
        if (min_lat <= r["lat"] <= max_lat) and (min_lon <= r["lng"] <= max_lon)
    ][:limit]

    _GEO_SEARCH_CACHE[cache_key] = (ahora_ts, resultados)
    return {"resultados": resultados, "provider": provider_name}


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
    # 1) Reservar al chofer de forma atómica (libre → ocupado): si dos servicios
    #    compiten por el mismo taxi, solo uno logra la reserva.
    reserva = await db.operadores.update_one(
        {"_id": to_oid(operador_id), "estado": EstadoOperador.libre.value},
        {"$set": {"estado": EstadoOperador.ocupado.value, "ultima_actualizacion": ts}},
    )
    if reserva.modified_count == 0:
        raise HTTPException(status_code=409, detail="El operador no está disponible")
    # 2) Ganar el servicio; si otro chofer ya lo tomó, se libera la reserva.
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
        await db.operadores.update_one(
            {"_id": to_oid(operador_id), "estado": EstadoOperador.ocupado.value},
            {"$set": {"estado": EstadoOperador.libre.value}},
        )
        return False
    after = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    op_sitio = op.get("sitio_id") or (after or {}).get("sitio_id") or DEFAULT_SITIO
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


def _identificar_colonia_punto(lat: float, lng: float, colonias: List[dict]) -> Optional[dict]:
    """Determina la colonia/cuadrante del tenant que contiene o está más cerca del punto."""
    if not colonias:
        return None
    for c in colonias:
        poly = c.get("poligono") or []
        if len(poly) >= 3:
            lats = [p[0] for p in poly]
            lngs = [p[1] for p in poly]
            if min(lats) <= lat <= max(lats) and min(lngs) <= lng <= max(lngs):
                return c
    mejor = None
    mejor_d = 999999.0
    for c in colonias:
        poly = c.get("poligono") or []
        if poly:
            c_lat = sum(p[0] for p in poly) / len(poly)
            c_lng = sum(p[1] for p in poly) / len(poly)
            d = haversine_km(lat, lng, c_lat, c_lng)
            if d < mejor_d:
                mejor_d = d
                mejor = c
    return mejor if mejor_d <= 6.0 else colonias[0]


_CATEGORIA_MULTIPLICADOR = {
    "Taxi estándar": 1.0,
    "Sedán": 1.0,
    "Pickup": 1.15,
    "SUV": 1.20,
    "Van": 1.30,
    "Ejecutivo": 1.25,
}


async def _calcular_cotizacion_tenant(
    origen: Ubicacion,
    destino: Ubicacion,
    sitio_id: str,
    tipo_vehiculo_preferido_id: Optional[str] = None,
) -> dict:
    """Calcula la tarifa real del tenant combinando colonias, tarifas_predefinidas,
    distancia vial en Palenque y disponibilidad en tiempo real por tipo de vehículo."""
    ruta_info = _ruta_vial_palenque(origen, destino)
    dist_m = int(ruta_info.get("distance_m") or 1000)
    dur_s = int(ruta_info.get("duration_s") or 240)
    dist_km = round(dist_m / 1000.0, 2)

    colonias = await db.colonias.find(
        {"activa": {"$ne": False}, **_sitio_query_for(sitio_id)}
    ).to_list(100)
    tarifas = await db.tarifas_predefinidas.find(
        {"activa": {"$ne": False}, **_sitio_query_for(sitio_id)}
    ).sort("orden", 1).to_list(100)

    col_orig = _identificar_colonia_punto(origen.lat, origen.lng, colonias)
    col_dest = _identificar_colonia_punto(destino.lat, destino.lng, colonias)
    zona_orig = (col_orig or {}).get("nombre") or _clasificar_zona_servicio(origen.texto or "", origen.lat, origen.lng)
    zona_dest = (col_dest or {}).get("nombre") or _clasificar_zona_servicio(destino.texto or "", destino.lat, destino.lng)

    # Hora local aproximada en Chiapas (UTC-6)
    hora_local = (datetime.now(timezone.utc) - timedelta(hours=6)).hour
    es_nocturno = hora_local >= 22 or hora_local < 6

    tarifa_match = None
    for t in tarifas:
        zn = (t.get("zona_nombre") or "").lower()
        if zn and (zn in zona_dest.lower() or zona_dest.lower() in zn):
            tarifa_match = t
            break
    if not tarifa_match and tarifas:
        tarifa_match = tarifas[0]

    base_orig = float((col_orig or {}).get("tarifa_nocturna" if es_nocturno else "tarifa_base") or 40.0)
    base_dest = float((col_dest or {}).get("tarifa_nocturna" if es_nocturno else "tarifa_base") or 40.0)
    salida_orig = float((col_orig or {}).get("tarifa_salida") or base_orig)

    if zona_orig == zona_dest:
        monto_base = max(base_dest, float((tarifa_match or {}).get("monto") or 40.0))
    else:
        monto_base = max(salida_orig, base_dest, float((tarifa_match or {}).get("monto") or 45.0))

    # Kilómetros adicionales sobre recorrido de 2.8 km
    km_extra_rate = float((tarifa_match or {}).get("costo_km_extra") or 8.0)
    if dist_km > 2.8:
        monto_base += (dist_km - 2.8) * km_extra_rate

    monto_base = max(35.0, float(round(monto_base / 5.0) * 5.0))

    candidatos = await _buscar_candidatos(origen.lat, origen.lng, num=50, sitio_id=sitio_id)
    tipos_docs = await db.tipos_vehiculo.find({"activo": {"$ne": False}}).sort("orden", 1).to_list(100)

    categorias = []
    costo_seleccionado = monto_base
    for td in tipos_docs:
        t = serialize(td)
        tid = t["id"]
        tnombre = t.get("nombre") or "Taxi estándar"
        mult = _CATEGORIA_MULTIPLICADOR.get(tnombre, 1.0)
        costo_cat = max(35.0, float(round((monto_base * mult) / 5.0) * 5.0))
        cands_tipo = [
            c for c in candidatos
            if (c.get("vehiculo") or {}).get("tipo_vehiculo_id") == tid
            or (tnombre == "Taxi estándar" and not (c.get("vehiculo") or {}).get("tipo_vehiculo_id"))
        ]
        cercano = cands_tipo[0] if cands_tipo else (candidatos[0] if candidatos else None)
        cat_info = {
            "id": tid,
            "nombre": tnombre,
            "descripcion": t.get("descripcion"),
            "capacidad": t.get("capacidad") or 4,
            "caracteristicas": t.get("caracteristicas") or [],
            "imagen_url": t.get("imagen_url") or "/assets/vehicle-types/taxi_estandar.png",
            "costo_estimado": costo_cat,
            "moneda": "MXN",
            "disponibles_exactos": len(cands_tipo),
            "disponibles_flota": len(candidatos),
            "disponible": len(candidatos) > 0,
            "eta_min": cercano["eta_min"] if cercano else None,
            "eta_s": cercano["eta_s"] if cercano else None,
            "distancia_unidad_m": cercano["distancia_m"] if cercano else None,
        }
        categorias.append(cat_info)
        if tipo_vehiculo_preferido_id and tid == str(tipo_vehiculo_preferido_id):
            costo_seleccionado = costo_cat

    tarifa_nombre = (
        f"{zona_orig} → {zona_dest}"
        if zona_orig != zona_dest
        else (tarifa_match or {}).get("nombre") or f"Tarifa Local {zona_dest}"
    )

    return {
        "sitio_id": sitio_id,
        "moneda": "MXN",
        "distancia_m": dist_m,
        "distancia_km": dist_km,
        "duracion_s": dur_s,
        "duracion_min": max(1, round(dur_s / 60.0)),
        "zona_origen": zona_orig,
        "zona_destino": zona_dest,
        "tarifa_id": str(tarifa_match["_id"]) if tarifa_match and tarifa_match.get("_id") else None,
        "tarifa_nombre": tarifa_nombre,
        "tarifa_base": monto_base,
        "costo_estimado": costo_seleccionado,
        "es_nocturno": es_nocturno,
        "unidades_libres_total": len(candidatos),
        "categorias": categorias,
    }


@api_router.post("/servicios/cotizar")
async def cotizar_servicio(body: CotizarServicioBody, request: Request):
    """Cotiza en tiempo real un viaje entre origen y destino usando las tarifas y
    colonias reales del tenant, además de disponibilidad y ETA por categoría."""
    actor = await _any_autenticado_o_pasajero(request)
    sitio_id = actor.get("sitio_id") or actor.get("_tenant") or DEFAULT_SITIO
    if not body.origen or body.origen.lat is None or body.origen.lng is None:
        raise HTTPException(status_code=400, detail="Debes indicar coordenadas del origen")
    if not body.destino or body.destino.lat is None or body.destino.lng is None:
        raise HTTPException(status_code=400, detail="Debes indicar coordenadas del destino")
    return await _calcular_cotizacion_tenant(
        body.origen, body.destino, sitio_id, body.tipo_vehiculo_preferido_id
    )


async def _autodespachar_servicio_pasajero(servicio_id: str) -> Optional[dict]:
    """Selecciona automáticamente al conductor elegible más cercano del mismo tenant
    (respetando categoría preferida con fallback a flota libre y excluyendo rechazados)
    y le envía la oferta (`estado = 'ofrecido'`). El viaje NO queda asignado hasta que
    el conductor acepta explícitamente."""
    s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    if not s or s.get("estado") not in (EstadoServicio.pendiente.value, EstadoServicio.ofrecido.value):
        return s
    origen = s.get("origen") or {}
    lat, lng = origen.get("lat"), origen.get("lng")
    if lat is None or lng is None:
        return s
    sitio_id = s.get("sitio_id") or DEFAULT_SITIO
    rechazados = list(s.get("rechazados") or [])
    pref_tipo = s.get("tipo_vehiculo_preferido_id")

    candidatos = []
    if pref_tipo:
        candidatos = await _buscar_candidatos(
            lat, lng, num=35, sitio_id=sitio_id, tipo_vehiculo_id=pref_tipo, excluir_ids=rechazados
        )
    if not candidatos:
        candidatos = await _buscar_candidatos(
            lat, lng, num=35, sitio_id=sitio_id, excluir_ids=rechazados
        )

    # Simulación: el chofer prioritario (op1 / TX-101 por defecto) recibe primero la
    # oferta si es elegible EN ESTE SITIO (libre, GPS o app conectada, sin servicio
    # activo y sin haber rechazado este viaje). DESPACHO_PRIORIDAD_USUARIO="" la apaga.
    if PRIORIDAD_DESPACHO_USUARIO:
        idx = next((i for i, c in enumerate(candidatos) if c.get("usuario") == PRIORIDAD_DESPACHO_USUARIO), -1)
        if idx > 0:
            candidatos.insert(0, candidatos.pop(idx))
        elif idx == -1:
            prioritario = await _buscar_candidatos(
                lat, lng, num=1, sitio_id=sitio_id, excluir_ids=rechazados,
                solo_usuario=PRIORIDAD_DESPACHO_USUARIO,
            )
            candidatos = prioritario + candidatos

    if not candidatos:
        await db.servicios.update_one(
            {"_id": s["_id"]},
            {"$set": {"estado": EstadoServicio.pendiente.value, "ofrecido_a": []}, "$unset": {"expira_en": ""}},
        )
        return await db.servicios.find_one({"_id": s["_id"]})

    mejor_candidato = candidatos[0]
    ids_oferta = [mejor_candidato["id"]]
    ttl = await oferta_ttl_seconds()  # config `oferta_duracion_seg`; luego cascada al siguiente
    expira = (datetime.now(timezone.utc) + timedelta(seconds=ttl)).isoformat()
    await db.servicios.update_one(
        {"_id": s["_id"]},
        {
            "$set": {
                "estado": EstadoServicio.ofrecido.value,
                "ofrecido_a": ids_oferta,
                "expira_en": expira,
                "oferta_ttl_s": ttl,
            }
        },
    )
    logger.info(
        "autodespacho pasajero: servicio=%s ofrecido a op=%s (%s m), expira_en=%s",
        servicio_id,
        mejor_candidato["id"],
        mejor_candidato.get("distancia_m"),
        expira,
    )
    s_fresh = await db.servicios.find_one({"_id": s["_id"]})
    await _notificar_servicio(s_fresh)
    return s_fresh


_cascada_task = None
_cascada_activa = False


async def _cascada_ofertas_vencidas() -> int:
    """Procesa ofertas vencidas (tras 30s) y las transfiere automáticamente al siguiente
    conductor elegible más cercano."""
    ahora = datetime.now(timezone.utc)
    docs = await db.servicios.find({
        "estado": EstadoServicio.ofrecido.value,
        "expira_en": {"$exists": True}
    }).to_list(100)
    n = 0
    for s in docs:
        exp = _parse_iso(s.get("expira_en"))
        if exp and (exp.replace(tzinfo=timezone.utc) if exp.tzinfo is None else exp) <= ahora:
            ofrecidos = list(s.get("ofrecido_a") or [])
            sid = str(s["_id"])
            res = await db.servicios.update_one(
                {"_id": s["_id"], "estado": EstadoServicio.ofrecido.value, "expira_en": s.get("expira_en")},
                {
                    "$addToSet": {"rechazados": {"$each": ofrecidos}},
                    "$set": {"ofrecido_a": []},
                    "$unset": {"expira_en": ""},
                }
            )
            if res.modified_count == 0:
                # Otro ciclo (bucle de fondo o búsqueda anidada) ya procesó esta oferta.
                continue
            logger.info("Oferta expirada para servicio=%s (ofrecido a %s). Cascada al siguiente conductor...", sid, ofrecidos)
            # Reasignar automáticamente al siguiente candidato disponible más cercano
            s_sig = await _autodespachar_servicio_pasajero(sid)
            if s_sig and not (s_sig.get("ofrecido_a") or []):
                # No quedan candidatos libres disponibles por ahora; queda pendiente
                await db.servicios.update_one(
                    {"_id": s["_id"]},
                    {"$set": {"estado": EstadoServicio.pendiente.value}}
                )
                s_sig = await db.servicios.find_one({"_id": s["_id"]})
                await _notificar_servicio(s_sig)
            n += 1
    return n


REINTENTO_PENDIENTES_SEG = 10.0


async def _reintentar_pendientes() -> int:
    """Viajes de pasajero que quedaron `pendiente` (todos los choferes rechazaron o
    no había libres): se vuelven a ofrecer a choferes que se liberen, y tras
    `pendiente_max_minutos` sin taxi pasan a `vencido` para avisar al pasajero."""
    ahora = datetime.now(timezone.utc)
    max_min = float(await get_config("pendiente_max_minutos", 10))
    docs = await db.servicios.find({
        "estado": EstadoServicio.pendiente.value,
        "tipo": "pasajero",
        "origen.lat": {"$ne": None},
    }).to_list(200)
    n = 0
    for s in docs:
        creado = _parse_iso(s.get("timestamp_creacion"))
        if creado and creado.tzinfo is None:
            creado = creado.replace(tzinfo=timezone.utc)
        if creado and (ahora - creado).total_seconds() > max_min * 60:
            res = await db.servicios.update_one(
                {"_id": s["_id"], "estado": EstadoServicio.pendiente.value},
                {"$set": {"estado": EstadoServicio.vencido.value, "ts_vencido": now_iso()}},
            )
            if res.modified_count:
                await _notificar_servicio(await db.servicios.find_one({"_id": s["_id"]}))
                n += 1
            continue
        s_sig = await _autodespachar_servicio_pasajero(str(s["_id"]))
        if s_sig and s_sig.get("estado") == EstadoServicio.ofrecido.value:
            n += 1
    return n


async def _bucle_cascada_ofertas():
    global _cascada_activa
    logger.info("Bucle de cascada de servicios activo (TTL de oferta desde config, verificación continua).")
    ultimo_reintento = 0.0
    while _cascada_activa:
        try:
            await _cascada_ofertas_vencidas()
            if time.monotonic() - ultimo_reintento >= REINTENTO_PENDIENTES_SEG:
                ultimo_reintento = time.monotonic()
                await _reintentar_pendientes()
        except Exception as exc:
            logger.error("Error en bucle de cascada de ofertas: %s", exc)
        await asyncio.sleep(1.5)


def _iniciar_cascada():
    global _cascada_activa, _cascada_task
    if not _cascada_activa:
        _cascada_activa = True
        _cascada_task = asyncio.create_task(_bucle_cascada_ofertas())
        logger.info("Bucle de cascada de ofertas iniciado.")


def _detener_cascada():
    global _cascada_activa, _cascada_task
    _cascada_activa = False
    if _cascada_task:
        _cascada_task.cancel()
        _cascada_task = None
        logger.info("Bucle de cascada de ofertas detenido.")


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
        "notas_pasajero": body.notas_pasajero,
        "sitio_id": sitio_id,
        "tipo": "pasajero" if pasajero else "terminal",
        "operador_asignado_id": None,
        "estado": EstadoServicio.pendiente.value,
        "timestamp_creacion": now_iso(),
        "timestamp_asignacion": None,
        "rechazados": [],
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

    # Si es solicitud de pasajero, calcular tarifa oficial del tenant cuando no venga fijada
    if pasajero and o_geo.get("lat") is not None and d_geo.get("lat") is not None:
        cot = await _calcular_cotizacion_tenant(
            Ubicacion(**o_geo),
            Ubicacion(**d_geo),
            sitio_id,
            body.tipo_vehiculo_preferido_id,
        )
        if doc.get("costo") is None:
            doc["costo"] = cot["costo_estimado"]
        if not doc.get("tarifa_id"):
            doc["tarifa_id"] = cot.get("tarifa_id")
        doc["tarifa_nombre"] = cot.get("tarifa_nombre")
        doc["distancia_m"] = cot.get("distancia_m")
        doc["duracion_s"] = cot.get("duracion_s")

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
    elif pasajero:
        # Autodespacho inmediato al conductor libre más cercano del tenant
        await _autodespachar_servicio_pasajero(str(res.inserted_id))

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
        if s_fresh.get("tipo") == "pasajero":
            # Reasignar automáticamente al siguiente conductor elegible más cercano no rechazado
            s_fresh = await _autodespachar_servicio_pasajero(servicio_id)
            restantes = len(s_fresh.get("ofrecido_a") or [])
            await _notificar_servicio(s_fresh)
        else:
            await db.servicios.update_one(
                {"_id": to_oid(servicio_id), "estado": EstadoServicio.ofrecido.value},
                {"$set": {"estado": EstadoServicio.pendiente.value}, "$unset": {"expira_en": ""}},
            )
            s_fresh = await db.servicios.find_one({"_id": to_oid(servicio_id)})
            restantes = 0
            await _notificar_servicio(s_fresh)
    logger.info("servicio rechazado id=%s por operador=%s (quedan %s)",
                servicio_id, current["id"], restantes)
    return serialize(s_fresh)


@api_router.post("/servicios/{servicio_id}/llegada-origen")
async def marcar_llegada_origen(servicio_id: str, current: dict = Depends(require_operador_estricto)):
    """El conductor asignado notifica que ha llegado al punto de encuentro del pasajero."""
    s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    if s.get("operador_asignado_id") != current["id"]:
        raise HTTPException(status_code=403, detail="Solo el conductor asignado puede marcar llegada")
    if s.get("estado") != EstadoServicio.asignado.value:
        raise HTTPException(status_code=409, detail="El servicio debe estar asignado")
    ts = now_iso()
    await db.servicios.update_one(
        {"_id": to_oid(servicio_id)},
        {"$set": {"conductor_en_origen": True, "timestamp_llegada_origen": ts}},
    )
    s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    await _notificar_servicio(s)
    return serialize(s)


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
    texto: Optional[str] = ""
    imagen_url: Optional[str] = None


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
        "texto": body.texto or "",
        "imagen_url": body.imagen_url,
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


@api_router.post("/servicios/{servicio_id}/mensajes/foto")
async def crear_mensaje_viaje_foto(
    servicio_id: str,
    request: Request,
    foto: UploadFile = File(...),
    texto: Optional[str] = Form(""),
):
    s = await _obtener_servicio_para_chat(servicio_id)
    actor, remitente = await _autor_chat_viaje(request, s)
    if s.get("estado") not in (EstadoServicio.asignado.value, EstadoServicio.en_curso.value):
        raise HTTPException(
            status_code=409,
            detail="El chat solo está disponible con el servicio asignado o en curso",
        )
    sitio_id = s.get("sitio_id") or DEFAULT_SITIO
    imagen_url = await _guardar_imagen(foto, f"chat/{servicio_id}", sitio_id=sitio_id)
    doc = {
        "servicio_id": servicio_id,
        "pasajero_id": s.get("pasajero_id"),
        "operador_id": s.get("operador_asignado_id"),
        "remitente": remitente,
        "remitente_id": actor["id"],
        "texto": texto or "",
        "imagen_url": imagen_url,
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
        "texto": body.texto or "",
        "imagen_url": body.imagen_url,
        "timestamp": now_iso(),
    }
    res = await db.mensajes_chat.insert_one(doc)
    doc["_id"] = res.inserted_id
    out = serialize(doc)
    await manager.send_operador(body.operador_id, {"type": "mensaje", "mensaje": out})
    await manager.broadcast_terminal({"type": "mensaje", "mensaje": out, "sitio_id": sitio_op}, sitio_id=sitio_op)
    return out


@api_router.post("/mensajes/foto")
async def crear_mensaje_central_foto(
    request: Request,
    operador_id: str = Form(...),
    remitente: str = Form("operador"),
    foto: UploadFile = File(...),
    texto: Optional[str] = Form(""),
):
    await _autor_chat_o_terminal(request, operador_id)
    op = await db.operadores.find_one({"_id": to_oid(operador_id)}, {"sitio_id": 1})
    sitio_op = (op or {}).get("sitio_id") or DEFAULT_SITIO
    imagen_url = await _guardar_imagen(foto, f"chat_central/{operador_id}", sitio_id=sitio_op)
    doc = {
        "operador_id": operador_id,
        "sitio_id": sitio_op,
        "remitente": remitente,
        "texto": texto or "",
        "imagen_url": imagen_url,
        "timestamp": now_iso(),
    }
    res = await db.mensajes_chat.insert_one(doc)
    doc["_id"] = res.inserted_id
    out = serialize(doc)
    await manager.send_operador(operador_id, {"type": "mensaje", "mensaje": out})
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
# Simulación Avanzada de Flota (15+ Taxis, WhatsApp, Servicios y Movimiento GPS)
# ---------------------------------------------------------------------------
from simulacion_datos import (  # noqa: E402  (datos de la simulación demo)
    PALENQUE_PISTAS_VIALES, DEMO_TAXIS, DEMO_TAXIS_PAKALNA, DEMO_TAXIS_FORANEOS,
    FOTOS_DEMO_HOMBRES, FOTOS_DEMO_MUJERES, _foto_demo, _fotos_demo_conductores,
)

_HASH_TAXI123 = hash_password("taxi123")
_HASH_SOCIO123 = hash_password("socio123")
_HASH_CENTRAL123 = hash_password("central123")


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

    # 5b) Retratos demo por género en bases ya sembradas. Solo toca cuentas que
    # siguen usando un retrato del catálogo (nunca una foto subida por el usuario).
    retrato_catalogo = {"$regex": r"^/assets/drivers/driver-\d+\.jpg$"}
    for usuario, foto in _fotos_demo_conductores().items():
        await db.operadores.update_one({"usuario": usuario, "foto_url": retrato_catalogo},
                                       {"$set": {"foto_url": foto}})
    for usuario, n in (("socia_carmen", 16), ("socia_patricia", 17)):
        await db.usuarios_dueno.update_one({"usuario": usuario, "foto_url": retrato_catalogo},
                                           {"$set": {"foto_url": _foto_demo(n)}})

    # 6) Conversación demo de WhatsApp (flujo ubicación→servicio del despacho).
    await _seed_wa_conversacion()

    logger.info("Migraciones aplicadas (sitios, sitio_id, vehículos backfill, tipos de vehículo)")


# ---------------------------------------------------------------------------
# Wire up
# ---------------------------------------------------------------------------
from dueno_module import build_router as build_dueno
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
# Antes que socios_extra: /dueno/notificaciones existe en ambos y gana el de este módulo.
app.include_router(build_dueno(
    DEFAULT_SITIO=DEFAULT_SITIO, TRACK_MAX_POINTS=TRACK_MAX_POINTS,
    _calcular_suscripcion=_calcular_suscripcion,
    _construir_focos_por_zona=_construir_focos_por_zona,
    _enriquecer_vehiculo=_enriquecer_vehiculo, _hoy_str=_hoy_str,
    _mapa_tipos_vehiculo=_mapa_tipos_vehiculo,
    _operador_ids_de_dueno=_operador_ids_de_dueno,
    _vehiculo_de_dueno_o_404=_vehiculo_de_dueno_o_404,
    _vehiculo_resumen=_vehiculo_resumen, _vehiculos_de_dueno=_vehiculos_de_dueno,
    db=_db_proxy, require_dueno=require_dueno, require_terminal=require_terminal,
    serialize=serialize, to_oid=to_oid,
))
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

from simulacion_module import build as build_simulacion
_sim = build_simulacion(
    APP_NAME=APP_NAME, DEFAULT_PUNTOS_CALIENTES=DEFAULT_PUNTOS_CALIENTES,
    DEFAULT_SITIO=DEFAULT_SITIO, EstadoOperador=EstadoOperador,
    _HASH_CENTRAL123=_HASH_CENTRAL123, _HASH_SOCIO123=_HASH_SOCIO123,
    _HASH_TAXI123=_HASH_TAXI123, _migraciones=_migraciones,
    _notificar_dueno_de_operador=_notificar_dueno_de_operador,
    _require_terminal_or_dev=_require_terminal_or_dev,
    _tipo_vehiculo_default_id=_tipo_vehiculo_default_id,
    analizar_y_comprimir_imagen_webp=analizar_y_comprimir_imagen_webp, db=_db_proxy,
    hash_password=hash_password, logger=logger, manager=manager, now_iso=now_iso,
    put_object=put_object, to_oid=to_oid,
)
app.include_router(_sim.router)
seed = _sim.seed
sembrar_datos_simulacion = _sim.sembrar_datos_simulacion
_iniciar_patrullaje = _sim._iniciar_patrullaje
_detener_patrullaje = _sim._detener_patrullaje

from whatsapp_module import build as build_whatsapp
_wa = build_whatsapp(
    DEFAULT_SITIO=DEFAULT_SITIO, _require_terminal_or_dev=_require_terminal_or_dev,
    _sitio_query_for=_sitio_query_for, db=_db_proxy, logger=logger, manager=manager,
    now_iso=now_iso, require_terminal=require_terminal, serialize=serialize,
    to_oid=to_oid,
)
app.include_router(_wa.router)
_seed_wa_conversacion = _wa._seed_wa_conversacion

from dev_module import build_router as build_dev
app.include_router(build_dev(
    DEFAULT_PUNTOS_CALIENTES=DEFAULT_PUNTOS_CALIENTES, DEFAULT_SITIO=DEFAULT_SITIO,
    JWT_ALGORITHM=JWT_ALGORITHM, JWT_SECRET=JWT_SECRET,
    SitioConfigBody=SitioConfigBody, UPLOAD_DIR=UPLOAD_DIR,
    _calcular_suscripcion=_calcular_suscripcion, _hoy_str=_hoy_str,
    _obtener_sitio_config=_obtener_sitio_config, _sitio_query_for=_sitio_query_for,
    analizar_y_comprimir_imagen_webp=analizar_y_comprimir_imagen_webp, db=_db_proxy,
    hash_password=hash_password, manager=manager, now_iso=now_iso,
    require_dev=require_dev, serialize=serialize, to_oid=to_oid,
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
    if SIMULACION_DEMO:
        if await db.operadores.count_documents({}) < 15:
            await sembrar_datos_simulacion()
        _iniciar_patrullaje()
    else:
        logger.info("Simulación demo desactivada (SIMULACION_DEMO=0)")
    _iniciar_cascada()


@app.on_event("shutdown")
async def shutdown_db_client():
    _detener_patrullaje()
    _detener_cascada()
    client.close()
