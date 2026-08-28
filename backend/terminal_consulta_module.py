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

    # -----------------------------------------------------------------
    # Choferes + expediente
    # -----------------------------------------------------------------
    @router.get("/conductores")
    async def lista_conductores(_=Depends(require_terminal)):
        ops = await db.operadores.find().sort("nombre", 1).to_list(1000)
        vehs = {v.get("operador_conductor_id"): v for v in await db.vehiculos.find().to_list(1000)}
        out = []
        for o in ops:
            v = vehs.get(str(o["_id"]))
            out.append({
                **serialize(o),
                "vehiculo": {"id": str(v["_id"]), "numero_economico": v.get("numero_economico"),
                             "marca": v.get("marca"), "modelo": v.get("modelo")} if v else None,
            })
        return out

    @router.get("/conductores/{operador_id}")
    async def expediente_conductor(operador_id: str, _=Depends(require_terminal)):
        try:
            op = await db.operadores.find_one({"_id": to_oid(operador_id)})
        except Exception:
            raise HTTPException(404, "Conductor no encontrado")
        if not op:
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
            documentos.append({"tipo": tipo, "numero": d.get("numero"), "vence_en": d.get("vence_en"), "estado": estado})
        mes = hoy.strftime("%Y-%m")
        servicios_mes = 0
        async for sv in db.servicios.find(
            {"operador_asignado_id": operador_id, "estado": "completado"},
            {"timestamp_creacion": 1},
        ):
            if str(sv.get("timestamp_creacion", "")).startswith(mes):
                servicios_mes += 1
        turno_activo = await db.turnos.find_one({"operador_id": operador_id, "fin": None})
        socio_nombre = await _nombre_socio((veh or {}).get("propietario_id"))
        return {
            "conductor": {"id": str(op["_id"]), "nombre": op.get("nombre"), "telefono": op.get("telefono"),
                          "estado": op.get("estado"), "foto_url": op.get("foto_url"), "usuario": op.get("usuario")},
            "unidad": ({"id": str(veh["_id"]), "numero_economico": veh.get("numero_economico"),
                        "marca": veh.get("marca"), "modelo": veh.get("modelo"), "placa": veh.get("placa"),
                        "socio": socio_nombre} if veh else None),
            "ingreso": op.get("creado"),
            "documentos": documentos,
            "alertas": {"vencidos": vencidos, "por_vencer": por_vencer, "faltantes": faltantes},
            "servicios_completados": servicios_mes,
            "turno_activo": bool(turno_activo),
        }

    # -----------------------------------------------------------------
    # Socios (consulta)
    # -----------------------------------------------------------------
    @router.get("/socios")
    async def lista_socios(_=Depends(require_terminal)):
        socios = await db.usuarios_dueno.find().sort("nombre", 1).to_list(500)
        out = []
        for s in socios:
            unidades = await db.vehiculos.count_documents({"propietario_id": str(s["_id"]), "activo": True})
            out.append({"id": str(s["_id"]), "nombre": s.get("nombre"), "usuario": s.get("usuario"),
                        "activo": s.get("activo", True), "unidades": unidades})
        return out

    @router.get("/socios/{socio_id}")
    async def detalle_socio(socio_id: str, _=Depends(require_terminal)):
        try:
            s = await db.usuarios_dueno.find_one({"_id": to_oid(socio_id)})
        except Exception:
            raise HTTPException(404, "Socio no encontrado")
        if not s:
            raise HTTPException(404, "Socio no encontrado")
        vehs = await db.vehiculos.find({"propietario_id": socio_id}).to_list(500)
        veh_ids = [str(v["_id"]) for v in vehs]
        ops = []
        if vehs:
            opids = [v.get("operador_conductor_id") for v in vehs if v.get("operador_conductor_id")]
            ops = await db.operadores.find({"_id": {"$in": [to_oid(i) for i in opids]}}).to_list(300)
        return {
            "socio": {"id": str(s["_id"]), "nombre": s.get("nombre"), "usuario": s.get("usuario")},
            "unidades": len(vehs),
            "conductores": [{"id": str(o["_id"]), "nombre": o.get("nombre"), "estado": o.get("estado")} for o in ops],
            "vehiculos": [{"id": str(v["_id"]), "numero_economico": v.get("numero_economico"),
                           "marca": v.get("marca"), "modelo": v.get("modelo"),
                           "conductor": next((o.get("nombre") for o in ops
                                              if str(o["_id"]) == v.get("operador_conductor_id")), None)} for v in vehs],
        }

    # -----------------------------------------------------------------
    # Mantenimiento (consulta)
    # -----------------------------------------------------------------
    @router.get("/mantenimiento")
    async def mantenimiento_resumen(_=Depends(require_terminal)):
        vehs = await db.vehiculos.find({"activo": True}).to_list(1000)
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
    async def combustible_historial(_=Depends(require_terminal)):
        cargas = await db.combustible_cargas.find().sort("creado", -1).to_list(200)
        vehs = {str(v["_id"]): v.get("numero_economico") for v in await db.vehiculos.find().to_list(1000)}
        ops = {str(o["_id"]): o.get("nombre") for o in await db.operadores.find().to_list(1000)}
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
    async def asignaciones_recientes(_=Depends(require_terminal)):
        docs = await db.asignaciones.find().sort("inicio", -1).to_list(100)
        vehs = {str(v["_id"]): v.get("numero_economico") for v in await db.vehiculos.find().to_list(1000)}
        ops = {str(o["_id"]): o.get("nombre") for o in await db.operadores.find().to_list(1000)}
        socios = {str(s["_id"]): s.get("nombre") for s in await db.usuarios_dueno.find().to_list(500)}
        return [{
            "id": str(d["_id"]), "vehiculo": vehs.get(d.get("vehiculo_id"), "—"),
            "conductor": ops.get(d.get("operador_id"), "—"), "socio": socios.get(d.get("socio_id"), "—"),
            "inicio": d.get("inicio"), "fin": d.get("fin"), "activo": d.get("activo", False),
        } for d in docs]

    # -----------------------------------------------------------------
    # Dashboard del sitio (F16)
    # -----------------------------------------------------------------
    @router.get("/dashboard")
    async def dashboard_sitio(_=Depends(require_terminal)):
        hoy = datetime.now(timezone.utc)
        hoy_prefix = hoy.strftime("%Y-%m-%d")
        mes = hoy.strftime("%Y-%m")
        ops = await db.operadores.find({}, {"estado": 1}).to_list(1000)
        estados = {"libre": 0, "ocupado": 0, "no_disponible": 0, "fuera_de_servicio": 0, "averiado": 0}
        for o in ops:
            e = o.get("estado") or "fuera_de_servicio"
            estados[e] = estados.get(e, 0) + 1
        servicios_hoy = await db.servicios.count_documents({"timestamp_creacion": {"$regex": f"^{hoy_prefix}"}})
        completados_mes = await db.servicios.count_documents(
            {"estado": "completado", "timestamp_creacion": {"$regex": f"^{mes}"}})
        cancelados_mes = await db.servicios.count_documents(
            {"estado": "cancelado", "timestamp_creacion": {"$regex": f"^{mes}"}})
        activos = await db.servicios.count_documents({"estado": {"$in": ["asignado", "en_curso"]}})
        socios_total = await db.usuarios_dueno.count_documents({})
        unidades = await db.vehiculos.count_documents({"activo": True})
        return {
            "estados": estados,
            "servicios_hoy": servicios_hoy,
            "servicios_activos": activos,
            "completados_mes": completados_mes,
            "cancelados_mes": cancelados_mes,
            "socios": socios_total,
            "unidades": unidades,
            "conductores": len(ops),
        }

    return router
