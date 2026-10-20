"""
Rutas del ciclo de un servicio: cotizar, crear (terminal, pasajero u
operador), listar, asignar/ofrecer (`/dispatch/*`), aceptar/rechazar,
llegada al origen, iniciar, cancelar, terminar y calificar. El motor de
despacho (`_buscar_candidatos`, `_asignar_atomicamente`,
`_autodespachar_servicio_pasajero`, cascada y reintento de pendientes)
sigue en server.py: lo usan también la cotización, el bucle de cascada en
segundo plano y las pruebas. Mismo patrón factory que los demás módulos.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import APIRouter, HTTPException, Depends, Request, Query


def build_router(*, AsignarBody, CalificacionCreate, CancelarBody, CotizarServicioBody,
                 DEFAULT_SITIO, DispatchOfferBody, ESTADOS_ACTIVOS_SERVICIO,
                 EstadoOperador, EstadoServicio, JWT_ALGORITHM, JWT_SECRET,
                 ServicioCreate, ServicioOperadorBody, Ubicacion,
                 _any_autenticado_o_pasajero, _asignar_atomicamente,
                 _auth_pasajero_o_terminal, _auth_servicio,
                 _autodespachar_servicio_pasajero, _buscar_candidatos,
                 _calcular_cotizacion_tenant, _etiqueta_lugar,
                 _expirar_ofertas_vencidas, _mismo_o_terminal,
                 _notificar_dueno_de_operador, _notificar_servicio, _parse_iso,
                 _sitio_query_for, _tiene_servicio_activo, db, haversine_km, logger,
                 manager, now_iso, oferta_ttl_seconds, require_operador,
                 require_operador_estricto, require_pasajero, require_terminal,
                 serialize, to_oid):
    router = APIRouter(prefix="/api", tags=["servicios"])

    @router.get("/dispatch/candidates")
    async def dispatch_candidates(lat: float, lng: float,
                                  num: int = Query(8, ge=1, le=50),
                                  sitio_id: Optional[str] = None,
                                  current=Depends(require_terminal)):
        """Lista los taxis más cercanos al punto dado (para el mapa del dispatcher)."""
        target_sitio = sitio_id or current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        return await _buscar_candidatos(lat, lng, num, target_sitio)

    @router.post("/dispatch/offer")
    async def dispatch_offer(body: DispatchOfferBody, _=Depends(require_terminal)):
        """Ofrece un servicio pendiente a los N taxis más cercanos (estado `ofrecido`)."""
        s = await db.servicios.find_one({"_id": to_oid(body.servicio_id)})
        if not s:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")
        if s.get("estado") not in (EstadoServicio.pendiente.value, EstadoServicio.ofrecido.value):
            raise HTTPException(status_code=409, detail="El servicio no está pendiente de despacho")
        origen = s.get("origen") or {}
        lat, lng = origen.get("lat"), origen.get("lng")
        if lat is None or lng is None:
            raise HTTPException(status_code=400, detail="El servicio no tiene coordenadas de origen")
        candidatos = await _buscar_candidatos(lat, lng, body.num_opciones, s.get("sitio_id"))
        if not candidatos:
            raise HTTPException(status_code=409, detail="No hay taxis disponibles en este momento")
        ids = [c["id"] for c in candidatos]
        ttl = await oferta_ttl_seconds()
        expira = (datetime.now(timezone.utc) + timedelta(seconds=ttl)).isoformat()
        await db.servicios.update_one(
            {"_id": to_oid(body.servicio_id)},
            {"$set": {
                "estado": EstadoServicio.ofrecido.value,
                "ofrecido_a": ids,
                "expira_en": expira,
                "oferta_ttl_s": ttl,
                "rechazados": [],
            }},
        )
        logger.info("despacho: servicio %s ofrecido a %s taxis", body.servicio_id, len(ids))
        s = await db.servicios.find_one({"_id": to_oid(body.servicio_id)})
        await _notificar_servicio(s)
        return {"servicio": serialize(s), "candidatos": candidatos}

    @router.post("/servicios/cotizar")
    async def cotizar_servicio(body: CotizarServicioBody, request: Request):
        """Cotiza en tiempo real un viaje entre origen y destino usando las tarifas y
        colonias reales del tenant, además de disponibilidad y ETA por categoría."""
        actor = await _any_autenticado_o_pasajero(request)
        sitio_id = actor.get("sitio_id") or actor.get("_tenant") or DEFAULT_SITIO
        if not body.origen or body.origen.lat is None or body.origen.lng is None:
            raise HTTPException(status_code=400, detail="Debes indicar coordenadas del origen")
        if not body.destino or body.destino.lat is None or body.destino.lng is None:
            raise HTTPException(status_code=400, detail="Debes indicar coordenadas del destino")
        return await _calcular_cotizacion_tenant(
            body.origen, body.destino, sitio_id, body.tipo_vehiculo_preferido_id
        )

    def _situar_servicio(body: ServicioCreate, pasajero: Optional[dict], sitio_id: str) -> dict:
        origen = body.origen.model_dump() if body.origen else {"texto": None, "lat": None, "lng": None}
        destino = body.destino.model_dump() if body.destino else {"texto": None, "lat": None, "lng": None}
        cliente_id = body.cliente_id or (str(pasajero["id"]) if pasajero else None)
        cliente_nombre = body.cliente_nombre or (pasajero["nombre"] if pasajero else None)
        cliente_telefono = body.cliente_telefono or (pasajero["telefono"] if pasajero else None)
        return {
            "cliente_id": cliente_id,
            "cliente_nombre": cliente_nombre,
            "cliente_telefono": cliente_telefono,
            "pasajero_id": str(pasajero["id"]) if pasajero else (body.pasajero_id or None),
            "origen": origen,
            "destino": destino,
            "origen_texto": origen.get("texto"),
            "destino_texto": destino.get("texto"),
            "costo": body.costo,
            "tarifa_id": body.tarifa_id,
            "metodo_pago": body.metodo_pago,
            "tipo_vehiculo_preferido_id": body.tipo_vehiculo_preferido_id,
            "notas_pasajero": body.notas_pasajero,
            "sitio_id": sitio_id,
            "tipo": "pasajero" if pasajero else "terminal",
            "operador_asignado_id": None,
            "estado": EstadoServicio.pendiente.value,
            "timestamp_creacion": now_iso(),
            "timestamp_asignacion": None,
            "rechazados": [],
        }

    @router.post("/servicios")
    async def create_servicio(body: ServicioCreate, request: Request):
        auth = request.headers.get("Authorization", "")
        pasajero = None
        if auth.startswith("Bearer "):
            try:
                payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
            except jwt.InvalidTokenError:
                raise HTTPException(status_code=401, detail="Token inválido")
            if payload.get("scope") == "pasajero":
                pasajero = await require_pasajero(request)
        if pasajero:
            if body.operador_asignado_id:
                raise HTTPException(status_code=400, detail="Un pasajero no puede elegir el taxi")
            if not body.origen or body.origen.lat is None or body.origen.lng is None:
                raise HTTPException(status_code=400, detail="Debes indicar coordenadas del origen")
            if not body.destino or body.destino.lat is None or body.destino.lng is None:
                raise HTTPException(status_code=400, detail="Debes indicar coordenadas del destino")
            sitio_id = pasajero.get("sitio_id") or DEFAULT_SITIO
        else:
            term = await require_terminal(request)
            sitio_id = term.get("sitio_id") or term.get("_tenant") or DEFAULT_SITIO

        doc = _situar_servicio(body, pasajero, sitio_id)
        # Calles reales para la voz del operador (Fase bot): si el origen/destino
        # vienen solo con coordenadas, se rellena el texto con reverse-geocoding.
        o_geo, d_geo = doc["origen"], doc["destino"]
        for punto, campo in ((o_geo, "origen_texto"), (d_geo, "destino_texto")):
            if punto.get("lat") is not None and not punto.get("texto"):
                etiqueta = await _etiqueta_lugar(punto["lat"], punto["lng"])
                if etiqueta:
                    punto["texto"] = etiqueta
                    doc[campo] = etiqueta

        # Si es solicitud de pasajero, calcular tarifa oficial del tenant cuando no venga fijada
        if pasajero and o_geo.get("lat") is not None and d_geo.get("lat") is not None:
            cot = await _calcular_cotizacion_tenant(
                Ubicacion(**o_geo),
                Ubicacion(**d_geo),
                sitio_id,
                body.tipo_vehiculo_preferido_id,
            )
            if doc.get("costo") is None:
                doc["costo"] = cot["costo_estimado"]
            if not doc.get("tarifa_id"):
                doc["tarifa_id"] = cot.get("tarifa_id")
            doc["tarifa_nombre"] = cot.get("tarifa_nombre")
            doc["distancia_m"] = cot.get("distancia_m")
            doc["duracion_s"] = cot.get("duracion_s")

        res = await db.servicios.insert_one(doc)
        doc["_id"] = res.inserted_id
        logger.info("servicio creado id=%s tipo=%s estado=pendiente", res.inserted_id, doc.get("tipo"))

        if body.operador_asignado_id:
            ok = await _asignar_atomicamente(str(res.inserted_id), body.operador_asignado_id)
            if not ok:
                # La asignación manual perdió la carrera; queda pendiente para despacho.
                _doc_fresh = await db.servicios.find_one({"_id": res.inserted_id})
                out = serialize(_doc_fresh)
                await manager.broadcast_terminal({"type": "servicio", "servicio": out}, sitio_id=sitio_id)
                return {"servicio": out, "asignado": False,
                        "detalle": "El taxi ya no estaba disponible; el servicio quedó pendiente"}
        elif pasajero:
            # Autodespacho inmediato al conductor libre más cercano del tenant
            await _autodespachar_servicio_pasajero(str(res.inserted_id))

        doc = await db.servicios.find_one({"_id": res.inserted_id})
        out = serialize(doc)
        await _notificar_servicio(doc)
        return {"servicio": out, "asignado": doc.get("estado") == EstadoServicio.asignado.value}

    @router.get("/servicios")
    async def list_servicios(estado: Optional[EstadoServicio] = None, current=Depends(require_terminal)):
        sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        query = _sitio_query_for(sitio)
        if estado:
            query["estado"] = estado.value
        docs = await db.servicios.find(query).sort("timestamp_creacion", -1).to_list(1000)
        return [serialize(d) for d in docs]

    @router.get("/servicios/hoy")
    async def list_servicios_hoy(current=Depends(require_terminal)):
        sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        hoy = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        docs = await db.servicios.find(
            {"timestamp_creacion": {"$regex": f"^{hoy}"}, **_sitio_query_for(sitio)}
        ).sort("timestamp_creacion", -1).to_list(1000)
        ops = {str(o["_id"]): o for o in await db.operadores.find(_sitio_query_for(sitio)).to_list(1000)}
        out = []
        for d in docs:
            s = serialize(d)
            op = ops.get(s.get("operador_asignado_id"))
            s["operador_nombre"] = op["nombre"] if op else None
            out.append(s)
        return out

    @router.get("/servicios/mis-activos")
    async def mis_servicios_activos(current: dict = Depends(require_operador)):
        """Servicios activos/ofrecidos al conductor actual (para la Driver App)."""
        await _expirar_ofertas_vencidas()
        docs = await db.servicios.find({
            "$or": [
                {"operador_asignado_id": current["id"]},
                {"ofrecido_a": current["id"]},
            ],
            "estado": {"$in": ESTADOS_ACTIVOS_SERVICIO},
        }).sort("timestamp_creacion", -1).to_list(100)
        return [serialize(d) for d in docs]

    @router.get("/servicios/{servicio_id}")
    async def get_servicio(servicio_id: str, request: Request):
        s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
        if not s:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")
        await _auth_servicio(request, s)
        return serialize(s)

    @router.post("/servicios/{servicio_id}/calificacion")
    async def calificar_conductor(
        servicio_id: str,
        body: CalificacionCreate,
        current: dict = Depends(require_pasajero),
    ):
        """Registra una única calificación del pasajero dueño de un viaje completado."""
        s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
        if not s:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")
        if s.get("pasajero_id") != current["id"]:
            raise HTTPException(status_code=403, detail="No tienes acceso a este servicio")
        if s.get("estado") != EstadoServicio.completado.value:
            raise HTTPException(status_code=409, detail="Solo puedes calificar un servicio completado")
        if s.get("calificacion_conductor"):
            raise HTTPException(status_code=409, detail="Este servicio ya tiene una calificación")

        calificacion = {
            "puntuacion": body.puntuacion,
            "comentario": body.comentario,
            "timestamp": now_iso(),
            "pasajero_id": current["id"],
        }
        # La condición evita calificaciones duplicadas incluso ante solicitudes concurrentes.
        result = await db.servicios.update_one(
            {
                "_id": to_oid(servicio_id),
                "pasajero_id": current["id"],
                "estado": EstadoServicio.completado.value,
                "calificacion_conductor": {"$exists": False},
            },
            {"$set": {"calificacion_conductor": calificacion}},
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=409, detail="Este servicio ya tiene una calificación")
        s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
        return {"calificacion_conductor": calificacion, "servicio": serialize(s)}

    @router.post("/servicios/{servicio_id}/asignar")
    async def asignar_servicio(servicio_id: str, body: AsignarBody, _=Depends(require_terminal)):
        """Asignación manual por el dispatcher (pasa por la lógica atómica)."""
        s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
        if not s:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")
        ok = await _asignar_atomicamente(servicio_id, body.operador_id)
        if not ok:
            raise HTTPException(
                status_code=409,
                detail="El servicio ya fue asignado o el taxi dejó de estar disponible",
            )
        return serialize(await db.servicios.find_one({"_id": to_oid(servicio_id)}))

    @router.post("/servicios/{servicio_id}/aceptar")
    async def aceptar_servicio(servicio_id: str, current: dict = Depends(require_operador_estricto)):
        """El conductor acepta la oferta (carrera atómica: solo uno gana)."""
        s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
        if not s:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")
        if s.get("estado") == "vencido":
            raise HTTPException(status_code=410, detail="La oferta expiró")
        if s.get("estado") not in ("ofrecido", "pendiente"):
            raise HTTPException(status_code=409, detail="El servicio ya no está disponible")
        if s.get("ofrecido_a") and current["id"] not in s.get("ofrecido_a", []):
            raise HTTPException(status_code=403, detail="No tienes una oferta activa para este servicio")
        exp = _parse_iso(s.get("expira_en"))
        if exp:
            exp = exp.replace(tzinfo=timezone.utc) if exp.tzinfo is None else exp
            if exp < datetime.now(timezone.utc):
                await db.servicios.update_one({"_id": s["_id"]},
                                              {"$set": {"estado": "vencido", "ts_vencido": now_iso()}})
                raise HTTPException(status_code=410, detail="La oferta expiró")
        ganador = await _asignar_atomicamente(servicio_id, current["id"],
                                              permitir_estados=["ofrecido", "pendiente"])
        if not ganador:
            logger.info("Problema de concurrencia resuelto: operador=%s perdió la asignación del servicio %s",
                        current["id"], servicio_id)
            raise HTTPException(status_code=409, detail="El servicio ya fue asignado a otro conductor")
        logger.info("servicio aceptado id=%s por operador=%s", servicio_id, current["id"])
        return serialize(await db.servicios.find_one({"_id": to_oid(servicio_id)}))

    @router.post("/servicios/{servicio_id}/rechazar")
    async def rechazar_servicio(servicio_id: str, current: dict = Depends(require_operador_estricto)):
        s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
        if not s:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")
        if s.get("estado") != "ofrecido" or current["id"] not in (s.get("ofrecido_a") or []):
            raise HTTPException(status_code=403, detail="No tienes una oferta activa para este servicio")
        # Operación atómica: $addToSet/$pull evita recálculo en memoria y carreras entre rechazos concurrentes
        res = await db.servicios.update_one(
            {"_id": to_oid(servicio_id), "estado": EstadoServicio.ofrecido.value, "ofrecido_a": current["id"]},
            {"$addToSet": {"rechazados": current["id"]}, "$pull": {"ofrecido_a": current["id"]}},
        )
        if res.matched_count == 0:
            # Validar si perdió la carrera o el servicio cambió de estado
            s2 = await db.servicios.find_one({"_id": to_oid(servicio_id)})
            if not s2:
                raise HTTPException(status_code=404, detail="Servicio no encontrado")
            if s2.get("estado") != "ofrecido" or current["id"] not in (s2.get("ofrecido_a") or []) and current["id"] not in (s2.get("rechazados") or []):
                raise HTTPException(status_code=403, detail="No tienes una oferta activa para este servicio")
        s_fresh = await db.servicios.find_one({"_id": to_oid(servicio_id)})
        restantes = len(s_fresh.get("ofrecido_a") or [])
        if restantes == 0 and s_fresh.get("estado") == EstadoServicio.ofrecido.value:
            if s_fresh.get("tipo") == "pasajero":
                # Reasignar automáticamente al siguiente conductor elegible más cercano no rechazado
                s_fresh = await _autodespachar_servicio_pasajero(servicio_id)
                restantes = len(s_fresh.get("ofrecido_a") or [])
                await _notificar_servicio(s_fresh)
            else:
                await db.servicios.update_one(
                    {"_id": to_oid(servicio_id), "estado": EstadoServicio.ofrecido.value},
                    {"$set": {"estado": EstadoServicio.pendiente.value}, "$unset": {"expira_en": ""}},
                )
                s_fresh = await db.servicios.find_one({"_id": to_oid(servicio_id)})
                restantes = 0
                await _notificar_servicio(s_fresh)
        logger.info("servicio rechazado id=%s por operador=%s (quedan %s)",
                    servicio_id, current["id"], restantes)
        return serialize(s_fresh)

    @router.post("/servicios/{servicio_id}/llegada-origen")
    async def marcar_llegada_origen(servicio_id: str, current: dict = Depends(require_operador_estricto)):
        """El conductor asignado notifica que ha llegado al punto de encuentro del pasajero."""
        s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
        if not s:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")
        if s.get("operador_asignado_id") != current["id"]:
            raise HTTPException(status_code=403, detail="Solo el conductor asignado puede marcar llegada")
        if s.get("estado") != EstadoServicio.asignado.value:
            raise HTTPException(status_code=409, detail="El servicio debe estar asignado")
        ts = now_iso()
        await db.servicios.update_one(
            {"_id": to_oid(servicio_id)},
            {"$set": {"conductor_en_origen": True, "timestamp_llegada_origen": ts}},
        )
        s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
        await _notificar_servicio(s)
        return serialize(s)

    async def _cancelar_servicio(servicio_id: str, motivo: Optional[str] = None) -> dict:
        s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
        if not s:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")
        if s.get("estado") in ("completado", "cancelado", "vencido", "rechazado"):
            raise HTTPException(status_code=409, detail="El servicio ya no se puede cancelar")
        ts = now_iso()
        updates = {"estado": "cancelado", "timestamp_cancelado": ts}
        if motivo:
            updates["motivo_cancelacion"] = motivo
        await db.servicios.update_one({"_id": to_oid(servicio_id)}, {"$set": updates})
        s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
        s_sitio = s.get("sitio_id") or DEFAULT_SITIO
        oid = s.get("operador_asignado_id")
        if oid:
            await db.operadores.update_one(
                {"_id": to_oid(oid)},
                {"$set": {"estado": EstadoOperador.libre.value, "ultima_actualizacion": ts}},
            )
            estado_msg = {"type": "estado", "operador_id": oid, "estado": EstadoOperador.libre.value, "ts": ts, "sitio_id": s_sitio}
            await manager.broadcast_terminal(estado_msg, sitio_id=s_sitio)
            await _notificar_dueno_de_operador(oid, estado_msg)
        await _notificar_servicio(s)
        logger.info("servicio cancelado id=%s", servicio_id)
        return serialize(s)

    @router.post("/servicios/{servicio_id}/cancelar")
    async def cancelar_servicio(servicio_id: str, request: Request, body: Optional[CancelarBody] = None):
        s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
        if not s:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")
        await _auth_pasajero_o_terminal(request, s)
        return await _cancelar_servicio(servicio_id, body.motivo if body else None)

    @router.post("/servicios/{servicio_id}/iniciar")
    async def iniciar_viaje(servicio_id: str, current: dict = Depends(require_operador_estricto)):
        """El conductor inició el recorrido (Irá por el cliente)."""
        s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
        if not s:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")
        if s.get("operador_asignado_id") != current["id"]:
            raise HTTPException(status_code=403, detail="Solo el conductor asignado puede iniciar el servicio")
        if s.get("estado") != "asignado":
            raise HTTPException(status_code=409, detail="El servicio debe estar asignado para iniciarlo")
        ts = now_iso()
        await db.servicios.update_one({"_id": to_oid(servicio_id)},
                                      {"$set": {"estado": "en_curso", "timestamp_inicio": ts}})
        s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
        await _notificar_servicio(s)
        return serialize(s)

    @router.post("/operadores/{operador_id}/servicio")
    async def iniciar_servicio_operador(operador_id: str, body: ServicioOperadorBody, request: Request):
        """Radio: el taxista inicia un servicio propio (sin pasajero digital)."""
        await _mismo_o_terminal(request, operador_id)
        op = await db.operadores.find_one({"_id": to_oid(operador_id)})
        if not op:
            raise HTTPException(status_code=404, detail="Operador no encontrado")
        if await _tiene_servicio_activo(operador_id):
            raise HTTPException(status_code=409, detail="Ya tienes un servicio en curso")
        ts = now_iso()
        op_sitio = op.get("sitio_id") or DEFAULT_SITIO
        doc = {
            "cliente_id": None, "cliente_nombre": None, "cliente_telefono": None,
            "origen": {"texto": body.origen_texto, "lat": None, "lng": None},
            "destino": {"texto": body.destino_texto, "lat": None, "lng": None},
            "origen_texto": body.origen_texto,
            "destino_texto": body.destino_texto,
            "costo": body.costo,
            "tarifa_id": body.tarifa_id,
            "metodo_pago": "cash",
            "sitio_id": op_sitio,
            "tipo": "operador",
            "operador_asignado_id": operador_id,
            "estado": EstadoServicio.en_curso.value,
            "timestamp_creacion": ts,
            "timestamp_asignacion": ts,
        }
        res = await db.servicios.insert_one(doc)
        doc["_id"] = res.inserted_id
        servicio = serialize(doc)
        await db.operadores.update_one(
            {"_id": to_oid(operador_id)},
            {"$set": {"estado": EstadoOperador.ocupado.value, "ultima_actualizacion": ts}},
        )
        estado_msg = {"type": "estado", "operador_id": operador_id, "estado": EstadoOperador.ocupado.value, "ts": ts, "sitio_id": op_sitio}
        await manager.broadcast_terminal(estado_msg, sitio_id=op_sitio)
        await manager.broadcast_terminal({"type": "servicio", "servicio": servicio}, sitio_id=op_sitio)
        await _notificar_dueno_de_operador(operador_id, estado_msg)
        await _notificar_dueno_de_operador(operador_id, {"type": "servicio", "servicio": servicio})
        return servicio

    async def _calcular_metricas_servicio(s: dict, ts_fin: str) -> dict:
        """Distancia/duración reales del viaje (nunca inventadas):
        - duracion_s: tiempo transcurrido real entre timestamp_inicio y el fin.
        - distancia_m: recorrido GPS real del conductor en esa ventana (más fiel que
          cualquier estimación de ruta); si no hay track suficiente, cae a línea
          recta origen→destino; si tampoco hay coordenadas, queda en None.
        """
        metrics = {"distancia_m": None, "duracion_s": None}
        t_inicio = s.get("timestamp_inicio")
        if t_inicio:
            inicio_dt, fin_dt = _parse_iso(t_inicio), _parse_iso(ts_fin)
            if inicio_dt and fin_dt:
                metrics["duracion_s"] = round((fin_dt - inicio_dt).total_seconds())

        oid = s.get("operador_asignado_id")
        dist_m = None
        if oid and t_inicio:
            op = await db.operadores.find_one({"_id": to_oid(oid)}, {"track": 1})
            track = [p for p in (op.get("track") or []) if t_inicio <= p[2] <= ts_fin] if op else []
            if len(track) >= 2:
                dist_m = 0.0
                for i in range(1, len(track)):
                    dist_m += haversine_km(track[i - 1][0], track[i - 1][1], track[i][0], track[i][1]) * 1000
        if dist_m is None:
            origen, destino = s.get("origen") or {}, s.get("destino") or {}
            if origen.get("lat") is not None and destino.get("lat") is not None:
                dist_m = haversine_km(origen["lat"], origen["lng"], destino["lat"], destino["lng"]) * 1000
        metrics["distancia_m"] = round(dist_m) if dist_m is not None else None
        return metrics

    @router.post("/servicios/{servicio_id}/terminar")
    async def terminar_servicio(servicio_id: str, request: Request):
        s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
        if not s:
            raise HTTPException(status_code=404, detail="Servicio no encontrado")
        # Puede terminar el conductor asignado o la terminal.
        auth = request.headers.get("Authorization", "")
        payload = None
        if auth.startswith("Bearer "):
            try:
                payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALGORITHM])
            except jwt.InvalidTokenError:
                raise HTTPException(status_code=401, detail="Token inválido")
        if not payload or payload.get("scope") == "terminal":
            await require_terminal(request)
        else:
            op = await require_operador(request)
            if str(op["id"]) != s.get("operador_asignado_id"):
                raise HTTPException(status_code=403, detail="Solo el conductor asignado puede terminar")
        if s.get("estado") not in ("en_curso", "asignado"):
            raise HTTPException(status_code=409, detail="El servicio no está en curso")
        ts = now_iso()
        metricas = await _calcular_metricas_servicio(s, ts)
        await db.servicios.update_one(
            {"_id": to_oid(servicio_id)},
            {"$set": {"estado": EstadoServicio.completado.value, "timestamp_fin": ts, **metricas}},
        )
        s_sitio = s.get("sitio_id") or DEFAULT_SITIO
        oid = s.get("operador_asignado_id")
        if oid:
            await db.operadores.update_one(
                {"_id": to_oid(oid)},
                {"$set": {"estado": EstadoOperador.libre.value, "ultima_actualizacion": ts}},
            )
            estado_msg = {"type": "estado", "operador_id": oid, "estado": EstadoOperador.libre.value, "ts": ts, "sitio_id": s_sitio}
            await manager.broadcast_terminal(estado_msg, sitio_id=s_sitio)
            await _notificar_dueno_de_operador(oid, estado_msg)
        s = await db.servicios.find_one({"_id": to_oid(servicio_id)})
        await _notificar_servicio(s)
        return serialize(s)

    return router
