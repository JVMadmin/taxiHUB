"""
Login y cuentas: operador (`/auth/login`, `/auth/me`), pasajero
(`/clientes/login`), operadoras de terminal (`/terminal/usuarios`,
`/terminal/login`) y dueños (`/dueno/usuarios`, `/dueno/login`). Cada token
lleva su scope y `sitio_id`. Las dependencias `require_*` siguen en
server.py porque las usan todos los routers. Mismo patrón factory que los
demás módulos.
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import APIRouter, HTTPException, Depends, Request


def build_router(*, ClienteLoginBody, DEFAULT_SITIO, DuenoLoginBody, DuenoUserCreate,
                 JWT_ALGORITHM, JWT_SECRET, LoginBody, TerminalLoginBody,
                 TerminalUserCreate, _mapa_tipos_vehiculo, _require_terminal_or_dev,
                 _sitio_query_for, _vehiculo_resumen, create_token, db,
                 get_current_operador, hash_password, now_iso, serialize, to_oid,
                 verify_password):
    router = APIRouter(prefix="/api", tags=["auth"])

    @router.post("/auth/login")
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

    @router.get("/auth/me")
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
    @router.post("/clientes/login")
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

    @router.post("/terminal/usuarios")
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

    @router.get("/terminal/usuarios")
    async def list_usuarios_terminal(current: dict = Depends(_require_terminal_or_dev)):
        if current.get("_actor") == "dev":
            docs = await db.usuarios_terminal.find().to_list(1000)
        else:
            docs = await db.usuarios_terminal.find(_sitio_query_for(current.get("sitio_id"))).to_list(1000)
        return [serialize(d) for d in docs]

    @router.post("/terminal/login")
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

    @router.post("/dueno/usuarios")
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

    @router.get("/dueno/usuarios")
    async def list_usuarios_dueno(current: dict = Depends(_require_terminal_or_dev)):
        if current.get("_actor") == "dev":
            docs = await db.usuarios_dueno.find().to_list(1000)
        else:
            docs = await db.usuarios_dueno.find(_sitio_query_for(current.get("sitio_id"))).to_list(1000)
        return [serialize(d) for d in docs]

    @router.post("/dueno/login")
    async def dueno_login(body: DuenoLoginBody):
        d = await db.usuarios_dueno.find_one({"usuario": body.usuario})
        if not d or not verify_password(body.contrasena, d.get("password_hash", "")):
            raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
        if d.get("activo") is False:
            raise HTTPException(status_code=403, detail="Cuenta desactivada")
        token = create_dueno_token(str(d["_id"]), d["usuario"], sitio_id=d.get("sitio_id") or DEFAULT_SITIO)
        return {"token": token, "usuario": serialize(d)}

    return router
