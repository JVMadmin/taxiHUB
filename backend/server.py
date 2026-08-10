from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
from enum import Enum
from typing import List, Optional, Dict
from datetime import datetime, timezone

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
import requests


# ---------------------------------------------------------------------------
# DB + app setup
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---- Emergent Object Storage ----
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "central-taxis"
storage_key = None


def init_storage(force: bool = False):
    global storage_key
    if storage_key and not force:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

app = FastAPI(title="Central de Taxis - API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("central_taxis")

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"


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


def create_token(operador_id: str, usuario: str) -> str:
    payload = {"sub": operador_id, "usuario": usuario, "iat": datetime.now(timezone.utc)}
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
    if not op:
        raise HTTPException(status_code=401, detail="Operador no encontrado")
    return serialize(op)


# ---------------------------------------------------------------------------
# Enums + Models
# ---------------------------------------------------------------------------
class EstadoOperador(str, Enum):
    libre = "libre"
    ocupado = "ocupado"
    no_disponible = "no_disponible"
    fuera_de_servicio = "fuera_de_servicio"


class EstadoServicio(str, Enum):
    pendiente = "pendiente"
    asignado = "asignado"
    en_curso = "en_curso"
    completado = "completado"
    cancelado = "cancelado"


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


class OperadorUpdate(BaseModel):
    nombre: Optional[str] = None
    telefono: Optional[str] = None
    placa: Optional[str] = None
    ruta_asignada: Optional[str] = None
    contrasena: Optional[str] = None


class EstadoUpdate(BaseModel):
    estado: EstadoOperador


class UbicacionUpdate(BaseModel):
    lat: float
    lng: float


class LoginBody(BaseModel):
    usuario: str
    contrasena: str


# ---- Clientes ----
class ClienteCreate(BaseModel):
    nombre: str
    telefono: str


class ClienteUpdate(BaseModel):
    nombre: Optional[str] = None
    telefono: Optional[str] = None


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
    origen: Ubicacion
    destino: Ubicacion
    operador_asignado_id: Optional[str] = None
    costo: Optional[float] = None


class AsignarBody(BaseModel):
    operador_id: str


class ServicioOperadorBody(BaseModel):
    origen_texto: str
    destino_texto: str
    costo: Optional[float] = None


# ---- Usuarios Terminal (operadoras) ----
class TerminalUserCreate(BaseModel):
    nombre: str
    usuario: str
    contrasena: str


class TerminalLoginBody(BaseModel):
    usuario: str
    contrasena: str


# ---------------------------------------------------------------------------
# WebSocket connection manager
# ---------------------------------------------------------------------------
class ConnectionManager:
    def __init__(self):
        self.terminal: List[WebSocket] = []
        self.operadores: Dict[str, List[WebSocket]] = {}

    async def connect_terminal(self, ws: WebSocket):
        await ws.accept()
        self.terminal.append(ws)

    def disconnect_terminal(self, ws: WebSocket):
        if ws in self.terminal:
            self.terminal.remove(ws)

    async def connect_operador(self, operador_id: str, ws: WebSocket):
        await ws.accept()
        self.operadores.setdefault(operador_id, []).append(ws)

    def disconnect_operador(self, operador_id: str, ws: WebSocket):
        conns = self.operadores.get(operador_id, [])
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


manager = ConnectionManager()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@api_router.post("/auth/login")
async def login(body: LoginBody):
    op = await db.operadores.find_one({"usuario": body.usuario})
    if not op or not verify_password(body.contrasena, op.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    token = create_token(str(op["_id"]), op["usuario"])
    return {"token": token, "operador": serialize(op)}


@api_router.get("/auth/me")
async def me(current: dict = Depends(get_current_operador)):
    return current


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
    token = create_terminal_token(str(u["_id"]), u["usuario"])
    return {"token": token, "usuario": serialize(u)}


# ---------------------------------------------------------------------------
# Operadores CRUD
# ---------------------------------------------------------------------------
@api_router.post("/operadores")
async def create_operador(body: OperadorCreate):
    if await db.operadores.find_one({"usuario": body.usuario}):
        raise HTTPException(status_code=409, detail="El usuario ya existe")
    doc = {
        "nombre": body.nombre,
        "telefono": body.telefono,
        "placa": body.placa,
        "ruta_asignada": body.ruta_asignada,
        "estado": EstadoOperador.fuera_de_servicio.value,
        "lat": None,
        "lng": None,
        "ultima_actualizacion": None,
        "usuario": body.usuario,
        "password_hash": hash_password(body.contrasena),
    }
    res = await db.operadores.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api_router.get("/operadores")
async def list_operadores():
    docs = await db.operadores.find().to_list(1000)
    return [serialize(d) for d in docs]


@api_router.get("/operadores/activos")
async def list_operadores_activos():
    """Operadores en operación (todo menos fuera_de_servicio) con estado y ubicación, para el mapa."""
    docs = await db.operadores.find(
        {"estado": {"$ne": EstadoOperador.fuera_de_servicio.value}}
    ).to_list(1000)
    return [serialize(d) for d in docs]


@api_router.get("/operadores/{operador_id}")
async def get_operador(operador_id: str):
    op = await db.operadores.find_one({"_id": to_oid(operador_id)})
    if not op:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    return serialize(op)


@api_router.put("/operadores/{operador_id}")
async def update_operador(operador_id: str, body: OperadorUpdate):
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items() if k != "contrasena"}
    if body.contrasena:
        updates["password_hash"] = hash_password(body.contrasena)
    if not updates:
        raise HTTPException(status_code=400, detail="Nada que actualizar")
    res = await db.operadores.update_one({"_id": to_oid(operador_id)}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    op = await db.operadores.find_one({"_id": to_oid(operador_id)})
    return serialize(op)


@api_router.delete("/operadores/{operador_id}")
async def delete_operador(operador_id: str):
    res = await db.operadores.delete_one({"_id": to_oid(operador_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    return {"ok": True}


@api_router.patch("/operadores/{operador_id}/estado")
async def update_estado(operador_id: str, body: EstadoUpdate):
    ts = now_iso()
    res = await db.operadores.update_one(
        {"_id": to_oid(operador_id)},
        {"$set": {"estado": body.estado.value, "ultima_actualizacion": ts}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    await manager.broadcast_terminal({
        "type": "estado",
        "operador_id": operador_id,
        "estado": body.estado.value,
        "ts": ts,
    })
    return {"ok": True, "estado": body.estado.value}


@api_router.post("/operadores/{operador_id}/ubicacion")
async def update_ubicacion(operador_id: str, body: UbicacionUpdate):
    """Escritura ligera: solo actualiza lat/lng + timestamp, no toca el resto del registro."""
    ts = now_iso()
    await db.operadores.update_one(
        {"_id": to_oid(operador_id)},
        {"$set": {"lat": body.lat, "lng": body.lng, "ultima_actualizacion": ts}},
    )
    await manager.broadcast_terminal({
        "type": "ubicacion",
        "operador_id": operador_id,
        "lat": body.lat,
        "lng": body.lng,
        "ts": ts,
    })
    return {"ok": True}


# ---------------------------------------------------------------------------
# Clientes CRUD
# ---------------------------------------------------------------------------
@api_router.post("/clientes")
async def create_cliente(body: ClienteCreate):
    doc = {"nombre": body.nombre, "telefono": body.telefono, "creado": now_iso()}
    res = await db.clientes.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api_router.get("/clientes")
async def list_clientes():
    docs = await db.clientes.find().to_list(1000)
    return [serialize(d) for d in docs]


@api_router.get("/clientes/{cliente_id}")
async def get_cliente(cliente_id: str):
    c = await db.clientes.find_one({"_id": to_oid(cliente_id)})
    if not c:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    out = serialize(c)
    # historial de servicios como relación (no lista embebida)
    servicios = await db.servicios.find({"cliente_id": cliente_id}).to_list(1000)
    out["historial_servicios"] = [serialize(s) for s in servicios]
    return out


@api_router.put("/clientes/{cliente_id}")
async def update_cliente(cliente_id: str, body: ClienteUpdate):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nada que actualizar")
    res = await db.clientes.update_one({"_id": to_oid(cliente_id)}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return serialize(await db.clientes.find_one({"_id": to_oid(cliente_id)}))


@api_router.delete("/clientes/{cliente_id}")
async def delete_cliente(cliente_id: str):
    res = await db.clientes.delete_one({"_id": to_oid(cliente_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Rutas CRUD
# ---------------------------------------------------------------------------
@api_router.post("/rutas")
async def create_ruta(body: RutaCreate):
    doc = {"nombre": body.nombre, "color_hex": body.color_hex}
    res = await db.rutas.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api_router.get("/rutas")
async def list_rutas():
    docs = await db.rutas.find().to_list(1000)
    return [serialize(d) for d in docs]


@api_router.get("/rutas/{ruta_id}")
async def get_ruta(ruta_id: str):
    r = await db.rutas.find_one({"_id": to_oid(ruta_id)})
    if not r:
        raise HTTPException(status_code=404, detail="Ruta no encontrada")
    return serialize(r)


@api_router.put("/rutas/{ruta_id}")
async def update_ruta(ruta_id: str, body: RutaUpdate):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nada que actualizar")
    res = await db.rutas.update_one({"_id": to_oid(ruta_id)}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Ruta no encontrada")
    return serialize(await db.rutas.find_one({"_id": to_oid(ruta_id)}))


@api_router.delete("/rutas/{ruta_id}")
async def delete_ruta(ruta_id: str):
    res = await db.rutas.delete_one({"_id": to_oid(ruta_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ruta no encontrada")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Servicios / Llamadas
# ---------------------------------------------------------------------------
@api_router.post("/servicios")
async def create_servicio(body: ServicioCreate):
    estado = EstadoServicio.pendiente.value
    ts_asignacion = None
    if body.operador_asignado_id:
        estado = EstadoServicio.asignado.value
        ts_asignacion = now_iso()
    doc = {
        "cliente_id": body.cliente_id,
        "cliente_nombre": body.cliente_nombre,
        "cliente_telefono": body.cliente_telefono,
        "origen": body.origen.model_dump(),
        "destino": body.destino.model_dump(),
        "origen_texto": body.origen.texto,
        "destino_texto": body.destino.texto,
        "costo": body.costo,
        "tipo": "terminal",
        "operador_asignado_id": body.operador_asignado_id,
        "estado": estado,
        "timestamp_creacion": now_iso(),
        "timestamp_asignacion": ts_asignacion,
    }
    res = await db.servicios.insert_one(doc)
    doc["_id"] = res.inserted_id
    out = serialize(doc)
    if body.operador_asignado_id:
        await manager.send_operador(body.operador_asignado_id, {"type": "nuevo_servicio", "servicio": out})
        await manager.broadcast_terminal({"type": "servicio", "servicio": out})
    return out


@api_router.get("/servicios")
async def list_servicios(estado: Optional[EstadoServicio] = None):
    query = {"estado": estado.value} if estado else {}
    docs = await db.servicios.find(query).to_list(1000)
    return [serialize(d) for d in docs]


@api_router.get("/servicios/hoy")
async def list_servicios_hoy():
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


@api_router.get("/servicios/{servicio_id}")
async def get_servicio(servicio_id: str):
    s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    return serialize(s)


@api_router.post("/servicios/{servicio_id}/asignar")
async def asignar_servicio(servicio_id: str, body: AsignarBody):
    op = await db.operadores.find_one({"_id": to_oid(body.operador_id)})
    if not op:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    ts = now_iso()
    res = await db.servicios.update_one(
        {"_id": to_oid(servicio_id)},
        {"$set": {
            "operador_asignado_id": body.operador_id,
            "estado": EstadoServicio.asignado.value,
            "timestamp_asignacion": ts,
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    servicio = serialize(await db.servicios.find_one({"_id": to_oid(servicio_id)}))
    await manager.send_operador(body.operador_id, {"type": "nuevo_servicio", "servicio": servicio})
    await manager.broadcast_terminal({"type": "servicio", "servicio": servicio})
    return servicio


@api_router.post("/operadores/{operador_id}/servicio")
async def iniciar_servicio_operador(operador_id: str, body: ServicioOperadorBody):
    op = await db.operadores.find_one({"_id": to_oid(operador_id)})
    if not op:
        raise HTTPException(status_code=404, detail="Operador no encontrado")
    ts = now_iso()
    doc = {
        "cliente_id": None, "cliente_nombre": None, "cliente_telefono": None,
        "origen": {"texto": body.origen_texto},
        "destino": {"texto": body.destino_texto},
        "origen_texto": body.origen_texto,
        "destino_texto": body.destino_texto,
        "costo": body.costo,
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
    await manager.broadcast_terminal({"type": "estado", "operador_id": operador_id, "estado": EstadoOperador.ocupado.value, "ts": ts})
    await manager.broadcast_terminal({"type": "servicio", "servicio": servicio})
    return servicio


@api_router.post("/servicios/{servicio_id}/terminar")
async def terminar_servicio(servicio_id: str):
    s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
    if not s:
        raise HTTPException(status_code=404, detail="Servicio no encontrado")
    ts = now_iso()
    await db.servicios.update_one(
        {"_id": to_oid(servicio_id)},
        {"$set": {"estado": EstadoServicio.completado.value, "timestamp_fin": ts}},
    )
    oid = s.get("operador_asignado_id")
    if oid:
        await db.operadores.update_one(
            {"_id": to_oid(oid)},
            {"$set": {"estado": EstadoOperador.libre.value, "ultima_actualizacion": ts}},
        )
        await manager.broadcast_terminal({"type": "estado", "operador_id": oid, "estado": EstadoOperador.libre.value, "ts": ts})
    servicio = serialize(await db.servicios.find_one({"_id": to_oid(servicio_id)}))
    await manager.broadcast_terminal({"type": "servicio", "servicio": servicio})
    return servicio


# ---------------------------------------------------------------------------
# Reportes de objetos olvidados
# ---------------------------------------------------------------------------
@api_router.post("/reportes")
async def crear_reporte(
    operador_id: str = Form(...),
    descripcion: Optional[str] = Form(None),
    foto: UploadFile = File(...),
):
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
    record = await db.reportes_objetos.find_one({"storage_path": path})
    if not record:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    data, content_type = get_object(path)
    return Response(content=data, media_type=record.get("content_type", content_type))


@api_router.get("/reportes")
async def list_reportes():
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
async def resolver_reporte(reporte_id: str):
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


@api_router.post("/mensajes")
async def crear_mensaje(body: MensajeCreate):
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
async def list_mensajes(operador_id: str):
    docs = await db.mensajes_chat.find({"operador_id": operador_id}).sort("timestamp", 1).to_list(2000)
    return [serialize(d) for d in docs]


@api_router.get("/conversaciones")
async def list_conversaciones():
    msgs = await db.mensajes_chat.find().sort("timestamp", 1).to_list(5000)
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
# Seed (manual)
# ---------------------------------------------------------------------------
@api_router.post("/seed")
async def seed():
    if await db.operadores.count_documents({}) > 0:
        return {"ok": True, "message": "La base ya tiene datos, seed omitido."}

    # Rutas
    rutas = [
        {"nombre": "Palenque - Pakal Ná", "color_hex": "#00b894"},
        {"nombre": "Centro - La Cañada", "color_hex": "#0984e3"},
    ]
    r_ids = [(await db.rutas.insert_one(r)).inserted_id for r in rutas]

    # Clientes
    clientes = [
        {"nombre": "María López", "telefono": "916-100-0001", "creado": now_iso()},
        {"nombre": "Juan Pérez", "telefono": "916-100-0002", "creado": now_iso()},
    ]
    for c in clientes:
        await db.clientes.insert_one(c)

    # Operadores
    operadores = [
        {"nombre": "Carlos Ramírez", "telefono": "916-200-0001", "placa": "TX-101",
         "ruta_asignada": str(r_ids[0]), "usuario": "op1", "password_hash": hash_password("taxi123")},
        {"nombre": "Ana Torres", "telefono": "916-200-0002", "placa": "TX-102",
         "ruta_asignada": None, "usuario": "op2", "password_hash": hash_password("taxi123")},
        {"nombre": "Luis Méndez", "telefono": "916-200-0003", "placa": "TX-103",
         "ruta_asignada": str(r_ids[1]), "usuario": "op3", "password_hash": hash_password("taxi123")},
    ]
    for o in operadores:
        o.update({"estado": EstadoOperador.fuera_de_servicio.value,
                  "lat": None, "lng": None, "ultima_actualizacion": None})
        await db.operadores.insert_one(o)

    return {"ok": True, "message": "Datos de ejemplo creados",
            "operadores": ["op1", "op2", "op3"], "contrasena": "taxi123"}


@api_router.get("/")
async def root():
    return {"message": "Central de Taxis API", "status": "ok"}


# ---------------------------------------------------------------------------
# WebSockets
# ---------------------------------------------------------------------------
@api_router.websocket("/ws/terminal")
async def ws_terminal(ws: WebSocket):
    await manager.connect_terminal(ws)
    try:
        while True:
            await ws.receive_text()  # keepalive
    except WebSocketDisconnect:
        manager.disconnect_terminal(ws)


@api_router.websocket("/ws/operador/{operador_id}")
async def ws_operador(ws: WebSocket, operador_id: str):
    await manager.connect_operador(operador_id, ws)
    try:
        while True:
            await ws.receive_text()  # keepalive
    except WebSocketDisconnect:
        manager.disconnect_operador(operador_id, ws)


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
    await db.operadores.create_index("usuario", unique=True)
    await db.servicios.create_index("cliente_id")
    await db.servicios.create_index("operador_asignado_id")
    if await db.usuarios_terminal.count_documents({}) == 0:
        await db.usuarios_terminal.insert_one(
            {"nombre": "Central", "usuario": "central", "password_hash": hash_password("central123")}
        )
    await db.usuarios_terminal.create_index("usuario", unique=True)
    try:
        init_storage()
        logger.info("Object storage inicializado")
    except Exception as e:
        logger.error(f"Fallo init storage: {e}")
    logger.info("Central de Taxis API iniciada")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
