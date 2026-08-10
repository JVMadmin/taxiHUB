# PRD — Central de Taxis / Flotillas

## Problem statement (original)
Plataforma de despacho para central de taxis con dos interfaces: Terminal (panel admin con mapa en tiempo real) y App del operador/taxista. Clientes sin app; sus datos se registran al crear un servicio. Tema oscuro. Construcción por fases.

## Arquitectura
- Backend: FastAPI + MongoDB (motor). Rutas bajo `/api`. JWT (Bearer) + bcrypt para login de operadores. WebSockets para tiempo real.
- Frontend: React + Tailwind + shadcn/ui. Leaflet (react-leaflet) con tiles oscuros CartoDB. Tema oscuro global.

## Personas
- Operadora/Admin (Terminal): recibe llamadas, ve taxis en el mapa, asigna servicios.
- Operador/Taxista (App): login, cambia estado, envía ubicación.

## Implementado
### Fase 1 — Backend (2026-08-10)
- Modelos: operadores, clientes, rutas, servicios.
- CRUD operadores/clientes/rutas; PATCH estado; POST ubicación (escritura ligera); crear/asignar servicio; listar activos.
- Auth login JWT + /auth/me. WebSockets /ws/terminal y /ws/operador/{id}. Endpoint /seed.

### Fase 3 — Terminal (2026-08-10)
- Mapa oscuro Leaflet a pantalla completa como elemento principal (`/` y `/terminal`).
- Marcadores de taxis coloreados por estado (verde/rojo/amarillo/gris) o por color de ruta al filtrar.
- Actualización en vivo vía WebSocket (ubicación/estado) sin recargar; indicador "En vivo".
- Panel lateral flotante: filtro por ruta + lista de taxis activos + leyenda.
- Modal "Nueva llamada": registra servicio y lo asigna a un taxi libre.

## Backlog
- P0: Fase 2 — App del operador (login, entrar/salir, botones de estado, selector de ruta, geolocalización cada 8-10s).
- P1: Fase 4 — Gestión de rutas (crear/editar color) desde Terminal.
- P2: Auto-marcar operador como ocupado al asignar; historial de cliente por teléfono; polilíneas de ruta.

## Test credentials
Ver /app/memory/test_credentials.md (op1/op2/op3, contraseña taxi123).
