"""
Panel del dueño de flota (`/dueno/*`) y notificaciones a responsables de
la terminal. Ownership por `vehiculos.propietario_id`; los helpers
(_vehiculos_de_dueno, etc.) siguen en server.py porque los usan otros
módulos. Mismo patrón factory que los demás módulos.
"""
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict

from fastapi import APIRouter, HTTPException, Depends, Query


def build_router(*, DEFAULT_SITIO, TRACK_MAX_POINTS, _calcular_suscripcion,
                 _construir_focos_por_zona, _enriquecer_vehiculo, _hoy_str,
                 _mapa_tipos_vehiculo, _operador_ids_de_dueno,
                 _vehiculo_de_dueno_o_404, _vehiculo_resumen, _vehiculos_de_dueno, db,
                 require_dueno, require_terminal, serialize, to_oid):
    router = APIRouter(prefix="/api", tags=["dueno"])

    @router.get("/dueno/me")
    async def dueno_me(current: dict = Depends(require_dueno)):
        out = dict(current)
        out["suscripcion"] = _calcular_suscripcion(out.get("licencia_vence_en"), default_dias=28, plan="Licencia Socio Concesionario")
        return out

    @router.get("/dueno/dashboard")
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

    @router.get("/dueno/flota")
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

    @router.get("/dueno/flota/{vehiculo_id}")
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

    @router.get("/dueno/servicios")
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

    @router.get("/dueno/servicios/{servicio_id}")
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

    @router.get("/dueno/reportes")
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

    @router.get("/dueno/notificaciones")
    async def dueno_notificaciones(
        limite: int = Query(50, ge=1, le=200),
        current: dict = Depends(require_dueno),
    ):
        """Bandeja de eventos operativos para socios/dueños (turnos, cargas combustible, incidencias)."""
        dueno_id = current["id"]
        vehiculos = await _vehiculos_de_dueno(dueno_id)
        op_ids = [v["operador_conductor_id"] for v in vehiculos if v.get("operador_conductor_id")]
        query_or: List[dict] = [{"propietario_id": dueno_id}]
        if op_ids:
            query_or.append({"operador_id": {"$in": op_ids}})
        docs = await db.notificaciones_responsables.find({"$or": query_or}).sort("creado", -1).to_list(limite)
        return {"notificaciones": [serialize(d) for d in docs]}

    @router.get("/terminal/notificaciones-responsables")
    async def terminal_notificaciones_responsables(
        limite: int = Query(50, ge=1, le=200),
        current: dict = Depends(require_terminal),
    ):
        """Bandeja de eventos operativos para la central de despacho."""
        sitio_id = current.get("sitio_id") or DEFAULT_SITIO
        docs = await db.notificaciones_responsables.find({"sitio_id": sitio_id}).sort("creado", -1).to_list(limite)
        return {"notificaciones": [serialize(d) for d in docs]}

    return router
