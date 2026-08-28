import asyncio
from pathlib import Path

import bcrypt
import motor.motor_asyncio

env = {}
for line in Path("backend/.env").read_text(encoding="utf-8").splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")

MES = "2026-08"


async def main():
    c = motor.motor_asyncio.AsyncIOMotorClient(env["MONGO_URL"])
    db = c[env["DB_NAME"]]
    await db.usuarios_dueno.delete_many({"usuario": "qa_full"})
    pw = bcrypt.hashpw(b"qa123456", bcrypt.gensalt()).decode()
    res = await db.usuarios_dueno.insert_one({"usuario": "qa_full", "nombre": "QA Full", "password_hash": pw, "activo": True})
    dueno_id = str(res.inserted_id)
    tipo = await db.tipos_vehiculo.find_one({"nombre": "Taxi estándar"})
    tipo_id = str(tipo["_id"]) if tipo else None
    op_pw = bcrypt.hashpw(b"op123456", bcrypt.gensalt()).decode()
    op_res = await db.operadores.insert_one({
        "usuario": "qa_cond", "password_hash": op_pw, "nombre": "QA Conductor",
        "telefono": "5551234567", "estado": "libre", "activo": True,
        "ultima_actualizacion": "2026-08-20T10:00:00+00:00",
    })
    op_id = str(op_res.inserted_id)
    v_res = await db.vehiculos.insert_one({
        "numero_economico": "QA-1", "placa": "QA123", "marca": "Nissan", "modelo": "Tsuru",
        "color": "Blanco", "anio": 2018, "estado": "activo", "activo": True,
        "operador_conductor_id": op_id, "propietario_id": dueno_id,
        "tipo_vehiculo_id": tipo_id, "lat": 17.5099, "lng": -91.9847, "odometro_km": 120000,
    })
    veh_id = str(v_res.inserted_id)
    for i in range(3):
        await db.servicios.insert_one({
            "operador_asignado_id": op_id, "vehiculo_id": veh_id, "estado": "completado",
            "timestamp_creacion": f"{MES}-10T09:0{i}:00", "completado_en": f"{MES}-10T09:{i}0:00",
            "costo": 80 + i * 10, "origen": {"texto": "Centro"}, "destino": {"texto": "Norte"},
        })
    await db.turnos_config.insert_one({
        "vehiculo_id": veh_id, "modo": "normal",
        "turnos": [{"tipo": "dia", "operador_id": op_id, "operador_nombre": "QA Conductor", "renta_semanal": 1500}],
        "actualizado": "2026-08-20T10:00:00+00:00",
    })
    await db.combustible_cargas.insert_one({
        "vehiculo_id": veh_id, "fecha": "2026-08-15", "litros": 40, "costo": 900,
        "odometro_km": 120000, "evidencia_url": None, "rendimiento_km_l": 12.5,
        "creado": "2026-08-15T10:00:00+00:00",
    })
    await db.socios_reparto.insert_one({
        "dueno_id": dueno_id, "nombre": "Socio Uno", "porcentaje": 50,
        "vehiculo_ids": [veh_id], "creado": "2026-08-01T10:00:00+00:00",
    })
    await db.mantenimientos.insert_one({
        "vehiculo_id": veh_id, "tipo": "aceite", "realizado_en": "2026-01-10",
        "odometro_km": 100000, "proximo_km": 105000, "proximo_en": "2026-02-10",
        "costo": 450, "notas": None, "creado": "2026-01-10T10:00:00+00:00",
    })
    await db.documentos_vehiculo.insert_one({
        "vehiculo_id": veh_id, "tipo": "verificacion", "vence_en": "2026-07-01",
        "actualizado": "2026-01-01T10:00:00+00:00",
    })
    await db.gastos_vehiculo.insert_one({
        "vehiculo_id": veh_id, "categoria": "mantenimiento", "monto": 1200,
        "fecha": "2026-08-05", "notas": None, "creado": "2026-08-05T10:00:00+00:00",
    })
    print("OK", dueno_id, veh_id, op_id)


asyncio.run(main())