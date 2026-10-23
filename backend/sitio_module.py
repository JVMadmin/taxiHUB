"""
Imagen y configuración del sitio: fotos de perfil, logo global y por
sitio (`/dev/logo`, `/dev/sitios/{clave}/logo`), evidencia del dueño y
lectura/edición de la configuración (`/config/logo`, `/config/sitio`,
`/config/{key}`). Las imágenes pasan por el análisis de seguridad y la
compresión WebP de server.py (`_guardar_imagen`), que también usan otros
módulos. Mismo patrón factory que los demás módulos.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, Form


def build_router(*, DEFAULT_SITIO, JWT_ALGORITHM, JWT_SECRET, SitioConfigBody,
                 _any_autenticado, _guardar_imagen, _mismo_o_terminal,
                 _obtener_sitio_config, _require_terminal_or_dev, db, now_iso,
                 require_dev, require_dueno, require_terminal, to_oid):
    router = APIRouter(prefix="/api", tags=["sitio"])

    @router.post("/perfil/{coleccion}/{doc_id}/foto")
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

    @router.post("/dev/logo")
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

    @router.post("/dev/sitios/{clave}/logo")
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

    @router.post("/dueno/evidencia")
    async def subir_evidencia_dueno(foto: UploadFile = File(...), current: dict = Depends(require_dueno)):
        """Sube la foto de evidencia de una carga de combustible (mismo mecanismo que
        las fotos de perfil/vehículo: _guardar_imagen + db.archivos + GET /api/files)."""
        url = await _guardar_imagen(foto, "evidencias", sitio_id=current.get("sitio_id") or DEFAULT_SITIO)
        return {"evidencia_url": url}

    @router.get("/config/logo")
    async def get_logo(sitio_id: Optional[str] = None):
        if sitio_id:
            s = await db.sitios.find_one({"clave": sitio_id})
            if s and s.get("logo_url"):
                return {"foto_url": s["logo_url"]}
        c = await db.config.find_one({"key": "logo"})
        return {"foto_url": c["foto_url"] if c else None}

    @router.get("/config/sitio")
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

    @router.get("/config/{key}")
    async def read_config(key: str, _=Depends(_any_autenticado)):
        doc = await db.config.find_one({"key": key})
        return {"key": key, "valor": doc.get("valor") if doc else None}

    @router.put("/config/sitio")
    async def update_config_sitio(body: SitioConfigBody, request: Request):
        actor = await _require_terminal_or_dev(request)
        target_sitio = body.clave or body.sitio_id or actor.get("sitio_id") or DEFAULT_SITIO
        tema_elegido = body.tema_default or body.tema or "amarillo"
        updates = {
            "clave": target_sitio,
            "sitio_id": target_sitio,
            "nombre": body.nombre,
            "subtitulo": body.subtitulo,
            "ciudad": body.ciudad,
            "telefono_central": body.telefono_central,
            "tema": tema_elegido,
            "tema_default": tema_elegido,
            "color_primario": body.color_primario or "#FFE600",
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

    return router
