"""
Catálogos del sitio: tipos de vehículo (VehicleType, con imagen),
vehículos de la flota, rutas colectivas, colonias/cuadrantes con precio y
tarifas predefinidas. Nunca se hardcodea `tipo -> imagen`: todo vive en
Mongo. Mismo patrón factory que los demás módulos.
"""
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel


def build_router(*, ColoniaBody, DEFAULT_SITIO, RutaCreate, RutaUpdate,
                 TipoVehiculoCreate, TipoVehiculoUpdate, VehiculoCreate,
                 VehiculoUpdate, _any_autenticado, _enriquecer_vehiculo,
                 _guardar_imagen_vehiculo, _mapa_tipos_vehiculo, _sitio_query_for,
                 _tipo_vehiculo_default_id, db, logger, now_iso, require_terminal,
                 serialize, to_oid):
    router = APIRouter(prefix="/api", tags=["catalogos"])

    @router.post("/tipos-vehiculo")
    async def create_tipo_vehiculo(body: TipoVehiculoCreate, _=Depends(require_terminal)):
        doc = {
            "nombre": body.nombre,
            "descripcion": body.descripcion,
            "capacidad": body.capacidad,
            "caracteristicas": body.caracteristicas,
            "orden": body.orden,
            "activo": body.activo,
            "imagen_url": None,
        }
        res = await db.tipos_vehiculo.insert_one(doc)
        doc["_id"] = res.inserted_id
        logger.info("tipo de vehículo creado id=%s nombre=%s", res.inserted_id, body.nombre)
        return serialize(doc)

    @router.get("/tipos-vehiculo")
    async def list_tipos_vehiculo():
        docs = await db.tipos_vehiculo.find().sort("orden", 1).to_list(500)
        return [serialize(d) for d in docs]

    @router.get("/tipos-vehiculo/{tipo_id}")
    async def get_tipo_vehiculo(tipo_id: str):
        t = await db.tipos_vehiculo.find_one({"_id": to_oid(tipo_id)})
        if not t:
            raise HTTPException(status_code=404, detail="Tipo de vehículo no encontrado")
        return serialize(t)

    @router.put("/tipos-vehiculo/{tipo_id}")
    async def update_tipo_vehiculo(tipo_id: str, body: TipoVehiculoUpdate, _=Depends(require_terminal)):
        updates = body.model_dump(exclude_none=True)
        if not updates:
            raise HTTPException(status_code=400, detail="Nada que actualizar")
        res = await db.tipos_vehiculo.update_one({"_id": to_oid(tipo_id)}, {"$set": updates})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Tipo de vehículo no encontrado")
        return serialize(await db.tipos_vehiculo.find_one({"_id": to_oid(tipo_id)}))

    @router.delete("/tipos-vehiculo/{tipo_id}")
    async def delete_tipo_vehiculo(tipo_id: str, _=Depends(require_terminal)):
        en_uso = await db.vehiculos.count_documents({"tipo_vehiculo_id": tipo_id})
        if en_uso > 0:
            raise HTTPException(status_code=409, detail=f"{en_uso} vehículo(s) usan este tipo; desactívalo en vez de eliminarlo")
        res = await db.tipos_vehiculo.delete_one({"_id": to_oid(tipo_id)})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Tipo de vehículo no encontrado")
        return {"ok": True}

    @router.post("/tipos-vehiculo/{tipo_id}/imagen")
    async def subir_imagen_tipo_vehiculo(tipo_id: str, foto: UploadFile = File(...), _=Depends(require_terminal)):
        if not await db.tipos_vehiculo.find_one({"_id": to_oid(tipo_id)}):
            raise HTTPException(status_code=404, detail="Tipo de vehículo no encontrado")
        url = await _guardar_imagen_vehiculo(foto, "tipos-vehiculo")
        await db.tipos_vehiculo.update_one({"_id": to_oid(tipo_id)}, {"$set": {"imagen_url": url}})
        return {"imagen_url": url}

    # ---------------------------------------------------------------------------
    # Vehículos (flota del sitio)
    # ---------------------------------------------------------------------------
    @router.post("/vehiculos")
    async def create_vehiculo(body: VehiculoCreate, current=Depends(require_terminal)):
        sitio_id = body.sitio_id or current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        if await db.vehiculos.find_one({"numero_economico": body.numero_economico, **_sitio_query_for(sitio_id)}):
            raise HTTPException(status_code=409, detail="Ya existe un vehículo con ese número económico")
        doc = {
            "numero_economico": body.numero_economico,
            "placa": body.placa,
            "marca": body.marca,
            "modelo": body.modelo,
            "color": body.color,
            "anio": body.anio,
            "estado": body.estado,
            "activo": body.estado != "inactivo",
            "sitio_id": sitio_id,
            "operador_conductor_id": body.operador_conductor_id,
            "propietario_id": body.propietario_id,
            "tipo_vehiculo_id": body.tipo_vehiculo_id or await _tipo_vehiculo_default_id(),
            "foto_url": None,
            "lat": None, "lng": None, "ultima_actualizacion": None,
        }
        res = await db.vehiculos.insert_one(doc)
        doc["_id"] = res.inserted_id
        if body.operador_conductor_id:
            await db.operadores.update_one(
                {"_id": to_oid(body.operador_conductor_id)},
                {"$set": {"vehiculo_id": str(res.inserted_id)}},
            )
        logger.info("vehículo creado id=%s numero_economico=%s", res.inserted_id, body.numero_economico)
        tipos = await _mapa_tipos_vehiculo()
        return _enriquecer_vehiculo(serialize(doc), tipos)

    @router.get("/vehiculos")
    async def list_vehiculos(current=Depends(require_terminal)):
        sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        docs = await db.vehiculos.find(_sitio_query_for(sitio)).to_list(1000)
        ops = {str(o["_id"]): o for o in await db.operadores.find(_sitio_query_for(sitio)).to_list(1000)}
        tipos = await _mapa_tipos_vehiculo()
        out = []
        for d in docs:
            v = _enriquecer_vehiculo(serialize(d), tipos)
            op = ops.get(v.get("operador_conductor_id"))
            v["conductor_nombre"] = op["nombre"] if op else None
            out.append(v)
        return out

    @router.get("/vehiculos/{vehiculo_id}")
    async def get_vehiculo(vehiculo_id: str, _=Depends(require_terminal)):
        v = await db.vehiculos.find_one({"_id": to_oid(vehiculo_id)})
        if not v:
            raise HTTPException(status_code=404, detail="Vehículo no encontrado")
        return _enriquecer_vehiculo(serialize(v), await _mapa_tipos_vehiculo())

    @router.post("/vehiculos/{vehiculo_id}/foto")
    async def subir_foto_vehiculo(vehiculo_id: str, foto: UploadFile = File(...), _=Depends(require_terminal)):
        if not await db.vehiculos.find_one({"_id": to_oid(vehiculo_id)}):
            raise HTTPException(status_code=404, detail="Vehículo no encontrado")
        url = await _guardar_imagen_vehiculo(foto, "vehiculos")
        await db.vehiculos.update_one({"_id": to_oid(vehiculo_id)}, {"$set": {"foto_url": url}})
        return {"foto_url": url}

    @router.put("/vehiculos/{vehiculo_id}")
    async def update_vehiculo(vehiculo_id: str, body: VehiculoUpdate, _=Depends(require_terminal)):
        updates = body.model_dump(exclude_none=True)
        if "activo" in updates and not updates["activo"]:
            updates["estado"] = "inactivo"
        if body.estado:
            updates["activo"] = body.estado != "inactivo"
        if not updates:
            raise HTTPException(status_code=400, detail="Nada que actualizar")
        prev = await db.vehiculos.find_one({"_id": to_oid(vehiculo_id)})
        if not prev:
            raise HTTPException(status_code=404, detail="Vehículo no encontrado")
        # Sincroniza el conductor asignado
        if "operador_conductor_id" in updates and updates["operador_conductor_id"] != prev.get("operador_conductor_id"):
            if prev.get("operador_conductor_id"):
                await db.operadores.update_one(
                    {"_id": to_oid(prev["operador_conductor_id"]), "vehiculo_id": vehiculo_id},
                    {"$unset": {"vehiculo_id": ""}},
                )
            nuevo = updates["operador_conductor_id"]
            if nuevo:
                await db.operadores.update_one(
                    {"_id": to_oid(nuevo)}, {"$set": {"vehiculo_id": vehiculo_id}}
                )
        await db.vehiculos.update_one({"_id": to_oid(vehiculo_id)}, {"$set": updates})
        v = serialize(await db.vehiculos.find_one({"_id": to_oid(vehiculo_id)}))
        return _enriquecer_vehiculo(v, await _mapa_tipos_vehiculo())

    @router.delete("/vehiculos/{vehiculo_id}")
    async def delete_vehiculo(vehiculo_id: str, _=Depends(require_terminal)):
        v = await db.vehiculos.find_one({"_id": to_oid(vehiculo_id)})
        if not v:
            raise HTTPException(status_code=404, detail="Vehículo no encontrado")
        if v.get("operador_conductor_id"):
            await db.operadores.update_one(
                {"_id": to_oid(v["operador_conductor_id"]), "vehiculo_id": vehiculo_id},
                {"$unset": {"vehiculo_id": ""}},
            )
        await db.vehiculos.delete_one({"_id": to_oid(vehiculo_id)})
        return {"ok": True}

    @router.post("/rutas")
    async def create_ruta(body: RutaCreate, current=Depends(require_terminal)):
        sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        doc = {
            "nombre": body.nombre,
            "color_hex": body.color_hex,
            "tipo": body.tipo or "colectiva",
            "tarifa_colectiva": body.tarifa_colectiva,
            "frecuencia_min": body.frecuencia_min,
            "horario": body.horario,
            "paradas": body.paradas or [],
            "trazo": body.trazo or [],
            "activa": body.activa,
            "sitio_id": sitio,
            "creado_en": now_iso(),
        }
        res = await db.rutas.insert_one(doc)
        doc["_id"] = res.inserted_id
        return serialize(doc)

    @router.get("/rutas")
    async def list_rutas(current=Depends(_any_autenticado)):
        sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        docs = await db.rutas.find(_sitio_query_for(sitio)).to_list(1000)
        return [serialize(d) for d in docs]

    @router.get("/rutas/{ruta_id}")
    async def get_ruta(ruta_id: str, _=Depends(_any_autenticado)):
        r = await db.rutas.find_one({"_id": to_oid(ruta_id)})
        if not r:
            raise HTTPException(status_code=404, detail="Ruta no encontrada")
        return serialize(r)

    @router.put("/rutas/{ruta_id}")
    async def update_ruta(ruta_id: str, body: RutaUpdate, _=Depends(require_terminal)):
        updates = body.model_dump(exclude_none=True)
        if not updates:
            raise HTTPException(status_code=400, detail="Nada que actualizar")
        res = await db.rutas.update_one({"_id": to_oid(ruta_id)}, {"$set": updates})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Ruta no encontrada")
        return serialize(await db.rutas.find_one({"_id": to_oid(ruta_id)}))

    @router.delete("/rutas/{ruta_id}")
    async def delete_ruta(ruta_id: str, _=Depends(require_terminal)):
        res = await db.rutas.delete_one({"_id": to_oid(ruta_id)})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Ruta no encontrada")
        return {"ok": True}

    @router.get("/colonias")
    async def list_colonias(current=Depends(_any_autenticado)):
        sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        docs = await db.colonias.find(_sitio_query_for(sitio)).sort("nombre", 1).to_list(500)
        return [serialize(d) for d in docs]

    @router.post("/colonias")
    async def create_colonia(body: ColoniaBody, current=Depends(require_terminal)):
        sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        doc = {
            **body.model_dump(),
            "sitio_id": sitio,
            "actualizado_en": now_iso(),
        }
        existente = await db.colonias.find_one({"nombre": body.nombre, **_sitio_query_for(sitio)})
        if existente:
            await db.colonias.update_one({"_id": existente["_id"]}, {"$set": doc})
            return serialize(await db.colonias.find_one({"_id": existente["_id"]}))
        doc["creado_en"] = now_iso()
        res = await db.colonias.insert_one(doc)
        doc["_id"] = res.inserted_id
        return serialize(doc)

    @router.put("/colonias/{colonia_id}")
    async def update_colonia(colonia_id: str, body: ColoniaBody, current=Depends(require_terminal)):
        sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        updates = {**body.model_dump(), "sitio_id": sitio, "actualizado_en": now_iso()}
        res = await db.colonias.update_one({"_id": to_oid(colonia_id)}, {"$set": updates})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Colonia/cuadrante no encontrado")
        return serialize(await db.colonias.find_one({"_id": to_oid(colonia_id)}))

    @router.delete("/colonias/{colonia_id}")
    async def delete_colonia(colonia_id: str, _=Depends(require_terminal)):
        res = await db.colonias.delete_one({"_id": to_oid(colonia_id)})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Colonia/cuadrante no encontrado")
        return {"ok": True}

    class TarifaBody(BaseModel):
        nombre: str
        monto: float
        tipo: str = "fijo"
        orden: int = 0
        hora_inicio: Optional[str] = "06:00"
        hora_fin: Optional[str] = "22:00"
        horario_tipo: Optional[str] = "todo_el_dia"  # todo_el_dia | diurno | nocturno | hora_pico
        recargo_nocturno: Optional[float] = 0.0
        recargo_lluvia: Optional[float] = 0.0
        costo_km_extra: Optional[float] = 0.0
        costo_parada_extra: Optional[float] = 15.0
        zona_nombre: Optional[str] = None
        notas: Optional[str] = None
        activa: bool = True

    @router.post("/tarifas")
    async def crear_tarifa(body: TarifaBody, current=Depends(require_terminal)):
        sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        doc = {**body.model_dump(), "sitio_id": sitio, "creado_en": now_iso()}
        res = await db.tarifas_predefinidas.insert_one(doc)
        doc["_id"] = res.inserted_id
        return serialize(doc)

    @router.get("/tarifas")
    async def list_tarifas(current=Depends(_any_autenticado)):
        sitio = current.get("sitio_id") or current.get("_tenant") or DEFAULT_SITIO
        docs = await db.tarifas_predefinidas.find(_sitio_query_for(sitio)).sort("orden", 1).to_list(1000)
        return [serialize(d) for d in docs]

    @router.put("/tarifas/{tarifa_id}")
    async def update_tarifa(tarifa_id: str, body: TarifaBody, _=Depends(require_terminal)):
        await db.tarifas_predefinidas.update_one({"_id": to_oid(tarifa_id)}, {"$set": body.model_dump()})
        return serialize(await db.tarifas_predefinidas.find_one({"_id": to_oid(tarifa_id)}))

    @router.delete("/tarifas/{tarifa_id}")
    async def delete_tarifa(tarifa_id: str, _=Depends(require_terminal)):
        await db.tarifas_predefinidas.delete_one({"_id": to_oid(tarifa_id)})
        return {"ok": True}

    return router
