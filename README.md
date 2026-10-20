# TaxiHUB

Plataforma de despacho para centrales y sitios de taxi: Terminal de despacho con mapa en tiempo real,
app del chofer, app del pasajero, portal de socios (dueños de flota) y landing pública.
Demo en vivo: <https://taxihub.cloud>.

## Stack
- **Backend**: FastAPI + MongoDB (motor), WebSockets, JWT por rol. `backend/`
- **Frontend**: React 19 (CRA + CRACO), Tailwind, shadcn/ui, Leaflet. `frontend/`
- **Móvil**: Capacitor (Android) para las apps de chofer, pasajero y socio.

## Desarrollo local
```bash
# Backend con Mongo en memoria (siembra la flota demo al arrancar)
cd backend
pip install -r requirements.txt
MONGO_URL=memory DB_NAME=taxihub_demo uvicorn server:app --port 8001

# Frontend (otra terminal)
cd frontend
yarn install
yarn start            # http://localhost:3000 → /terminal, /operador, /pasajero, /dueno, /dev
```

## Pruebas
```bash
cd backend
python -m pytest -q   # suites en tests/, sobre mongomock
```

## Despliegue
Ver [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) y `scripts/deploy_vps.sh`.

## Documentación
- [AGENTS.md](AGENTS.md): arquitectura, convenciones y reglas para agentes.
- [memory/PRD.md](memory/PRD.md): historial de fases y funcionalidades.
- [docs/](docs/): diseño de cada fase.
