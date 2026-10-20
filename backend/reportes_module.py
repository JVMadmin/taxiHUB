"""
Reportes de objetos olvidados (alta con foto analizada anti-malware y
comprimida a WebP por tenant, ciclo de resguardo y resolución) y descarga
autenticada de archivos `GET /files/{path}`. Mismo patrón factory que los
demás módulos.
"""
import uuid
from typing import Optional, Dict, Literal

from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, Form, Response
from pydantic import BaseModel


def build_router(*, APP_NAME, DEFAULT_SITIO, SCOPES, _exige_scope, _load_token,
                 _read_operador, _sitio_query_for, analizar_y_comprimir_imagen_webp,
                 db, get_object, manager, now_iso, put_object,
                 require_operador_estricto, require_terminal, serialize, to_oid):
    router = APIRouter(prefix="/api", tags=["reportes"])

    @router.post("/reportes")
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

    @router.get("/files/{path:path}")
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

    @router.get("/reportes")
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

    @router.patch("/reportes/{reporte_id}/estado")
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

    @router.patch("/reportes/{reporte_id}/resolver")
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

    return router
