"""
Consultas de la TERMINAL (F7/F8/F13/F16 premium): expedientes, socios,
mantenimiento, combustible y dashboard del sitio — SOLO LECTURA (§27/§39).

La operadora consulta; no escribe. Mismo patrón factory que los demás módulos.
"""
from datetime import datetime, timezone
from typing import Optional, List, Dict

from fastapi import APIRouter, HTTPException, Depends


def build_router(*, db, serialize, to_oid, now_iso, require_terminal, TRACK_MAX_POINTS):
    router = APIRouter(prefix="/api/terminal", tags=["terminal-consulta"])

    DOC_TIPOS = ("licencia", "ine", "seguro")
    DOC_TIPOS_SCT_EXTRA = ("tarjeton_sct", "antidoping", "carta_antecedentes", "comprobante_domicilio")

    def _estado_vigencia(vence_en, hoy):
        try:
            dias = (datetime.fromisoformat(vence_en).date() - hoy.date()).days
        except (TypeError, ValueError):
            return "vencido"
        if dias <= 0:
            return "vencido"
        if dias <= 30:
            return "por_vencer"
        return "vigente"

    async def _nombre_socio(propietario_id):
        if not propietario_id:
            return None
        try:
            d = await db.usuarios_dueno.find_one({"_id": to_oid(propietario_id)})
        except Exception:
            return None
        return d.get("nombre") if d else None

    def _sitio_query(current: dict) -> dict:
        sitio = (current or {}).get("sitio_id") or (current or {}).get("_tenant") or "default"
        if sitio == "default":
            return {"$or": [{"sitio_id": "default"}, {"sitio_id": None}, {"sitio_id": {"$exists": False}}]}
        return {"sitio_id": sitio}

    def _mismo_sitio(doc: Optional[dict], current: dict) -> bool:
        if not doc:
            return False
        sitio = (current or {}).get("sitio_id") or (current or {}).get("_tenant") or "default"
        doc_sitio = doc.get("sitio_id") or "default"
        return doc_sitio == sitio

    # -----------------------------------------------------------------
    # Choferes + expediente completo SCT / SEMOVI
    # -----------------------------------------------------------------
    @router.get("/conductores")
    async def lista_conductores(current=Depends(require_terminal)):
        s_filter = _sitio_query(current)
        ops = await db.operadores.find(s_filter).sort("nombre", 1).to_list(1000)
        vehs_raw = await db.vehiculos.find(s_filter).to_list(1000)
        vehs = {v.get("operador_conductor_id"): v for v in vehs_raw}
        socios_map = {str(s["_id"]): s.get("nombre") for s in await db.usuarios_dueno.find(s_filter).to_list(500)}
        hoy = datetime.now(timezone.utc)
        hoy_prefix = hoy.strftime("%Y-%m-%d")
        svs_hoy = await db.servicios.find(
            {**s_filter, "timestamp_creacion": {"$regex": f"^{hoy_prefix}"}, "estado": {"$ne": "cancelado"}},
            {"operador_asignado_id": 1},
        ).to_list(2000)
        conteo_hoy: Dict[str, int] = {}
        for sv in svs_hoy:
            oid = sv.get("operador_asignado_id")
            if oid:
                conteo_hoy[oid] = conteo_hoy.get(oid, 0) + 1

        out = []
        for idx, o in enumerate(ops):
            oid = str(o["_id"])
            v = vehs.get(oid)
            lic_estado = _estado_vigencia(o.get("licencia_vence_en", "2028-01-01"), hoy) if o.get("licencia_vence_en") else "vigente"
            socio_nom = socios_map.get((v or {}).get("propietario_id")) if v else None
            ser_o = serialize(o)
            if not ser_o.get("foto_url"):
                ser_o["foto_url"] = f"/assets/drivers/driver-{(idx % 15) + 1:02d}.jpg"
            if not ser_o.get("licencia_numero") and ser_o.get("licencia_folio"):
                ser_o["licencia_numero"] = ser_o.get("licencia_folio")
            if not ser_o.get("tarjeton_sct") and ser_o.get("tarjeton_semovi"):
                ser_o["tarjeton_sct"] = ser_o.get("tarjeton_semovi")
            out.append({
                **ser_o,
                "servicios_hoy": conteo_hoy.get(oid, o.get("servicios_hoy", 0)),
                "licencia_estado": lic_estado,
                "socio_nombre": socio_nom,
                "vehiculo": {
                    "id": str(v["_id"]),
                    "numero_economico": v.get("numero_economico"),
                    "marca": v.get("marca"),
                    "modelo": v.get("modelo"),
                    "placa": v.get("placa"),
                    "color": v.get("color"),
                    "foto_url": v.get("foto_url"),
                    "cuota_diaria": v.get("cuota_diaria"),
                } if v else None,
            })
        return out

    @router.get("/conductores/{operador_id}")
    async def expediente_conductor(operador_id: str, current=Depends(require_terminal)):
        try:
            op = await db.operadores.find_one({"_id": to_oid(operador_id)})
        except Exception:
            raise HTTPException(404, "Conductor no encontrado")
        if not op or not _mismo_sitio(op, current):
            raise HTTPException(404, "Conductor no encontrado")
        veh = await db.vehiculos.find_one({"operador_conductor_id": operador_id})
        hoy = datetime.now(timezone.utc)
        docs_raw = await db.documentos_conductor.find({"operador_id": operador_id}).to_list(50)
        por_tipo = {d["tipo"]: d for d in docs_raw}
        documentos, vencidos, por_vencer, faltantes = [], 0, 0, []
        for tipo in DOC_TIPOS:
            d = por_tipo.get(tipo)
            if not d:
                documentos.append({"tipo": tipo, "numero": None, "vence_en": None, "estado": "faltante"})
                faltantes.append(tipo)
                continue
            estado = _estado_vigencia(d.get("vence_en", ""), hoy)
            if estado == "vencido":
                vencidos += 1
            elif estado == "por_vencer":
                por_vencer += 1
            documentos.append({
                "tipo": tipo,
                "numero": d.get("numero"),
                "vence_en": d.get("vence_en"),
                "emisor": d.get("emisor"),
                "estado": estado,
            })

        documentos_sct = []
        for tipo in DOC_TIPOS_SCT_EXTRA:
            d = por_tipo.get(tipo)
            if d:
                est = _estado_vigencia(d.get("vence_en", ""), hoy)
                documentos_sct.append({
                    "tipo": tipo,
                    "numero": d.get("numero"),
                    "vence_en": d.get("vence_en"),
                    "emisor": d.get("emisor"),
                    "estado": est,
                })

        mes = hoy.strftime("%Y-%m")
        hoy_prefix = hoy.strftime("%Y-%m-%d")
        servicios_mes = 0
        servicios_hoy = 0
        servicios_recientes = []
        async for sv in db.servicios.find(
            {"operador_asignado_id": operador_id},
        ).sort("timestamp_creacion", -1).limit(40):
            ts_c = str(sv.get("timestamp_creacion", ""))
            if sv.get("estado") == "completado" and ts_c.startswith(mes):
                servicios_mes += 1
            if sv.get("estado") != "cancelado" and ts_c.startswith(hoy_prefix):
                servicios_hoy += 1
            if len(servicios_recientes) < 6:
                servicios_recientes.append({
                    "id": str(sv["_id"]),
                    "folio": sv.get("folio"),
                    "origen": sv.get("origen"),
                    "destino": sv.get("destino"),
                    "costo": sv.get("costo"),
                    "estado": sv.get("estado"),
                    "timestamp_creacion": sv.get("timestamp_creacion"),
                })

        turno_activo = await db.turnos.find_one({"operador_id": operador_id, "fin": None})
        socio_nombre = await _nombre_socio((veh or {}).get("propietario_id"))
        seed_idx = sum(ord(c) for c in str(op["_id"])) % 15
        foto_op = op.get("foto_url") or f"/assets/drivers/driver-{seed_idx + 1:02d}.jpg"
        return {
            "conductor": {
                "id": str(op["_id"]),
                "nombre": op.get("nombre"),
                "telefono": op.get("telefono"),
                "estado": op.get("estado"),
                "foto_url": foto_op,
                "usuario": op.get("usuario"),
                "curp": op.get("curp"),
                "rfc": op.get("rfc"),
                "nss_imss": op.get("nss_imss"),
                "tipo_sangre": op.get("tipo_sangre"),
                "licencia_numero": op.get("licencia_numero") or op.get("licencia_folio"),
                "licencia_tipo": op.get("licencia_tipo") or "Estatal Chofer Público Tipo B (SCT)",
                "licencia_vence_en": op.get("licencia_vence_en") or (por_tipo.get("licencia") or {}).get("vence_en"),
                "tarjeton_sct": op.get("tarjeton_sct") or op.get("tarjeton_semovi"),
                "antidoping_resultado": op.get("antidoping_resultado") or op.get("examen_medico") or "NEGATIVO (Apto)",
                "antidoping_fecha": op.get("antidoping_fecha"),
                "carta_antecedentes_folio": op.get("carta_antecedentes_folio"),
                "domicilio": op.get("domicilio"),
                "contacto_emergencia": op.get("contacto_emergencia"),
                "telefono_emergencia": op.get("telefono_emergencia"),
                "calificacion": op.get("calificacion") or op.get("calificacion_promedio") or 4.9,
                "infracciones_sct": op.get("infracciones_sct", 0),
                "servicios_hoy": servicios_hoy,
                "servicios_historicos": op.get("servicios_historicos", servicios_mes),
                "notas_expediente": op.get("notas_expediente"),
            },
            "unidad": ({
                "id": str(veh["_id"]),
                "numero_economico": veh.get("numero_economico"),
                "marca": veh.get("marca"),
                "modelo": veh.get("modelo"),
                "anio": veh.get("anio"),
                "color": veh.get("color"),
                "placa": veh.get("placa"),
                "foto_url": veh.get("foto_url"),
                "poliza_seguro": veh.get("poliza_seguro"),
                "aseguradora": veh.get("aseguradora"),
                "seguro_vence_en": veh.get("seguro_vence_en"),
                "verificacion_ambiental": veh.get("verificacion_ambiental") or veh.get("revista_vehicular"),
                "odometro_km": veh.get("odometro_km"),
                "cuota_diaria": veh.get("cuota_diaria"),
                "socio": socio_nombre,
            } if veh else None),
            "ingreso": op.get("creado"),
            "documentos": documentos,
            "documentos_sct": documentos_sct,
            "alertas": {"vencidos": vencidos, "por_vencer": por_vencer, "faltantes": faltantes},
            "servicios_completados": servicios_mes,
            "servicios_recientes": servicios_recientes,
            "turno_activo": bool(turno_activo),
        }

    # -----------------------------------------------------------------
    # Socios (expediente completo concesionario SCT)
    # -----------------------------------------------------------------
    @router.get("/socios")
    async def lista_socios(current=Depends(require_terminal)):
        s_filter = _sitio_query(current)
        socios = await db.usuarios_dueno.find(s_filter).sort("nombre", 1).to_list(500)
        out = []
        for idx, s in enumerate(socios):
            sid = str(s["_id"])
            unidades = await db.vehiculos.count_documents({**s_filter, "propietario_id": sid, "activo": True})
            out.append({
                "id": sid,
                "nombre": s.get("nombre"),
                "usuario": s.get("usuario"),
                "activo": s.get("activo", True),
                "unidades": unidades,
                "foto_url": s.get("foto_url") or f"/assets/drivers/driver-{(idx % 15) + 1:02d}.jpg",
                "telefono": s.get("telefono"),
                "email": s.get("email"),
                "rfc": s.get("rfc"),
                "curp": s.get("curp"),
                "concesion_folio": s.get("concesion_folio"),
                "modalidad_sct": s.get("modalidad_sct") or "Concesión Servicio Público Taxi",
                "vigencia_concesion": s.get("vigencia_concesion") or s.get("licencia_vence_en"),
                "poliza_flota": s.get("poliza_flota"),
                "aseguradora": s.get("aseguradora"),
                "estatus_cuota_sitio": s.get("estatus_cuota_sitio") or "Al corriente",
                "cuota_mensual_central": s.get("cuota_mensual_central", 1200.0),
            })
        return out

    @router.get("/socios/{socio_id}")
    async def detalle_socio(socio_id: str, current=Depends(require_terminal)):
        try:
            s = await db.usuarios_dueno.find_one({"_id": to_oid(socio_id)})
        except Exception:
            raise HTTPException(404, "Socio no encontrado")
        if not s or not _mismo_sitio(s, current):
            raise HTTPException(404, "Socio no encontrado")
        s_filter = _sitio_query(current)
        vehs = await db.vehiculos.find({**s_filter, "propietario_id": socio_id}).to_list(500)
        ops = []
        if vehs:
            opids = [v.get("operador_conductor_id") for v in vehs if v.get("operador_conductor_id")]
            ops = await db.operadores.find({"_id": {"$in": [to_oid(i) for i in opids]}}).to_list(300)
        cuota_diaria_flota = sum(float(v.get("cuota_diaria") or 400.0) for v in vehs)
        seed_idx = sum(ord(c) for c in str(s["_id"])) % 15
        return {
            "socio": {
                "id": str(s["_id"]),
                "nombre": s.get("nombre"),
                "usuario": s.get("usuario"),
                "foto_url": s.get("foto_url") or f"/assets/drivers/driver-{seed_idx + 1:02d}.jpg",
                "telefono": s.get("telefono"),
                "email": s.get("email"),
                "rfc": s.get("rfc"),
                "curp": s.get("curp"),
                "domicilio": s.get("domicilio") or s.get("domicilio_fiscal"),
                "concesion_folio": s.get("concesion_folio"),
                "modalidad_sct": s.get("modalidad_sct") or "Concesión Servicio Público Taxi",
                "vigencia_concesion": s.get("vigencia_concesion") or s.get("licencia_vence_en"),
                "poliza_flota": s.get("poliza_flota"),
                "aseguradora": s.get("aseguradora"),
                "contacto_emergencia": s.get("contacto_emergencia") or s.get("banco_cuenta"),
                "estatus_cuota_sitio": s.get("estatus_cuota_sitio") or "Al corriente",
                "cuota_mensual_central": s.get("cuota_mensual_central", 1200.0),
                "notas_expediente": s.get("notas_expediente"),
                "ingreso": s.get("creado"),
            },
            "unidades": len(vehs),
            "cuota_diaria_flota": round(cuota_diaria_flota, 2),
            "conductores": [{
                "id": str(o["_id"]),
                "nombre": o.get("nombre"),
                "estado": o.get("estado"),
                "foto_url": o.get("foto_url") or f"/assets/drivers/driver-{(i % 15) + 1:02d}.jpg",
                "telefono": o.get("telefono"),
                "placa": o.get("placa"),
                "licencia_numero": o.get("licencia_numero") or o.get("licencia_folio"),
                "licencia_vence_en": o.get("licencia_vence_en"),
                "calificacion": o.get("calificacion") or o.get("calificacion_promedio") or 4.9,
            } for i, o in enumerate(ops)],
            "vehiculos": [{
                "id": str(v["_id"]),
                "numero_economico": v.get("numero_economico"),
                "marca": v.get("marca"),
                "modelo": v.get("modelo"),
                "anio": v.get("anio"),
                "placa": v.get("placa"),
                "color": v.get("color"),
                "foto_url": v.get("foto_url"),
                "cuota_diaria": v.get("cuota_diaria", 400.0),
                "odometro_km": v.get("odometro_km"),
                "poliza_seguro": v.get("poliza_seguro"),
                "aseguradora": v.get("aseguradora"),
                "conductor": next((o.get("nombre") for o in ops
                                   if str(o["_id"]) == v.get("operador_conductor_id")), None),
                "conductor_foto": next((o.get("foto_url") or f"/assets/drivers/driver-{(i % 15) + 1:02d}.jpg" for i, o in enumerate(ops)
                                        if str(o["_id"]) == v.get("operador_conductor_id")), None),
            } for v in vehs],
        }

    # -----------------------------------------------------------------
    # Mantenimiento (consulta)
    # -----------------------------------------------------------------
    @router.get("/mantenimiento")
    async def mantenimiento_resumen(current=Depends(require_terminal)):
        s_filter = _sitio_query(current)
        vehs = await db.vehiculos.find({**s_filter, "activo": True}).to_list(1000)
        out = []
        for v in vehs:
            vid = str(v["_id"])
            regs = await db.mantenimientos.find({"vehiculo_id": vid}).sort("realizado_en", -1).to_list(1)
            ultimo = regs[0] if regs else None
            out.append({
                "vehiculo_id": vid, "numero_economico": v.get("numero_economico"),
                "odometro_km": v.get("odometro_km"),
                "ultimo": ({"tipo": ultimo.get("tipo"), "realizado_en": ultimo.get("realizado_en"),
                            "costo": ultimo.get("costo")} if ultimo else None),
            })
        return {"vehiculos": out}

    # -----------------------------------------------------------------
    # Combustible (consulta §27: la terminal NO registra)
    # -----------------------------------------------------------------
    @router.get("/combustible")
    async def combustible_historial(current=Depends(require_terminal)):
        s_filter = _sitio_query(current)
        vehs = {str(v["_id"]): v.get("numero_economico") for v in await db.vehiculos.find(s_filter).to_list(1000)}
        ops = {str(o["_id"]): o.get("nombre") for o in await db.operadores.find(s_filter).to_list(1000)}
        cargas_raw = await db.combustible_cargas.find().sort("creado", -1).to_list(400)
        cargas = [
            c for c in cargas_raw
            if (c.get("vehiculo_id") in vehs) or (c.get("operador_id") in ops)
        ][:200]
        out = [{
            "id": str(c["_id"]), "fecha": c.get("fecha"), "litros": c.get("litros"),
            "costo": c.get("costo"), "odometro_km": c.get("odometro_km"),
            "estacion": c.get("estacion"),
            "unidad": vehs.get(c.get("vehiculo_id"), "—"),
            "registro_por": ops.get(c.get("operador_id"), "socio"),
        } for c in cargas]
        return {"cargas": out}

    # -----------------------------------------------------------------
    # Asignaciones (consulta)
    # -----------------------------------------------------------------
    @router.get("/asignaciones")
    async def asignaciones_recientes(current=Depends(require_terminal)):
        s_filter = _sitio_query(current)
        vehs = {str(v["_id"]): v.get("numero_economico") for v in await db.vehiculos.find(s_filter).to_list(1000)}
        ops = {str(o["_id"]): o.get("nombre") for o in await db.operadores.find(s_filter).to_list(1000)}
        socios = {str(s["_id"]): s.get("nombre") for s in await db.usuarios_dueno.find(s_filter).to_list(500)}
        docs_raw = await db.asignaciones.find().sort("inicio", -1).to_list(300)
        docs = [
            d for d in docs_raw
            if (d.get("vehiculo_id") in vehs) or (d.get("operador_id") in ops) or (d.get("socio_id") in socios)
        ][:100]
        return [{
            "id": str(d["_id"]), "vehiculo": vehs.get(d.get("vehiculo_id"), "—"),
            "conductor": ops.get(d.get("operador_id"), "—"), "socio": socios.get(d.get("socio_id"), "—"),
            "inicio": d.get("inicio"), "fin": d.get("fin"), "activo": d.get("activo", False),
        } for d in docs]

    # -----------------------------------------------------------------
    # Dashboard del sitio (F16 + Focos de Servicios por Zona)
    # -----------------------------------------------------------------
    @router.get("/dashboard")
    async def dashboard_sitio(current=Depends(require_terminal)):
        s_filter = _sitio_query(current)
        hoy = datetime.now(timezone.utc)
        hoy_prefix = hoy.strftime("%Y-%m-%d")
        mes = hoy.strftime("%Y-%m")
        ops = await db.operadores.find(s_filter, {"estado": 1}).to_list(1000)
        estados = {"libre": 0, "ocupado": 0, "no_disponible": 0, "fuera_de_servicio": 0, "averiado": 0}
        for o in ops:
            e = o.get("estado") or "fuera_de_servicio"
            estados[e] = estados.get(e, 0) + 1
        servicios_hoy = await db.servicios.count_documents({**s_filter, "timestamp_creacion": {"$regex": f"^{hoy_prefix}"}})
        completados_mes = await db.servicios.count_documents(
            {**s_filter, "estado": "completado", "timestamp_creacion": {"$regex": f"^{mes}"}})
        cancelados_mes = await db.servicios.count_documents(
            {**s_filter, "estado": "cancelado", "timestamp_creacion": {"$regex": f"^{mes}"}})
        activos = await db.servicios.count_documents({**s_filter, "estado": {"$in": ["asignado", "en_curso"]}})
        socios_total = await db.usuarios_dueno.count_documents(s_filter)
        unidades = await db.vehiculos.count_documents({**s_filter, "activo": True})

        # Focos de servicios por zona con semáforo de demanda
        colonias = await db.colonias.find(s_filter).to_list(200)
        svs_recientes = await db.servicios.find(
            {**s_filter, "estado": {"$ne": "cancelado"}},
            {"origen": 1, "destino": 1, "colonia_origen": 1, "timestamp_creacion": 1, "costo": 1},
        ).sort("timestamp_creacion", -1).limit(300).to_list(300)

        zonas_catalogo = [c.get("nombre") for c in colonias if c.get("nombre")] or [
            "Centro / Parque Central",
            "La Cañada",
            "Pakal-Ná / Estación Tren Maya",
            "Zona Hotelera / Ruinas",
            "ADO / Periférico Sur",
            "Col. Maya / Hospital",
        ]
        conteo_zona = {z: 0 for z in zonas_catalogo}
        ingresos_zona = {z: 0.0 for z in zonas_catalogo}
        for sv in svs_recientes:
            texto = f"{sv.get('colonia_origen') or ''} {sv.get('origen') or ''} {sv.get('destino') or ''}".lower()
            matched = None
            for z in zonas_catalogo:
                palabras = [p for p in z.lower().replace("/", " ").split() if len(p) >= 4]
                if any(p in texto for p in palabras):
                    matched = z
                    break
            if not matched and zonas_catalogo:
                if "pakal" in texto or "tren" in texto:
                    matched = next((z for z in zonas_catalogo if "pakal" in z.lower()), zonas_catalogo[0])
                elif "cañada" in texto or "canada" in texto:
                    matched = next((z for z in zonas_catalogo if "cañada" in z.lower()), zonas_catalogo[0])
                elif "hotel" in texto or "ruina" in texto or "tuli" in texto:
                    matched = next((z for z in zonas_catalogo if "hotel" in z.lower() or "ruina" in z.lower()), zonas_catalogo[0])
                elif "ado" in texto or "central" in texto or "mercado" in texto:
                    matched = zonas_catalogo[0]
                else:
                    matched = zonas_catalogo[hash(texto) % len(zonas_catalogo)]
            if matched:
                conteo_zona[matched] = conteo_zona.get(matched, 0) + 1
                ingresos_zona[matched] = round(ingresos_zona.get(matched, 0.0) + float(sv.get("costo") or 40.0), 2)

        max_sv = max(conteo_zona.values()) if conteo_zona else 1
        focos_por_zona = []
        for idx, z in enumerate(zonas_catalogo):
            cnt = conteo_zona.get(z, 0)
            ratio = (cnt / max_sv) if max_sv > 0 else 0
            if cnt >= 6 or ratio >= 0.75:
                nivel, color, bg = "Foco Alto", "#EF4444", "rgba(239,68,68,0.16)"
            elif cnt >= 3 or ratio >= 0.4:
                nivel, color, bg = "Demanda Media", "#F59E0B", "rgba(245,158,11,0.16)"
            elif cnt >= 1:
                nivel, color, bg = "Demanda Estable", "#10B981", "rgba(16,185,129,0.16)"
            else:
                nivel, color, bg = "Sin Tráfico", "#64748B", "rgba(100,116,139,0.16)"
            col_doc = next((c for c in colonias if c.get("nombre") == z), None)
            focos_por_zona.append({
                "zona": z,
                "servicios": cnt,
                "ingresos": round(ingresos_zona.get(z, 0.0), 2),
                "porcentaje": round(ratio * 100),
                "nivel": nivel,
                "color": color,
                "bg": bg,
                "tarifa_base": (col_doc or {}).get("tarifa_base", 40.0),
            })
        focos_por_zona.sort(key=lambda x: x["servicios"], reverse=True)

        return {
            "estados": estados,
            "servicios_hoy": servicios_hoy,
            "servicios_activos": activos,
            "completados_mes": completados_mes,
            "cancelados_mes": cancelados_mes,
            "socios": socios_total,
            "unidades": unidades,
            "conductores": len(ops),
            "focos_por_zona": focos_por_zona,
        }

    return router
