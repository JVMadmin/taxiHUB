"""
Operadores (conductores): CRUD de la terminal, perfil propio, cambio de
estado, diagnóstico GPS y rutas de ubicación (`/operadores/{id}/ubicacion`,
lotes, `/locations` y track). Siguen en server.py el pipeline GPS
(`_actualizar_ubicacion`, geofence de llegada) y el recorrido ajustado a
calles, que lee `ROUTING_PROVIDER_URL` en cada llamada junto al routing.
Mismo patrón factory que los demás módulos.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, Request, Query


def build_router(*, BatchLocationsRequest, DEFAULT_SITIO, EstadoOperador, EstadoUpdate,
                 OperadorCreate, OperadorUpdate, TRACK_MAX_POINTS, UbicacionGPS,
                 UbicacionUpdate, _actualizar_ubicacion,
                 _enriquecer_operadores_con_vehiculos, _mismo_o_terminal,
                 _notificar_dueno_de_operador, _parse_iso, _procesar_ubicaciones_batch,
                 _turno_activo, _validar_transicion_estado, db, hash_password, logger,
                 manager, now_iso, require_operador, require_operador_estricto,
                 require_terminal, serialize, to_oid):
    router = APIRouter(prefix="/api", tags=["operadores"])

    @router.post("/operadores")
    async def create_operador(body: OperadorCreate, current=Depends(require_terminal)):
        if await db.operadores.find_one({"usuario": body.usuario}):
            raise HTTPException(status_code=409, detail="El usuario ya existe")
        if body.vehiculo_id:
            if not await db.vehiculos.find_one({"_id": to_oid(body.vehiculo_id)}):
                raise HTTPException(status_code=404, detail="Vehículo no encontrado")
        sitio_id = body.sitio_id or current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        doc = {
            "nombre": body.nombre,
            "telefono": body.telefono,
            "placa": body.placa,
            "ruta_asignada": body.ruta_asignada,
            "vehiculo_id": body.vehiculo_id,
            "sitio_id": sitio_id,
            "estado": EstadoOperador.fuera_de_servicio.value,
            "lat": None,
            "lng": None,
            "ultima_actualizacion": None,
            "usuario": body.usuario,
            "password_hash": hash_password(body.contrasena),
            "creado": now_iso(),
            "activo": True,
        }
        res = await db.operadores.insert_one(doc)
        op_id = str(res.inserted_id)
        if body.vehiculo_id:
            await db.vehiculos.update_one({"_id": to_oid(body.vehiculo_id)},
                                          {"$set": {"operador_conductor_id": op_id}})
        doc["_id"] = res.inserted_id
        logger.info("operador creado id=%s usuario=%s", op_id, body.usuario)
        return serialize(doc)

    @router.get("/operadores")
    async def list_operadores(current=Depends(require_terminal)):
        sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        docs = await db.operadores.find({"sitio_id": sitio}).to_list(1000)
        return await _enriquecer_operadores_con_vehiculos([serialize(d) for d in docs])

    @router.get("/operadores/activos")
    async def list_operadores_activos(current=Depends(require_terminal)):
        """Operadores en operación (todo menos fuera_de_servicio) con estado y ubicación, para el mapa."""
        sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        docs = await db.operadores.find(
            {"estado": {"$ne": EstadoOperador.fuera_de_servicio.value}, "sitio_id": sitio}
        ).to_list(1000)
        return await _enriquecer_operadores_con_vehiculos([serialize(d) for d in docs])

    @router.get("/operadores/me")
    async def get_operador_me(current: dict = Depends(require_operador)):
        op = await db.operadores.find_one({"_id": to_oid(current["id"])})
        return serialize(op)

    async def _generar_diagnostico_gps(operador_id: str) -> dict:
        """Genera diagnóstico detallado de telemetría GPS, señal, batería y turno."""
        op = await db.operadores.find_one({"_id": to_oid(operador_id)})
        if not op:
            raise HTTPException(status_code=404, detail="Operador no encontrado")

        ahora = datetime.now(timezone.utc)
        ultima_act = op.get("ultima_actualizacion")
        segundos_desde = None
        if ultima_act:
            try:
                dt = _parse_iso(ultima_act)
                if dt:
                    segundos_desde = max(0, int((ahora - dt).total_seconds()))
            except Exception:
                pass

        accuracy = op.get("gps_accuracy")
        calidad = "sin_senal"
        if segundos_desde is not None and segundos_desde <= 30:
            if accuracy is not None and accuracy <= 15:
                calidad = "excelente"
            elif accuracy is not None and accuracy <= 35:
                calidad = "buena"
            else:
                calidad = "degradada"
        elif segundos_desde is not None and segundos_desde <= 90:
            calidad = "intermitente"
        else:
            calidad = "desconectado"

        turno = await _turno_activo(operador_id)
        servicios_activos = await db.servicios.count_documents({
            "operador_asignado_id": operador_id,
            "estado": {"$in": ["asignado", "en_curso"]},
        })
        vehiculo = None
        if op.get("vehiculo_id"):
            v = await db.vehiculos.find_one({"_id": to_oid(op["vehiculo_id"])})
            if v:
                vehiculo = {
                    "id": str(v["_id"]),
                    "placa": v.get("placa"),
                    "numero_economico": v.get("numero_economico"),
                    "marca": v.get("marca"),
                    "modelo": v.get("modelo"),
                    "odometro_km": v.get("odometro_km"),
                }

        return {
            "ok": True,
            "operador": {
                "id": operador_id,
                "nombre": op.get("nombre"),
                "placa": op.get("placa"),
                "estado": op.get("estado"),
                "sitio_id": op.get("sitio_id") or DEFAULT_SITIO,
            },
            "gps": {
                "lat": op.get("lat"),
                "lng": op.get("lng"),
                "accuracy": accuracy,
                "speed": op.get("gps_speed"),
                "heading": op.get("gps_heading"),
                "battery": op.get("gps_battery"),
                "ultima_actualizacion": ultima_act,
                "gps_ts_cliente": op.get("gps_ts_cliente"),
                "segundos_desde_reporte": segundos_desde,
                "calidad_senal": calidad,
                "track_buffer_puntos": len(op.get("track") or []),
            },
            "vehiculo": vehiculo,
            "turno_activo": bool(turno),
            "turno_id": str(turno["_id"]) if turno else None,
            "servicios_activos_count": servicios_activos,
            "servidor_ts": now_iso(),
        }

    @router.get("/operadores/diagnostico-gps")
    async def get_diagnostico_gps_me(current: dict = Depends(require_operador_estricto)):
        """Diagnóstico GPS directo para el operador autenticado."""
        return await _generar_diagnostico_gps(current["id"])

    @router.get("/operadores/me/diagnostico-gps")
    async def get_diagnostico_gps_me_alias(current: dict = Depends(require_operador_estricto)):
        """Alias para diagnóstico GPS directo del operador autenticado."""
        return await _generar_diagnostico_gps(current["id"])

    @router.get("/operadores/{operador_id}")
    async def get_operador(operador_id: str, request: Request):
        await _mismo_o_terminal(request, operador_id)
        op = await db.operadores.find_one({"_id": to_oid(operador_id)})
        if not op:
            raise HTTPException(status_code=404, detail="Operador no encontrado")
        return serialize(op)

    @router.put("/operadores/{operador_id}")
    async def update_operador(operador_id: str, body: OperadorUpdate, request: Request):
        actor = await _mismo_o_terminal(request, operador_id)
        es_terminal = actor.get("_actor") == "terminal"
        updates = {k: v for k, v in body.model_dump(exclude_none=True).items() if k != "contrasena"}
        if body.contrasena:
            updates["password_hash"] = hash_password(body.contrasena)
        # Un operador solo puede actualizar su ruta y asignación de vehículo.
        if not es_terminal:
            updates = {k: updates[k] for k in ("ruta_asignada", "vehiculo_id") if k in updates}
        if not updates:
            raise HTTPException(status_code=400, detail="Nada que actualizar")
        res = await db.operadores.update_one({"_id": to_oid(operador_id)}, {"$set": updates})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Operador no encontrado")
        if "vehiculo_id" in updates:
            # Libera el vehículo anterior y asigna el nuevo si procede
            await db.vehiculos.update_many(
                {"operador_conductor_id": operador_id}, {"$set": {"operador_conductor_id": None}}
            )
            if updates["vehiculo_id"]:
                try:
                    await db.vehiculos.update_one({"_id": to_oid(updates["vehiculo_id"])},
                                                  {"$set": {"operador_conductor_id": operador_id}})
                except HTTPException:
                    pass
        op = await db.operadores.find_one({"_id": to_oid(operador_id)})
        out = serialize(op)
        out.pop("_actor", None)
        return out

    @router.delete("/operadores/{operador_id}")
    async def delete_operador(operador_id: str, _=Depends(require_terminal)):
        res = await db.operadores.delete_one({"_id": to_oid(operador_id)})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Operador no encontrado")
        return {"ok": True}

    @router.patch("/operadores/{operador_id}/estado")
    async def update_estado(operador_id: str, body: EstadoUpdate, request: Request):
        await _mismo_o_terminal(request, operador_id)
        ts = now_iso()
        prev = await db.operadores.find_one({"_id": to_oid(operador_id)})
        if not prev:
            raise HTTPException(status_code=404, detail="Operador no encontrado")
        nuevo = body.estado.value
        # F6: con turno abierto no se puede salir de operación manualmente —
        # el cierre correcto es finalizar el turno (cierra km y duración).
        if nuevo == EstadoOperador.fuera_de_servicio.value:
            turno_abierto = await db.turnos.find_one(
                {"operador_id": operador_id, "fin": None})
            if turno_abierto:
                raise HTTPException(
                    status_code=409,
                    detail="Tienes un turno activo: finaliza tu turno antes de salir de servicio")
        await _validar_transicion_estado(operador_id, prev.get("estado") or "fuera_de_servicio", nuevo)
        updates = {"estado": nuevo, "ultima_actualizacion": ts}
        if nuevo == "fuera_de_servicio":
            updates["inicio_operacion"] = None
        elif prev.get("estado") == "fuera_de_servicio":
            updates["inicio_operacion"] = ts
        await db.operadores.update_one({"_id": to_oid(operador_id)}, {"$set": updates})
        logger.info("estado operador id=%s %s -> %s", operador_id, prev.get("estado"), nuevo)
        op_sitio = prev.get("sitio_id") or DEFAULT_SITIO
        msg = {"type": "estado", "operador_id": operador_id, "estado": nuevo, "sitio_id": op_sitio, "ts": ts}
        await manager.broadcast_terminal(msg, sitio_id=op_sitio)
        await _notificar_dueno_de_operador(operador_id, msg)
        return {"ok": True, "estado": nuevo}

    @router.post("/operadores/{operador_id}/ubicacion")
    async def update_ubicacion(operador_id: str, body: UbicacionUpdate, request: Request):
        """Compatible con la app web actual; delega al pipeline GPS moderno."""
        await _mismo_o_terminal(request, operador_id)
        return await _actualizar_ubicacion(operador_id, body.lat, body.lng,
                                           body.accuracy, body.speed, body.heading,
                                           body.battery_level, body.timestamp)

    @router.post("/operadores/{operador_id}/ubicaciones-batch")
    async def update_ubicaciones_batch(operador_id: str, body: BatchLocationsRequest, request: Request):
        """Ingesta masiva de puntos GPS almacenados en cola offline (Fase Android)."""
        await _mismo_o_terminal(request, operador_id)
        return await _procesar_ubicaciones_batch(operador_id, body.puntos)

    @router.post("/locations/batch")
    async def update_locations_batch_driver(body: BatchLocationsRequest, current: dict = Depends(require_operador_estricto)):
        """Ingesta masiva de puntos GPS offline autenticada con token de operador."""
        return await _procesar_ubicaciones_batch(current["id"], body.puntos)

    @router.get("/operadores/{operador_id}/diagnostico-gps")
    async def get_diagnostico_gps(operador_id: str, request: Request):
        """Diagnóstico detallado de telemetría GPS, calidad de señal y batería."""
        await _mismo_o_terminal(request, operador_id)
        return await _generar_diagnostico_gps(operador_id)

    @router.get("/operadores/{operador_id}/track")
    async def get_track(operador_id: str, limite: int = Query(TRACK_MAX_POINTS, ge=2, le=2000),
                        _=Depends(require_terminal)):
        """Historial de recorrido de un taxi (Fase 10). Solo la terminal lo ve;
        el pasajero nunca accede al rastro de la flota (privacidad GPS)."""
        op = await db.operadores.find_one({"_id": to_oid(operador_id)})
        if not op:
            raise HTTPException(status_code=404, detail="Operador no encontrado")
        track = (op.get("track") or [])[-limite:]
        return {
            "operador_id": operador_id,
            "track": [{"lat": p[0], "lng": p[1], "ts": p[2]} for p in track],
        }

    @router.post("/locations")
    async def ingest_ubicacion(body: UbicacionGPS, current: dict = Depends(require_operador)):
        if body.driver_id and body.driver_id != current["id"]:
            raise HTTPException(status_code=403, detail="No puedes enviar ubicación de otro conductor")
        driver_id = body.driver_id or current["id"]
        return await _actualizar_ubicacion(driver_id, body.lat, body.lng,
                                           body.accuracy, body.speed, body.heading,
                                           body.battery_level, body.timestamp)

    return router
