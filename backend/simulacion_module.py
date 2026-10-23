"""
Simulación demo de la flota: siembra de datos (taxis, socios, servicios,
WhatsApp), patrullaje GPS sobre las pistas viales y rutas `/seed`,
`/simulacion/*` y `/pistas-viales`. Mismo patrón factory que los demás
módulos; `server.py` re-exporta `seed`, `sembrar_datos_simulacion` y los
controles del patrullaje.
"""
import asyncio
import math
import os
import random
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi import APIRouter, Request

from simulacion_datos import PALENQUE_PISTAS_VIALES, DEMO_TAXIS, DEMO_TAXIS_PAKALNA, DEMO_TAXIS_FORANEOS, _fotos_demo_conductores


def build(*, APP_NAME, DEFAULT_PUNTOS_CALIENTES, DEFAULT_SITIO, EstadoOperador,
          _HASH_CENTRAL123, _HASH_SOCIO123, _HASH_TAXI123, _migraciones,
          _notificar_dueno_de_operador, _require_terminal_or_dev,
          _tipo_vehiculo_default_id, analizar_y_comprimir_imagen_webp, db,
          hash_password, logger, manager, now_iso, put_object, to_oid):
    router = APIRouter(prefix="/api", tags=["simulacion"])

    _simulacion_activa = False
    _simulacion_task = None

    def _generar_track_calle(puntos_calle: list, current_idx: int, sentido_direccion: str = "adelante", cant_puntos: int = 15) -> list:
        """Genera un historial de recorrido previo (track) estrictamente sobre la calzada vial y en el sentido correcto."""
        track = []
        total = len(puntos_calle)
        base_time = datetime.now(timezone.utc) - timedelta(minutes=cant_puntos * 2)
        step = 1 if sentido_direccion == "adelante" else -1
        for i in range(cant_puntos):
            delta = (cant_puntos - 1 - i) * step
            idx = (current_idx - delta) % total
            pt = puntos_calle[idx]
            ts = (base_time + timedelta(minutes=i * 2)).isoformat()
            track.append([round(pt[0], 6), round(pt[1], 6), ts])
        return track

    async def _sembrar_baseline_tests():
        """Siembra ultrarrápida (<15ms) para la suite de pytest (`taxihub_test`),
        preservando los invariantes exactos que esperan `tests/test_server.py`,
        `tests/test_dueno.py` y `tests/test_vehicle_types.py`."""
        await _migraciones()
        rutas_data = [
            {"nombre": "Palenque - Pakal Ná", "color_hex": "#FFE600", "sitio_id": DEFAULT_SITIO},
            {"nombre": "Centro - La Cañada", "color_hex": "#FFB800", "sitio_id": DEFAULT_SITIO},
            {"nombre": "Circuito Hotelero", "color_hex": "#FF9900", "sitio_id": DEFAULT_SITIO},
        ]
        rutas_ids = []
        for r in rutas_data:
            existente = await db.rutas.find_one({"nombre": r["nombre"]})
            if existente:
                rutas_ids.append(str(existente["_id"]))
            else:
                ins = await db.rutas.insert_one(r)
                rutas_ids.append(str(ins.inserted_id))

        tipo_estandar_id = await _tipo_vehiculo_default_id()
        for i, t in enumerate(DEMO_TAXIS[:5]):
            op_doc = {
                "nombre": t["nombre"],
                "telefono": t["telefono"],
                "placa": t["placa"],
                "ruta_asignada": rutas_ids[i % len(rutas_ids)],
                "usuario": t["usuario"],
                "password_hash": _HASH_TAXI123,
                "estado": EstadoOperador.fuera_de_servicio.value,
                "lat": t["lat"],
                "lng": t["lng"],
                "ultima_actualizacion": None,
                "sitio_id": DEFAULT_SITIO,
                "activo": True,
                "track": [],
                "foto_url": None,
            }
            existente = await db.operadores.find_one({"usuario": t["usuario"]})
            if existente:
                await db.operadores.update_one({"_id": existente["_id"]}, {"$set": op_doc})
                op_id = str(existente["_id"])
            else:
                ins = await db.operadores.insert_one(op_doc)
                op_id = str(ins.inserted_id)
            v_doc = {
                "numero_economico": t["placa"],
                "placa": t["placa"],
                "marca": t["marca"],
                "modelo": t["modelo"],
                "color": t["color"],
                "estado": "activo",
                "activo": True,
                "sitio_id": DEFAULT_SITIO,
                "operador_conductor_id": op_id,
                "propietario_id": None,
                "lat": t["lat"],
                "lng": t["lng"],
                "ultima_actualizacion": None,
                "tipo_vehiculo_id": tipo_estandar_id,
                "foto_url": None,
            }
            await db.vehiculos.update_one({"numero_economico": t["placa"], "sitio_id": DEFAULT_SITIO}, {"$set": v_doc}, upsert=True)
            v_obj = await db.vehiculos.find_one({"numero_economico": t["placa"], "sitio_id": DEFAULT_SITIO})
            await db.operadores.update_one({"_id": to_oid(op_id)}, {"$set": {"vehiculo_id": str(v_obj["_id"])}})
        return {"ok": True, "taxis": 5}

    async def sembrar_datos_simulacion():
        """Siembra 25 taxis en el tenant principal (`sitio_palenque`) + 5 taxis en el
        segundo tenant de pruebas (`sitio_pakalna`), rutas, socios con cuotas, servicios
        activos y 10 conversaciones de WhatsApp."""
        await _migraciones()

        # Configurar los 2 sitios (tenants) para pruebas multi-sitio
        await db.sitios.update_one(
            {"clave": DEFAULT_SITIO},
            {"$set": {
                "clave": DEFAULT_SITIO,
                "nombre": "Radio Taxis Palenque",
                "subtitulo": "Central Satelital Palenque — Flota Principal",
                "ciudad": "Palenque, Chiapas",
                "telefono_central": "+52 916 345 0000",
                "tema": "amarillo",
                "color_primario": "#FFE600",
                "modo_default": "dark",
                "map_center_lat": 17.5099,
                "map_center_lng": -91.9847,
                "cuota_diaria_default": 350.0,
                "auto_respuesta_wa": True,
                "puntos_calientes": DEFAULT_PUNTOS_CALIENTES,
                "actualizado": now_iso(),
            }},
            upsert=True,
        )
        await db.sitios.update_one(
            {"clave": "sitio_pakalna"},
            {"$set": {
                "clave": "sitio_pakalna",
                "nombre": "Sitio Tren Maya Pakal-Ná",
                "subtitulo": "Base Ferroviaria y Zona Norte",
                "ciudad": "Pakal-Ná, Palenque",
                "telefono_central": "+52 916 400 0200",
                "tema": "amarillo",
                "color_primario": "#FFE600",
                "modo_default": "dark",
                "map_center_lat": 17.5350,
                "map_center_lng": -91.9560,
                "cuota_diaria_default": 400.0,
                "auto_respuesta_wa": True,
                "puntos_calientes": DEFAULT_PUNTOS_CALIENTES,
                "actualizado": now_iso(),
            }},
            upsert=True,
        )
        # Asegurar operadoras de terminal para ambos tenants
        if not await db.usuarios_terminal.find_one({"usuario": "central"}):
            await db.usuarios_terminal.insert_one({
                "nombre": "Central Palenque", "usuario": "central",
                "password_hash": _HASH_CENTRAL123, "sitio_id": DEFAULT_SITIO,
                "activo": True, "creado": now_iso(),
            })
        if not await db.usuarios_terminal.find_one({"usuario": "central_pakalna"}):
            await db.usuarios_terminal.insert_one({
                "nombre": "Central Pakal-Ná", "usuario": "central_pakalna",
                "password_hash": _HASH_CENTRAL123, "sitio_id": "sitio_pakalna",
                "activo": True, "creado": now_iso(),
            })
        if not await db.usuarios_terminal.find_one({"usuario": "operadora1"}):
            await db.usuarios_terminal.insert_one({
                "nombre": "Operadora Turno Matutino", "usuario": "operadora1",
                "password_hash": hash_password("central123"), "sitio_id": DEFAULT_SITIO,
                "activo": True, "creado": now_iso(),
            })
        if not await db.clientes.find_one({"usuario": "pasajero1"}):
            await db.clientes.insert_one({
                "nombre": "Carlos Mendoza (Pasajero Demo)",
                "telefono": "+52 916 555 0900",
                "usuario": "pasajero1",
                "password_hash": hash_password("pasajero123"),
                "activo": True,
                "sitio_id": DEFAULT_SITIO,
                "creado": now_iso(),
            })

        # 1. Rutas Colectivas con Trazo Vial en el Mapa
        rutas_data = [
            {
                "nombre": "Palenque - Pakal Ná (Colectivo)",
                "color_hex": "#FFE600",
                "tipo": "colectiva",
                "tarifa_colectiva": 15.0,
                "frecuencia_min": 8,
                "horario": "05:00 - 22:30",
                "paradas": ["Parque Central", "Terminal ADO", "Glorieta Cabeza Maya", "CFE Bulevar", "Mercado Pakal-Ná", "Estación Tren Maya"],
                "trazo": PALENQUE_PISTAS_VIALES["pista_pakal_na"]["puntos"][:20],
                "activa": True,
                "sitio_id": DEFAULT_SITIO,
            },
            {
                "nombre": "Centro - La Cañada / Zona Hotelera",
                "color_hex": "#FFB800",
                "tipo": "colectiva",
                "tarifa_colectiva": 12.0,
                "frecuencia_min": 6,
                "horario": "05:30 - 23:00",
                "paradas": ["Mercado Municipal", "Parque Central", "Super Che", "Terminal ADO", "Hotel Maya Tulipanes", "Av. Merle Green"],
                "trazo": PALENQUE_PISTAS_VIALES["pista_canada_ado"]["puntos"][:20],
                "activa": True,
                "sitio_id": DEFAULT_SITIO,
            },
            {
                "nombre": "Circuito Hotelero - Zona Arqueológica",
                "color_hex": "#FF9900",
                "tipo": "colectiva",
                "tarifa_colectiva": 25.0,
                "frecuencia_min": 12,
                "horario": "06:00 - 19:00",
                "paradas": ["Terminal ADO", "Glorieta Maya", "Hotel Chan-Kah", "Museo de Sitio", "Zona Arqueológica Palenque"],
                "trazo": PALENQUE_PISTAS_VIALES["pista_carretera_ruinas"]["puntos"][:20],
                "activa": True,
                "sitio_id": DEFAULT_SITIO,
            },
        ]
        rutas_ids = []
        for r in rutas_data:
            existente = await db.rutas.find_one({"nombre": {"$regex": f"^{r['nombre'][:15]}"}, "sitio_id": DEFAULT_SITIO})
            if existente:
                await db.rutas.update_one({"_id": existente["_id"]}, {"$set": r})
                rutas_ids.append(str(existente["_id"]))
            else:
                ins = await db.rutas.insert_one(r)
                rutas_ids.append(str(ins.inserted_id))

        tipo_estandar_id = await _tipo_vehiculo_default_id()

        # 2. Socios Concesionarios / Inversionistas (Dueños de Flota con Expediente Completo y Foto)
        ahora_dt = datetime.now(timezone.utc)
        socios_data = [
            {
                "nombre": "Don Roberto Méndez Solís", "usuario": "socio_roberto", "telefono": "916-345-0010",
                "cuota": 380.0, "taxis": ["TX-101", "TX-102", "TX-103", "TX-116", "TX-117"],
                "foto_url": "/assets/drivers/driver-01.jpg", "rfc": "MESR680412HCS", "curp": "MESR680412HCSRLN04",
                "concesion_folio": "SCT-CHIS-PAL-00142", "poliza_flota": "QUALITAS-FL-99281",
                "domicilio_fiscal": "Av. Juárez #114, Col. Centro, Palenque, Chis.",
                "banco_cuenta": "BBVA · CLABE 012180004819201142",
                "licencia_vence_en": (ahora_dt + timedelta(days=28)).strftime("%Y-%m-%d"),
                "antiguedad_anios": 14,
            },
            {
                "nombre": "Doña Carmen Velasco Cruz", "usuario": "socia_carmen", "telefono": "916-345-0020",
                "cuota": 350.0, "taxis": ["TX-104", "TX-105", "TX-118", "TX-119"],
                "foto_url": "/assets/drivers/driver-16.jpg", "rfc": "VECC740923MCS", "curp": "VECC740923MCSCLN01",
                "concesion_folio": "SCT-CHIS-PAL-00198", "poliza_flota": "GNP-TAXI-77412",
                "domicilio_fiscal": "Calle Independencia #45, Barrio La Cañada, Palenque",
                "banco_cuenta": "Banorte · CLABE 072180005591823019",
                "licencia_vence_en": (ahora_dt + timedelta(days=22)).strftime("%Y-%m-%d"),
                "antiguedad_anios": 11,
            },
            {
                "nombre": "Lic. Jorge Domínguez Arcos", "usuario": "socio_jorge", "telefono": "916-345-0030",
                "cuota": 400.0, "taxis": ["TX-106", "TX-107", "TX-108", "TX-109", "TX-120", "TX-121"],
                "foto_url": "/assets/drivers/driver-03.jpg", "rfc": "DOAJ791105HCS", "curp": "DOAJ791105HCSMRN08",
                "concesion_folio": "SCT-CHIS-PAL-00231", "poliza_flota": "AXA-PUB-44109",
                "domicilio_fiscal": "Blvd. Palenque-Pakal Ná Km 1.5, Palenque",
                "banco_cuenta": "Santander · CLABE 014180605019283746",
                "licencia_vence_en": (ahora_dt + timedelta(days=35)).strftime("%Y-%m-%d"),
                "antiguedad_anios": 9,
            },
            {
                "nombre": "Ing. Manuel Guzmán Peña", "usuario": "socio_manuel", "telefono": "916-345-0040",
                "cuota": 360.0, "taxis": ["TX-110", "TX-122"],
                "foto_url": "/assets/drivers/driver-04.jpg", "rfc": "GUPM820218HCS", "curp": "GUPM820218HCSPLN02",
                "concesion_folio": "SCT-CHIS-PAL-00304", "poliza_flota": "AFIRME-TX-66120",
                "domicilio_fiscal": "Av. 5 de Mayo #88, Col. Centro, Palenque",
                "banco_cuenta": "Citibanamex · CLABE 002180701293847561",
                "licencia_vence_en": (ahora_dt + timedelta(days=16)).strftime("%Y-%m-%d"),
                "antiguedad_anios": 7,
            },
            {
                "nombre": "Sra. Patricia Morales López", "usuario": "socia_patricia", "telefono": "916-345-0050",
                "cuota": 350.0, "taxis": ["TX-111", "TX-112", "TX-113", "TX-123", "TX-124"],
                "foto_url": "/assets/drivers/driver-17.jpg", "rfc": "MOLP760730MCS", "curp": "MOLP760730MCSRLN05",
                "concesion_folio": "SCT-CHIS-PAL-00359", "poliza_flota": "QUALITAS-FL-99510",
                "domicilio_fiscal": "Av. Merle Green #22, Zona La Cañada, Palenque",
                "banco_cuenta": "HSBC · CLABE 021180040591827364",
                "licencia_vence_en": (ahora_dt + timedelta(days=29)).strftime("%Y-%m-%d"),
                "antiguedad_anios": 10,
            },
            {
                "nombre": "Sr. Fernando Estrada Ruiz", "usuario": "socio_fernando", "telefono": "916-345-0060",
                "cuota": 350.0, "taxis": ["TX-114", "TX-115", "TX-125"],
                "foto_url": "/assets/drivers/driver-06.jpg", "rfc": "ESRF710314HCS", "curp": "ESRF710314HCSTLN09",
                "concesion_folio": "SCT-CHIS-PAL-00412", "poliza_flota": "CHUBB-PUB-11920",
                "domicilio_fiscal": "Periférico Sur #302, Col. Las Flores, Palenque",
                "banco_cuenta": "BBVA · CLABE 012180009918273645",
                "licencia_vence_en": (ahora_dt + timedelta(days=19)).strftime("%Y-%m-%d"),
                "antiguedad_anios": 12,
            },
        ]
        socio_por_placa = {}
        cuota_por_placa = {}
        for s in socios_data:
            existente = await db.usuarios_dueno.find_one({"usuario": s["usuario"]})
            doc = {
                "nombre": s["nombre"],
                "usuario": s["usuario"],
                "password_hash": _HASH_SOCIO123,
                "telefono": s["telefono"],
                "foto_url": s["foto_url"],
                "rfc": s["rfc"],
                "curp": s["curp"],
                "concesion_folio": s["concesion_folio"],
                "poliza_flota": s["poliza_flota"],
                "domicilio_fiscal": s["domicilio_fiscal"],
                "banco_cuenta": s["banco_cuenta"],
                "cuota_diaria": s["cuota"],
                "licencia_vence_en": s["licencia_vence_en"],
                "antiguedad_anios": s["antiguedad_anios"],
                "sitio_id": DEFAULT_SITIO,
                "activo": True,
                "creado": now_iso(-s["antiguedad_anios"] * 365 * 24 * 60),
            }
            if existente:
                await db.usuarios_dueno.update_one({"_id": existente["_id"]}, {"$set": doc})
                socio_id = str(existente["_id"])
            else:
                ins = await db.usuarios_dueno.insert_one(doc)
                socio_id = str(ins.inserted_id)
            for placa in s["taxis"]:
                socio_por_placa[placa] = socio_id
                cuota_por_placa[placa] = s["cuota"]

        # 3. 25 Taxis de Palenque + 5 Taxis de Pakal-Ná + 4 Taxis Foráneos (con expediente completo SCT/SEMOVI)
        fotos_demo = _fotos_demo_conductores()
        tipos_sangre = ["O+", "A+", "O+", "B+", "O-", "A+"]
        op_ids = {}
        await db.documentos_conductor.delete_many({})
        for i, t in enumerate(DEMO_TAXIS + DEMO_TAXIS_PAKALNA + DEMO_TAXIS_FORANEOS):
            t_sitio = t.get("sitio_id") or DEFAULT_SITIO
            lat, lng = t["lat"], t["lng"]
            pista = PALENQUE_PISTAS_VIALES.get(t["pista_id"], {})
            puntos_calle = pista.get("puntos", [[lat, lng]])
            sentido_dir = t.get("sentido_direccion", "adelante")
            track = _generar_track_calle(puntos_calle, t["idx"], sentido_dir, 15)
            driver_foto = fotos_demo[t["usuario"]]
            pref_curp = "".join([c for c in t["nombre"].upper() if c.isalpha()][:4]).ljust(4, "X")

            op_doc = {
                "nombre": t["nombre"],
                "telefono": t["telefono"],
                "placa": t["placa"],
                "ruta_asignada": rutas_ids[i % len(rutas_ids)],
                "usuario": t["usuario"],
                "password_hash": _HASH_TAXI123,
                "estado": t["estado"],
                "lat": lat,
                "lng": lng,
                "es_foraneo": t.get("es_foraneo", False),
                "destino_foraneo": t.get("destino_foraneo", ""),
                "gps_speed": 7.5 if t["estado"] != "fuera_de_servicio" else 0.0,
                "gps_heading": t.get("gps_heading", 0),
                "sentido_calle": t.get("sentido_calle", "doble"),
                "sentido_direccion": t.get("sentido_direccion", "adelante"),
                "descripcion_sentido": t.get("descripcion_sentido", ""),
                "gps_accuracy": round(random.uniform(2.5, 4.5), 1),
                "ultima_actualizacion": now_iso(),
                # En servicio desde hace 45 min a 5 h (cronómetro de turno de la app del chofer).
                "inicio_operacion": now_iso(-random.randint(45, 300)) if t["estado"] != "fuera_de_servicio" else None,
                "sitio_id": t_sitio,
                "activo": True,
                "track": track,
                "foto_url": driver_foto,
                "curp": f"{pref_curp}{80 + (i % 18):02d}0{(i % 9) + 1}15HCSRL{i % 10:02d}",
                "rfc": f"{pref_curp}{80 + (i % 18):02d}0{(i % 9) + 1}15A{i % 9}",
                "tipo_sangre": tipos_sangre[i % len(tipos_sangre)],
                "licencia_tipo": "Tarjetón Estatal Servicio Público Tipo B",
                "licencia_folio": f"CHIS-TPB-2026-{1000 + i}",
                "tarjeton_semovi": f"SEMOVI-PAL-{400 + i}",
                "examen_medico": "APTO (Toxicológico y Pericia Aprobado)",
                "contacto_emergencia": f"Familiar Directo de {t['nombre'].split()[0]}",
                "telefono_emergencia": f"916-880-{1000 + i:04d}",
                "domicilio": f"Calle {(i % 12) + 1} de Mayo #{10 + i * 3}, Palenque, Chiapas",
                "calificacion_promedio": round(4.6 + ((i % 5) * 0.08), 2),
                "antiguedad_meses": 14 + (i * 4),
                "creado": now_iso(-(14 + i * 4) * 30 * 24 * 60),
            }
            existente = await db.operadores.find_one({"usuario": t["usuario"]})
            if existente:
                await db.operadores.update_one({"_id": existente["_id"]}, {"$set": op_doc})
                op_id = str(existente["_id"])
            else:
                ins = await db.operadores.insert_one(op_doc)
                op_id = str(ins.inserted_id)
            op_ids[t["usuario"]] = op_id

            # Sembrar documentos oficiales del expediente (con algunos por vencer para probar filtros)
            dias_lic = 18 if i in (2, 7, 14) else (240 + i * 5)
            dias_seg = -5 if i == 11 else (190 + i * 3)
            await db.documentos_conductor.insert_many([
                {
                    "operador_id": op_id,
                    "tipo": "licencia",
                    "nombre_doc": "Licencia / Tarjetón Chofer Público Tipo B",
                    "numero": f"CHIS-TPB-{1000 + i}",
                    "vence_en": (ahora_dt + timedelta(days=dias_lic)).strftime("%Y-%m-%d"),
                },
                {
                    "operador_id": op_id,
                    "tipo": "ine",
                    "nombre_doc": "Identificación Oficial INE Vigente",
                    "numero": f"INE-0709{100000 + i}",
                    "vence_en": (ahora_dt + timedelta(days=900)).strftime("%Y-%m-%d"),
                },
                {
                    "operador_id": op_id,
                    "tipo": "seguro",
                    "nombre_doc": "Póliza RC Viajero (1,500 UMA)",
                    "numero": f"QUAL-RCV-{8800 + i}",
                    "vence_en": (ahora_dt + timedelta(days=dias_seg)).strftime("%Y-%m-%d"),
                },
                {
                    "operador_id": op_id,
                    "tipo": "antidoping",
                    "nombre_doc": "Certificado Médico y Toxicológico SCT",
                    "numero": f"MED-SCT-{3300 + i}",
                    "vence_en": (ahora_dt + timedelta(days=150)).strftime("%Y-%m-%d"),
                },
            ])

            modelo_lower = t["modelo"].lower()
            if modelo_lower == "sentra":
                vehiculo_foto = "/assets/vehicles/Sentra.png"
            else:
                vehiculo_foto = f"/assets/vehicles/{modelo_lower}.png"

            propietario_socio_id = socio_por_placa.get(t["placa"])
            cuota_v = cuota_por_placa.get(t["placa"], 350.0)
            v_doc = {
                "numero_economico": t["placa"],
                "placa": f"CH-{410 + i}-TX",
                "marca": t["marca"],
                "modelo": t["modelo"],
                "anio": 2021 + (i % 4),
                "color": t["color"],
                "revista_vehicular": "APROBADA 2026",
                "tenencia_estado": "PAGADA 2026",
                "poliza_seguro": f"QUAL-RCV-{8800 + i}",
                "estado": "activo" if t["estado"] != "fuera_de_servicio" else "mantenimiento",
                "activo": True,
                "sitio_id": t_sitio,
                "operador_conductor_id": op_id,
                "propietario_id": propietario_socio_id,
                "cuota_diaria": cuota_v,
                "odometro_km": 42500 + (i * 1850),
                "lat": lat,
                "lng": lng,
                "ultima_actualizacion": now_iso(),
                "tipo_vehiculo_id": tipo_estandar_id,
                "foto_url": vehiculo_foto,
            }
            await db.vehiculos.update_one(
                {"numero_economico": t["placa"], "sitio_id": t_sitio},
                {"$set": v_doc},
                upsert=True
            )
            v_obj = await db.vehiculos.find_one({"numero_economico": t["placa"], "sitio_id": t_sitio})
            await db.operadores.update_one({"_id": to_oid(op_id)}, {"$set": {"vehiculo_id": str(v_obj["_id"])}})

        # 3. Servicios en varios estados
        await db.servicios.delete_many({"sitio_id": DEFAULT_SITIO})
        servicios = [
            # 5 Servicios en curso con destinos viales reales en Palenque
            {
                "cliente_nombre": "Dr. Fernando Ruiz", "cliente_telefono": "916-555-0101",
                "origen": {"texto": "Hotel Ciudad Real, Palenque", "lat": 17.5100, "lng": -91.9830},
                "destino": {"texto": "Zona Arqueológica de Palenque", "lat": 17.4840, "lng": -91.9950},
                "estado": "en_curso", "operador_asignado_id": op_ids["op3"],
                "costo": 180.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-15), "timestamp_creacion": now_iso(-15),
                "timestamp_asignacion": now_iso(-12), "timestamp_inicio": now_iso(-8),
            },
            {
                "cliente_nombre": "Lic. Mónica Estrada", "cliente_telefono": "916-555-0102",
                "origen": {"texto": "Terminal ADO Palenque", "lat": 17.5140, "lng": -91.9855},
                "destino": {"texto": "Hotel Misión Palenque y Spa", "lat": 17.5130, "lng": -91.9790},
                "estado": "en_curso", "operador_asignado_id": op_ids["op7"],
                "costo": 80.0, "metodo_pago": "tarjeta", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-10), "timestamp_creacion": now_iso(-10),
                "timestamp_asignacion": now_iso(-8), "timestamp_inicio": now_iso(-5),
            },
            {
                "cliente_nombre": "Ing. Carlos Valenzuela", "cliente_telefono": "916-555-0105",
                "origen": {"texto": "Centro de Convenciones Palenque", "lat": 17.5150, "lng": -91.9820},
                "destino": {"texto": "Estación Tren Maya Palenque", "lat": 17.5359, "lng": -91.9592},
                "estado": "en_curso", "operador_asignado_id": op_ids["op8"],
                "costo": 120.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-9), "timestamp_creacion": now_iso(-9),
                "timestamp_asignacion": now_iso(-7), "timestamp_inicio": now_iso(-4),
            },
            {
                "cliente_nombre": "Arqueólogo Mateo Ramos", "cliente_telefono": "916-555-0103",
                "origen": {"texto": "Estación Tren Maya Palenque", "lat": 17.5320, "lng": -91.9540},
                "destino": {"texto": "Parque Central de Palenque", "lat": 17.5098, "lng": -91.9820},
                "estado": "en_curso", "operador_asignado_id": op_ids["op10"],
                "costo": 95.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-8), "timestamp_creacion": now_iso(-8),
                "timestamp_asignacion": now_iso(-6), "timestamp_inicio": now_iso(-3),
            },
            {
                "cliente_nombre": "Verónica Salgado", "cliente_telefono": "916-555-0104",
                "origen": {"texto": "Fracc. Pakal-Ná Norte", "lat": 17.5260, "lng": -91.9580},
                "destino": {"texto": "Hospital General de Palenque", "lat": 17.5077, "lng": -91.9800},
                "estado": "en_curso", "operador_asignado_id": op_ids["op12"],
                "costo": 85.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-6), "timestamp_creacion": now_iso(-6),
                "timestamp_asignacion": now_iso(-4), "timestamp_inicio": now_iso(-2),
            },
            # 2 Servicios Asignados
            {
                "cliente_nombre": "María López (Hotel Maya)", "cliente_telefono": "916-100-0001",
                "origen": {"texto": "Terminal ADO Palenque", "lat": 17.5140, "lng": -91.9855},
                "destino": {"texto": "Hotel Maya Tulipanes, La Cañada", "lat": 17.5165, "lng": -91.9810},
                "estado": "asignado", "operador_asignado_id": op_ids["op5"],
                "costo": 60.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-4), "timestamp_creacion": now_iso(-4), "timestamp_asignacion": now_iso(-2),
            },
            {
                "cliente_nombre": "Carmen Velasco (Super Che)", "cliente_telefono": "916-100-0006",
                "origen": {"texto": "Super Che Palenque, Av. Juárez", "lat": 17.5125, "lng": -91.9840},
                "destino": {"texto": "Mercado Municipal de Palenque", "lat": 17.5131, "lng": -91.9845},
                "estado": "asignado", "operador_asignado_id": op_ids["op9"],
                "costo": 50.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-3), "timestamp_creacion": now_iso(-3), "timestamp_asignacion": now_iso(-1),
            },
            # Pendientes (listos para despacho en la terminal)
            {
                "cliente_nombre": "Guillermo Zepeda", "cliente_telefono": "916-555-0201",
                "origen": {"texto": "Restaurante Maya Cañada", "lat": 17.5180, "lng": -91.9790},
                "destino": {"texto": "Balneario Nututún", "lat": 17.4760, "lng": -91.9980},
                "estado": "pendiente", "operador_asignado_id": None,
                "costo": 120.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-3), "timestamp_creacion": now_iso(-3),
            },
            {
                "cliente_nombre": "Familia Barrientos", "cliente_telefono": "916-100-0008",
                "origen": {"texto": "Parque Central frente a Catedral", "lat": 17.5098, "lng": -91.9820},
                "destino": {"texto": "Ecoparque Aluxes", "lat": 17.5010, "lng": -92.0120},
                "estado": "pendiente", "operador_asignado_id": None,
                "costo": 95.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-2), "timestamp_creacion": now_iso(-2),
            },
            {
                "cliente_nombre": "Ing. David Trujillo", "cliente_telefono": "916-100-0007",
                "origen": {"texto": "Estación Tren Maya Palenque", "lat": 17.5320, "lng": -91.9540},
                "destino": {"texto": "Hotel Misión Palenque", "lat": 17.5130, "lng": -91.9790},
                "estado": "pendiente", "operador_asignado_id": None,
                "costo": 110.0, "metodo_pago": "transferencia", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-1), "timestamp_creacion": now_iso(-1),
            },
            # Completados hoy
            {
                "cliente_nombre": "Sofía Castro", "cliente_telefono": "916-555-0301",
                "origen": {"texto": "Terminal ADO"}, "destino": {"texto": "Parque Central"},
                "estado": "completado", "operador_asignado_id": op_ids["op1"],
                "costo": 50.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-120), "timestamp_creacion": now_iso(-120), "timestamp_fin": now_iso(-100),
            },
            {
                "cliente_nombre": "Alberto Núñez", "cliente_telefono": "916-555-0302",
                "origen": {"texto": "Mercado Municipal"}, "destino": {"texto": "Hotel Chan-Kah"},
                "estado": "completado", "operador_asignado_id": op_ids["op2"],
                "costo": 130.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-90), "timestamp_creacion": now_iso(-90), "timestamp_fin": now_iso(-70),
            },
            {
                "cliente_nombre": "Lucía Domínguez", "cliente_telefono": "916-555-0303",
                "origen": {"texto": "Colonia Pakal Ná"}, "destino": {"texto": "Centro Médico Palenque"},
                "estado": "completado", "operador_asignado_id": op_ids["op4"],
                "costo": 65.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-75), "timestamp_creacion": now_iso(-75), "timestamp_fin": now_iso(-55),
            },
            {
                "cliente_nombre": "Gustavo Morales", "cliente_telefono": "916-555-0304",
                "origen": {"texto": "Hotel Tulijá Express"}, "destino": {"texto": "Plaza Las Flores"},
                "estado": "completado", "operador_asignado_id": op_ids["op6"],
                "costo": 55.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-60), "timestamp_creacion": now_iso(-60), "timestamp_fin": now_iso(-40),
            },
            {
                "cliente_nombre": "Elena Morales", "cliente_telefono": "916-555-0305",
                "origen": {"texto": "Plaza de las Artesanías"}, "destino": {"texto": "Hotel Maya Tulipanes"},
                "estado": "completado", "operador_asignado_id": op_ids["op8"],
                "costo": 45.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-45), "timestamp_creacion": now_iso(-45), "timestamp_fin": now_iso(-25),
            },
            {
                "cliente_nombre": "Mariana Cifuentes", "cliente_telefono": "916-555-0306",
                "origen": {"texto": "Aeropuerto de Palenque"}, "destino": {"texto": "Hotel Ciudad Real"},
                "estado": "completado", "operador_asignado_id": op_ids["op11"],
                "costo": 220.0, "metodo_pago": "tarjeta", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-40), "timestamp_creacion": now_iso(-40), "timestamp_fin": now_iso(-15),
            },
            {
                "cliente_nombre": "Ignacio Rivas", "cliente_telefono": "916-555-0307",
                "origen": {"texto": "Gasolinera Periférico"}, "destino": {"texto": "Terminal ADO"},
                "estado": "completado", "operador_asignado_id": op_ids["op13"],
                "costo": 50.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-30), "timestamp_creacion": now_iso(-30), "timestamp_fin": now_iso(-10),
            },
            {
                "cliente_nombre": "Raúl Santillán", "cliente_telefono": "916-555-0308",
                "origen": {"texto": "Palacio Municipal"}, "destino": {"texto": "Colonia Los Ángeles"},
                "estado": "completado", "operador_asignado_id": op_ids["op14"],
                "costo": 60.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-20), "timestamp_creacion": now_iso(-20), "timestamp_fin": now_iso(-5),
            },
            {
                "cliente_nombre": "Patricia Solís", "cliente_telefono": "916-555-0309",
                "origen": {"texto": "Parque Central"}, "destino": {"texto": "Colonia Maya"},
                "estado": "completado", "operador_asignado_id": op_ids["op1"],
                "costo": 55.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-150), "timestamp_creacion": now_iso(-150), "timestamp_fin": now_iso(-132),
            },
            {
                "cliente_nombre": "Héctor Domínguez", "cliente_telefono": "916-555-0310",
                "origen": {"texto": "Hospital General"}, "destino": {"texto": "Terminal ADO"},
                "estado": "completado", "operador_asignado_id": op_ids["op1"],
                "costo": 60.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-180), "timestamp_creacion": now_iso(-180), "timestamp_fin": now_iso(-165),
            },
            {
                "cliente_nombre": "Lorena Aguilar", "cliente_telefono": "916-555-0311",
                "origen": {"texto": "Super Che"}, "destino": {"texto": "Fracc. Pakal-Ná"},
                "estado": "completado", "operador_asignado_id": op_ids["op2"],
                "costo": 75.0, "metodo_pago": "transferencia", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-140), "timestamp_creacion": now_iso(-140), "timestamp_fin": now_iso(-122),
            },
            {
                "cliente_nombre": "Arturo Vázquez", "cliente_telefono": "916-555-0312",
                "origen": {"texto": "Estación Tren Maya"}, "destino": {"texto": "Zona Hotelera La Cañada"},
                "estado": "completado", "operador_asignado_id": op_ids["op5"],
                "costo": 110.0, "metodo_pago": "efectivo", "sitio_id": DEFAULT_SITIO,
                "creado_en": now_iso(-110), "timestamp_creacion": now_iso(-110), "timestamp_fin": now_iso(-92),
            },
        ]
        op_meta_by_id = {op_ids[t["usuario"]]: t for t in DEMO_TAXIS if t["usuario"] in op_ids}
        for s_doc in servicios:
            oid_s = s_doc.get("operador_asignado_id")
            if oid_s and oid_s in op_meta_by_id:
                s_doc["operador_nombre"] = op_meta_by_id[oid_s]["nombre"]
                s_doc["operador_placa"] = op_meta_by_id[oid_s]["placa"]
        await db.servicios.insert_many(servicios)

        # 4. 10 Conversaciones de WhatsApp
        await db.wa_conversaciones.delete_many({"sitio_id": DEFAULT_SITIO})
        wa_conversaciones = [
            # 1: María López - Reciente (< 2 min), Hotel Maya Tulipanes
            {
                "cliente_nombre": "María López",
                "cliente_telefono": "+52 916 100 0001",
                "sitio_id": DEFAULT_SITIO,
                "creada_en": now_iso(-1),
                "actualizada_en": now_iso(-1),
                "mensajes": [
                    {"de": "cliente", "texto": "Buenas tardes central, ¿tienen un taxi disponible?", "ts": now_iso(-2)},
                    {"de": "cliente", "texto": "Estoy aquí en la recepción del Hotel Maya Tulipanes con mi maleta", "lat": 17.5165, "lng": -91.9810, "ts": now_iso(-1)}
                ]
            },
            # 2: Dr. Alejandro Gómez - Advertencia (2-5 min), Hospital General
            {
                "cliente_nombre": "Dr. Alejandro Gómez",
                "cliente_telefono": "+52 916 100 0002",
                "sitio_id": DEFAULT_SITIO,
                "creada_en": now_iso(-4),
                "actualizada_en": now_iso(-3),
                "mensajes": [
                    {"de": "cliente", "texto": "Hola central, salgo de turno de guardia médica", "ts": now_iso(-4)},
                    {"de": "cliente", "texto": "Comparto mi ubicación frente a Urgencias del Hospital General", "lat": 17.5060, "lng": -91.9780, "ts": now_iso(-3)}
                ]
            },
            # 3: Elena Morales (ADO) - Urgente (> 5 min, URGENTE rojo), Terminal ADO
            {
                "cliente_nombre": "Elena Morales (ADO)",
                "cliente_telefono": "+52 916 100 0003",
                "sitio_id": DEFAULT_SITIO,
                "creada_en": now_iso(-8),
                "actualizada_en": now_iso(-7),
                "mensajes": [
                    {"de": "cliente", "texto": "Buenas tardes, ¿me pueden mandar una unidad a la Terminal ADO? Llegó mi autobús.", "ts": now_iso(-8)},
                    {"de": "cliente", "texto": "Aquí los espero afuera sobre la banqueta principal con 2 maletas", "lat": 17.5140, "lng": -91.9855, "ts": now_iso(-7)}
                ]
            },
            # 4: Pedro Santos - Turista (Pregunta tarifas Misol-Ha)
            {
                "cliente_nombre": "Pedro Santos (Turista)",
                "cliente_telefono": "+52 916 100 0004",
                "sitio_id": DEFAULT_SITIO,
                "creada_en": now_iso(-14),
                "actualizada_en": now_iso(-10),
                "mensajes": [
                    {"de": "cliente", "texto": "Hola buenas tardes, ¿cuánto cobran por llevarnos y esperarnos en las Cascadas de Misol-Ha?", "ts": now_iso(-12)},
                    {"de": "operadora", "texto": "Buenas tardes Pedro, el viaje redondo con 2 horas de espera está en $450 pesos.", "ts": now_iso(-11)},
                    {"de": "cliente", "texto": "Excelente, ¿tienen unidad para salir en 20 minutos?", "ts": now_iso(-10)}
                ]
            },
            # 5: Lic. Roberto Coutiño - Ejecutivo Aeropuerto Palenque
            {
                "cliente_nombre": "Lic. Roberto Coutiño",
                "cliente_telefono": "+52 916 100 0005",
                "sitio_id": DEFAULT_SITIO,
                "creada_en": now_iso(-5),
                "actualizada_en": now_iso(-4),
                "mensajes": [
                    {"de": "cliente", "texto": "Buenos días, requiero una unidad ejecutiva hacia el Aeropuerto de Palenque para vuelo de las 11:30 am.", "ts": now_iso(-5)},
                    {"de": "cliente", "texto": "Estoy en el Centro frente a Banamex, ¿pueden emitir factura?", "lat": 17.5100, "lng": -91.9825, "ts": now_iso(-4)}
                ]
            },
            # 6: Carmen Velasco - Super Chedraui (Compras)
            {
                "cliente_nombre": "Carmen Velasco",
                "cliente_telefono": "+52 916 100 0006",
                "sitio_id": DEFAULT_SITIO,
                "creada_en": now_iso(-2),
                "actualizada_en": now_iso(-2),
                "mensajes": [
                    {"de": "cliente", "texto": "Hola, salgo de hacer despensa de Super Che con varios carritos", "ts": now_iso(-2)},
                    {"de": "cliente", "texto": "Ocupo un taxi con cajuela amplia por favor, estoy en el estacionamiento", "lat": 17.5125, "lng": -91.9840, "ts": now_iso(-2)}
                ]
            },
            # 7: Ing. David Trujillo - Tren Maya Palenque (> 5 min, URGENTE rojo)
            {
                "cliente_nombre": "Ing. David Trujillo (Tren Maya)",
                "cliente_telefono": "+52 916 100 0007",
                "sitio_id": DEFAULT_SITIO,
                "creada_en": now_iso(-7),
                "actualizada_en": now_iso(-6),
                "mensajes": [
                    {"de": "cliente", "texto": "Acabamos de bajar del Tren Maya en la estación Palenque", "ts": now_iso(-7)},
                    {"de": "cliente", "texto": "Somos 3 personas con equipaje hacia el Hotel Misión, les mando ubicación", "lat": 17.5320, "lng": -91.9540, "ts": now_iso(-6)}
                ]
            },
            # 8: Familia Barrientos - Parque Central (5 personas)
            {
                "cliente_nombre": "Familia Barrientos",
                "cliente_telefono": "+52 916 100 0008",
                "sitio_id": DEFAULT_SITIO,
                "creada_en": now_iso(-1),
                "actualizada_en": now_iso(-1),
                "mensajes": [
                    {"de": "cliente", "texto": "Buenas tardes, ¿tendrán una unidad tipo Avanza o amplia para 5 pasajeros?", "ts": now_iso(-1)},
                    {"de": "cliente", "texto": "Estamos aquí junto al quiosco del Parque Central", "lat": 17.5098, "lng": -91.9820, "ts": now_iso(-1)}
                ]
            },
            # 9: Valeria Ramos - Métodos de pago Nututún
            {
                "cliente_nombre": "Valeria Ramos",
                "cliente_telefono": "+52 916 100 0009",
                "sitio_id": DEFAULT_SITIO,
                "creada_en": now_iso(-15),
                "actualizada_en": now_iso(-8),
                "mensajes": [
                    {"de": "cliente", "texto": "Hola buenas tardes, ¿los choferes aceptan pago por transferencia CoDi o tarjeta?", "ts": now_iso(-15)},
                    {"de": "operadora", "texto": "¡Hola Valeria! Sí, tenemos unidades equipadas con terminal clip y cobro por transferencia.", "ts": now_iso(-10)},
                    {"de": "cliente", "texto": "Perfecto, en 15 minutos les pido uno para el Balneario Nututún.", "ts": now_iso(-8)}
                ]
            },
            # 10: Don Javier Méndez - Mercado Municipal (Cliente habitual)
            {
                "cliente_nombre": "Don Javier Méndez",
                "cliente_telefono": "+52 916 100 0010",
                "sitio_id": DEFAULT_SITIO,
                "creada_en": now_iso(-2),
                "actualizada_en": now_iso(-2),
                "mensajes": [
                    {"de": "cliente", "texto": "Buenos días muchachas, ¿me mandan mi taxi de siempre al Mercado por favor?", "ts": now_iso(-2)},
                    {"de": "cliente", "texto": "Estoy en el portal de las flores como todos los días", "lat": 17.5080, "lng": -91.9835, "ts": now_iso(-2)}
                ]
            },
        ]
        await db.wa_conversaciones.insert_many(wa_conversaciones)

        # 5. Colonias / Cuadrantes con Delimitador de Precios por Zona
        await db.colonias.delete_many({"sitio_id": DEFAULT_SITIO})
        colonias_seed = [
            {
                "nombre": "Centro",
                "color": "#38bdf8",
                "tarifa_base": 40.0,
                "tarifa_nocturna": 55.0,
                "tarifa_salida": 45.0,
                "notas": "Primer cuadro, Parque Central y Mercado Municipal",
                "activa": True,
                "sitio_id": DEFAULT_SITIO,
                "poligono": [[17.5130, -91.9880], [17.5130, -91.9790], [17.5060, -91.9790], [17.5060, -91.9880]],
                "creado_en": now_iso(),
            },
            {
                "nombre": "La Cañada",
                "color": "#a855f7",
                "tarifa_base": 50.0,
                "tarifa_nocturna": 65.0,
                "tarifa_salida": 55.0,
                "notas": "Zona Hotelera y eco-turística La Cañada",
                "activa": True,
                "sitio_id": DEFAULT_SITIO,
                "poligono": [[17.5155, -91.9950], [17.5155, -91.9880], [17.5085, -91.9880], [17.5085, -91.9950]],
                "creado_en": now_iso(),
            },
            {
                "nombre": "Pakal-Ná",
                "color": "#f59e0b",
                "tarifa_base": 65.0,
                "tarifa_nocturna": 85.0,
                "tarifa_salida": 70.0,
                "notas": "Corredor Norte, CFE y Estación Tren Maya",
                "activa": True,
                "sitio_id": DEFAULT_SITIO,
                "poligono": [[17.5420, -91.9780], [17.5420, -91.9640], [17.5300, -91.9640], [17.5300, -91.9780]],
                "creado_en": now_iso(),
            },
            {
                "nombre": "Zona Hotelera / Ruinas",
                "color": "#f43f5e",
                "tarifa_base": 120.0,
                "tarifa_nocturna": 150.0,
                "tarifa_salida": 130.0,
                "notas": "Carretera a las Ruinas y Hoteles de Selva",
                "activa": True,
                "sitio_id": DEFAULT_SITIO,
                "poligono": [[17.5085, -92.0080], [17.5085, -91.9950], [17.4980, -91.9950], [17.4980, -92.0080]],
                "creado_en": now_iso(),
            },
            {
                "nombre": "Periférico Sur / Hospital",
                "color": "#10b981",
                "tarifa_base": 55.0,
                "tarifa_nocturna": 70.0,
                "tarifa_salida": 60.0,
                "notas": "Hospital General, Plaza Las Flores y salidas sur",
                "activa": True,
                "sitio_id": DEFAULT_SITIO,
                "poligono": [[17.5060, -91.9880], [17.5060, -91.9760], [17.4990, -91.9760], [17.4990, -91.9880]],
                "creado_en": now_iso(),
            },
        ]
        await db.colonias.insert_many(colonias_seed)

        # 6. Tarifas Predefinidas con Horarios, Recargos y Zonas
        await db.tarifas_predefinidas.delete_many({"sitio_id": DEFAULT_SITIO})
        tarifas_seed = [
            {
                "nombre": "Dejada Local Centro (Diurna)",
                "monto": 40.0,
                "tipo": "por_zona",
                "orden": 1,
                "hora_inicio": "06:00",
                "hora_fin": "22:00",
                "horario_tipo": "diurno",
                "recargo_nocturno": 15.0,
                "recargo_lluvia": 10.0,
                "costo_km_extra": 8.0,
                "costo_parada_extra": 15.0,
                "zona_nombre": "Centro",
                "notas": "Tarifa base dentro del primer cuadro de la ciudad",
                "activa": True,
                "sitio_id": DEFAULT_SITIO,
            },
            {
                "nombre": "Centro ↔ La Cañada / ADO",
                "monto": 50.0,
                "tipo": "por_zona",
                "orden": 2,
                "hora_inicio": "06:00",
                "hora_fin": "22:00",
                "horario_tipo": "diurno",
                "recargo_nocturno": 15.0,
                "recargo_lluvia": 10.0,
                "costo_km_extra": 10.0,
                "costo_parada_extra": 15.0,
                "zona_nombre": "La Cañada",
                "notas": "Incluye equipaje estándar en cajuela",
                "activa": True,
                "sitio_id": DEFAULT_SITIO,
            },
            {
                "nombre": "Centro ↔ Pakal-Ná / Hospital",
                "monto": 65.0,
                "tipo": "por_zona",
                "orden": 3,
                "hora_inicio": "05:30",
                "hora_fin": "23:00",
                "horario_tipo": "todo_el_dia",
                "recargo_nocturno": 20.0,
                "recargo_lluvia": 15.0,
                "costo_km_extra": 10.0,
                "costo_parada_extra": 20.0,
                "zona_nombre": "Pakal-Ná",
                "notas": "Corredor Bulevar Palenque - Pakal-Ná",
                "activa": True,
                "sitio_id": DEFAULT_SITIO,
            },
            {
                "nombre": "Estación Tren Maya / Aeropuerto",
                "monto": 110.0,
                "tipo": "fijo",
                "orden": 4,
                "hora_inicio": "00:00",
                "hora_fin": "23:59",
                "horario_tipo": "todo_el_dia",
                "recargo_nocturno": 25.0,
                "recargo_lluvia": 15.0,
                "costo_km_extra": 12.0,
                "costo_parada_extra": 25.0,
                "zona_nombre": "Pakal-Ná",
                "notas": "Servicio especial con espera en andén",
                "activa": True,
                "sitio_id": DEFAULT_SITIO,
            },
            {
                "nombre": "Zona Arqueológica / Ruinas",
                "monto": 150.0,
                "tipo": "foraneo",
                "orden": 5,
                "hora_inicio": "07:00",
                "hora_fin": "18:00",
                "horario_tipo": "diurno",
                "recargo_nocturno": 30.0,
                "recargo_lluvia": 20.0,
                "costo_km_extra": 14.0,
                "costo_parada_extra": 30.0,
                "zona_nombre": "Zona Hotelera / Ruinas",
                "notas": "Corredor turístico Carretera a las Ruinas",
                "activa": True,
                "sitio_id": DEFAULT_SITIO,
            },
            {
                "nombre": "Tarifa Nocturna Especial",
                "monto": 75.0,
                "tipo": "horario",
                "orden": 6,
                "hora_inicio": "22:00",
                "hora_fin": "06:00",
                "horario_tipo": "nocturno",
                "recargo_nocturno": 0.0,
                "recargo_lluvia": 15.0,
                "costo_km_extra": 12.0,
                "costo_parada_extra": 20.0,
                "zona_nombre": "Todas las zonas",
                "notas": "Aplica automáticamente en guardia nocturna",
                "activa": True,
                "sitio_id": DEFAULT_SITIO,
            },
        ]
        await db.tarifas_predefinidas.insert_many(tarifas_seed)

        # 7. Objetos Reportados con Evidencia Fotográfica Real en WebP por Tenant e Histórico
        await db.reportes_objetos.delete_many({"sitio_id": DEFAULT_SITIO})
        try:
            from PIL import Image, ImageDraw
            import io as _io

            def _crear_evidencia_webp(oid: str, titulo: str, subtitulo: str, detalle: str, rgb_top: tuple, rgb_bot: tuple) -> dict:
                img = Image.new("RGB", (680, 440), rgb_top)
                draw = ImageDraw.Draw(img)
                for y in range(440):
                    r = int(rgb_top[0] + (rgb_bot[0] - rgb_top[0]) * (y / 440.0))
                    g = int(rgb_top[1] + (rgb_bot[1] - rgb_top[1]) * (y / 440.0))
                    b = int(rgb_top[2] + (rgb_bot[2] - rgb_top[2]) * (y / 440.0))
                    draw.line([(0, y), (680, y)], fill=(r, g, b))
                # Marco de evidencia forense / resguardo
                draw.rectangle([20, 20, 660, 420], outline=(34, 211, 238), width=3)
                draw.rectangle([20, 20, 660, 74], fill=(9, 14, 26))
                draw.text((38, 38), f"EVIDENCIA FOTOGRAFICA WEBP · RESGUARDO TAXIHUB", fill=(34, 211, 238))
                # Dibujar silueta estilizada del objeto en el centro
                draw.rounded_rectangle([190, 110, 490, 305], radius=22, fill=(18, 28, 48), outline=(148, 163, 184), width=3)
                draw.rounded_rectangle([225, 138, 455, 245], radius=12, fill=(30, 41, 59), outline=(56, 189, 248), width=2)
                draw.text((245, 175), titulo.upper()[:24], fill=(255, 255, 255))
                draw.text((245, 205), subtitulo[:32], fill=(148, 163, 184))
                draw.rectangle([20, 335, 660, 420], fill=(9, 14, 26))
                draw.text((38, 350), f"OBJETO: {titulo}", fill=(255, 255, 255))
                draw.text((38, 375), f"DETALLE: {detalle}", fill=(16, 185, 129))
                draw.text((38, 396), f"TENANT STORAGE: uploads/tenants/{DEFAULT_SITIO}/reportes/ · FORMATO: WEBP SEGURO", fill=(148, 163, 184))
                buf = _io.BytesIO()
                img.save(buf, format="WEBP", quality=84)
                comp = analizar_y_comprimir_imagen_webp(buf.getvalue(), "evidencia.webp")
                path = f"{APP_NAME}/reportes/{oid}/{uuid.uuid4().hex}.webp"
                saved = put_object(path, comp["data"], "image/webp", sitio_id=DEFAULT_SITIO)
                return {"path": saved["path"], "tenant_path": saved.get("tenant_path"), "ahorro": comp.get("ahorro_pct", 34.5)}

            ev1 = _crear_evidencia_webp(op_ids["op1"], "iPhone 15 Pro Funda Negra", "Asiento trasero derecho · Unidad TX-101", "Pantalla intacta, bloqueado con funda MagSafe", (15, 23, 42), (30, 58, 138))
            ev2 = _crear_evidencia_webp(op_ids["op4"], "Mochila Samsonite Azul Marino", "Cajuela · Viaje Terminal ADO -> Hotel Mision", "Contiene laptop Dell y documentos personales", (17, 24, 39), (6, 78, 59))
            ev3 = _crear_evidencia_webp(op_ids["op2"], "Cartera de Piel Cafe con INE", "Asiento copiloto · Unidad TX-102", "Devuelta en base central previa identificacion", (24, 24, 27), (120, 53, 15))
            ev4 = _crear_evidencia_webp(op_ids["op8"], "Lentes Ray-Ban con Estuche", "Consola trasera · Unidad TX-108", "Entregado a su propietaria en recepcion del hotel", (15, 23, 42), (88, 28, 135))

            reportes_seed = [
                {
                    "operador_id": op_ids["op1"],
                    "operador_nombre": "Juan Pérez",
                    "operador_placa": "TX-101",
                    "sitio_id": DEFAULT_SITIO,
                    "storage_path": ev1["path"],
                    "tenant_storage_path": ev1["tenant_path"],
                    "foto_url": f"/api/files/{ev1['path']}",
                    "content_type": "image/webp",
                    "formato": "webp",
                    "seguridad_verificada": True,
                    "ahorro_compresion_pct": 38.4,
                    "categoria": "Electrónicos",
                    "descripcion": "iPhone 15 Pro con funda negra MagSafe olvidado en el asiento trasero al bajar en Parque Central.",
                    "timestamp": now_iso(-35),
                    "estado": "encontrado",
                    "unidad": {"numero_economico": "TX-101", "placa": "CH-410-TX"},
                    "historial": [{"estado": "encontrado", "ts": now_iso(-35), "actor": "operador", "nota": "Reportado al finalizar viaje"}],
                },
                {
                    "operador_id": op_ids["op4"],
                    "operador_nombre": "Pedro Gómez",
                    "operador_placa": "TX-104",
                    "sitio_id": DEFAULT_SITIO,
                    "storage_path": ev2["path"],
                    "tenant_storage_path": ev2["tenant_path"],
                    "foto_url": f"/api/files/{ev2['path']}",
                    "content_type": "image/webp",
                    "formato": "webp",
                    "seguridad_verificada": True,
                    "ahorro_compresion_pct": 41.2,
                    "categoria": "Equipaje / Mochila",
                    "descripcion": "Mochila Samsonite azul marino con laptop y carpeta de trabajo olvidada en la cajuela en Terminal ADO.",
                    "timestamp": now_iso(-210),
                    "estado": "resguardo",
                    "ultima_nota": "Recibido en casilleros de la Central Palenque (Gaveta #3)",
                    "unidad": {"numero_economico": "TX-104", "placa": "CH-413-TX"},
                    "historial": [
                        {"estado": "encontrado", "ts": now_iso(-210), "actor": "operador"},
                        {"estado": "resguardo", "ts": now_iso(-180), "actor": "terminal", "nota": "Resguardado en Gaveta #3 de la central"},
                    ],
                },
                {
                    "operador_id": op_ids["op2"],
                    "operador_nombre": "Miguel Ángel López",
                    "operador_placa": "TX-102",
                    "sitio_id": DEFAULT_SITIO,
                    "storage_path": ev3["path"],
                    "tenant_storage_path": ev3["tenant_path"],
                    "foto_url": f"/api/files/{ev3['path']}",
                    "content_type": "image/webp",
                    "formato": "webp",
                    "seguridad_verificada": True,
                    "ahorro_compresion_pct": 36.8,
                    "categoria": "Documentos / Cartera",
                    "descripcion": "Cartera de piel café con credencial INE y tarjetas bancarias a nombre de Alberto Núñez.",
                    "timestamp": now_iso(-1500),  # Ayer
                    "fecha_devolucion": now_iso(-1250),
                    "entregado_a": "Alberto Núñez (Titular INE)",
                    "telefono_receptor": "916-555-0302",
                    "ultima_nota": "Entregada personalmente tras validar INE en ventanilla de central.",
                    "estado": "devuelto",
                    "unidad": {"numero_economico": "TX-102", "placa": "CH-411-TX"},
                    "historial": [
                        {"estado": "encontrado", "ts": now_iso(-1500), "actor": "operador"},
                        {"estado": "resguardo", "ts": now_iso(-1420), "actor": "terminal"},
                        {"estado": "devuelto", "ts": now_iso(-1250), "actor": "terminal", "entregado_a": "Alberto Núñez (Titular INE)", "nota": "Firmó bitácora de conformidad"},
                    ],
                },
                {
                    "operador_id": op_ids["op8"],
                    "operador_nombre": "Roberto Díaz",
                    "operador_placa": "TX-108",
                    "sitio_id": DEFAULT_SITIO,
                    "storage_path": ev4["path"],
                    "tenant_storage_path": ev4["tenant_path"],
                    "foto_url": f"/api/files/{ev4['path']}",
                    "content_type": "image/webp",
                    "formato": "webp",
                    "seguridad_verificada": True,
                    "ahorro_compresion_pct": 39.5,
                    "categoria": "Accesorios",
                    "descripcion": "Lentes de sol Ray-Ban en estuche rígido negro olvidados en viaje hacia Hotel Maya Tulipanes.",
                    "timestamp": now_iso(-4320),  # Hace 3 días
                    "fecha_devolucion": now_iso(-4100),
                    "entregado_a": "Elena Morales (Huésped Hab. 204)",
                    "telefono_receptor": "916-555-0305",
                    "ultima_nota": "El operador regresó al hotel y entregó en recepción.",
                    "estado": "devuelto",
                    "unidad": {"numero_economico": "TX-108", "placa": "CH-417-TX"},
                    "historial": [
                        {"estado": "encontrado", "ts": now_iso(-4320), "actor": "operador"},
                        {"estado": "devuelto", "ts": now_iso(-4100), "actor": "terminal", "entregado_a": "Elena Morales", "nota": "Entregado en recepción del hotel"},
                    ],
                },
            ]
            await db.reportes_objetos.insert_many(reportes_seed)
        except Exception as exc:
            logger.warning("No se pudieron sembrar fotos WebP demo de reportes: %s", exc)

        # 8. Facturas SaaS por Tenant y Aviso del Desarrollador
        await db.facturas_tenant.delete_many({})
        await db.facturas_tenant.insert_many([
            {
                "folio": "FAC-DEFA-202610-101",
                "sitio_id": DEFAULT_SITIO,
                "sitio_nombre": "Radio Taxis Palenque",
                "concepto": "Suscripción Mensual Plan Central Satelital Pro (25 Unidades + Puente WhatsApp Anti-Ban)",
                "periodo": "Octubre 2026",
                "monto": 2800.0,
                "moneda": "MXN",
                "estado": "pagada",
                "metodo_pago": "Transferencia SPEI",
                "fecha_emision": (ahora_dt - timedelta(days=4)).strftime("%Y-%m-%d"),
                "fecha_vencimiento": (ahora_dt + timedelta(days=26)).strftime("%Y-%m-%d"),
                "fecha_pago": (ahora_dt - timedelta(days=3)).isoformat(),
                "creado_en": now_iso(-4 * 24 * 60),
            },
            {
                "folio": "FAC-PAKA-202610-102",
                "sitio_id": "sitio_pakalna",
                "sitio_nombre": "Sitio Tren Maya Pakal-Ná",
                "concepto": "Suscripción Mensual Base Ferroviaria (Flota Pakal-Ná + Despacho Satelital)",
                "periodo": "Octubre 2026",
                "monto": 1950.0,
                "moneda": "MXN",
                "estado": "pendiente",
                "metodo_pago": "Transferencia SPEI / CoDi",
                "fecha_emision": (ahora_dt - timedelta(days=2)).strftime("%Y-%m-%d"),
                "fecha_vencimiento": (ahora_dt + timedelta(days=19)).strftime("%Y-%m-%d"),
                "creado_en": now_iso(-2 * 24 * 60),
            },
            {
                "folio": "FAC-DEFA-202609-089",
                "sitio_id": DEFAULT_SITIO,
                "sitio_nombre": "Radio Taxis Palenque",
                "concepto": "Suscripción Mensual Plan Central Satelital Pro — Septiembre",
                "periodo": "Septiembre 2026",
                "monto": 2800.0,
                "moneda": "MXN",
                "estado": "pagada",
                "metodo_pago": "Transferencia SPEI",
                "fecha_emision": (ahora_dt - timedelta(days=34)).strftime("%Y-%m-%d"),
                "fecha_vencimiento": (ahora_dt - timedelta(days=4)).strftime("%Y-%m-%d"),
                "fecha_pago": (ahora_dt - timedelta(days=33)).isoformat(),
                "creado_en": now_iso(-34 * 24 * 60),
            },
        ])

        if await db.avisos_dev.count_documents({"activo": True}) == 0:
            await db.avisos_dev.insert_one({
                "sitio_id": "todos",
                "titulo": "Soporte Técnico TaxiHub Cloud Activo",
                "mensaje": "Escríbenos por WhatsApp para dudas, altas de unidades o capacitación.",
                "nivel": "info",
                "contacto_soporte": "WhatsApp Soporte: +52 916 163 2304",
                "creado_en": now_iso(-60),
                "expira_en": (ahora_dt + timedelta(hours=72)).isoformat(),
                "activo": True,
            })

        logger.info("Simulación sembrada: %d taxis en Palenque + %d en Pakal-Ná, %d servicios, %d chats de WhatsApp.",
                    len(DEMO_TAXIS), len(DEMO_TAXIS_PAKALNA), len(servicios), len(wa_conversaciones))
        return {
            "ok": True,
            "message": "Datos de simulación sembrados con éxito",
            "taxis": len(DEMO_TAXIS),
            "taxis_pakalna": len(DEMO_TAXIS_PAKALNA),
            "taxis_foraneos": len(DEMO_TAXIS_FORANEOS),
            "servicios": len(servicios),
            "conversaciones_wa": len(wa_conversaciones),
            "operadores": [t["usuario"] for t in DEMO_TAXIS],
            "contrasena_operadores": "taxi123",
            "usuario_terminal": "central",
            "contrasena_terminal": "central123",
        }

    def _haversine_dist_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        R = 6371000.0
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
        a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    def _calc_azimuth_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dl = math.radians(lon2 - lon1)
        y = math.sin(dl) * math.cos(p2)
        x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
        return round((math.degrees(math.atan2(y, x)) + 360) % 360, 1)

    def _init_pistas_metricas():
        """Calcula distancias acumuladas y rumbos exactos para interpolación continua a escala milimétrica."""
        for pid, p in PALENQUE_PISTAS_VIALES.items():
            pts = p.get("puntos", [])
            if not pts:
                continue
            cum_dist = [0.0]
            bearings = []
            for i in range(len(pts) - 1):
                p1, p2 = pts[i], pts[i + 1]
                d = _haversine_dist_m(p1[0], p1[1], p2[0], p2[1])
                cum_dist.append(cum_dist[-1] + d)
                bearings.append(_calc_azimuth_bearing(p1[0], p1[1], p2[0], p2[1]))
            bearings.append(bearings[-1] if bearings else 0.0)
            p["cum_dist"] = cum_dist
            p["total_dist"] = cum_dist[-1]
            p["bearings_fwd"] = bearings

    def _interpolar_posicion_pista(pista: dict, dist_m: float):
        """Interpola exactamente lat, lng y rumbo sobre la pista vial según la distancia recorrida."""
        cum_dist = pista.get("cum_dist", [0.0])
        pts = pista.get("puntos", [])
        bearings = pista.get("bearings_fwd", [])
        total = pista.get("total_dist", 0.0)
        if not pts or total <= 0:
            return (pts[0][0], pts[0][1], 0.0) if pts else (17.5099, -91.9847, 0.0)

        d = max(0.0, min(total, dist_m))
        idx = 0
        for i in range(len(cum_dist) - 1):
            if cum_dist[i] <= d <= cum_dist[i + 1]:
                idx = i
                break
            elif d > cum_dist[i + 1]:
                idx = i

        seg_len = cum_dist[idx + 1] - cum_dist[idx]
        frac = 0.0 if seg_len <= 1e-6 else (d - cum_dist[idx]) / seg_len
        p1 = pts[idx]
        p2 = pts[idx + 1]
        lat = p1[0] + frac * (p2[0] - p1[0])
        lng = p1[1] + frac * (p2[1] - p1[1])
        brg = bearings[idx] if idx < len(bearings) else 0.0
        return lat, lng, brg

    async def _bucle_patrullaje():
        """Bucle de patrullaje vial continuo que recorre las calles de Palenque a velocidad urbana realista (< 40 km/h)."""
        nonlocal _simulacion_activa
        _init_pistas_metricas()
        logger.info("Iniciando bucle de patrullaje continuo a velocidad realista (< 40 km/h) sobre pistas viales de Palenque...")
        while _simulacion_activa:
            ts = now_iso()
            for taxi in DEMO_TAXIS + DEMO_TAXIS_PAKALNA + DEMO_TAXIS_FORANEOS:
                u = taxi["usuario"]
                op = await db.operadores.find_one({"usuario": u})
                if not op:
                    continue
                if op.get("estado") == "fuera_de_servicio":
                    continue
                # Si el operador tiene un socket activo, está conectado o tiene telemetría GPS real,
                # excluirlo de la simulación para que el mapa muestre únicamente su ubicación física real.
                op_id_str = str(op["_id"])
                if (
                    len(manager.operadores.get(op_id_str, [])) > 0
                    or op.get("gps_real") is True
                    or op.get("en_linea_real") is True
                ):
                    continue
                pista = PALENQUE_PISTAS_VIALES.get(taxi["pista_id"], {})
                cum_dist = pista.get("cum_dist", [])
                total_dist = pista.get("total_dist", 0.0)
                doble_sentido = pista.get("doble_sentido", False)
                if not cum_dist or total_dist <= 0:
                    continue

                # Inicializar posición métrica si no existe
                if "dist_m" not in taxi:
                    init_idx = min(taxi.get("idx", 0), len(cum_dist) - 1)
                    taxi["dist_m"] = cum_dist[init_idx]

                sentido_dir = taxi.get("sentido_direccion", "adelante")
                # Velocidad estrictamente controlada < 40 km/h (promedio urbano 26 a 34 km/h)
                speed_kmh = round(random.uniform(26.0, 34.0), 1)
                speed_ms = round(speed_kmh / 3.6, 2)
                dt = 2.0
                step_m = speed_ms * dt  # ~14.4 a 18.8 metros por ciclo

                if sentido_dir == "adelante":
                    taxi["dist_m"] += step_m
                    if taxi["dist_m"] >= total_dist:
                        if doble_sentido:
                            overshoot = taxi["dist_m"] - total_dist
                            taxi["dist_m"] = max(0.0, total_dist - overshoot)
                            sentido_dir = "reversa"
                        else:
                            taxi["dist_m"] = taxi["dist_m"] % total_dist
                else:  # reversa en calles de doble sentido
                    taxi["dist_m"] -= step_m
                    if taxi["dist_m"] <= 0.0:
                        if doble_sentido:
                            taxi["dist_m"] = abs(taxi["dist_m"])
                            sentido_dir = "adelante"
                        else:
                            taxi["dist_m"] = total_dist - abs(taxi["dist_m"])

                taxi["sentido_direccion"] = sentido_dir
                new_lat, new_lng, brg_fwd = _interpolar_posicion_pista(pista, taxi["dist_m"])
                heading = round((brg_fwd + 180) % 360, 1) if sentido_dir == "reversa" else brg_fwd

                op_id = str(op["_id"])
                op_sitio = op.get("sitio_id") or taxi.get("sitio_id") or DEFAULT_SITIO

                track_pt = [round(new_lat, 6), round(new_lng, 6), ts]
                await db.operadores.update_one(
                    {"_id": op["_id"]},
                    {
                        "$set": {
                            "lat": round(new_lat, 6),
                            "lng": round(new_lng, 6),
                            "gps_speed": speed_ms,
                            "gps_heading": heading,
                            "sentido_direccion": sentido_dir,
                            "ultima_actualizacion": ts,
                        },
                        "$push": {
                            "track": {
                                "$each": [track_pt],
                                "$slice": -45
                            }
                        }
                    }
                )
                if op.get("vehiculo_id"):
                    await db.vehiculos.update_one(
                        {"_id": to_oid(op["vehiculo_id"])},
                        {
                            "$set": {
                                "lat": round(new_lat, 6),
                                "lng": round(new_lng, 6),
                                "ultima_actualizacion": ts,
                            }
                        }
                    )

                ubi_msg = {
                    "type": "ubicacion",
                    "operador_id": op_id,
                    "sitio_id": op_sitio,
                    "lat": round(new_lat, 6),
                    "lng": round(new_lng, 6),
                    "gps_speed": speed_ms,
                    "gps_heading": heading,
                    "sentido_direccion": sentido_dir,
                    "es_foraneo": op.get("es_foraneo", False),
                    "destino_foraneo": op.get("destino_foraneo", ""),
                    "ts": ts
                }
                await manager.broadcast_terminal(ubi_msg, sitio_id=op_sitio)
                await _notificar_dueno_de_operador(op_id, ubi_msg)
                activo_pas = await db.servicios.find_one({
                    "operador_asignado_id": op_id,
                    "pasajero_id": {"$exists": True, "$ne": None},
                    "estado": {"$in": ["asignado", "en_curso"]},
                })
                if activo_pas:
                    await manager.send_pasajero(activo_pas["pasajero_id"], {
                        "type": "ubicacion",
                        "servicio_id": str(activo_pas["_id"]),
                        "lat": round(new_lat, 6),
                        "lng": round(new_lng, 6),
                        "gps_heading": heading,
                        "gps_speed": speed_ms,
                        "ts": ts,
                    })

            await asyncio.sleep(2.0)

    def _iniciar_patrullaje():
        nonlocal _simulacion_activa, _simulacion_task
        if not _simulacion_activa:
            _simulacion_activa = True
            _simulacion_task = asyncio.create_task(_bucle_patrullaje())
            logger.info("Patrullaje GPS continuo activado.")

    def _detener_patrullaje():
        nonlocal _simulacion_activa, _simulacion_task
        _simulacion_activa = False
        if _simulacion_task:
            _simulacion_task.cancel()
            _simulacion_task = None
            logger.info("Patrullaje GPS continuo detenido.")

    @router.post("/seed")
    async def seed(request: Request = None):
        """Siembra de datos. En entorno de tests (`taxihub_test`) siembra la línea
        base rápida de 5 operadores sin lanzar tareas en background; en entorno de
        demostración/desarrollo siembra los 25 taxis + 2º tenant y activa patrullaje."""
        if isinstance(request, Request) and os.environ.get("ENV", "").lower() == "production":
            await _require_terminal_or_dev(request)
        if os.environ.get("DB_NAME") == "taxihub_test" or "PYTEST_CURRENT_TEST" in os.environ:
            return await _sembrar_baseline_tests()
        res = await sembrar_datos_simulacion()
        _iniciar_patrullaje()
        res["patrullaje_activo"] = True
        return res

    @router.post("/simulacion/sembrar")
    async def api_simulacion_sembrar(request: Request):
        if os.environ.get("ENV", "").lower() == "production":
            await _require_terminal_or_dev(request)
        res = await sembrar_datos_simulacion()
        return res

    @router.post("/simulacion/iniciar")
    async def api_simulacion_iniciar(request: Request):
        if os.environ.get("ENV", "").lower() == "production":
            await _require_terminal_or_dev(request)
        _iniciar_patrullaje()
        return {"ok": True, "mensaje": f"Patrullaje GPS de {len(DEMO_TAXIS)} taxis iniciado en tiempo real"}

    @router.post("/simulacion/detener")
    async def api_simulacion_detener(request: Request):
        if os.environ.get("ENV", "").lower() == "production":
            await _require_terminal_or_dev(request)
        _detener_patrullaje()
        return {"ok": True, "mensaje": "Patrullaje GPS detenido"}

    @router.get("/pistas-viales")
    async def api_pistas_viales():
        """Retorna las pistas viales predeterminadas y únicas sobre las calles reales de Palenque."""
        return list(PALENQUE_PISTAS_VIALES.values())

    @router.get("/simulacion/estado")
    async def api_simulacion_estado():
        count_taxis = await db.operadores.count_documents({})
        count_servicios = await db.servicios.count_documents({})
        count_wa = await db.wa_conversaciones.count_documents({})
        return {
            "patrullaje_activo": _simulacion_activa,
            "taxis_total": count_taxis,
            "servicios_total": count_servicios,
            "conversaciones_wa": count_wa,
        }

    return SimpleNamespace(
        router=router,
        seed=seed,
        sembrar_datos_simulacion=sembrar_datos_simulacion,
        _iniciar_patrullaje=_iniciar_patrullaje,
        _detener_patrullaje=_detener_patrullaje,
    )
