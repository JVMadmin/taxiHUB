# FASE 1 — AUDITORÍA COMPLETA · TaxiHUB 2.0 "Taxi Operations OS"

> Fecha: 2026-08-27 · Alcance: solo lectura, sin modificaciones de código.
> Estado del repo al auditar: backend Docker OK (mongo+backend+frontend+seed), 32/32 tests pass, tiles Esri Base+Reference con fallback OSM.

---

## 1. Inventario del sistema existente (NO destruir)

### 1.1 Backend
| Componente | Ubicación | Estado |
|---|---|---|
| API monolítica | `backend/server.py` (3.043 líneas) | Funcional; routing+auth+dominio+migraciones en un archivo |
| Módulo mantenimiento | `backend/mantenimiento_module.py` (~200 l.) | Funcional; factory `build_router()` con inyección de helpers privados de server.py |
| Módulo socios/turnos/combustible | `backend/socios_extra_module.py` (~242 l.) | Funcional; mismo patrón factory |
| Auth | JWT HS256 sin `exp`, scopes: `operador/terminal/pasajero/dev/dueno` | Funcional; 8 dependencias + auth inline duplicada en 4+ endpoints |
| WebSockets | `ConnectionManager` (in-memory), canales terminal/operador/pasajero/dueno | Funcional; close 1008 en token inválido (apps ya hacen logout en 1008) |
| GPS | `POST /operadores/{id}/ubicacion` + `POST /api/locations` | Funcional; track embebido cap 400 pts, dedupe ≥8 m, espejo a vehiculos |
| Despacho | Ofertas con TTL, asignación atómica (`matched_count`) | Funcional; expiración perezosa (sin job de fondo) |
| Multi-tenant | `sitio_id` + ownership `vehiculos.propietario_id` para socios | Parcial: socios aislados por propietario_id (testeado); sitio_id solo se aplica en despacho, no en listados |

### 1.2 Colecciones (19)
- **Core**: operadores, clientes, rutas, servicios, reportes_objetos, mensajes_chat, usuarios_terminal, usuarios_dueno, tarifas_predefinidas, config, archivos, vehiculos, tipos_vehiculo, sitios
- **Módulos**: mantenimientos, documentos_vehiculo, gastos_vehiculo, turnos_config, combustible_cargas, socios_reparto
- ⚠️ Las 6 colecciones de módulos **sin índices**; sin 2dsphere en ninguna.

### 1.3 Estados (fuente única de verdad en server.py)
- **Operador**: `libre, ocupado, no_disponible, fuera_de_servicio, averiado` (transiciones validadas `_validar_transicion_estado` l.806)
- **Servicio**: `pendiente, ofrecido, asignado, en_curso, completado, cancelado, vencido, rechazado`
- 🆕 Requeridos por 2.0 y **no existentes**: EN CAMINO (azul) y MANTENIMIENTO como estado de unidad.

### 1.4 Frontend
| App | Archivo | Líneas | Observaciones |
|---|---|---|---|
| Terminal (Centro de Operaciones) | `pages/Terminal.jsx` | 912 | Mapa full + panel flota + rail admin (`TerminalMenu.jsx` 817) + modal nueva llamada con picking |
| Operador (Driver) | `pages/OperadorApp.jsx` | 1.011 | Sin turno formal ni kilometraje; GPS cada ~9 s; oferta con countdown |
| Pasajero | `pages/PassengerApp.jsx` | 783 | Fuera de alcance en 2.0 |
| Dueño (Socios) | `pages/DuenoApp.jsx` + `pages/dueno/*` (10 vistas) | ~1.386 | Dashboard/Flota/Mapa/Servicios/Conductores/Mantenimiento/Combustible/Turnos/Reportes/Reparto. Turnos y Mantenimiento **sin formularios de escritura** |
| Dev | `pages/DevPanel.jsx` | — | Panel QA |

### 1.5 Design system actual
- Tokens en `index.css` (867 l.): 3 paletas `data-theme` (esmeralda/oceano/ambar), paleta shadcn completa, utilidades `.bezel-shell`, `.th-table`, `.chip`, `.elev-1/2/3`.
- Dark mode real vía `data-mode="claro"` — pero sostenido por **~40 reglas `!important`** que re-pintan clases zinc hardcodeadas (frágil).
- 574 clases zinc fuera de tokens; 36/46 componentes shadcn sin usar; react-query/SWR instalados sin usar.

### 1.6 Tests
- 32 backend tests OK (mongomock, xdist `-n 2 --dist loadscope`): despacho/GPS/estados/privacidad/routing/scopes/track + dueño + tipos vehículo.
- **Cobertura cero**: módulos mantenimiento/socios_extra (11 endpoints sin test), chat, reportes, tarifas, WS handlers, frontend.

---

## 2. Brechas frente a TaxiHUB 2.0

| # | Requisito 2.0 | Estado actual | Esfuerzo |
|---|---|---|---|
| 1 | Auto-finalización por geofence (F5) | **No existe** geofencing. `servicios.destino` SÍ guarda lat/lng (prerrequisito listo) | Backend medio + config + WS |
| 2 | Estados EN CAMINO / MANTENIMIENTO | No existen en enums | Backend bajo + frontend |
| 3 | Buscador geográfico (F4) | Solo picking por clic + OSRM routing | Nuevo: Nominatim/Photon + componente MapSearch |
| 4 | Panel WhatsApp (F4, arquitectura preparada) | No existe | Diseño de panel + contratos para proveedor oficial futuro |
| 5 | Turno con km inicial/final (F6/F10) | Solo `inicio_operacion` (cronómetro); odómetro solo captura manual del dueño | Backend + Driver App |
| 6 | Expediente de conductor con documentos (F8) | Documentos existen **por vehículo** (`documentos_vehiculo`); no por conductor | Backend (extensión) + UI |
| 7 | Socios: ficha completa, asignaciones (F7) | Reparto básico con N+1 severo (`/reparto/calculo`) | Backend refactor + UI |
| 8 | Objetos olvidados con estados (F11) | `reportes_objetos` binario (resuelto sí/no), sin foto-servicio-unidad vínculo completo | Extensión de esquema |
| 9 | Dashboard ejecutivo con gráficas (F12) | Dashboard dueño básico + Reportes con recharts | Extensión |
| 10 | App Android (F6, GPS segundo plano) | **No existe**; solo web responsive. Backend `UbicacionGPS` ya acepta driver_id/vehicle_id | Fase propia (PWA → WebView/Capacitor) |
| 11 | Design System unificado (F2) | Tokens parciales; modo claro frágil; 36 shadcn sin usar | Refactor grande |
| 12 | Config por sitio (geofence etc.) | `config` global única (gps_stale_seconds, oferta_duracion_seg, logo) | Migrar a per-sitio |
| 13 | Mapa "premium" con POIs (F3) | Esri Base+Reference (ya con rótulos); falta densidad POIs | Evaluar Esri "Navigation"/"Community" style |

---

## 3. Deudas técnicas y riesgos

### P0 — Seguridad (vigentes de memory/AUDITORIA.md, bloquean SaaS comercial)
1. `POST /api/terminal/usuarios` y `POST /api/seed` **públicos** (alta de usuarios sin auth).
2. JWT sin `exp`/refresh; credencial semilla `central/central123` hardcodeada (l.2944).
3. CORS `*` por defecto; uploads sin validar tipo/tamaño.
4. Multi-tenant `sitio_id` declarado pero **sin aplicar en listados** (`GET /operadores`, `/servicios`).

### P1 — Arquitectura
5. `server.py` 3.043 líneas; patrón factory de módulos acoplado a helpers privados (extender así empeora).
6. Auth JWT re-decodificada inline en 4+ lugares (create_servicio l.1719, terminar l.2039…).
7. WS en memoria del proceso (no escala horizontal); expiración de ofertas perezosa sin job.
8. N+1: `/dueno/reparto/calculo` (socios×vehículos×500 docs) y `/dueno/conductores`.

### P2 — Datos
9. Timestamps ISO string comparados por regex `^YYYY-MM` (gastos l.1768, reportes l.2399) — no indexables.
10. Track como array embebido (cap 400) — OK para hoy, limitante para histórico/analítica.

### P3 — Frontend
11. Monolitos: OperadorApp 1.011, Terminal 912, TerminalMenu 817; bottom-sheets duplicados 4×.
12. Carga de `/servicios/hoy` duplicada (Terminal.jsx y ServiciosPanel.jsx).
13. iframe `?embed=1` en DeviceModeToggle (hack visual).
14. Sin guarded routes ni code splitting; polling manual donde react-query ya está instalado.

---

## 4. Activos reutilizables (construir sobre esto)

- ✅ Asignación atómica de servicios (carrera resuelta, testeada).
- ✅ Privacidad GPS forzada en backend (pasajero solo ve su taxi; dueño solo su flota).
- ✅ Track GPS con dedupe y espejo vehículo — base para geofence dwell detection.
- ✅ `servicios.destino{lat,lng}` obligatorio desde terminal — base para auto-finalización.
- ✅ Sistema de config con caché — extender a `arrival_radius_meters` etc.
- ✅ Módulos mantenimiento/combustible/turnos ya persisten lo que 2.0 necesita mostrar.
- ✅ shadcn/ui (46 componentes) + tokens CSS + 3 paletas + dark/light reales.
- ✅ 32 tests de regresión como red de seguridad para el refactor.
- ✅ Stack Docker funcional (mongo+backend+frontend+seed) y pipeline de captura Playwright/CDP para auditoría visual.

---

## 5. Plan de fases (confirmado contra el prompt maestro)

| Fase | Entregable | Riesgo de regresión |
|---|---|---|
| F2 | Design System 2.0: tokens (paleta exacta del prompt), tipografía, StatusSystem unificado, map components (TaxiMarker/MapSearch/FleetLayer…), migración de zinc→tokens progresiva | Medio: tocar index.css afecta todo → migrar por utils nuevos, no reemplazo |
| F3 | Centro de Operaciones (Command Center): topbar con contadores, sidebar por módulos, mapa protagonista con POIs | Alto: Terminal.jsx es el corazón → refactor por extracción de componentes con tests como red |
| F4 | Nueva llamada + MapSearch + panel WhatsApp (arquitectura preparada) | Bajo: aditivo |
| F5 | Auto-finalización: geofence backend autoritativo + config por sitio + evento WS + UX discreta | Medio: tocar máquina de estados → tests nuevos primero |
| F6 | Driver App minimalista (turno, km, servicio, GPS estados) + estrategia background (PWA→Capacitor) | Medio |
| F7–F12 | Socios, expedientes, mantenimiento, combustible/turnos, objetos, dashboard ejecutivo | Bajo-medio, mayormente aditivo |
| F13 | Auditoría visual completa (capturas desktop/tablet/mobile, dark mode) | — |

**Orden de seguridad**: cada fase termina con build + 32 tests + captura visual antes de avanzar.

---

## 6. Decisión registrada

- NO se reemplaza Leaflet, MongoDB, FastAPI ni WebSockets.
- NO se toca PassengerApp (fuera de alcance 2.0) salvo compatibilidad.
- La operadora decide: cero autoasignación; el único "auto" será la finalización por geofence (F5), autoritativa en backend.
- Los P0 de seguridad se atenderán dentro de las fases que tocan cada zona (no un big-bang aparte).
