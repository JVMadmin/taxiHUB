"""
Módulo de Mantenimiento — Panel del Dueño, taxiHUB.

Aditivo: no modifica nada de server.py salvo el `include_router` que se
indica en INTEGRACION.md. Reutiliza exactamente los mismos helpers y el
mismo patrón de ownership que ya usa /dueno/flota, /dueno/servicios, etc.

Colecciones nuevas: mantenimientos, documentos_vehiculo, gastos_vehiculo.
No se toca el modelo Vehiculo existente ni sus rutas /vehiculos/*.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Literal

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
import uuid


def build_router(*, db, serialize, to_oid, now_iso, require_dueno,
                  _vehiculos_de_dueno, _vehiculo_de_dueno_o_404, _hoy_str):
    router = APIRouter(prefix="/api/dueno/mantenimiento", tags=["mantenimiento"])

    # -----------------------------------------------------------------
    # Modelos
    # -----------------------------------------------------------------
    class RegistroCreate(BaseModel):
        vehiculo_id: str
        tipo: Literal["aceite", "llantas", "frenos", "verificacion", "otro"]
        realizado_en: str  # ISO date string, ej. "2026-08-15"
        odometro_km: Optional[float] = None
        proximo_km: Optional[float] = None
        proximo_en: Optional[str] = None
        costo: float = 0
        notas: Optional[str] = None

    class DocumentoUpsert(BaseModel):
        vehiculo_id: str
        tipo: Literal["tarjeta_circulacion", "seguro", "verificacion", "licencia_conductor"]
        vence_en: str  # ISO date

    class GastoCreate(BaseModel):
        vehiculo_id: str
        categoria: Literal["gasolina", "refacciones", "multas", "mantenimiento", "otro"]
        monto: float
        fecha: str  # ISO date
        notas: Optional[str] = None

    # -----------------------------------------------------------------
    # Cálculo de salud (mismo criterio para toda la app: 0-100)
    # -----------------------------------------------------------------
    PESOS = {"aceite": 0.35, "llantas": 0.25, "frenos": 0.25, "documentos": 0.15}
    INTERVALO_KM = {"aceite": 5000, "llantas": 40000, "frenos": 30000}

    def _subsistema(registro: Optional[dict], odometro_km: Optional[float], intervalo: int) -> float:
        if not registro or odometro_km is None or registro.get("odometro_km") is None:
            return 0.0
        recorrido = max(odometro_km - registro["odometro_km"], 0)
        restante = max(1 - (recorrido / intervalo), 0)
        return round(restante * 100, 1)

    def _doc_score(documentos: List[dict]) -> float:
        if not documentos:
            return 100.0  # sin documentos capturados aún no penaliza de más; se refleja aparte como "sin datos"
        hoy = datetime.now(timezone.utc).date()
        peor = 100.0
        for d in documentos:
            vence = d.get("vence_en")
            if not vence:
                continue
            dias = (datetime.fromisoformat(vence).date() - hoy).days
            if dias <= 0:
                peor = min(peor, 0)
            elif dias <= 30:
                peor = min(peor, 50)
        return peor

    async def _salud_vehiculo(vehiculo: dict) -> dict:
        vid = str(vehiculo["_id"])
        odometro_km = vehiculo.get("odometro_km")
        registros = await db.mantenimientos.find({"vehiculo_id": vid}).sort("realizado_en", -1).to_list(200)
        documentos = await db.documentos_vehiculo.find({"vehiculo_id": vid}).to_list(20)

        ultimo_por_tipo: Dict[str, dict] = {}
        for r in registros:  # ya viene ordenado desc, el primero de cada tipo es el más reciente
            ultimo_por_tipo.setdefault(r["tipo"], r)

        aceite = _subsistema(ultimo_por_tipo.get("aceite"), odometro_km, INTERVALO_KM["aceite"])
        llantas = _subsistema(ultimo_por_tipo.get("llantas"), odometro_km, INTERVALO_KM["llantas"])
        frenos = _subsistema(ultimo_por_tipo.get("frenos"), odometro_km, INTERVALO_KM["frenos"])
        docs = _doc_score(documentos)

        overall = round(
            aceite * PESOS["aceite"] + llantas * PESOS["llantas"] +
            frenos * PESOS["frenos"] + docs * PESOS["documentos"], 1,
        )
        estado = "urgente" if overall < 40 else ("proximo" if overall < 80 else "aldia")
        return {
            "vehiculo_id": vid, "aceite": aceite, "llantas": llantas, "frenos": frenos,
            "documentos": docs, "overall": overall, "estado": estado,
            "odometro_km": odometro_km,
            "registros": [serialize(r) for r in registros],
            "documentos_detalle": [serialize(d) for d in documentos],
        }

    # -----------------------------------------------------------------
    # Endpoints
    # -----------------------------------------------------------------
    @router.get("/resumen")
    async def resumen(current: dict = Depends(require_dueno)):
        """Alimenta el banner de alerta + las tarjetas del módulo."""
        vehiculos = await _vehiculos_de_dueno(current["id"])
        salud = [await _salud_vehiculo(v) for v in vehiculos]
        urgentes = sum(1 for s in salud if s["estado"] == "urgente")
        proximos = sum(1 for s in salud if s["estado"] == "proximo")
        return {
            "vehiculos": [
                {**serialize(v), "salud": s}
                for v, s in zip(vehiculos, salud)
            ],
            "urgentes": urgentes,
            "proximos": proximos,
        }

    @router.get("/vehiculo/{vehiculo_id}")
    async def detalle_vehiculo(vehiculo_id: str, current: dict = Depends(require_dueno)):
        v = await _vehiculo_de_dueno_o_404(vehiculo_id, current["id"])
        salud = await _salud_vehiculo(v)
        return {"vehiculo": serialize(v), "salud": salud}

    @router.post("/registro")
    async def crear_registro(body: RegistroCreate, current: dict = Depends(require_dueno)):
        await _vehiculo_de_dueno_o_404(body.vehiculo_id, current["id"])  # valida ownership, 404 si no es suyo
        doc = {
            "id": str(uuid.uuid4()),
            "vehiculo_id": body.vehiculo_id,
            "tipo": body.tipo,
            "realizado_en": body.realizado_en,
            "odometro_km": body.odometro_km,
            "proximo_km": body.proximo_km,
            "proximo_en": body.proximo_en,
            "costo": body.costo,
            "notas": body.notas,
            "creado": now_iso(),
        }
        await db.mantenimientos.insert_one(doc)
        # Si viene odometro_km, actualiza el del vehículo (no toca ninguna otra ruta existente)
        if body.odometro_km is not None:
            await db.vehiculos.update_one(
                {"_id": to_oid(body.vehiculo_id)},
                {"$set": {"odometro_km": body.odometro_km}},
            )
        v = await db.vehiculos.find_one({"_id": to_oid(body.vehiculo_id)})
        return {"creado": True, "salud": await _salud_vehiculo(v)}

    @router.post("/documento")
    async def upsert_documento(body: DocumentoUpsert, current: dict = Depends(require_dueno)):
        await _vehiculo_de_dueno_o_404(body.vehiculo_id, current["id"])
        await db.documentos_vehiculo.update_one(
            {"vehiculo_id": body.vehiculo_id, "tipo": body.tipo},
            {"$set": {"vehiculo_id": body.vehiculo_id, "tipo": body.tipo,
                      "vence_en": body.vence_en, "actualizado": now_iso()}},
            upsert=True,
        )
        return {"guardado": True}

    @router.post("/gasto")
    async def crear_gasto(body: GastoCreate, current: dict = Depends(require_dueno)):
        await _vehiculo_de_dueno_o_404(body.vehiculo_id, current["id"])
        doc = {
            "id": str(uuid.uuid4()), "vehiculo_id": body.vehiculo_id,
            "categoria": body.categoria, "monto": body.monto, "fecha": body.fecha,
            "notas": body.notas, "creado": now_iso(),
        }
        await db.gastos_vehiculo.insert_one(doc)
        return {"creado": True}

    @router.get("/gastos-por-mes")
    async def gastos_por_mes(current: dict = Depends(require_dueno)):
        vehiculo_ids = [str(v["_id"]) for v in await _vehiculos_de_dueno(current["id"])]
        if not vehiculo_ids:
            return []
        pipeline = [
            {"$match": {"vehiculo_id": {"$in": vehiculo_ids}}},
            {"$group": {"_id": {"$substrCP": ["$fecha", 0, 7]}, "total": {"$sum": "$monto"}}},
            {"$sort": {"_id": 1}},
        ]
        return await db.gastos_vehiculo.aggregate(pipeline).to_list(24)

    @router.get("/proximos")
    async def proximos_servicios(current: dict = Depends(require_dueno)):
        """Lista ordenada por next_due para el panel 'Próximos servicios'."""
        vehiculo_ids = [str(v["_id"]) for v in await _vehiculos_de_dueno(current["id"])]
        if not vehiculo_ids:
            return []
        docs = await db.mantenimientos.find(
            {"vehiculo_id": {"$in": vehiculo_ids}, "proximo_en": {"$ne": None}}
        ).sort("proximo_en", 1).to_list(50)
        return [{**d, "_id": str(d["_id"])} for d in docs]

    return router
