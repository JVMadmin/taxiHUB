import asyncio
import motor.motor_asyncio

import os

async def main():
    db_name = os.environ.get("DB_NAME", "taxihub_prod")
    client = motor.motor_asyncio.AsyncIOMotorClient("mongodb://taxihub-mongo:27017")
    db = client[db_name]
    # Reset op1..op5 to simulation
    await db.operadores.update_many(
        {"usuario": {"$in": ["op1", "op2", "op3", "op4", "op5"]}},
        {"$set": {"en_linea_real": False, "gps_real": False, "estado": "libre"}}
    )
    # Check op1 to op5
    ops = await db.operadores.find({"usuario": {"$in": ["op1", "op2", "op3", "op4", "op5"]}}).to_list(10)
    for op in ops:
        print(f"User: {op['usuario']}, ID: {op['_id']}, Placa: {op.get('placa')}, Estado: {op.get('estado')}, GPS_Real: {op.get('gps_real')}, Lat/Lng: ({op.get('lat')}, {op.get('lng')}), Update: {op.get('ultima_actualizacion')}")

asyncio.run(main())
