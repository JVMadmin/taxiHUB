"""
WhatsApp Opción A: puente QR Baileys (`wa-bridge/`, una sesión por sitio) con
cadencia humana (spintax, "escribiendo…", cola por sitio, solo responde a quien
escribió en las últimas 24 h) + webhook/entrada del puente (`/wa/incoming`,
`/wa/webhook`, autenticados con `WA_WEBHOOK_TOKEN`) y bandeja de conversaciones
de la terminal.

Los sitios demo (`SITIOS_DEMO` con la simulación activa) siguen simulados: con
las cuentas demo públicas nadie debe vincular su WhatsApp real a ellos. Para
probar el puente en un sitio demo: `WA_PUENTE_EN_DEMO=1`.

Mismo patrón factory que los demás módulos; `server.py` re-exporta
`_seed_wa_conversacion` (lo usa `_migraciones`).
"""
import os
import random
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Optional, Dict, Literal

import httpx
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field


def build(*, DEFAULT_SITIO, SITIOS_DEMO, _require_terminal_or_dev, _sitio_query_for, db, logger,
          manager, now_iso, require_terminal, serialize, simulacion_demo, to_oid):
    router = APIRouter(prefix="/api", tags=["whatsapp"])

    _wa_last_send_ts: Dict[str, float] = {}
    _wa_demo_state: Dict[str, Dict] = {}

    _PROTECCION = {
        "solo_respuesta_entrante_24h": True,
        "simulacion_escritura_humana_ms": "1500-3200",
        "variacion_spintax_polimorfica": True,
        "cola_rate_limit_min_seg": 3.0,
        "lectura_natural_delay_ms": "800-1500",
        "sesion_persistente_multifile": True,
        "aviso": ("Conexión no oficial (WhatsApp Web): estas reglas reducen el riesgo, pero WhatsApp "
                  "puede bloquear el número si los pasajeros lo reportan como spam."),
    }

    def _es_sitio_demo(sitio: str) -> bool:
        if os.environ.get("WA_PUENTE_EN_DEMO", "").strip().lower() in ("1", "true", "si", "sí", "on"):
            return False
        return bool(simulacion_demo()) and sitio in SITIOS_DEMO

    async def _puente(metodo: str, ruta: str, timeout: float = 4.0, **kwargs):
        """Llama al puente Baileys. Devuelve (status, json) o (None, None) si no responde."""
        url = os.environ.get("WA_BRIDGE_URL", "http://127.0.0.1:3099").rstrip("/") + ruta
        token = os.environ.get("WA_BRIDGE_TOKEN") or os.environ.get("WA_WEBHOOK_TOKEN") or ""
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        try:
            async with httpx.AsyncClient(timeout=timeout) as hc:
                r = await hc.request(metodo, url, headers=headers, **kwargs)
            try:
                data = r.json()
            except ValueError:
                data = {}
            return r.status_code, data
        except Exception as e:
            logger.info("Puente WhatsApp no disponible (%s %s): %s", metodo, ruta, e)
            return None, None

    class WaReply(BaseModel):
        texto: str = Field(min_length=1, max_length=1000)

    class WaAutoReplyDespacho(BaseModel):
        servicio_id: Optional[str] = None
        operador_id: Optional[str] = None
        unidad: Optional[str] = None
        vehiculo_desc: Optional[str] = None
        conductor_nombre: Optional[str] = None
        eta_min: int = Field(default=4, ge=1, le=60)
        costo: Optional[float] = None

    class WaVincularDemoBody(BaseModel):
        accion: Literal["vincular", "desvincular", "regenerar_qr", "codigo_emparejamiento", "configurar_numero"] = "vincular"
        numero: Optional[str] = None
        telefono: Optional[str] = None
        dispositivo: Optional[str] = None
        modo_conexion: Optional[str] = None

    class WaIncomingBody(BaseModel):
        cliente_telefono: str = Field(min_length=4, max_length=40)
        cliente_nombre: Optional[str] = "Cliente WhatsApp (Prueba)"
        texto: Optional[str] = "Hola, necesito un taxi en mi ubicación por favor"
        lat: Optional[float] = None
        lng: Optional[float] = None
        sitio_id: Optional[str] = None

    _WA_SALUDOS = [
        "¡Hola {cliente}!",
        "¡Qué tal {cliente}!",
        "Buen día {cliente},",
        "¡Listo {cliente}!",
    ]
    _WA_CUERPOS = [
        "Tu unidad *{unidad}* ({vehiculo}) ya va en camino a tu ubicación.",
        "Asignamos el taxi *{unidad}* ({vehiculo}) para tu servicio y ya salió hacia ti.",
        "La unidad *{unidad}* ({vehiculo}) ha sido despachada hacia tu punto.",
        "Confirmado: el taxi *{unidad}* ({vehiculo}) se dirige por ti en este momento.",
    ]
    _WA_CIERRES = [
        "Lo conduce *{conductor}* y llega en aprox. *{eta_min} min*. 🚕",
        "Tu operador es *{conductor}*, tiempo estimado de llegada: *{eta_min} min*. 📍",
        "Operador asignado: *{conductor}* (llega en ~*{eta_min} min*). ¡Gracias por viajar con nosotros!",
        "Al volante va *{conductor}*, estará contigo en unos *{eta_min} min*.",
    ]

    def _generar_mensaje_spintax_antiban(
        cliente: str,
        unidad: str,
        vehiculo: str,
        conductor: str,
        eta_min: int,
        costo: Optional[float] = None,
        plantilla_custom: Optional[str] = None,
    ) -> str:
        """Regla 3 Anti-Ban: variación polimórfica natural (Spintax) para nunca enviar
        el mismo bloque idéntico de bytes de forma repetitiva."""
        nombre_limpio = (cliente or "cliente").split("(")[0].strip()
        if plantilla_custom and "{unidad}" in plantilla_custom:
            try:
                 base_txt = plantilla_custom.format(
                     cliente=nombre_limpio,
                     unidad=unidad,
                     vehiculo=vehiculo or "Taxi",
                     conductor=conductor,
                     eta_min=eta_min,
                     costo=f"${int(costo)}" if costo else "",
                 )
                 return base_txt
            except Exception:
                 pass
        saludo = random.choice(_WA_SALUDOS).format(cliente=nombre_limpio)
        cuerpo = random.choice(_WA_CUERPOS).format(unidad=unidad, vehiculo=vehiculo or "Taxi")
        cierre = random.choice(_WA_CIERRES).format(conductor=conductor, eta_min=eta_min)
        extra_costo = f" Tarifa acordada: *${int(costo)} MXN*." if costo else ""
        return f"{saludo} {cuerpo} {cierre}{extra_costo}"

    def _wa_conv_serialize(doc: Dict) -> Dict:
        d = serialize(doc)
        msgs = d.get("mensajes") or []
        d["ultimo_mensaje"] = msgs[-1] if msgs else None
        d["mensajes_count"] = len(msgs)
        # Verifica ventana de 24h de cliente (Regla 1 Anti-Ban: solo responder a quien escribió)
        msgs_cliente = [m for m in msgs if m.get("de") == "cliente"]
        d["ventana_24h_activa"] = len(msgs_cliente) > 0
        return d

    _ERRORES_ENVIO = {
        "whatsapp_no_conectado": "WhatsApp no está vinculado en esta central.",
        "fuera_de_ventana_24h": "El pasajero no ha escrito en las últimas 24 h; WhatsApp solo permite responderle.",
        "puente_no_disponible": "El servicio de WhatsApp no responde.",
    }

    async def _enviar_por_bridge_antiban(sitio_id: str, telefono: str, texto: str) -> dict:
        """Cadencia humana (cola >= 3 s, "escribiendo…" 1.5–3.2 s) y envío por el puente
        Baileys. En sitios demo el envío es simulado. Devuelve los campos que se guardan
        en el mensaje: `id`, `estado_envio` (simulado | encolado | fallido) y `antiban`."""
        import time as _time
        now_t = _time.time()
        last_t = _wa_last_send_ts.get(sitio_id, 0.0)
        espera_cola = max(0.0, 3.0 - (now_t - last_t))
        typing_ms = random.randint(1500, 3200)
        _wa_last_send_ts[sitio_id] = now_t + espera_cola
        mensaje_id = uuid.uuid4().hex

        if _es_sitio_demo(sitio_id):
            state = _wa_demo_state.setdefault(sitio_id, {})
            state["mensajes_enviados_hoy"] = state.get("mensajes_enviados_hoy", 0) + 1
            estado, error = "simulado", None
        else:
            status, data = await _puente(
                "POST", "/send", timeout=6.0,
                json={
                    "sitio_id": sitio_id,
                    "telefono": telefono,
                    "texto": texto,
                    "typing_ms": typing_ms,
                    "delay_queue_ms": int(espera_cola * 1000),
                    "mensaje_id": mensaje_id,
                },
            )
            if status in (200, 202):
                estado, error = "encolado", None
            else:
                estado = "fallido"
                error = (data or {}).get("error") or "puente_no_disponible"

        meta = {
            "id": mensaje_id,
            "estado_envio": estado,
            "antiban": {
                "regla_1_solo_respuesta_24h": True,
                "regla_2_composing_ms": typing_ms,
                "regla_3_spintax_unico": True,
                "regla_4_rate_limit_delay_s": round(espera_cola, 2),
                "entregado_bridge": estado == "encolado",
            },
        }
        if error:
            meta["error_envio"] = _ERRORES_ENVIO.get(error, error)
        return meta

    def _generar_qr_data_url(texto: str) -> str:
        try:
            import qrcode
            import io
            import base64
            qr = qrcode.QRCode(
                version=None,
                error_correction=qrcode.constants.ERROR_CORRECT_M,
                box_size=8,
                border=2,
            )
            qr.add_data(texto)
            qr.make(fit=True)
            img = qr.make_image(fill_color="black", back_color="white")
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            b64 = base64.b64encode(buf.getvalue()).decode("ascii")
            return f"data:image/png;base64,{b64}"
        except Exception as e:
            logger.warning("Error generando QR real: %s", e)
            return ""

    async def _estado_demo(sitio: str, sitio_doc: Dict) -> Dict:
        """Estado simulado de los sitios demo (no hay WhatsApp real detrás)."""
        default_num = sitio_doc.get("whatsapp_numero") or sitio_doc.get("telefono_central") or "+52 916 345 9900"
        state = _wa_demo_state.setdefault(sitio, {})
        state.setdefault("conectado", True)
        state.setdefault("numero_vinculado", default_num)
        state.setdefault("mensajes_enviados_hoy", 4)
        state.setdefault("qr_code", f"TAXIHUB-DEMO|{sitio}|{uuid.uuid4().hex[:12]}")
        state.setdefault("pairing_code", "DEMO-0000")
        return {
            "sitio_id": sitio,
            "demo": True,
            "puente_disponible": False,
            "estado": "conectado" if state["conectado"] else "desconectado",
            "conectado": state["conectado"],
            "numero_vinculado": state["numero_vinculado"],
            "dispositivo": "Simulación de la demo",
            "modo": "demo_simulado",
            "qr_code": state["qr_code"],
            "qr_data_url": _generar_qr_data_url(state["qr_code"]),
            "pairing_code": state["pairing_code"],
            "mensajes_enviados_hoy": state["mensajes_enviados_hoy"],
            "motivo": None,
            "antiban_proteccion": _PROTECCION,
        }

    async def _estado_real(sitio: str, sitio_doc: Dict) -> Dict:
        status, b = await _puente("GET", "/status", timeout=3.0, params={"sitio_id": sitio})
        puente = status == 200
        b = b if puente else {}
        estado = b.get("estado") or "desconectado"
        conectado = estado == "conectado"
        qr = b.get("qr_code") if estado == "esperando_qr" else None
        return {
            "sitio_id": sitio,
            "demo": False,
            "puente_disponible": puente,
            "estado": estado,
            "conectado": conectado,
            "numero_vinculado": b.get("numero_vinculado") or sitio_doc.get("whatsapp_numero"),
            "dispositivo": b.get("dispositivo") or "TaxiHUB Central",
            "modo": "baileys_live" if conectado else ("sin_vincular" if puente else "puente_no_disponible"),
            "qr_code": qr,
            "qr_data_url": _generar_qr_data_url(qr) if qr else "",
            "pairing_code": b.get("pairing_code") if estado == "esperando_codigo" else None,
            "mensajes_enviados_hoy": b.get("mensajes_enviados_hoy", 0),
            "motivo": b.get("motivo"),
            "antiban_proteccion": _PROTECCION,
        }

    @router.get("/wa/status")
    async def wa_get_status(current=Depends(require_terminal)):
        sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        sitio_doc = await db.sitios.find_one({"clave": sitio}) or {}
        if _es_sitio_demo(sitio):
            return await _estado_demo(sitio, sitio_doc)
        return await _estado_real(sitio, sitio_doc)

    async def _guardar_numero(sitio: str, numero: str):
        await db.sitios.update_one(
            {"clave": sitio},
            {"$set": {"whatsapp_numero": numero, "actualizado": now_iso()}},
            upsert=True,
        )

    @router.post("/wa/bridge/vincular")
    async def wa_bridge_vincular(body: WaVincularDemoBody, current=Depends(require_terminal)):
        sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        nuevo_num = (body.numero or body.telefono or "").strip()

        if _es_sitio_demo(sitio):
            state = _wa_demo_state.setdefault(sitio, {})
            if body.accion in ("desvincular", "regenerar_qr"):
                state["conectado"] = False
                state["qr_code"] = f"TAXIHUB-DEMO|{sitio}|{uuid.uuid4().hex[:8]}"
            elif body.accion == "codigo_emparejamiento":
                digits = "".join(c for c in (nuevo_num or "0000") if c.isdigit())[-4:].zfill(4)
                state["pairing_code"] = f"DEMO-{digits}"
                state["conectado"] = True
            else:
                state["conectado"] = True
            if nuevo_num:
                state["numero_vinculado"] = nuevo_num
                await _guardar_numero(sitio, nuevo_num)
            return await wa_get_status(current)

        if body.accion in ("vincular", "configurar_numero"):
            if nuevo_num:
                await _guardar_numero(sitio, nuevo_num)
            return await wa_get_status(current)

        if body.accion == "codigo_emparejamiento":
            digitos = "".join(c for c in nuevo_num if c.isdigit())
            if len(digitos) < 11:
                raise HTTPException(status_code=422, detail="Escribe el número con lada de país, p. ej. +52 916 123 4567")
            await _guardar_numero(sitio, nuevo_num)
            status, data = await _puente("POST", f"/sesiones/{sitio}/iniciar", timeout=25.0,
                                         json={"modo": "codigo", "telefono": digitos})
        elif body.accion == "regenerar_qr":
            status, data = await _puente("POST", f"/sesiones/{sitio}/iniciar", timeout=25.0, json={"modo": "qr"})
        else:  # desvincular
            status, data = await _puente("POST", f"/sesiones/{sitio}/cerrar", timeout=15.0, json={})
        if status != 200:
            raise HTTPException(status_code=503, detail="El servicio de WhatsApp no está disponible. Intenta de nuevo en un minuto.")
        return await wa_get_status(current)

    async def _sitio_wa_autorizado(request: Request, sitio_pedido: Optional[str]) -> str:
        """Quién puede inyectar mensajes entrantes: el puente con `Bearer WA_WEBHOOK_TOKEN`
        (elige el sitio) o una sesión de terminal/dev (la terminal queda en su propio sitio)."""
        auth = request.headers.get("Authorization", "")
        token = os.environ.get("WA_WEBHOOK_TOKEN")
        if token and auth == f"Bearer {token}":
            return sitio_pedido or DEFAULT_SITIO
        if not auth.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="No autorizado")
        actor = await _require_terminal_or_dev(request)
        if actor.get("_actor") == "terminal":
            return actor.get("sitio_id") or DEFAULT_SITIO
        return sitio_pedido or actor.get("sitio_id") or DEFAULT_SITIO

    @router.post("/wa/incoming")
    async def wa_incoming(body: WaIncomingBody, request: Request):
        """Recibe un mensaje entrante desde el puente Baileys local o desde el simulador de número de prueba."""
        sitio = await _sitio_wa_autorizado(request, body.sitio_id)
        return await _registrar_wa_entrante(body, sitio)

    async def _registrar_wa_entrante(body: WaIncomingBody, sitio: str) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        entry = {"de": "cliente", "texto": body.texto or "Hola, solicito un taxi", "ts": now}
        if body.lat is not None and body.lng is not None:
            entry["lat"] = float(body.lat)
            entry["lng"] = float(body.lng)
        await db.wa_conversaciones.update_one(
            {"cliente_telefono": body.cliente_telefono.strip(), "sitio_id": sitio},
            {
                "$setOnInsert": {
                    "cliente_nombre": (body.cliente_nombre or body.cliente_telefono).strip(),
                    "cliente_telefono": body.cliente_telefono.strip(),
                    "sitio_id": sitio,
                    "creada_en": now,
                },
                "$push": {"mensajes": entry},
                "$set": {
                    "cliente_nombre": (body.cliente_nombre or body.cliente_telefono).strip(),
                    "actualizada_en": now,
                },
            },
            upsert=True,
        )
        conv = await db.wa_conversaciones.find_one(
            {"cliente_telefono": body.cliente_telefono.strip(), "sitio_id": sitio}
        )
        serialized = _wa_conv_serialize(conv) if conv else None
        if serialized:
            await manager.broadcast_terminal(
                {"type": "wa_mensaje", "conversacion": serialized, "sitio_id": sitio},
                sitio_id=sitio,
            )
        return {"ok": True, "conversacion": serialized}

    @router.post("/wa/test-incoming")
    async def wa_test_incoming(body: WaIncomingBody, current=Depends(require_terminal)):
        """Permite a la operadora probar un mensaje entrante desde su número de prueba con 1 clic."""
        sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        return await _registrar_wa_entrante(body, sitio)

    @router.get("/wa/conversaciones")
    async def wa_list_conversaciones(current=Depends(require_terminal)):
        sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        docs = await db.wa_conversaciones.find(_sitio_query_for(sitio)).sort("actualizada_en", -1).to_list(100)
        return [_wa_conv_serialize(d) for d in docs]

    @router.get("/wa/conversaciones/{conv_id}")
    async def wa_get_conversacion(conv_id: str, current=Depends(require_terminal)):
        sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        doc = await db.wa_conversaciones.find_one({"_id": to_oid(conv_id), **_sitio_query_for(sitio)})
        if not doc:
            raise HTTPException(status_code=404, detail="Conversación no encontrada")
        return _wa_conv_serialize(doc)

    @router.post("/wa/conversaciones/{conv_id}/reply")
    async def wa_reply(conv_id: str, body: WaReply, current=Depends(require_terminal)):
        """Respuesta de la operadora con protección Anti-Baneo (solo responde a hilos
        iniciados por el cliente, con presencia 'composing' y cola rate-limit)."""
        sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        conv = await db.wa_conversaciones.find_one({"_id": to_oid(conv_id), **_sitio_query_for(sitio)})
        if not conv:
            raise HTTPException(status_code=404, detail="Conversación no encontrada")
        now = datetime.now(timezone.utc).isoformat()
        meta = await _enviar_por_bridge_antiban(sitio, conv.get("cliente_telefono", ""), body.texto)
        msg_entry = {"de": "operadora", "texto": body.texto, "ts": now, **meta}
        await db.wa_conversaciones.update_one(
            {"_id": to_oid(conv_id)},
            {"$push": {"mensajes": msg_entry},
             "$set": {"actualizada_en": now}},
        )
        updated = await db.wa_conversaciones.find_one({"_id": to_oid(conv_id)})
        await manager.broadcast_terminal(
            {"type": "wa_mensaje", "conversacion": _wa_conv_serialize(updated), "sitio_id": sitio},
            sitio_id=sitio,
        )
        return {"ok": True, "mensaje": msg_entry, "antiban": meta["antiban"],
                "entregado": meta["estado_envio"] != "fallido", "error_envio": meta.get("error_envio")}

    @router.post("/wa/conversaciones/{conv_id}/auto-reply-despacho")
    async def wa_auto_reply_despacho(conv_id: str, body: WaAutoReplyDespacho, current=Depends(require_terminal)):
        """Genera y envía automáticamente la confirmación de despacho por WhatsApp
        usando Spintax Anti-Baneo (unidad, vehículo, chofer, ETA) y marca el chat como despachado."""
        sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        conv = await db.wa_conversaciones.find_one({"_id": to_oid(conv_id), **_sitio_query_for(sitio)})
        if not conv:
            raise HTTPException(status_code=404, detail="Conversación no encontrada")
        unidad = body.unidad
        conductor = body.conductor_nombre
        vehiculo_desc = body.vehiculo_desc
        if body.operador_id and (not unidad or not conductor or not vehiculo_desc):
            op_doc = await db.operadores.find_one({"_id": to_oid(body.operador_id)})
            if op_doc:
                unidad = unidad or op_doc.get("placa") or "TX"
                conductor = conductor or op_doc.get("nombre") or "Operador"
                if not vehiculo_desc:
                    v_doc = await db.vehiculos.find_one({"operador_conductor_id": body.operador_id})
                    if v_doc:
                        vehiculo_desc = f"{v_doc.get('marca', '')} {v_doc.get('modelo', '')}".strip()
        unidad = unidad or "TX"
        conductor = conductor or "Operador"
        vehiculo_desc = vehiculo_desc or "Sedán Blanco"
        sitio_doc = await db.sitios.find_one({"clave": sitio}) or {}
        plantilla_custom = sitio_doc.get("plantilla_wa")
        texto = _generar_mensaje_spintax_antiban(
            cliente=conv.get("cliente_nombre") or "Cliente",
            unidad=unidad,
            vehiculo=vehiculo_desc,
            conductor=conductor,
            eta_min=body.eta_min,
            costo=body.costo,
            plantilla_custom=plantilla_custom,
        )
        now = datetime.now(timezone.utc).isoformat()
        meta = await _enviar_por_bridge_antiban(sitio, conv.get("cliente_telefono", ""), texto)
        msg_entry = {
            "de": "operadora",
            "texto": texto,
            "ts": now,
            "auto_despacho": True,
            "unidad": unidad,
            "conductor_nombre": conductor,
            "eta_min": body.eta_min,
            "servicio_id": body.servicio_id,
            **meta,
        }
        await db.wa_conversaciones.update_one(
            {"_id": to_oid(conv_id)},
            {
                "$push": {"mensajes": msg_entry},
                "$set": {
                    "actualizada_en": now,
                    "ultimo_despacho": {
                        "servicio_id": body.servicio_id,
                        "unidad": body.unidad,
                        "conductor_nombre": body.conductor_nombre,
                        "eta_min": body.eta_min,
                        "ts": now,
                    },
                },
            },
        )
        updated = await db.wa_conversaciones.find_one({"_id": to_oid(conv_id)})
        serialized = _wa_conv_serialize(updated)
        await manager.broadcast_terminal(
            {"type": "wa_mensaje", "conversacion": serialized, "sitio_id": sitio},
            sitio_id=sitio,
        )
        return {"ok": True, "texto": texto, "mensaje": msg_entry, "conversacion": serialized,
                "entregado": meta["estado_envio"] != "fallido", "error_envio": meta.get("error_envio")}

    @router.post("/wa/webhook")
    async def wa_webhook(request: Request):
        """Ingreso de eventos del puente QR Baileys o proveedor WhatsApp Business.
        Requiere WA_WEBHOOK_TOKEN configurado; sin él responde 503.
        Mensaje entrante: {sitio_id?, remitente: {nombre, telefono}, mensaje: {texto | lat+lng}}
        Resultado de un envío: {tipo: "estado_envio", sitio_id, mensaje_id, estado: enviado|fallido, error?}
        """
        token = os.environ.get("WA_WEBHOOK_TOKEN")
        if not token:
            raise HTTPException(status_code=503, detail="Webhook WhatsApp no configurado")
        auth = request.headers.get("Authorization", "")
        if auth != f"Bearer {token}":
            raise HTTPException(status_code=401, detail="No autorizado")
        payload = await request.json()
        sitio = payload.get("sitio_id") or DEFAULT_SITIO
        if payload.get("tipo") == "estado_envio":
            return await _registrar_estado_envio(sitio, payload)
        rem = payload.get("remitente") or {}
        msg = payload.get("mensaje") or {}
        now = datetime.now(timezone.utc).isoformat()
        entry = {"de": "cliente", "texto": msg.get("texto"), "ts": now}
        if msg.get("lat") is not None:
            entry["lat"] = msg["lat"]
            entry["lng"] = msg["lng"]
        await db.wa_conversaciones.update_one(
            {"cliente_telefono": rem.get("telefono"), "sitio_id": sitio},
            {"$setOnInsert": {"cliente_nombre": rem.get("nombre") or rem.get("telefono"),
                              "cliente_telefono": rem.get("telefono"),
                              "sitio_id": sitio,
                              "creada_en": now},
             "$push": {"mensajes": entry}, "$set": {"actualizada_en": now}},
            upsert=True,
        )
        conv = await db.wa_conversaciones.find_one({"cliente_telefono": rem.get("telefono"), "sitio_id": sitio})
        if conv:
            await manager.broadcast_terminal(
                {"type": "wa_mensaje", "conversacion": _wa_conv_serialize(conv), "sitio_id": sitio},
                sitio_id=sitio,
            )
        return {"ok": True}

    async def _registrar_estado_envio(sitio: str, payload: Dict) -> Dict:
        mensaje_id = payload.get("mensaje_id")
        estado = payload.get("estado") if payload.get("estado") in ("enviado", "fallido") else None
        if not mensaje_id or not estado:
            raise HTTPException(status_code=422, detail="mensaje_id y estado son obligatorios")
        cambios = {"mensajes.$.estado_envio": estado}
        if estado == "fallido":
            cambios["mensajes.$.error_envio"] = str(payload.get("error") or "No se pudo enviar")[:200]
            cambios["mensajes.$.antiban.entregado_bridge"] = False
        r = await db.wa_conversaciones.update_one({"sitio_id": sitio, "mensajes.id": mensaje_id}, {"$set": cambios})
        if not r.matched_count:
            return {"ok": True, "actualizado": False}
        conv = await db.wa_conversaciones.find_one({"sitio_id": sitio, "mensajes.id": mensaje_id})
        await manager.broadcast_terminal(
            {"type": "wa_mensaje", "conversacion": _wa_conv_serialize(conv), "sitio_id": sitio},
            sitio_id=sitio,
        )
        return {"ok": True, "actualizado": True}

    async def _seed_wa_conversacion():
        """Conversación demo para validar el flujo ubicación→servicio."""
        now = datetime.now(timezone.utc).isoformat()
        if await db.wa_conversaciones.count_documents({}) > 0:
            return
        await db.wa_conversaciones.insert_one({
            "cliente_nombre": "María López",
            "cliente_telefono": "+52 916 123 4567",
            "sitio_id": DEFAULT_SITIO,
            "creada_en": now,
            "actualizada_en": now,
            "mensajes": [
                {"de": "cliente", "texto": "Hola, necesito un taxi", "ts": now},
                {"de": "cliente", "texto": "Estoy aquí", "lat": 17.5115, "lng": -91.9823, "ts": now},
            ],
        })

    return SimpleNamespace(
        router=router,
        _seed_wa_conversacion=_seed_wa_conversacion,
    )
