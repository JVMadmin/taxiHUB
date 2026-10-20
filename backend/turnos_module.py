"""
Turnos del taxista (F6): iniciar/finalizar con kilometraje, evidencia de
combustible, entrega de unidad y liquidación de la cuota fijada por el
dueño; y combustible del taxista (F12 §27/§28/§29): carga con ticket e
historial propio. Mismo patrón factory que los demás módulos.
"""
import uuid
from typing import Optional, Dict

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Query
from pydantic import BaseModel, Field


def build_router(*, APP_NAME, DEFAULT_SITIO, EstadoOperador,
                 _notificar_dueno_de_operador, _parse_iso, _turno_activo,
                 analizar_y_comprimir_imagen_webp, db, manager, now_iso, put_object,
                 registrar_notificacion_responsable, require_operador_estricto,
                 serialize, to_oid):
    router = APIRouter(prefix="/api", tags=["turnos"])

    class TurnoIniciar(BaseModel):
        odometro_km: Optional[float] = Field(default=None, ge=0, description="Kilómetros del tablero al iniciar (opcional)")
        nivel_combustible: Optional[str] = "3/4"
        evidencia_inicio_url: Optional[str] = None
        unidad_limpia: bool = True
        notas_inicio: Optional[str] = None

    class TurnoFinalizar(BaseModel):
        odometro_km: Optional[float] = Field(default=None, ge=0, description="Kilómetros del tablero al finalizar (opcional)")
        nivel_combustible_fin: Optional[str] = None
        evidencia_fin_url: Optional[str] = None
        entrega_unidad_confirmada: bool = True
        entrega_a: Optional[str] = "dueno"  # "dueno" | "relevo" | "base"
        relevo_operador_nombre: Optional[str] = None
        cuota_entregada: Optional[float] = None
        metodo_pago_cuota: Optional[str] = "efectivo"  # "efectivo" | "transferencia"
        comprobante_cuota_url: Optional[str] = None
        notas_cierre: Optional[str] = None

    def _turno_out(doc: Dict) -> Dict:
        d = serialize(doc)
        if d.get("odometro_fin") is not None and d.get("odometro_inicio") is not None:
            d["km_recorridos"] = round(d["odometro_fin"] - d["odometro_inicio"], 1)
        if d.get("fin") and d.get("inicio"):
            ini, fin = _parse_iso(d["inicio"]), _parse_iso(d["fin"])
            if ini and fin:
                d["duracion_s"] = max(0, int((fin - ini).total_seconds()))
        if "estado_liquidacion" in d:
            d.setdefault("liquidacion_estado", d["estado_liquidacion"])
        return d

    async def _obtener_cuota_vehiculo(vehiculo_id: Optional[str], operador_id: Optional[str] = None) -> float:
        """Obtiene la cuota por turno/día fijada por el dueño para este vehículo."""
        if not vehiculo_id:
            return 350.0
        try:
            v = await db.vehiculos.find_one({"_id": to_oid(vehiculo_id)})
            if v and v.get("cuota_diaria") is not None:
                return float(v["cuota_diaria"])
        except Exception:
            pass
        tcfg = await db.turnos_config.find_one({"vehiculo_id": vehiculo_id})
        if tcfg:
            if tcfg.get("cuota_diaria") is not None:
                return float(tcfg["cuota_diaria"])
            for t in tcfg.get("turnos") or []:
                if not operador_id or t.get("operador_id") == operador_id:
                    if t.get("cuota_diaria") is not None:
                        return float(t["cuota_diaria"])
                    if t.get("renta_semanal"):
                        return round(float(t["renta_semanal"]) / 7.0, 2)
        return 350.0

    @router.post("/turnos/evidencia")
    async def subir_evidencia_turno(
        foto: UploadFile = File(...),
        tipo: Optional[str] = Form("combustible"),
        current: dict = Depends(require_operador_estricto),
    ):
        """Sube foto de evidencia del tablero/combustible al iniciar turno, cargar
        combustible o entregar unidad/cuota al cierre del turno. Convierte a WebP seguro."""
        operador_id = current["id"]
        op = await db.operadores.find_one({"_id": to_oid(operador_id)}) or {}
        op_sitio = op.get("sitio_id") or DEFAULT_SITIO
        data = await foto.read()
        comp = analizar_y_comprimir_imagen_webp(data, filename=foto.filename or "evidencia.jpg", max_dim=1600)
        path = f"{APP_NAME}/evidencias/{operador_id}/{tipo}_{uuid.uuid4().hex}.webp"
        result = put_object(path, comp["data"], "image/webp", sitio_id=op_sitio)
        await db.archivos.insert_one({
            "storage_path": result["path"],
            "content_type": "image/webp",
            "tipo": tipo,
            "operador_id": operador_id,
            "dimensiones": comp.get("dimensiones"),
            "ahorro_pct": comp.get("ahorro_pct"),
            "ts": now_iso(),
        })
        url = f"/api/files/{result['path']}"
        return {"ok": True, "evidencia_url": url, "ahorro_pct": comp.get("ahorro_pct")}

    @router.post("/turnos/iniciar")
    async def turno_iniciar(body: TurnoIniciar, current: dict = Depends(require_operador_estricto)):
        operador_id = current["id"]
        if await _turno_activo(operador_id):
            raise HTTPException(status_code=409, detail="Ya tienes un turno activo")
        ts = now_iso()
        op = await db.operadores.find_one({"_id": to_oid(operador_id)})
        if not op:
            raise HTTPException(status_code=404, detail="Operador no encontrado")
        op_sitio = op.get("sitio_id") or DEFAULT_SITIO
        vid = op.get("vehiculo_id")
        cuota_meta = await _obtener_cuota_vehiculo(vid, operador_id)
        doc = {
            "operador_id": operador_id,
            "operador_nombre": op.get("nombre"),
            "placa": op.get("placa"),
            "vehiculo_id": vid,
            "sitio_id": op_sitio,
            "inicio": ts,
            "fin": None,
            "odometro_inicio": body.odometro_km,
            "odometro_fin": None,
            "nivel_combustible_inicio": body.nivel_combustible or "3/4",
            "evidencia_inicio_url": body.evidencia_inicio_url,
            "unidad_limpia": body.unidad_limpia,
            "notas_inicio": body.notas_inicio,
            "cuota_meta": cuota_meta,
            "estado_liquidacion": "en_turno",
        }
        res = await db.turnos.insert_one(doc)
        # Iniciar turno == entrar en operación (libre).
        nuevo_estado = EstadoOperador.libre.value
        if (op.get("estado") or "fuera_de_servicio") == EstadoOperador.fuera_de_servicio.value:
            await db.operadores.update_one(
                {"_id": to_oid(operador_id)},
                {"$set": {"estado": nuevo_estado, "inicio_operacion": ts, "ultima_actualizacion": ts}})
            msg = {"type": "estado", "operador_id": operador_id, "estado": nuevo_estado, "sitio_id": op_sitio, "ts": ts}
            await manager.broadcast_terminal(msg, sitio_id=op_sitio)
            await _notificar_dueno_de_operador(operador_id, msg)
        out = _turno_out({**doc, "_id": res.inserted_id})
        await _notificar_dueno_de_operador(operador_id, {"type": "turno", "evento": "iniciado", "turno": out})
        await registrar_notificacion_responsable(
            "turno_inicio",
            operador_id,
            f"Inicio de Turno — Unidad {op.get('placa') or 'Taxi'}",
            f"El conductor {op.get('nombre')} inició su turno. Odómetro inicial: {body.odometro_km or 'N/R'} km.",
            metadata={"turno_id": str(res.inserted_id), "odometro": body.odometro_km, "combustible": body.nivel_combustible}
        )
        return {"ok": True, "turno": out, "operador": {"estado": nuevo_estado}}

    @router.post("/turnos/finalizar")
    async def turno_finalizar(body: TurnoFinalizar, current: dict = Depends(require_operador_estricto)):
        operador_id = current["id"]
        turno = await _turno_activo(operador_id)
        if not turno:
            raise HTTPException(status_code=409, detail="No tienes un turno activo")

        # Validación crítica: evitar cerrar jornada con servicios activos en curso
        servicios_activos = await db.servicios.count_documents({
            "operador_asignado_id": operador_id,
            "estado": {"$in": ["asignado", "en_curso"]},
        })
        if servicios_activos > 0:
            raise HTTPException(
                status_code=400,
                detail=f"No puedes finalizar el turno mientras tengas {servicios_activos} servicio(s) en curso. Completa o cancela los viajes activos primero."
            )

        if body.odometro_km is not None and turno.get("odometro_inicio") is not None:
            if body.odometro_km < turno["odometro_inicio"]:
                raise HTTPException(status_code=400,
                                    detail="El kilometraje final no puede ser menor al inicial")
        ts = now_iso()
        inicio_ts = turno.get("inicio") or ""
        # Calcular ingresos y viajes completados durante este turno
        servicios_turno = await db.servicios.find({
            "operador_asignado_id": operador_id,
            "estado": "completado",
            "timestamp_creacion": {"$gte": inicio_ts},
        }).to_list(500)
        ingresos_turno = round(sum((s.get("costo") or 0.0) for s in servicios_turno), 2)
        cargas_turno = await db.combustible_cargas.find({
            "operador_id": operador_id,
            "creado": {"$gte": inicio_ts},
        }).to_list(50)
        gasto_combustible = round(sum((c.get("costo") or 0.0) for c in cargas_turno), 2)
        cuota_meta = turno.get("cuota_meta") or await _obtener_cuota_vehiculo(turno.get("vehiculo_id"), operador_id)
        cuota_entregada = body.cuota_entregada if body.cuota_entregada is not None else cuota_meta

        updates = {
            "fin": ts,
            "odometro_fin": body.odometro_km,
            "nivel_combustible_fin": body.nivel_combustible_fin or "1/2",
            "evidencia_fin_url": body.evidencia_fin_url,
            "entrega_unidad_confirmada": body.entrega_unidad_confirmada,
            "entrega_a": body.entrega_a or "dueno",
            "relevo_operador_nombre": body.relevo_operador_nombre,
            "cuota_meta": cuota_meta,
            "cuota_entregada": cuota_entregada,
            "metodo_pago_cuota": body.metodo_pago_cuota or "efectivo",
            "comprobante_cuota_url": body.comprobante_cuota_url,
            "notas_cierre": body.notas_cierre,
            "viajes_completados": len(servicios_turno),
            "ingresos_brutos": ingresos_turno,
            "gasto_combustible": gasto_combustible,
            "estado_liquidacion": "pendiente_confirmacion",
            "confirmado_por_dueno": False,
        }
        await db.turnos.update_one(
            {"_id": turno["_id"]},
            {"$set": updates},
        )
        doc = await db.turnos.find_one({"_id": turno["_id"]})
        # Cerrar turno == salir de operación (fuera_de_servicio)
        await db.operadores.update_one(
            {"_id": to_oid(operador_id)},
            {"$set": {"estado": EstadoOperador.fuera_de_servicio.value,
                      "inicio_operacion": None, "ultima_actualizacion": ts}})
        op_sitio = turno.get("sitio_id") or current.get("sitio_id") or DEFAULT_SITIO
        msg = {"type": "estado", "operador_id": operador_id,
               "estado": EstadoOperador.fuera_de_servicio.value, "sitio_id": op_sitio, "ts": ts}
        await manager.broadcast_terminal(msg, sitio_id=op_sitio)
        await _notificar_dueno_de_operador(operador_id, msg)
        out = _turno_out(doc)
        await _notificar_dueno_de_operador(operador_id, {"type": "turno", "evento": "finalizado", "turno": out})
        op = await db.operadores.find_one({"_id": to_oid(operador_id)}) or {}
        await registrar_notificacion_responsable(
            "turno_fin",
            operador_id,
            f"Fin de Turno — Unidad {op.get('placa') or 'Taxi'}",
            f"El conductor {op.get('nombre')} finalizó jornada. {len(servicios_turno)} viajes, ${ingresos_turno} brutos.",
            metadata={"turno_id": str(turno["_id"]), "odometro_fin": body.odometro_km, "ingresos": ingresos_turno, "viajes": len(servicios_turno)}
        )
        return {"ok": True, "turno": out}

    @router.get("/turnos/activo")
    async def turno_activo(current: dict = Depends(require_operador_estricto)):
        operador_id = current["id"]
        op = await db.operadores.find_one({"_id": to_oid(operador_id)},
                                          {"lat": 1, "lng": 1, "ultima_actualizacion": 1,
                                           "gps_accuracy": 1, "gps_battery": 1, "vehiculo_id": 1})
        vid = op.get("vehiculo_id") if op else None
        cuota_sugerida = await _obtener_cuota_vehiculo(vid, operador_id)
        turno = await _turno_activo(operador_id)
        if not turno:
            return {"turno": None, "cuota_meta": cuota_sugerida}
        out = _turno_out(turno)
        if not out.get("cuota_meta"):
            out["cuota_meta"] = cuota_sugerida
        inicio_ts = turno.get("inicio") or ""
        servicios_turno = await db.servicios.find({
            "operador_asignado_id": operador_id,
            "estado": "completado",
            "timestamp_creacion": {"$gte": inicio_ts},
        }).to_list(200)
        cargas_turno = await db.combustible_cargas.find({
            "operador_id": operador_id,
            "creado": {"$gte": inicio_ts},
        }).to_list(50)
        out["viajes_turno"] = len(servicios_turno)
        out["ingresos_turno"] = round(sum((s.get("costo") or 0.0) for s in servicios_turno), 2)
        out["gasto_combustible_turno"] = round(sum((c.get("costo") or 0.0) for c in cargas_turno), 2)
        out["gps"] = {
            "lat": op.get("lat") if op else None,
            "lng": op.get("lng") if op else None,
            "ultima_actualizacion": op.get("ultima_actualizacion") if op else None,
            "accuracy": op.get("gps_accuracy") if op else None,
            "battery": op.get("gps_battery") if op else None,
        }
        return {"turno": out, "cuota_meta": out["cuota_meta"]}

    @router.get("/turnos/mis-turnos")
    async def turno_historial(current: dict = Depends(require_operador_estricto),
                              limite: int = Query(30, ge=1, le=100)):
        # `_id` desempata turnos con el mismo `inicio` (reloj de baja resolución).
        docs = await db.turnos.find({"operador_id": current["id"]}).sort(
            [("inicio", -1), ("_id", -1)]).to_list(limite)
        return {"turnos": [_turno_out(d) for d in docs]}

    # ---------------------------------------------------------------------------
    # Combustible del TAXISTA (F12 §27/§28/§29): carga + ticket + historial propio
    # ---------------------------------------------------------------------------
    class CargaTaxista(BaseModel):
        fecha: str
        litros: float = Field(gt=0)
        costo: float = Field(ge=0)
        odometro_km: float = Field(ge=0)
        estacion: Optional[str] = None

    @router.post("/combustible")
    async def registrar_carga_taxista(
        fecha: str = Form(...),
        litros: float = Form(...),
        costo: float = Form(...),
        odometro_km: float = Form(...),
        estacion: Optional[str] = Form(None),
        idempotency_key: Optional[str] = Form(None),
        ticket: Optional[UploadFile] = File(None),
        current: dict = Depends(require_operador_estricto),
    ):
        operador_id = current["id"]

        # Prevención estricta de duplicados por reintento de red
        if idempotency_key:
            existente = await db.combustible_cargas.find_one({"idempotency_key": idempotency_key})
            if existente:
                return {
                    "ok": True,
                    "id": str(existente["_id"]),
                    "ticket_url": existente.get("ticket_url"),
                    "rendimiento_km_l": existente.get("rendimiento_km_l"),
                    "duplicado": True,
                }

        op = await db.operadores.find_one({"_id": to_oid(operador_id)}, {"vehiculo_id": 1, "nombre": 1, "placa": 1, "sitio_id": 1})
        vid = op.get("vehiculo_id") if op else None
        ticket_url = None
        if ticket and ticket.filename:
            data = await ticket.read()
            comp = analizar_y_comprimir_imagen_webp(data, filename=ticket.filename or "ticket.jpg", max_dim=1600)
            path = f"{APP_NAME}/combustible/{operador_id}/{uuid.uuid4().hex}.webp"
            op_sitio = (op.get("sitio_id") if op else None) or DEFAULT_SITIO
            result = put_object(path, comp["data"], "image/webp", sitio_id=op_sitio)
            await db.archivos.insert_one({
                "storage_path": result["path"],
                "content_type": "image/webp",
                "tipo": "ticket_combustible",
                "operador_id": operador_id,
                "dimensiones": comp.get("dimensiones"),
                "ahorro_pct": comp.get("ahorro_pct"),
                "ts": now_iso(),
            })
            ticket_url = f"/api/files/{result['path']}"

        rendimiento = None
        if vid:
            anterior = await db.combustible_cargas.find(
                {"vehiculo_id": vid}
            ).sort("odometro_km", -1).to_list(1)
            if anterior and anterior[0].get("odometro_km", 0) < odometro_km and litros > 0:
                rendimiento = round((odometro_km - anterior[0]["odometro_km"]) / litros, 1)

        doc = {
            "id": str(uuid.uuid4()),
            "operador_id": operador_id,
            "operador_nombre": op.get("nombre") if op else None,
            "placa": op.get("placa") if op else None,
            "sitio_id": (op.get("sitio_id") if op else None) or DEFAULT_SITIO,
            "vehiculo_id": vid,
            "fecha": fecha, "litros": litros, "costo": costo,
            "odometro_km": odometro_km, "estacion": estacion,
            "idempotency_key": idempotency_key,
            "ticket_url": ticket_url, "evidencia_url": ticket_url,
            "rendimiento_km_l": rendimiento,
            "creado": now_iso(),
        }
        res = await db.combustible_cargas.insert_one(doc)
        # Odómetro del vehículo se actualiza con la carga (traza de uso).
        if vid and odometro_km:
            try:
                await db.vehiculos.update_one(
                    {"_id": to_oid(vid)},
                    {"$set": {"odometro_km": odometro_km}},
                )
            except HTTPException:
                pass
        await _notificar_dueno_de_operador(operador_id, {"type": "combustible", "carga": serialize({**doc, "_id": res.inserted_id})})
        await registrar_notificacion_responsable(
            "combustible_carga",
            operador_id,
            f"Carga de Combustible — Unidad {op.get('placa') or 'Taxi'}",
            f"Conductor {op.get('nombre') if op else 'Operador'}: {litros} L por ${costo} MXN ({estacion or 'Gasolinera'}). Odómetro: {odometro_km} km.",
            metadata={"litros": litros, "costo": costo, "odometro": odometro_km, "estacion": estacion}
        )
        return {"ok": True, "id": str(res.inserted_id), "ticket_url": ticket_url, "rendimiento_km_l": rendimiento}

    @router.get("/combustible/mis-cargas")
    async def mis_cargas_combustible(current: dict = Depends(require_operador_estricto),
                                     limite: int = Query(30, ge=1, le=100)):
        docs = await db.combustible_cargas.find({"operador_id": current["id"]}).sort(
            "creado", -1).to_list(limite)
        return {"cargas": [serialize(d) for d in docs]}

    return router
