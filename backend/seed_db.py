#!/usr/bin/env python3
"""
TaxiHUB — Script de Inicialización y Sembrado de Base de Datos (Producción y Staging)
Ejecuta la siembra completa y reproducible de entidades multi-tenant:
- Tenants / Sitios (Radio Taxis Palenque + Sitio Pakal-Ná)
- Usuarios de Terminal (admin, despachador) y Socios Dueños (socio_roberto, etc.)
- Flota de 30 vehículos y operadores vinculados con fotografías y documentación
- Colonias con polígonos geoespaciales y tarifas por zona
- Tarifas diurnas/nocturnas predefinidas
- Conversaciones y reportes iniciales
"""

import asyncio
import logging
import os
import sys

# Asegurar path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from server import sembrar_datos_simulacion, db, mongo_url, db_name

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("seed_db")

async def main():
    logger.info("Iniciando sembrado de TaxiHUB...")
    logger.info("Conectado a MongoDB: %s / DB: %s", mongo_url, db_name)
    
    try:
        resultado = await sembrar_datos_simulacion()
        logger.info("Sembrado completado con éxito!")
        for k, v in resultado.items():
            logger.info("  %s: %s", k, v)
    except Exception as e:
        logger.error("Error durante el sembrado: %s", e, exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
