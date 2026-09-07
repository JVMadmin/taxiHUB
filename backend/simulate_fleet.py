"""Simulador de Flota, Servicios y WhatsApp en Vivo para taxiHUB (Palenque, Chiapas).

Crea datos completos para una simulación operativa:
1. 6 taxis con información completa, vehículos y estados (libres, ocupados, en pausa).
2. Trazado de recorridos GPS previos (track) para cada taxi.
3. Conversaciones de WhatsApp con ubicaciones compartidas y semáforos de urgencia (<2m, 2-5m, >5m).
4. Servicios activos (en curso, pendientes de asignar) y completados para las métricas del día.
5. Bucle de patrullaje GPS en tiempo real para que los taxis se muevan continuamente en el mapa.
"""

import asyncio
import os
import sys
import math
import random
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import bcrypt

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://mongo:27017")
DB_NAME = os.environ.get("DB_NAME", "taxihub_test")
DEFAULT_SITIO = "default"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

def now_iso(offset_minutes=0):
    dt = datetime.now(timezone.utc) + timedelta(minutes=offset_minutes)
    return dt.isoformat()

def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

# Puntos clave en Palenque, Chiapas
PALENQUE_POINTS = {
    "parque_central": (17.5098, -91.9820),
    "terminal_ado": (17.5140, -91.9855),
    "maya_tulipanes": (17.5160, -91.9812),
    "plaza_flores": (17.5045, -91.9750),
    "hospital_general": (17.5060, -91.9780),
    "super_che": (17.5125, -91.9840),
    "la_canada": (17.5180, -91.9790),
    "pakal_na": (17.5250, -91.9600),
    "base_poniente": (17.5120, -91.9880),
}

# Rutas de patrullaje en loop para cada taxi
PATROL_ROUTES = [
    # Ruta 1: Circuito Centro - Parque - Mercado
    [
        (17.5098, -91.9820), (17.5108, -91.9830), (17.5120, -91.9840),
        (17.5135, -91.9835), (17.5125, -91.9815), (17.5105, -91.9810),
    ],
    # Ruta 2: Circuito ADO - La Cañada
    [
        (17.5140, -91.9855), (17.5155, -91.9835), (17.5170, -91.9810),
        (17.5180, -91.9790), (17.5165, -91.9820), (17.5145, -91.9845),
    ],
    # Ruta 3: Corredor Hotelero - Periférico
    [
        (17.5160, -91.9812), (17.5145, -91.9790), (17.5120, -91.9770),
        (17.5090, -91.9760), (17.5110, -91.9790), (17.5140, -91.9805),
    ],
    # Ruta 4: Plaza Las Flores - Hospital
    [
        (17.5045, -91.9750), (17.5060, -91.9780), (17.5075, -91.9800),
        (17.5085, -91.9780), (17.5070, -91.9760), (17.5050, -91.9740),
    ],
]

def generate_track_history(center_lat, center_lng, points=15):
    """Genera un historial de puntos para que 'Ver recorrido' muestre una ruta suave."""
    track = []
    base_time = datetime.now(timezone.utc) - timedelta(minutes=points * 2)
    lat, lng = center_lat, center_lng
    for i in range(points):
        lat += (random.random() - 0.5) * 0.0006
        lng += (random.random() - 0.5) * 0.0006
        ts = (base_time + timedelta(minutes=i * 2)).isoformat()
        track.append([round(lat, 6), round(lng, 6), ts])
    return track

async def seed_simulation_data():
    print("[SIMULADOR] Sembrando datos operativos de prueba en Palenque...")

    # 1. Asegurar catálogo de tipos de vehículo
    tipo_estandar = await db.tipos_vehiculo.find_one({"nombre": "Taxi estándar"})
    tipo_id = str(tipo_estandar["_id"]) if tipo_estandar else None

    # 2. Rutas
    rutas_data = [
        {"nombre": "Palenque - Pakal Ná", "color_hex": "#4F5DFF"},
        {"nombre": "Centro - La Cañada", "color_hex": "#7CFC3C"},
        {"nombre": "Circuito Hotelero", "color_hex": "#FFB224"},
    ]
    rutas_ids = []
    for r in rutas_data:
        existente = await db.rutas.find_one({"nombre": r["nombre"]})
        if existente:
            rutas_ids.append(str(existente["_id"]))
        else:
            ins = await db.rutas.insert_one(r)
            rutas_ids.append(str(ins.inserted_id))

    # 3. Flota de 6 taxis operativos
    taxis = [
        {
            "usuario": "op1",
            "nombre": "Carlos Ramírez",
            "telefono": "916-200-0001",
            "placa": "TX-101",
            "marca": "Nissan", "modelo": "March", "color": "Blanco",
            "estado": "libre", # DISPONIBLE (verde neón)
            "pos": PALENQUE_POINTS["parque_central"],
            "speed": 0.0, "heading": 90, "accuracy": 3.8,
            "ruta": rutas_ids[0],
        },
        {
            "usuario": "op2",
            "nombre": "Ana Torres",
            "telefono": "916-200-0002",
            "placa": "TX-102",
            "marca": "Chevrolet", "modelo": "Aveo", "color": "Gris",
            "estado": "libre", # DISPONIBLE (verde neón)
            "pos": PALENQUE_POINTS["terminal_ado"],
            "speed": 5.2, "heading": 180, "accuracy": 4.1,
            "ruta": rutas_ids[1],
        },
        {
            "usuario": "op3",
            "nombre": "Luis Méndez",
            "telefono": "916-200-0003",
            "placa": "TX-103",
            "marca": "Toyota", "modelo": "Yaris", "color": "Café",
            "estado": "ocupado", # OCUPADO (rojo)
            "pos": PALENQUE_POINTS["la_canada"],
            "speed": 8.9, "heading": 45, "accuracy": 4.5,
            "ruta": rutas_ids[1],
        },
        {
            "usuario": "op4",
            "nombre": "José Hernández",
            "telefono": "916-200-0004",
            "placa": "TX-104",
            "marca": "Nissan", "modelo": "Versa", "color": "Rojo",
            "estado": "libre", # DISPONIBLE (verde neón)
            "pos": PALENQUE_POINTS["plaza_flores"],
            "speed": 3.6, "heading": 270, "accuracy": 3.2,
            "ruta": rutas_ids[2],
        },
        {
            "usuario": "op5",
            "nombre": "Roberto Morales",
            "telefono": "916-200-0005",
            "placa": "TX-105",
            "marca": "Volkswagen", "modelo": "Vento", "color": "Plata",
            "estado": "libre", # DISPONIBLE (verde neón)
            "pos": PALENQUE_POINTS["maya_tulipanes"],
            "speed": 0.0, "heading": 0, "accuracy": 3.0,
            "ruta": rutas_ids[2],
        },
        {
            "usuario": "op6",
            "nombre": "Miguel Sánchez",
            "telefono": "916-200-0006",
            "placa": "TX-106",
            "marca": "Nissan", "modelo": "Tsuru", "color": "Blanco",
            "estado": "no_disponible", # EN RECESO (ámbar)
            "pos": PALENQUE_POINTS["base_poniente"],
            "speed": 0.0, "heading": 120, "accuracy": 6.0,
            "ruta": rutas_ids[0],
        },
    ]

    operador_ids = {}
    for t in taxis:
        lat, lng = t["pos"]
        track = generate_track_history(lat, lng, 12)
        op_doc = {
            "nombre": t["nombre"],
            "telefono": t["telefono"],
            "placa": t["placa"],
            "ruta_asignada": t["ruta"],
            "usuario": t["usuario"],
            "password_hash": hash_pw("taxi123"),
            "estado": t["estado"],
            "lat": lat,
            "lng": lng,
            "gps_speed": t["speed"],
            "gps_heading": t["heading"],
            "gps_accuracy": t["accuracy"],
            "ultima_actualizacion": now_iso(),
            "sitio_id": DEFAULT_SITIO,
            "activo": True,
            "track": track,
        }
        existente = await db.operadores.find_one({"usuario": t["usuario"]})
        if existente:
            await db.operadores.update_one({"_id": existente["_id"]}, {"$set": op_doc})
            op_id = str(existente["_id"])
        else:
            ins = await db.operadores.insert_one(op_doc)
            op_id = str(ins.inserted_id)
        operador_ids[t["usuario"]] = op_id

        # Vehículo vinculado
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
            "lat": lat,
            "lng": lng,
            "ultima_actualizacion": now_iso(),
            "tipo_vehiculo_id": tipo_id,
        }
        await db.vehiculos.update_one(
            {"numero_economico": t["placa"]},
            {"$set": v_doc},
            upsert=True
        )
        v_obj = await db.vehiculos.find_one({"numero_economico": t["placa"]})
        await db.operadores.update_one({"_id": existente["_id"] if existente else ins.inserted_id},
                                      {"$set": {"vehiculo_id": str(v_obj["_id"])}})

    print(f"[SIMULADOR] {len(taxis)} taxis operativos configurados con posiciones GPS activas en Palenque.")

    # 4. Servicios de prueba
    await db.servicios.delete_many({})

    servicios_sim = [
        # Servicio 1: En curso con el taxi TX-103
        {
            "cliente_nombre": "Dr. Fernando Ruiz",
            "cliente_telefono": "916-555-0101",
            "origen": {"texto": "Hotel Ciudad Real, Palenque", "lat": 17.5100, "lng": -91.9830},
            "destino": {"texto": "Zona Arqueológica de Palenque", "lat": 17.4840, "lng": -92.0460},
            "estado": "en_curso",
            "operador_asignado_id": operador_ids["op3"],
            "costo": 180.0,
            "metodo_pago": "efectivo",
            "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-12),
            "timestamp_creacion": now_iso(-12),
            "timestamp_asignacion": now_iso(-10),
            "timestamp_inicio": now_iso(-6),
        },
        # Servicio 2: Pendiente de asignación en Super Che
        {
            "cliente_nombre": "Claudia Méndez",
            "cliente_telefono": "916-555-0202",
            "origen": {"texto": "Super Che Palenque, Av. Juárez", "lat": 17.5125, "lng": -91.9840},
            "destino": {"texto": "Colonia Pakal Ná Centro", "lat": 17.5250, "lng": -91.9600},
            "estado": "pendiente",
            "operador_asignado_id": None,
            "costo": 70.0,
            "metodo_pago": "efectivo",
            "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-3),
            "timestamp_creacion": now_iso(-3),
        },
        # Servicio 3: Pendiente de asignación en Hospital General
        {
            "cliente_nombre": "Mario Estrada",
            "cliente_telefono": "916-555-0303",
            "origen": {"texto": "Hospital General de Palenque", "lat": 17.5060, "lng": -91.9780},
            "destino": {"texto": "Fracc. San Juan, Casa 14", "lat": 17.5010, "lng": -91.9700},
            "estado": "pendiente",
            "operador_asignado_id": None,
            "costo": 55.0,
            "metodo_pago": "efectivo",
            "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-1),
            "timestamp_creacion": now_iso(-1),
        },
        # Servicios completados hoy (para las métricas del Topbar / Dashboard)
        {
            "cliente_nombre": "Sofía Castro", "cliente_telefono": "916-555-0404",
            "origen": {"texto": "Terminal ADO"}, "destino": {"texto": "Parque Central"},
            "estado": "completado", "operador_asignado_id": operador_ids["op1"],
            "costo": 50.0, "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-90), "timestamp_creacion": now_iso(-90), "timestamp_fin": now_iso(-70)
        },
        {
            "cliente_nombre": "Alberto Núñez", "cliente_telefono": "916-555-0505",
            "origen": {"texto": "Mercado Municipal"}, "destino": {"texto": "Hotel Chan-Kah"},
            "estado": "completado", "operador_asignado_id": operador_ids["op2"],
            "costo": 120.0, "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-60), "timestamp_creacion": now_iso(-60), "timestamp_fin": now_iso(-40)
        },
        {
            "cliente_nombre": "Lucía Domínguez", "cliente_telefono": "916-555-0606",
            "origen": {"texto": "Pakal Ná"}, "destino": {"texto": "Centro Médico"},
            "estado": "completado", "operador_asignado_id": operador_ids["op4"],
            "costo": 65.0, "sitio_id": DEFAULT_SITIO,
            "creado_en": now_iso(-45), "timestamp_creacion": now_iso(-45), "timestamp_fin": now_iso(-25)
        },
    ]
    await db.servicios.insert_many(servicios_sim)
    print(f"[SIMULADOR] {len(servicios_sim)} servicios insertados (1 en curso, 2 pendientes, 3 completados).")

    # 5. Conversaciones de WhatsApp para probar el Bloque 2
    await db.wa_conversaciones.delete_many({})

    wa_data = [
        # Conversación 1: María López -> Urgencia < 2 min (Gris/Neutro), con Ubicación
        # Más cercano: TX-105 (en Hotel Maya Tulipanes a sólo 80m)
        {
            "cliente_nombre": "María López",
            "cliente_telefono": "+52 916 100 0001",
            "creada_en": now_iso(-1),
            "actualizada_en": now_iso(-1),
            "mensajes": [
                {
                    "de": "cliente",
                    "texto": "Buenas tardes, ¿tienen un taxi disponible?",
                    "ts": now_iso(-2)
                },
                {
                    "de": "cliente",
                    "texto": "Estoy aquí en la recepción del Hotel Maya Tulipanes",
                    "lat": 17.5165,
                    "lng": -91.9810,
                    "ts": now_iso(-1)
                }
            ]
        },
        # Conversación 2: Dr. Alejandro Gómez -> Urgencia 2-5 min (Ámbar), con Ubicación
        # Más cercano: TX-104 en Plaza Las Flores / Hospital
        {
            "cliente_nombre": "Dr. Alejandro Gómez",
            "cliente_telefono": "+52 916 100 0002",
            "creada_en": now_iso(-4),
            "actualizada_en": now_iso(-3),
            "mensajes": [
                {
                    "de": "cliente",
                    "texto": "Hola central, salgo de guardia en el Hospital General",
                    "ts": now_iso(-4)
                },
                {
                    "de": "cliente",
                    "texto": "Comparto mi ubicación para que me recojan",
                    "lat": 17.5060,
                    "lng": -91.9780,
                    "ts": now_iso(-3)
                }
            ]
        },
        # Conversación 3: Elena Morales -> Urgencia > 5 min (Rojo + Badge URGENTE), con Ubicación
        # Más cercano: TX-102 en Terminal ADO
        {
            "cliente_nombre": "Elena Morales (ADO)",
            "cliente_telefono": "+52 916 100 0003",
            "creada_en": now_iso(-8),
            "actualizada_en": now_iso(-7),
            "mensajes": [
                {
                    "de": "cliente",
                    "texto": "Buenas tardes, ¿me pueden enviar una unidad a la Terminal ADO? Mi autobús acaba de llegar.",
                    "ts": now_iso(-8)
                },
                {
                    "de": "cliente",
                    "texto": "Aquí los espero afuera sobre la banqueta principal",
                    "lat": 17.5140,
                    "lng": -91.9855,
                    "ts": now_iso(-7)
                }
            ]
        },
        # Conversación 4: Pedro Santos -> Consulta general (para probar chips de respuesta rápida)
        {
            "cliente_nombre": "Pedro Santos (Turista)",
            "cliente_telefono": "+52 916 100 0004",
            "creada_en": now_iso(-15),
            "actualizada_en": now_iso(-10),
            "mensajes": [
                {
                    "de": "cliente",
                    "texto": "Hola, ¿cuánto cobran por un viaje a las cascadas de Misol-Ha?",
                    "ts": now_iso(-10)
                }
            ]
        }
    ]
    await db.wa_conversaciones.insert_many(wa_data)
    print(f"[SIMULADOR] {len(wa_data)} conversaciones de WhatsApp listas con ubicaciones y semáforos de urgencia.")

async def run_live_patrol(iterations=10000, interval_seconds=3):
    """Mueve los taxis de forma continua para que la Terminal cobre vida en tiempo real."""
    print(f"\n[SIMULADOR EN VIVO] Iniciando patrullaje GPS continuo (intervalo: {interval_seconds}s)...")

    taxis_activos = ["op1", "op2", "op3", "op4", "op5"]
    route_indices = {u: random.randint(0, len(PATROL_ROUTES[i % len(PATROL_ROUTES)]) - 1) for i, u in enumerate(taxis_activos)}

    step = 0
    while step < iterations:
        step += 1
        ts = now_iso()

        for i, u in enumerate(taxis_activos):
            route = PATROL_ROUTES[i % len(PATROL_ROUTES)]
            curr_idx = route_indices[u]
            target_idx = (curr_idx + 1) % len(route)

            start_lat, start_lng = route[curr_idx]
            end_lat, end_lng = route[target_idx]

            fraction = (step % 6) / 6.0
            new_lat = start_lat + (end_lat - start_lat) * fraction + (random.random() - 0.5) * 0.0001
            new_lng = start_lng + (end_lng - start_lng) * fraction + (random.random() - 0.5) * 0.0001

            if fraction == 0:
                route_indices[u] = target_idx

            speed = round(random.uniform(15.0, 35.0), 1)
            heading = round(math.degrees(math.atan2(end_lng - start_lng, end_lat - start_lat)) % 360, 1)

            await db.operadores.update_one(
                {"usuario": u},
                {
                    "$set": {
                        "lat": round(new_lat, 6),
                        "lng": round(new_lng, 6),
                        "gps_speed": round(speed / 3.6, 2),
                        "gps_heading": heading,
                        "gps_accuracy": round(random.uniform(3.0, 5.5), 1),
                        "ultima_actualizacion": ts,
                    },
                    "$push": {
                        "track": {
                            "$each": [[round(new_lat, 6), round(new_lng, 6), ts]],
                            "$slice": -30
                        }
                    }
                }
            )

        print(f"[SIMULADOR] Actualización GPS #{step} para 5 taxis en vivo.", end="\r")
        await asyncio.sleep(interval_seconds)

async def main():
    await seed_simulation_data()
    if "--live" in sys.argv or "-l" in sys.argv:
        await run_live_patrol()

if __name__ == "__main__":
    asyncio.run(main())
