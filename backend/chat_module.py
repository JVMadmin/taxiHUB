"""
Chat: mensajes por viaje (pasajero ↔ conductor ↔ central, con foto) y
chat central ↔ operador (`/mensajes`, `/conversaciones`). Reutiliza el
ConnectionManager para empujar los mensajes en tiempo real. Mismo patrón
factory que los demás módulos.
"""
from typing import Optional, Dict

import jwt
from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, Form
from pydantic import BaseModel


def build_router(*, DEFAULT_SITIO, EstadoServicio, JWT_ALGORITHM, JWT_SECRET,
                 MensajeViajeCreate, _guardar_imagen, _read_operador, _sitio_query_for,
                 db, manager, now_iso, require_pasajero, require_terminal, serialize,
                 to_oid):
    router = APIRouter(prefix="/api", tags=["chat"])

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

    @router.get("/servicios/{servicio_id}/mensajes")
    async def list_mensajes_viaje(servicio_id: str, request: Request):
        s = await _obtener_servicio_para_chat(servicio_id)
        await _autor_chat_viaje(request, s)
        docs = await db.mensajes_chat.find(
            {"servicio_id": servicio_id}
        ).sort("timestamp", 1).to_list(2000)
        return [serialize(d) for d in docs]

    @router.post("/servicios/{servicio_id}/mensajes")
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

    @router.post("/servicios/{servicio_id}/mensajes/foto")
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

    @router.post("/mensajes")
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

    @router.post("/mensajes/foto")
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

    @router.get("/mensajes")
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

    @router.get("/conversaciones")
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

    return router
