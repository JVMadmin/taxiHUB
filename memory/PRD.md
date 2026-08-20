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
- Backend: modelos `reportes_objetos` y `mensajes_chat`. Subida de foto a almacenamiento local en disco (`POST /api/reportes`, servido por `GET /api/files/{path}`). Chat reutiliza el `ConnectionManager` (WS) existente vía `POST /api/mensajes` + `GET /api/mensajes`, `GET /api/conversaciones`. Reportes: `GET /api/reportes`, `PATCH /api/reportes/{id}/resolver`.
- App operador: botón "Reportar objeto" (cámara/galería + descripción), overlay de chat con la central en burbujas, cronómetro de tiempo en operación.
- Terminal: menú lateral derecho deslizable (no tapa el mapa) con secciones Asignar servicio, Operadores (todos), Clientes (con historial), Objetos reportados (miniatura + resolver), Chat (conversaciones + responder) y Rutas.
- Mejoras: "hace X seg" en la lista de taxis activos, buscador por nombre/unidad, cronómetro de operación en la app del operador.

### Fase 6 — Picking en mapa, multi-operadora, servicios del taxista, paletas (2026-08-10)
- Terminal: selección de origen/destino haciendo clic en el mapa dentro del formulario "Nueva llamada" (guarda lat/lng en el servicio); el rail del menú se repliega al abrir un panel; botones "Nuevo" para alta de operadores y clientes; sección "Servicios de hoy" (`GET /api/servicios/hoy`).
- Auth multi-operadora: colección `usuarios_terminal` + `POST /api/terminal/login` y `/api/terminal/usuarios`; ruta `/terminal/login`; default `central`/`central123`.
- App operador: "Iniciar servicio" (origen/destino/costo → estado ocupado) y "Terminar servicio" (→ libre); guardado en `servicios` con `tipo: "operador"`, `origen_texto`, `destino_texto`, `costo`.
- Paleta de colores (Terminal + operador): Esmeralda (default), Océano, Ámbar vía `data-theme` en localStorage.

### Fase 6b — Tarifas, sesión/contador persistente (2026-08-10)
- Backend: modelo `tarifas_predefinidas` (nombre, monto, tipo, orden) + CRUD; servicio con `tarifa_id`; operador con `inicio_operacion` (timestamp) seteado en el endpoint de estado; login rechaza cuentas `activo:false`.
- Terminal: sección "Tarifas" (crear/editar/eliminar nombre+precio).
- App operador: "Iniciar servicio" muestra botones de tarifa (un toque = crear servicio + ocupado) + "Precio libre"; origen/destino OPCIONALES. Contador de operación calculado como `ahora - inicio_operacion` (no timer local, persiste al reabrir). Sesión persistida (token localStorage). Wake Lock API para mantener pantalla activa en turno.

### Fase 7 — Fotos de perfil, panel de desarrollador, pulido (2026-08-10)
- Backend: `foto_url` en operadores y usuarios_terminal; subida reutilizando el almacenamiento local (`POST /api/perfil/{coleccion}/{id}/foto`, servida por `/api/files/{path}`). Logo en `config` (`POST /api/dev/logo`, `GET /api/config/logo`). Panel dev: `POST /api/dev/login`, `GET /api/dev/cuentas`, `PATCH /api/dev/cuentas/...` (activar/desactivar), `GET /api/dev/backup` (export JSON), `GET /api/dev/auditoria`.
- Frontend: fotos de perfil en headers de Terminal y operador; página `/dev` con login propio y pestañas Logotipo, Cuentas, Respaldo, Auditoría. Micro-interacciones globales (active:scale) sobre el tema oscuro.

### Fase 8 — Plataforma profesional de sitio de taxis (2026-08-15)
- Flota: colección `vehiculos` (número económico, placas, marca, modelo, color, estado, activo, sitio) + `vehiculo_id` en el conductor. Migración segura: backfill de un vehículo por conductor desde su `placa` (sin borrar nada).
- Multisitio: colección `sitios` + `sitio_id` (default `default`) en operadores/clientes/servicios/vehículos; aislamiento de datos listo.
- Estados: nuevo estado `averiado` (OUT_OF_SERVICE) y máquina de transiciones **validada en backend** (un conductor con servicio activo no puede soltarse; averiado no puede quedar libre/ocupado).
- GPS profesional: `POST /api/locations` (accuracy, speed, heading, battery, timestamp) + alias `/operadores/{id}/ubicacion`; frescura con umbral configurable `config.gps_stale_seconds` (120s); listo para foreground service en Android.
- Servicios/ride: ciclo completo `pendiente → ofrecido → asignado → en_curso → completado` (+ cancelado/vencido/rechazado); **asignación atómica** (update con condición de estado + `matched_count`); endpoints `aceptar/rechazar/cancelar/iniciar/terminar`; radio del taxista conservado.
- Despacho v1: `GET /api/dispatch/candidates` y `POST /api/dispatch/offer`; elige taxis `libre` con GPS fresco ordenados por Haversine; TTL de ofertas configurable.
- Privacidad GPS (obligatoria): canal WS por pasajero (`/ws/pasajero/{id}`) y del viaje activo que solo expone el taxi asignado tras la asignación; el pasajero nunca accede a la flota.
- Seguridad: scopes JWT por rol (operador/terminal/pasajero/dev) y dependencias FastAPI; operador solo su propia cuenta; pasajero solo su servicio; operadora + `sitio_id`. Frontend usa `termApi`/`devApi` con sus tokens correspondientes.
- Terminal (web): popup de taxi ampliado (vehículo, GPS, última actualización), panel de servicios con pestañas/contadores + Despachar (candidatos) + entrega manual atómica, sección "Vehículos / Flota" con CRUD, leyenda con `averiado`. App operador: instancia de aceptar/rechazar/iniciar/terminar para servicios digitales y Carga de sus servicios activos al abrir.
- Config: `POST /api/config/set`, `GET /api/config/{key}` (umbrales GPS y TTL).
- Tests: 10 pruebas (concurrencia 2→1, GPS, transiciones inválidas, privacidad pasajero, ciclo completo, cancelación, despacho por distancia, scopes, oferta vencida, rechazo→recofrecer) vía pytest-xdist sobre mongomock-motor.

### Fase 8.2 — Passenger App web + Driver App web operativas (2026-08-16)
- **Passenger App web** (`/pasajero`): registro/inicio de sesión, solicitar taxi (origen por GPS o clic en mapa, destino con marcador), mapa en vivo con su taxi asignado (WS autenticado del pasajero), tarjeta del conductor/unidad/GPS, cancelación, historial. Data-testids en `constants/testIds/passenger.js`.
- **Driver App web** (ya existente en `/operador`): aceptar/rechazar oferta, iniciar/terminar, estado, GPS, tarifas, chat, reportes.
- Credenciales de prueba sembradas para `maria`/`taxi123` (pasajero). Enlaces cruzados entre apps en los logins.

### Fase 8.1 — Estabilización (2026-08-16)
- Validación con **MongoDB real** (8.0 portable local) y E2E del Dispatcher con **Playwright**: solicitud → despacho → asignación → aceptación → seguimiento → completado, todo en verde (incluye tiempo real por WS autenticado).
- **WebSockets protegidos**: `/ws/terminal`, `/ws/operador/{id}`, `/ws/pasajero/{id}` requieren token JWT (`?token=`) con scope y sujeto correctos; inválidos se cierran con 1008. (La causa del 404 inicial: uvicorn sin librería `websockets`.)
- Fix UX: al despachar, el panel de servicios pasa a la pestaña `ofrecido` para mostrar los candidatos de asignación.

### Fase 9 — Rediseño UX/UI profesional + navegación GPS + experiencia de conductor (2026-08-16)
- **Design System centralizado** (`index.css` + `tailwind.config.js`): tokens de marca multi-paleta (esmeralda/oceano/ámbar) vía variables CSS `--brand`, superficies (`surface`, `surface-2`, `surface-3`), elevaciones (`elev-1/2/3`), clases de sistema (`glass-panel` funcional, `chip`, `th-skeleton`, `btn-primary-elev`/`btn-danger-elev` con elevación sutil), scrollbars/selección/focus temáticos, animaciones estándar (fade/slide/scale/ping/pulse-ring) y `prefers-reduced-motion`.
- **Identidad taxiHUB**: `BrandMark` + `BrandWordmark` (wordmark con "HUB" en acento) reutilizados en Terminal, logins y Passenger.
- **Componentes compartidos reutilizables**: `EstadoBadge`/`ServicioBadge`/`DriverStatusPill` (nunca color únicamente: punto + texto), `ConnectionBadge` (online/reconnecting/offline), `GpsBadge` (activo + precisión o alerta), `EmptyState` profesional, `ConfirmAction` (confirmaciones para acciones críticas), `ServiciosPanel` (tarjetas de servicio rediseñadas + despacho + candidatos, reutilizado por Dispatcher y menú Terminal), `BottomSheet`.
- **Dispatcher profesional** (`Terminal.jsx`): header con identidad, sitio, hora en vivo, estado del sistema, conexión; barra de indicadores en tiempo real (Disponibles/Ocupados/Pausados/Offline/Averiados); sidebar rediseñado con chips de filtro; tray de servicios en vivo; **panel del taxi seleccionado** (unidad, estado, conductor, vehículo, ruta, precisión GPS, velocidad, actualización, "Seguir taxi", "Ver servicio"); selección desde mapa o lista; popup ampliado; sidebar/tray responsive.
- **Flota/Administración** (`TerminalMenu.jsx`): paneles rediseñados con estados vacíos, buscador en operadores/vehículos, filtros de flota (Todos/Disponibles/Ocupados/Offline/Averiados), edición inline de vehículos, confirmaciones para eliminar vehículos/tarifas y finalizar viajes, sección servicios reutiliza `ServiciosPanel`.
- **App del conductor** (`OperadorApp.jsx`): **mapa a pantalla completa con navegación GPS** — posición del vehículo (icono con rumbo), marcador del cliente/destino, **polilínea de ruta real sobre calles (OSRM)**, distancia + ETA en vivo, recalculo al moverse; bottom sheet que cambia según el estado (oferta con cuenta regresiva y botón Aceptar/Rechazar grande, "Llegué al cliente", "Finalizar viaje" con confirmación); estado del conductor siempre visible; indicador GPS discreto (precisión); indicador de conexión (online/reconectando/offline) + banner de sin-internet; botón recentrar; servicio propio con confirmación; skeletons/estados vacíos.
- **Passenger App** (`PassengerApp.jsx`): alineada visualmente (identidad taxiHUB, badges de estado, empty states, botones elevados); mapas y flujo sin cambios funcionales.
- **Logins** (`OperadorLogin.jsx`, `TerminalLogin.jsx`): identidad de marca + fondo con brillo sutil + botones elevados.
- **Rutas + ETA** (backend): `POST /api/routing/route` (operador o terminal; nunca pasajero). Proveedor OSRM abierto/gratuito configurable (`ROUTING_PROVIDER_URL`, `ROUTING_TIMEOUT_SECONDS`) con **fallback automático a línea recta (Haversine)** si el proveedor falla; devuelve `distance_m`, `duration_s` y geometría GeoJSON. Cliente: `lib/geo.js` (haversine, formatos, rumbo) + hook `useRouting` (recalcula solo al moverse ≥60 m). Sin dependencias nuevas.
- **Microinteracciones** donde aportan (aparición de servicios, cambio de estado, selección de taxi, paneles), sin animar todo. Estados de carga (skeleton/spinner), empty y error (mensajes entendibles, detalles en consola).
- Tests: 3 nuevas pruebas de routing (auth obligatoria, fallback Haversine, acepta operador) — 13/13 verdes sobre mongomock-motor. Build frontend OK (`craco build`).

## Backlog
- P3: ETA/zonas/prioridad en el despacho; turnos y rotación; polilíneas de ruta; app móvil Android (GPS en segundo plano) e iOS; pago card/online; job en segundo plano para expiraciones; índices geoespaciales 2dsphere para flotas grandes.
- P0: Fase 2 — App del operador (login, entrar/salir, botones de estado, selector de ruta, geolocalización cada 8-10s).
- P1: Fase 4 — Gestión de rutas (crear/editar color) desde Terminal.
- P2: Auto-marcar operador como ocupado al asignar; historial de cliente por teléfono; polilíneas de ruta.

## Test credentials
Ver /app/memory/test_credentials.md (op1/op2/op3, contraseña taxi123).
