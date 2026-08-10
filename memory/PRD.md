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

### Fase 2 — App del operador (2026-08-10)
- Login JWT, entrar/salir, botones de estado, selector de ruta, geolocalización cada ~9s.

### Fase 4 — Rutas (2026-08-10)
- Gestión de rutas (crear/editar nombre y color) desde el menú lateral de la Terminal (sección "Rutas").
- El operador ya selecciona su ruta al iniciar operación.

### Fase 5 — Reportes, chat y menú Terminal (2026-08-10)
- Backend: modelos `reportes_objetos` y `mensajes_chat`. Subida de foto a **Emergent Object Storage** (`POST /api/reportes`, servido por `GET /api/files/{path}`). Chat reutiliza el `ConnectionManager` (WS) existente vía `POST /api/mensajes` + `GET /api/mensajes`, `GET /api/conversaciones`. Reportes: `GET /api/reportes`, `PATCH /api/reportes/{id}/resolver`.
- App operador: botón "Reportar objeto" (cámara/galería + descripción), overlay de chat con la central en burbujas, cronómetro de tiempo en operación.
- Terminal: menú lateral derecho deslizable (no tapa el mapa) con secciones Asignar servicio, Operadores (todos), Clientes (con historial), Objetos reportados (miniatura + resolver), Chat (conversaciones + responder) y Rutas.
- Mejoras: "hace X seg" en la lista de taxis activos, buscador por nombre/unidad, cronómetro de operación en la app del operador.

### Fase 6 — Picking en mapa, multi-operadora, servicios del taxista, paletas (2026-08-10)
- Terminal: selección de origen/destino haciendo clic en el mapa dentro del formulario "Nueva llamada" (guarda lat/lng en el servicio); el rail del menú se repliega al abrir un panel; botones "Nuevo" para alta de operadores y clientes; sección "Servicios de hoy" (`GET /api/servicios/hoy`).
- Auth multi-operadora: colección `usuarios_terminal` + `POST /api/terminal/login` y `/api/terminal/usuarios`; ruta `/terminal/login`; default `central`/`central123`.
- App operador: "Iniciar servicio" (origen/destino/costo → estado ocupado) y "Terminar servicio" (→ libre); guardado en `servicios` con `tipo: "operador"`, `origen_texto`, `destino_texto`, `costo`.
- Paleta de colores (Terminal + operador): Esmeralda (default), Océano, Ámbar vía `data-theme` en localStorage.

## Backlog
- P0: Fase 2 — App del operador (login, entrar/salir, botones de estado, selector de ruta, geolocalización cada 8-10s).
- P1: Fase 4 — Gestión de rutas (crear/editar color) desde Terminal.
- P2: Auto-marcar operador como ocupado al asignar; historial de cliente por teléfono; polilíneas de ruta.

## Test credentials
Ver /app/memory/test_credentials.md (op1/op2/op3, contraseña taxi123).
