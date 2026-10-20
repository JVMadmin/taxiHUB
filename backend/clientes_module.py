"""
Clientes y cuentas de pasajero: alta (por la terminal o autoregistro),
CRUD de la terminal y rutas propias del pasajero (`/clientes/me`, sus
servicios y viaje activo). Mismo patrón factory que los demás módulos.
"""
from typing import Dict

from fastapi import APIRouter, HTTPException, Depends, Request


def build_router(*, ClienteCreate, ClienteUpdate, DEFAULT_SITIO,
                 ESTADOS_ACTIVOS_SERVICIO, _servicio_para_pasajero, create_token, db,
                 hash_password, logger, now_iso, require_pasajero, require_terminal,
                 serialize, to_oid):
    router = APIRouter(prefix="/api", tags=["clientes"])

    @router.post("/clientes")
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

    @router.get("/clientes")
    async def list_clientes(current=Depends(require_terminal)):
        sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        docs = await db.clientes.find({"sitio_id": sitio}).to_list(1000)
        return [serialize(d) for d in docs]

    # ---- Endpoints de pasajero (app móvil nativa / web) ----
    @router.get("/clientes/me")
    async def pasajero_me(current: dict = Depends(require_pasajero)):
        return current

    @router.put("/clientes/me")
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

    @router.get("/clientes/me/servicios")
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

    @router.get("/clientes/me/viaje-activo")
    async def pasajero_viaje_activo(current: dict = Depends(require_pasajero)):
        """Devuelve SOLO el servicio activo del pasajero + taxi asignado (privacidad)."""
        s = await db.servicios.find_one({
            "pasajero_id": current["id"],
            "estado": {"$in": ESTADOS_ACTIVOS_SERVICIO},
        }, sort=[("timestamp_creacion", -1)])
        if not s:
            return {"servicio": None}
        return {"servicio": await _servicio_para_pasajero(s)}

    @router.get("/clientes/{cliente_id}")
    async def get_cliente(cliente_id: str, _=Depends(require_terminal)):
        c = await db.clientes.find_one({"_id": to_oid(cliente_id)})
        if not c:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        out = serialize(c)
        servicios = await db.servicios.find({"cliente_id": cliente_id}).to_list(1000)
        out["historial_servicios"] = [serialize(s) for s in servicios]
        return out

    @router.put("/clientes/{cliente_id}")
    async def update_cliente(cliente_id: str, body: ClienteUpdate, _=Depends(require_terminal)):
        updates = body.model_dump(exclude_none=True)
        if not updates:
            raise HTTPException(status_code=400, detail="Nada que actualizar")
        res = await db.clientes.update_one({"_id": to_oid(cliente_id)}, {"$set": updates})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        return serialize(await db.clientes.find_one({"_id": to_oid(cliente_id)}))

    @router.delete("/clientes/{cliente_id}")
    async def delete_cliente(cliente_id: str, _=Depends(require_terminal)):
        res = await db.clientes.delete_one({"_id": to_oid(cliente_id)})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        return {"ok": True}

    return router
