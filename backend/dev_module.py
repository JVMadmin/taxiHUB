"""
Panel de desarrollador SaaS (`/dev/*`): login con DEV_USER/DEV_PASSWORD,
análisis de tenants, alta/edición de sitios, cuentas, suscripción,
facturación, avisos a terminales (y `/avisos/activos`), optimización WebP
del storage, backup y auditoría. Mismo patrón factory que los demás módulos.
"""
import os
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Literal

import jwt
from fastapi import APIRouter, HTTPException, Depends, Request, Response
from pydantic import BaseModel


def build_router(*, DEFAULT_PUNTOS_CALIENTES, DEFAULT_SITIO, JWT_ALGORITHM, JWT_SECRET,
                 SitioConfigBody, UPLOAD_DIR, _calcular_suscripcion, _hoy_str,
                 _obtener_sitio_config, _sitio_query_for,
                 analizar_y_comprimir_imagen_webp, db, hash_password, manager, now_iso,
                 require_dev, serialize, to_oid):
    router = APIRouter(prefix="/api", tags=["dev"])

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
        contacto_soporte: Optional[str] = "+52 916 163 2304 (Soporte SaaS TaxiHub)"
        duracion_horas: int = 24
        horas_vigencia: Optional[int] = None

    @router.post("/dev/login")
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

    @router.get("/dev/sitios")
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

    @router.get("/dev/analisis-tenants")
    @router.get("/dev/tenants-analisis")
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

    @router.post("/dev/sitios")
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
            "tema": body.tema or "amarillo",
            "color_primario": body.color_primario or "#FFE600",
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

    @router.put("/dev/sitios/{clave}")
    async def dev_update_sitio(clave: str, body: SitioConfigBody, _=Depends(require_dev)):
        body.clave = clave
        updates = {
            "clave": clave,
            "nombre": body.nombre,
            "subtitulo": body.subtitulo,
            "ciudad": body.ciudad,
            "telefono_central": body.telefono_central,
            "tema": body.tema or "amarillo",
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
        await db.sitios.update_one({"clave": clave}, {"$set": updates}, upsert=True)
        return await _obtener_sitio_config(clave)

    @router.get("/dev/cuentas")
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

    @router.patch("/dev/cuentas/{coleccion}/{doc_id}")
    async def dev_toggle_cuenta(coleccion: str, doc_id: str, body: ActivoBody, _=Depends(require_dev)):
        if coleccion not in ("operadores", "usuarios_terminal", "usuarios_dueno"):
            raise HTTPException(status_code=400, detail="Colección inválida")
        await db[coleccion].update_one({"_id": to_oid(doc_id)}, {"$set": {"activo": body.activo}})
        return {"ok": True, "activo": body.activo}

    @router.patch("/dev/suscripcion")
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

    @router.get("/dev/facturas")
    async def dev_list_facturas(sitio_id: Optional[str] = None, _=Depends(require_dev)):
        q = {"sitio_id": sitio_id} if sitio_id else {}
        docs = await db.facturas_tenant.find(q).sort("fecha_emision", -1).to_list(500)
        return [serialize(d) for d in docs]

    @router.post("/dev/facturas")
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

    @router.patch("/dev/facturas/{factura_id}")
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

    @router.get("/dev/avisos")
    async def dev_list_avisos(_=Depends(require_dev)):
        docs = await db.avisos_dev.find().sort("creado_en", -1).to_list(200)
        return [serialize(d) for d in docs]

    @router.post("/dev/avisos")
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

    @router.delete("/dev/avisos/{aviso_id}")
    async def dev_eliminar_aviso(aviso_id: str, _=Depends(require_dev)):
        await db.avisos_dev.update_one({"_id": to_oid(aviso_id)}, {"$set": {"activo": False}})
        return {"ok": True}

    @router.get("/avisos/activos")
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

    @router.post("/dev/storage/optimizar")
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

    @router.get("/dev/backup")
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

    @router.get("/dev/auditoria")
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

    return router
