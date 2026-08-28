"""
Módulo adicional del Panel de Socios — taxiHUB.
Turnos/relevos, Combustible, Notificaciones centralizadas, Reparto de
ganancias, Conductores. Aditivo, mismo patrón que mantenimiento_module.py:
reutiliza require_dueno / _vehiculos_de_dueno / _vehiculo_de_dueno_o_404.
"""
from datetime import datetime, timezone
from typing import Optional, List, Literal
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
import uuid


def build_router(*, db, serialize, to_oid, now_iso, require_dueno,
                  _vehiculos_de_dueno, _vehiculo_de_dueno_o_404):
    router = APIRouter(prefix="/api/dueno", tags=["socios-extra"])

    # =================================================================
    # TURNOS / RELEVOS
    # =================================================================
    class TurnoConfig(BaseModel):
        vehiculo_id: str
        modo: Literal["normal", "turnos"]
        # modo "normal": un solo turno con operador_id y sin horario fijo
        # modo "turnos": dos turnos (dia/noche) con horario y renta
        turnos: List[dict]  # [{tipo, operador_id, horario_inicio?, horario_fin?, renta_semanal?}]

    @router.get("/turnos/resumen")
    async def turnos_resumen(current: dict = Depends(require_dueno)):
        vehiculos = await _vehiculos_de_dueno(current["id"])
        out = []
        renta_semana_total = 0
        for v in vehiculos:
            vid = str(v["_id"])
            config = await db.turnos_config.find_one({"vehiculo_id": vid})
            turnos = config.get("turnos", []) if config else []
            for t in turnos:
                renta_semana_total += t.get("renta_semanal", 0) or 0
            out.append({
                "vehiculo": serialize(v),
                "modo": config.get("modo", "normal") if config else "normal",
                "turnos": turnos,
            })
        return {"vehiculos": out, "renta_semana_total": renta_semana_total}

    @router.post("/turnos/config")
    async def guardar_turnos(body: TurnoConfig, current: dict = Depends(require_dueno)):
        await _vehiculo_de_dueno_o_404(body.vehiculo_id, current["id"])
        if body.modo == "normal" and len(body.turnos) > 1:
            raise HTTPException(400, "El modo normal admite un solo conductor, sin relevo")
        if body.modo == "turnos" and len(body.turnos) > 2:
            raise HTTPException(400, "El modo turnos admite máximo 2 (día/noche)")
        await db.turnos_config.update_one(
            {"vehiculo_id": body.vehiculo_id},
            {"$set": {"vehiculo_id": body.vehiculo_id, "modo": body.modo,
                      "turnos": body.turnos, "actualizado": now_iso()}},
            upsert=True,
        )
        return {"guardado": True}

    # =================================================================
    # COMBUSTIBLE
    # =================================================================
    class CargaCombustible(BaseModel):
        vehiculo_id: str
        fecha: str  # ISO date
        litros: float
        costo: float
        odometro_km: float
        evidencia_url: Optional[str] = None  # base64 o URL ya subida por el cliente

    @router.post("/combustible/carga")
    async def registrar_carga(body: CargaCombustible, current: dict = Depends(require_dueno)):
        await _vehiculo_de_dueno_o_404(body.vehiculo_id, current["id"])

        anterior = await db.combustible_cargas.find(
            {"vehiculo_id": body.vehiculo_id}
        ).sort("odometro_km", -1).to_list(1)

        rendimiento = None
        if anterior and anterior[0]["odometro_km"] < body.odometro_km:
            km_recorridos = body.odometro_km - anterior[0]["odometro_km"]
            if body.litros > 0:
                rendimiento = round(km_recorridos / body.litros, 1)

        doc = {
            "id": str(uuid.uuid4()), "vehiculo_id": body.vehiculo_id,
            "fecha": body.fecha, "litros": body.litros, "costo": body.costo,
            "odometro_km": body.odometro_km, "evidencia_url": body.evidencia_url,
            "rendimiento_km_l": rendimiento, "creado": now_iso(),
        }
        await db.combustible_cargas.insert_one(doc)

        # Alerta simple: 2 cargas seguidas con rendimiento bajo el promedio del vehículo
        alerta = None
        historico = await db.combustible_cargas.find(
            {"vehiculo_id": body.vehiculo_id, "rendimiento_km_l": {"$ne": None}}
        ).sort("fecha", -1).to_list(5)
        if len(historico) >= 2:
            promedio = sum(h["rendimiento_km_l"] for h in historico) / len(historico)
            ultimas_dos = historico[:2]
            if all(h["rendimiento_km_l"] < promedio * 0.8 for h in ultimas_dos):
                alerta = "Rendimiento bajo en las últimas 2 cargas — posible fuga o mal uso"

        return {"creado": True, "rendimiento_km_l": rendimiento, "alerta": alerta}

    @router.get("/combustible/historial")
    async def combustible_historial(current: dict = Depends(require_dueno)):
        vehiculo_ids = [str(v["_id"]) for v in await _vehiculos_de_dueno(current["id"])]
        if not vehiculo_ids:
            return {"cargas": [], "gasto_mes": 0, "rendimiento_promedio": None}
        cargas = await db.combustible_cargas.find(
            {"vehiculo_id": {"$in": vehiculo_ids}}
        ).sort("fecha", -1).to_list(200)
        mes_actual = datetime.now(timezone.utc).strftime("%Y-%m")
        gasto_mes = sum(c["costo"] for c in cargas if c["fecha"].startswith(mes_actual))
        rendimientos = [c["rendimiento_km_l"] for c in cargas if c.get("rendimiento_km_l")]
        promedio = round(sum(rendimientos) / len(rendimientos), 1) if rendimientos else None
        return {
            "cargas": [{**c, "_id": str(c["_id"])} for c in cargas],
            "gasto_mes": gasto_mes,
            "rendimiento_promedio": promedio,
        }

    # =================================================================
    # NOTIFICACIONES (calculadas, no se guardan aparte — nunca se desincronizan)
    # =================================================================
    @router.get("/notificaciones")
    async def notificaciones(current: dict = Depends(require_dueno)):
        vehiculos = await _vehiculos_de_dueno(current["id"])
        operador_ids = [v.get("operador_conductor_id") for v in vehiculos if v.get("operador_conductor_id")]
        operadores = {
            str(o["_id"]): o for o in (await db.operadores.find(
                {"_id": {"$in": [to_oid(i) for i in operador_ids]}}
            ).to_list(100) if operador_ids else [])
        }
        items = []
        hoy = datetime.now(timezone.utc)

        for v in vehiculos:
            vid = str(v["_id"])
            nombre = v.get("numero_economico", vid)

            # GPS: la última actualización vive en el operador (ISO string) y
            # no en el vehículo; si pasaron >30 min se marca critical.
            op = operadores.get(v.get("operador_conductor_id"))
            ultima = op.get("ultima_actualizacion") if op else None
            if ultima:
                try:
                    minutos = (hoy - datetime.fromisoformat(ultima)).total_seconds() / 60
                except (TypeError, ValueError):
                    minutos = None
                if minutos is not None and minutos > 30:
                    items.append({"severidad": "critical", "vehiculo": nombre,
                                   "mensaje": f"{nombre} sin señal GPS reciente"})

            # Mantenimiento (reutiliza mantenimientos ya guardados)
            registros = await db.mantenimientos.find({"vehiculo_id": vid}).to_list(50)
            if not registros:
                continue  # sin datos de mantenimiento, no se puede alertar

            documentos = await db.documentos_vehiculo.find({"vehiculo_id": vid}).to_list(20)
            for d in documentos:
                dias = (datetime.fromisoformat(d["vence_en"]).date() - hoy.date()).days
                if dias <= 0:
                    items.append({"severidad": "critical", "vehiculo": nombre,
                                   "mensaje": f"{nombre}: {d['tipo']} vencido"})
                elif dias <= 30:
                    items.append({"severidad": "warning", "vehiculo": nombre,
                                   "mensaje": f"{nombre}: {d['tipo']} vence en {dias} días"})

        return {"items": items, "criticas": sum(1 for i in items if i["severidad"] == "critical")}

    # =================================================================
    # REPARTO DE GANANCIAS
    # =================================================================
    class SocioUpsert(BaseModel):
        nombre: str
        porcentaje: float
        vehiculo_ids: List[str]

    @router.get("/reparto/socios")
    async def listar_socios(current: dict = Depends(require_dueno)):
        socios = await db.socios_reparto.find({"dueno_id": current["id"]}).to_list(50)
        return [{**s, "_id": str(s["_id"])} for s in socios]

    @router.post("/reparto/socios")
    async def crear_socio(body: SocioUpsert, current: dict = Depends(require_dueno)):
        doc = {
            "id": str(uuid.uuid4()), "dueno_id": current["id"], "nombre": body.nombre,
            "porcentaje": body.porcentaje, "vehiculo_ids": body.vehiculo_ids, "creado": now_iso(),
        }
        await db.socios_reparto.insert_one(doc)
        return {"creado": True}

    @router.get("/reparto/calculo")
    async def calcular_reparto(current: dict = Depends(require_dueno)):
        socios = await db.socios_reparto.find({"dueno_id": current["id"]}).to_list(50)
        mes_actual = datetime.now(timezone.utc).strftime("%Y-%m")
        # Una sola consulta para todos los vehículos (evita N+1: antes eran
        # socios×vehículos queries de hasta 500 docs cada una).
        todos_los_vids = sorted({vid for s in socios for vid in s.get("vehiculo_ids", [])})
        ingresos_por_vid: dict = {vid: 0.0 for vid in todos_los_vids}
        if todos_los_vids:
            async for sv in db.servicios.find(
                {"vehiculo_id": {"$in": todos_los_vids}, "estado": "completado",
                 "timestamp_fin": {"$regex": f"^{mes_actual}"}},
                {"vehiculo_id": 1, "costo": 1},
            ):
                vid = sv.get("vehiculo_id")
                if vid in ingresos_por_vid:
                    ingresos_por_vid[vid] += sv.get("costo", 0) or 0
        resultado = []
        for s in socios:
            ingresos = round(sum(ingresos_por_vid.get(vid, 0.0) for vid in s.get("vehiculo_ids", [])), 2)
            a_recibir = round(ingresos * (s["porcentaje"] / 100), 2)
            resultado.append({"socio": s["nombre"], "porcentaje": s["porcentaje"],
                               "ingresos_atribuidos": ingresos, "a_recibir": a_recibir})
        return resultado

    # =================================================================
    # CONDUCTORES (listado propio — reusa operadores existentes)
    # =================================================================
    @router.get("/conductores")
    async def listar_conductores(current: dict = Depends(require_dueno)):
        vehiculos = await _vehiculos_de_dueno(current["id"])
        operador_ids = [v["operador_conductor_id"] for v in vehiculos if v.get("operador_conductor_id")]
        if not operador_ids:
            return []
        operadores = await db.operadores.find({"_id": {"$in": [to_oid(i) for i in operador_ids]}}).to_list(100)

        # Conteos en una sola pasada (antes: 2 count_documents por conductor).
        mes_actual = datetime.now(timezone.utc).strftime("%Y-%m")
        completados_mes: dict = {oid: 0 for oid in operador_ids}
        cancelados: dict = {oid: 0 for oid in operador_ids}
        async for sv in db.servicios.find(
            {"operador_asignado_id": {"$in": operador_ids},
             "estado": {"$in": ["completado", "cancelado"]}},
            {"operador_asignado_id": 1, "estado": 1, "timestamp_creacion": 1},
        ):
            oid = sv.get("operador_asignado_id")
            if oid not in completados_mes:
                continue
            if sv.get("estado") == "completado" and str(sv.get("timestamp_creacion", "")).startswith(mes_actual):
                completados_mes[oid] += 1
            elif sv.get("estado") == "cancelado":
                cancelados[oid] += 1

        out = []
        for op in operadores:
            oid = str(op["_id"])
            out.append({**serialize(op), "servicios_completados": completados_mes.get(oid, 0),
                        "cancelados": cancelados.get(oid, 0)})
        out.sort(key=lambda o: o["servicios_completados"], reverse=True)
        return out

    # =================================================================
    # FICHA DE SOCIO (F7): resumen integral para la vista Socios
    # =================================================================
    @router.get("/ficha")
    async def ficha_socio(current: dict = Depends(require_dueno)):
        """Ficha 360° del socio autenticado: datos, flota, conductores,
        servicios del mes, mantenimientos y documentación — todo en una
        consulta por colección (sin N+1)."""
        dueno_id = current["id"]
        vehiculos = await _vehiculos_de_dueno(dueno_id)
        vehiculo_ids = [str(v["_id"]) for v in vehiculos]
        operador_ids = [v.get("operador_conductor_id") for v in vehiculos if v.get("operador_conductor_id")]

        mes_actual = datetime.now(timezone.utc).strftime("%Y-%m")
        hoy = datetime.now(timezone.utc)

        # Operadores de la flota
        operadores = []
        if operador_ids:
            operadores = await db.operadores.find(
                {"_id": {"$in": [to_oid(i) for i in operador_ids]}}).to_list(200)

        # Servicios del mes en una consulta
        servicios_mes = 0
        ingresos_mes = 0.0
        cancelados_mes = 0
        if operador_ids:
            async for sv in db.servicios.find(
                {"operador_asignado_id": {"$in": operador_ids},
                 "estado": {"$in": ["completado", "cancelado"]},
                 "timestamp_creacion": {"$regex": f"^{mes_actual}"}},
                {"estado": 1, "costo": 1},
            ):
                if sv.get("estado") == "completado":
                    servicios_mes += 1
                    ingresos_mes += sv.get("costo", 0) or 0
                else:
                    cancelados_mes += 1

        # Mantenimientos y documentos (2 consultas para toda la flota)
        mantenimientos = await db.mantenimientos.find(
            {"vehiculo_id": {"$in": vehiculo_ids}}).sort("realizado_en", -1).to_list(200)
        documentos = await db.documentos_vehiculo.find(
            {"vehiculo_id": {"$in": vehiculo_ids}}).to_list(200)

        # Estado documental por vehículo
        docs_por_vehiculo: dict = {}
        docs_vencidos = docs_por_vencer = 0
        for d in documentos:
            docs_por_vehiculo.setdefault(d.get("vehiculo_id"), []).append(d)
            try:
                dias = (datetime.fromisoformat(d["vence_en"]).date() - hoy.date()).days
            except (TypeError, ValueError):
                continue
            if dias <= 0:
                docs_vencidos += 1
            elif dias <= 30:
                docs_por_vencer += 1

        # Último mantenimiento por vehículo
        ultimo_mant_por_vid: dict = {}
        for m in mantenimientos:
            vid = m.get("vehiculo_id")
            if vid and vid not in ultimo_mant_por_vid:
                ultimo_mant_por_vid[vid] = m

        # Estados de flota (SSOT de conteo del prompt §19)
        estados_flota = {"disponibles": 0, "ocupadas": 0, "pausadas": 0,
                         "offline": 0, "averiadas": 0}
        for v in vehiculos:
            op = next((o for o in operadores if str(o["_id"]) == v.get("operador_conductor_id")), None)
            estado_op = (op or {}).get("estado") or "fuera_de_servicio"
            if estado_op == "libre":
                estados_flota["disponibles"] += 1
            elif estado_op == "ocupado":
                estados_flota["ocupadas"] += 1
            elif estado_op == "no_disponible":
                estados_flota["pausadas"] += 1
            elif estado_op == "averiado":
                estados_flota["averiadas"] += 1
            else:
                estados_flota["offline"] += 1

        return {
            "socio": {"id": dueno_id, "nombre": current.get("usuario") or dueno_id},
            "flota": {
                "total": len(vehiculos),
                "estados": estados_flota,
                "vehiculos": [{
                    "id": str(v["_id"]),
                    "numero_economico": v.get("numero_economico"),
                    "marca": v.get("marca"), "modelo": v.get("modelo"),
                    "estado": (next((o.get("estado") for o in operadores
                                     if str(o["_id"]) == v.get("operador_conductor_id")), "fuera_de_servicio")),
                    "conductor": next(({"id": str(o["_id"]), "nombre": o["nombre"]}
                                       for o in operadores
                                       if str(o["_id"]) == v.get("operador_conductor_id")), None),
                    "ultimo_mantenimiento": (
                        {"tipo": m.get("tipo"), "realizado_en": m.get("realizado_en"),
                         "odometro_km": m.get("odometro_km")}
                        if (m := ultimo_mant_por_vid.get(str(v["_id"]))) else None),
                    "documentos": [
                        {"tipo": d.get("tipo"), "vence_en": d.get("vence_en")}
                        for d in docs_por_vehiculo.get(str(v["_id"]), [])
                    ],
                } for v in vehiculos],
            },
            "conductores": [{
                "id": str(o["_id"]), "nombre": o["nombre"], "telefono": o.get("telefono"),
                "estado": o.get("estado"), "foto_url": o.get("foto_url"),
                "vehiculo": next((v.get("numero_economico") for v in vehiculos
                                  if v.get("operador_conductor_id") == str(o["_id"])), None),
            } for o in operadores],
            "mes": {
                "clave": mes_actual,
                "servicios_completados": servicios_mes,
                "servicios_cancelados": cancelados_mes,
                "ingresos": round(ingresos_mes, 2),
            },
            "alertas": {
                "documentos_vencidos": docs_vencidos,
                "documentos_por_vencer": docs_por_vencer,
            },
        }

    # =================================================================
    # EXPEDIENTES DE CONDUCTOR (F8): documentación personal + resumen
    # =================================================================
    TIPOS_DOC_CONDUCTOR = ("licencia", "ine", "seguro")
    DOC_POR_VENCER_DIAS = 30

    class DocConductorUpsert(BaseModel):
        tipo: str
        numero: Optional[str] = None
        vence_en: str  # ISO date (YYYY-MM-DD)

    def _estado_vigencia(vence_en: str, hoy) -> str:
        try:
            dias = (datetime.fromisoformat(vence_en).date() - hoy.date()).days
        except (TypeError, ValueError):
            return "vencido"
        if dias <= 0:
            return "vencido"
        if dias <= DOC_POR_VENCER_DIAS:
            return "por_vencer"
        return "vigente"

    async def _operador_de_dueno_o_404(operador_id: str, dueno_id: str) -> dict:
        """Expediente solo del conductor cuya unidad pertenece al socio."""
        try:
            oid = to_oid(operador_id)
        except Exception:
            raise HTTPException(404, "Conductor no encontrado")
        op = await db.operadores.find_one({"_id": oid})
        if not op:
            raise HTTPException(404, "Conductor no encontrado")
        veh = await db.vehiculos.find_one({
            "operador_conductor_id": operador_id, "propietario_id": dueno_id})
        if not veh:
            # Sin unidad propia del socio → no es su conductor (no filtra datos).
            raise HTTPException(404, "Conductor no encontrado")
        return {"operador": op, "vehiculo": veh}

    @router.post("/conductores/{operador_id}/documentos")
    async def upsert_doc_conductor(operador_id: str, body: DocConductorUpsert,
                                   current: dict = Depends(require_dueno)):
        await _operador_de_dueno_o_404(operador_id, current["id"])
        ahora = now_iso()
        doc = {
            "operador_id": operador_id, "tipo": body.tipo,
            "numero": body.numero, "vence_en": body.vence_en,
            "actualizado_en": ahora,
        }
        await db.documentos_conductor.update_one(
            {"operador_id": operador_id, "tipo": body.tipo},
            {"$set": doc}, upsert=True,
        )
        guardado = await db.documentos_conductor.find_one(
            {"operador_id": operador_id, "tipo": body.tipo})
        hoy = datetime.now(timezone.utc)
        out = {**{k: v for k, v in guardado.items() if k != "_id"},
               "estado": _estado_vigencia(body.vence_en, hoy)}
        return {"ok": True, "documento": out}

    @router.get("/conductores/{operador_id}/documentos")
    async def listar_doc_conductor(operador_id: str, current: dict = Depends(require_dueno)):
        await _operador_de_dueno_o_404(operador_id, current["id"])
        hoy = datetime.now(timezone.utc)
        docs = await db.documentos_conductor.find(
            {"operador_id": operador_id}).to_list(50)
        out = [{**{k: v for k, v in d.items() if k != "_id"},
                "estado": _estado_vigencia(d.get("vence_en", ""), hoy)}
               for d in docs]
        return {"documentos": out}

    @router.get("/conductores/{operador_id}")
    async def expediente_conductor(operador_id: str, current: dict = Depends(require_dueno)):
        ctx = await _operador_de_dueno_o_404(operador_id, current["id"])
        op, veh = ctx["operador"], ctx["vehiculo"]
        hoy = datetime.now(timezone.utc)
        docs_raw = await db.documentos_conductor.find(
            {"operador_id": operador_id}).to_list(50)
        por_tipo = {d["tipo"]: d for d in docs_raw}
        documentos, vencidos, por_vencer = [], 0, 0
        for tipo in TIPOS_DOC_CONDUCTOR:
            d = por_tipo.get(tipo)
            if not d:
                documentos.append({"tipo": tipo, "numero": None,
                                   "vence_en": None, "estado": "faltante"})
                continue
            estado = _estado_vigencia(d.get("vence_en", ""), hoy)
            if estado == "vencido":
                vencidos += 1
            elif estado == "por_vencer":
                por_vencer += 1
            documentos.append({"tipo": tipo, "numero": d.get("numero"),
                               "vence_en": d.get("vence_en"), "estado": estado})
        faltantes = [t for t in TIPOS_DOC_CONDUCTOR if t not in por_tipo]

        mes_actual = datetime.now(timezone.utc).strftime("%Y-%m")
        servicios_completados = 0
        async for sv in db.servicios.find(
            {"operador_asignado_id": operador_id, "estado": "completado"},
            {"timestamp_creacion": 1},
        ):
            if str(sv.get("timestamp_creacion", "")).startswith(mes_actual):
                servicios_completados += 1

        turno_activo = await db.turnos.find_one(
            {"operador_id": operador_id, "fin": None})

        return {
            "conductor": {
                "id": str(op["_id"]), "nombre": op.get("nombre"),
                "telefono": op.get("telefono"), "estado": op.get("estado"),
                "foto_url": op.get("foto_url"), "usuario": op.get("usuario"),
            },
            "unidad": {
                "id": str(veh["_id"]),
                "numero_economico": veh.get("numero_economico"),
                "marca": veh.get("marca"), "modelo": veh.get("modelo"),
                "placa": veh.get("placa"),
            },
            "ingreso": op.get("creado") or None,
            "documentos": documentos,
            "alertas": {"vencidos": vencidos, "por_vencer": por_vencer,
                        "faltantes": faltantes},
            "servicios_completados": servicios_completados,
            "turno_activo": bool(turno_activo),
        }

    # =================================================================
    # ASIGNACIONES socio → unidad → conductor (F9 §21): con historial
    # =================================================================
    class AsignacionCreate(BaseModel):
        vehiculo_id: str
        operador_id: str

    @router.get("/asignaciones")
    async def listar_asignaciones(current: dict = Depends(require_dueno)):
        docs = await db.asignaciones.find({"socio_id": current["id"]}).sort("inicio", -1).to_list(200)
        vehs = {str(v["_id"]): v.get("numero_economico") for v in await db.vehiculos.find(
            {"propietario_id": current["id"]}).to_list(500)}
        opids = [d.get("operador_id") for d in docs if d.get("operador_id")]
        ops = {str(o["_id"]): o.get("nombre") for o in (await db.operadores.find(
            {"_id": {"$in": [to_oid(i) for i in opids]}}).to_list(500) if opids else [])}
        return [{
            "id": str(d["_id"]), "vehiculo": vehs.get(d.get("vehiculo_id"), "—"),
            "conductor": ops.get(d.get("operador_id"), "—"),
            "inicio": d.get("inicio"), "fin": d.get("fin"), "activo": d.get("activo", False),
        } for d in docs]

    @router.post("/asignaciones")
    async def crear_asignacion(body: AsignacionCreate, current: dict = Depends(require_dueno)):
        v = await _vehiculo_de_dueno_o_404(body.vehiculo_id, current["id"])
        try:
            op = await db.operadores.find_one({"_id": to_oid(body.operador_id)})
        except Exception:
            op = None
        if not op:
            raise HTTPException(404, "Conductor no encontrado")
        ts = now_iso()
        # Cierra la asignación activa previa de la unidad (historial completo).
        await db.asignaciones.update_many(
            {"vehiculo_id": body.vehiculo_id, "activo": True},
            {"$set": {"activo": False, "fin": ts}},
        )
        doc = {"vehiculo_id": body.vehiculo_id, "operador_id": body.operador_id,
               "socio_id": current["id"], "inicio": ts, "fin": None, "activo": True}
        res = await db.asignaciones.insert_one(doc)
        # La unidad queda vinculada al conductor asignado (comportamiento histórico).
        await db.vehiculos.update_one(
            {"_id": to_oid(body.vehiculo_id)},
            {"$set": {"operador_conductor_id": body.operador_id}},
        )
        return {"creado": True, "id": str(res.inserted_id), "inicio": ts}

    @router.post("/asignaciones/{asignacion_id}/finalizar")
    async def finalizar_asignacion(asignacion_id: str, current: dict = Depends(require_dueno)):
        doc = await db.asignaciones.find_one({"_id": to_oid(asignacion_id)})
        if not doc or doc.get("socio_id") != current["id"]:
            raise HTTPException(404, "Asignación no encontrada")
        if not doc.get("activo"):
            raise HTTPException(409, "La asignación ya está finalizada")
        await db.asignaciones.update_one(
            {"_id": doc["_id"]}, {"$set": {"activo": False, "fin": now_iso()}}
        )
        return {"ok": True}

    # =================================================================
    # DASHBOARD EJECUTIVO (F12 §25): series para gráficas
    # =================================================================
    @router.get("/ejecutivo")
    async def dashboard_ejecutivo(current: dict = Depends(require_dueno),
                                  dias: int = 14):
        """Series agregadas para el dashboard ejecutivo del socio.
        1 consulta por colección con $in de la flota propia (sin N+1)."""
        dueno_id = current["id"]
        vehiculos = await _vehiculos_de_dueno(dueno_id)
        vehiculo_ids = [str(v["_id"]) for v in vehiculos]
        operador_ids = [v.get("operador_conductor_id") for v in vehiculos if v.get("operador_conductor_id")]
        dias = max(7, min(dias or 14, 60))
        ahora = datetime.now(timezone.utc)
        mes_actual = ahora.strftime("%Y-%m")
        hoy_str = ahora.strftime("%Y-%m-%d")

        nombres_conductores = {}
        if operador_ids:
            for o in await db.operadores.find(
                {"_id": {"$in": [to_oid(i) for i in operador_ids]}}, {"nombre": 1}
            ).to_list(200):
                nombres_conductores[str(o["_id"])] = o.get("nombre") or "—"

        # --- Servicios del mes (para por-conductor y resumen) ---
        servicios_mes = []
        if operador_ids:
            servicios_mes = await db.servicios.find(
                {"operador_asignado_id": {"$in": operador_ids},
                 "estado": {"$in": ["completado", "cancelado"]},
                 "timestamp_creacion": {"$regex": f"^{mes_actual}"}},
                {"operador_asignado_id": 1, "estado": 1, "costo": 1,
                 "timestamp_creacion": 1, "distancia_m": 1},
            ).to_list(5000)

        completados_mes = [s for s in servicios_mes if s.get("estado") == "completado"]
        cancelados_mes = sum(1 for s in servicios_mes if s.get("estado") == "cancelado")
        ingresos_mes = round(sum(s.get("costo", 0) or 0 for s in completados_mes), 2)

        # Servicios por conductor (mes)
        por_conductor: dict = {}
        for s in completados_mes:
            oid = s.get("operador_asignado_id")
            item = por_conductor.setdefault(
                oid, {"conductor": nombres_conductores.get(oid, "—"),
                      "completados": 0, "ingresos": 0.0})
            item["completados"] += 1
            item["ingresos"] += s.get("costo", 0) or 0
        servicios_por_conductor = sorted(
            ({"conductor": v["conductor"], "completados": v["completados"],
              "ingresos": round(v["ingresos"], 2)} for v in por_conductor.values()),
            key=lambda x: x["completados"], reverse=True)[:12]

        # --- Servicios por hora (hoy) y por día (ventana) ---
        # La serie se calcula sobre los completados+cancelados del mes;
        # el filtro por día se hace en memoria (los ISO string comparan lexicográfico).
        horas: dict = {}
        dias_map: dict = {}
        hoy_total = 0
        for s in servicios_mes:
            ts = s.get("timestamp_creacion") or ""
            if not ts.startswith(hoy_str):
                continue
            hoy_total += 1
            try:
                hora = int(ts[11:13])
                horas[hora] = horas.get(hora, 0) + 1
            except (TypeError, ValueError):
                continue
        # ventana de días: últimos N (conteo de servicios del mes en esos días)
        from datetime import timedelta
        for offset in range(dias - 1, -1, -1):
            dia = (ahora - timedelta(days=offset)).strftime("%Y-%m-%d")
            dias_map[dia] = 0
        for s in servicios_mes:
            dia = (s.get("timestamp_creacion") or "")[:10]
            if dia in dias_map:
                dias_map[dia] += 1
        servicios_por_hora = [{"hora": h, "total": horas.get(h, 0)} for h in range(24)]
        servicios_por_dia = [{"dia": d[5:], "total": t} for d, t in dias_map.items()]

        # --- Turnos cerrados → km por conductor ---
        km_totales = 0.0
        turnos_cerrados = await db.turnos.find(
            {"operador_id": {"$in": operador_ids}, "fin": {"$ne": None},
             "odometro_fin": {"$ne": None}},
        ).to_list(1000)
        km_por_conductor: dict = {}
        for t in turnos_cerrados:
            km = max((t.get("odometro_fin") or 0) - (t.get("odometro_inicio") or 0), 0)
            km_totales += km
            oid = t.get("operador_id")
            km_por_conductor[oid] = km_por_conductor.get(oid, 0) + km

        # --- Combustible por mes (toda la flota) ---
        combustible_por_mes: dict = {}
        if vehiculo_ids:
            async for c in db.combustible_cargas.find(
                {"vehiculo_id": {"$in": vehiculo_ids}}, {"fecha": 1, "costo": 1, "litros": 1}
            ).sort("fecha", -1).limit(500):
                mes = (c.get("fecha") or "")[:7]
                if not mes:
                    continue
                item = combustible_por_mes.setdefault(mes, {"total": 0.0, "litros": 0.0})
                item["total"] += c.get("costo", 0) or 0
                item["litros"] += c.get("litros", 0) or 0
        combustible_series = [
            {"mes": m, "total": round(v["total"], 2), "litros": round(v["litros"], 1)}
            for m, v in sorted(combustible_por_mes.items())[-12:]
        ]

        # --- Salud de flota (resumen del módulo de mantenimiento) ---
        salud_flota = {"urgentes": 0, "proximos": 0, "documentos_vencidos": 0}
        if vehiculo_ids:
            docs = await db.documentos_vehiculo.find(
                {"vehiculo_id": {"$in": vehiculo_ids}}).to_list(200)
            for d in docs:
                try:
                    if (datetime.fromisoformat(d["vence_en"]).date() - ahora.date()).days <= 0:
                        salud_flota["documentos_vencidos"] += 1
                except (TypeError, ValueError):
                    continue

        return {
            "resumen": {
                "hoy": hoy_total,
                "completados_mes": len(completados_mes),
                "cancelados_mes": cancelados_mes,
                "ingresos_mes": ingresos_mes,
                "km_totales": round(km_totales, 1),
                "flota_activa": len(vehiculos),
                "conductores_activos": len(operador_ids),
            },
            "servicios_por_hora": servicios_por_hora,
            "servicios_por_dia": servicios_por_dia,
            "servicios_por_conductor": servicios_por_conductor,
            "km_por_conductor": [
                {"conductor": nombres_conductores.get(oid, "—"), "km": round(km, 1)}
                for oid, km in sorted(km_por_conductor.items(), key=lambda x: -x[1])[:12]
            ],
            "combustible_por_mes": combustible_series,
            "salud_flota": salud_flota,
        }

    return router
