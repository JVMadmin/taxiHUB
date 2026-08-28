# TAXIHUB 2.0 — TAXI OPERATIONS OS · ENTREGABLE FINAL

> Fecha: 2026-08-27 · 13 fases completadas · **78/78 tests backend** · build de producción OK ·
> auditoría visual con capturas reales en desktop/tablet/mobile y dark/light.

---

## 1. Resumen de arquitectura

Sin cambios de tecnología (regla §0): FastAPI + MongoDB (motor) + WebSockets + Leaflet +
React (CRA/CRACO) + Tailwind/shadcn. Todo lo nuevo es **aditivo** sobre el sistema 1.x.

```
backend/
  server.py                    ← API monolítica (3494 l.): despacho, GPS, geofence F5,
                                 turnos F6, WhatsApp F4, geocoding F4, reportes F11
  mantenimiento_module.py      ← salud de flota (tests desde F9)
  socios_extra_module.py       ← turnos socio, combustible, reparto, ficha F7,
                                 expedientes F8, ejecutivo F12
frontend/src/
  design/                      ← Design System 2.0: tokens.css, status.js (SSOT), icons.js
  components/maps/             ← TaxiMarker, FleetLayer, RouteLine, MapSearch, …
  components/ops/              ← OpsTopbar, FleetPanel, MissionCard, OpsMobileDock
  pages/dueno/                 ← 12 vistas: + Socios, Expediente, Ejecutivo, Turnos editor
docs/FASE1…FASE12.md           ← documentación por fase
```

**Infra Docker** (docker-compose.yml): mongo:7 (healthcheck) + backend (:8000) +
frontend nginx (:3000) + seed automático.

## 2. Design System (F2)

- **Tokens**: paleta normativa exacta (#10B981 primary; success/danger/warning/info/purple),
  superficies dark (#07131D) / claro (#F6F8F7) conmutables, tipografía Display→Numeric,
  primitivos (.th-card, .th-btn, .th-status, .th-map-ctl).
- **SSOT de estados**: `design/status.js` — operador/servicio/unidad/documento/objeto.
  `lib/api.js` re-exporta nombres históricos → TODA la app usa la paleta 2.0 sin breaking.
- **Iconografía**: `design/icons.js` — catálogo único (lucide). Sin emojis como UI principal.

## 3. Componentes nuevos

| Grupo | Componentes |
|---|---|
| maps/ | TaxiMarker (memo), PickupMarker, DestinationMarker, RouteLine, MapControls, FleetLayer (memo), MapSearch |
| ops/ | OpsTopbar, FleetPanel, MissionCard, OpsMobileDock, indicadores |
| páginas | WhatsAppPanel, Socios, Expediente, Ejecutivo, AccionMantenimiento, EditorTurnos |

### Refactorizados
- **Terminal.jsx** 914→~560 l. (−39%): orquestador puro; lógica WS/GPS/despacho intacta.
- **Conductores.jsx**: cards navegables → expediente.
- **Mantenimiento.jsx**: +3 formularios de escritura.
- **Turnos.jsx**: +editor de turnos/relevo con renta.
- **DuenoApp.jsx**: nav móvil legible (hallazgo F13 corregido).

## 4. APIs nuevas (todas autenticadas, ownership verificado)

| Endpoint | Scope | Fase |
|---|---|---|
| `GET /geo/search` | cualquier rol activo | F4 |
| `GET/POST /wa/conversaciones[/{id}[/reply]]`, `POST /wa/webhook` (503 sin token) | terminal | F4 |
| `POST /turnos/iniciar|finalizar`, `GET /turnos/activo|mis-turnos` | operador (estricto) | F6 |
| `GET /dueno/ficha` | dueno | F7 |
| `POST/GET /dueno/conductores/{id}/documentos`, `GET /dueno/conductores/{id}` | dueno (aislado 404) | F8 |
| `PATCH /reportes/{id}/estado` (+ compat `/resolver`) | terminal | F11 |
| `GET /dueno/ejecutivo` | dueno | F12 |

## 5. APIs modificadas (compatibles)
- `POST /api/locations` y `/operadores/{id}/ubicacion`: +`llegada_detectada`/`servicio_auto_completado` (aditivo).
- `PATCH /operadores/{id}/estado`: 409 si hay turno abierto (guardarraíl F6).
- `POST /reportes`: estado inicial `encontrado` + historial + vínculo servicio/unidad.
- `GET /dueno/reparto/calculo` y `/dueno/conductores`: refactor sin N+1 (+ bug del mes corregido).
- `POST /operadores`: registra `creado` (fecha de ingreso).

## 6. Backend: cambios clave
- **Geofence autoritativo (F5)**: `_evaluar_llegada_geofence()` — precisión + radio +
  velocidad + dwell + UPDATE condicionado (sin dobles cierres). Config sembrada:
  `auto_complete_enabled=true`, `arrival_radius_m=75`, `arrival_dwell_s=30`, `max_gps_accuracy_m=30`.
- **_DbProxy**: módulos resuelven `db` por acceso (testeable + reconexión caliente).
- **Guardarraíl de turno** y cierre que respeta servicios activos.
- Evento WS nuevo: `destino_alcanzado` (terminal + conductor).

## 7. GPS y WebSockets
- GPS/track/espejo vehículo/dedup/privacidad: **intactos** (tests de regresión verde).
- WS: 4 canales + logout en 1008 (token inválido → re-login automático, fix de esta sesión).
- `destino_alcanzado` alimenta UX discreta (toasts) sin acción requerida.

## 8. Permisos y seguridad (§34/§35)
- Scopes: operador/terminal/pasajero/dueno/dev — todos los endpoints nuevos con dependencia correcta.
- Aislamiento socio por `propietario_id` testeado en ficha, expedientes, ejecutivo, reparto, turnos config, mantenimiento (404 al intruso).
- Deuda P0 **documentada y vigente** (fuera de alcance de fases funcionales, requiere decisión):
  endpoints públicos de alta (`/terminal/usuarios`, `/seed`), JWT sin `exp`, CORS `*`, credencial semilla.
  → Recomendación: sprint de endurecimiento antes de producción.

## 9. Pruebas realizadas
- **78 tests backend** (mongomock, xdist `-n 2 --dist loadscope`, pytest.ini intacto):
  32 originales (regresión) + 46 nuevos en 7 suites: geofence(8), turnos(8), socios(5),
  expedientes(5), mantenimiento(5), turnos config(5), objetos(5), ejecutivo(5), reparto/conductores incl. en socios.
- **TDD**: cada suite escrita antes del backend (rojo→verde) salvo cobertura de módulos preexistentes.
- **E2E visuales (CDP/Edge headless)**: flujo WhatsApp→mapa→modal prefill; login Driver + modal km;
  ficha Socios; expediente con estados documentales; modal mantenimiento; editor turnos;
  dashboard ejecutivo; Terminal dark/claro. Capturas en `Temp/opencode/aud_*.png`.
- **Overflow móvil**: 0 px horizontal en Dueño (390px) y Driver (430px).
- **Validación por fase**: build + suite completa + captura antes de avanzar (regla §39).

## 10. Problemas encontrados y resueltos (síntesis)
1. CARTO exigía API key (tiles "API KEY REQUIRED") → Esri Base+Reference con fallback OSM por tile.
2. `zoom` CSS rompía Leaflet (tiles negras) → escala por font-size raíz.
3. Tokens de sesión huérfanos tras cambiar JWT_SECRET → logout automático en WS 1008.
4. Módulos con `db` capturado (intesteable) → _DbProxy.
5. Bug de ingresos en reparto (campo inexistente `completado_en`) → corregido con tests.
6. Photon público: sin `lang`, exige User-Agent → documentado en el proxy.
7. Import faltante post-refactor (ServiciosPanel) → detectado por captura visual, corregido.

## 11. Pendientes (registrados, priorizados)
1. **Endurecimiento P0** (ver §8) — bloqueante para producción.
2. **Android background GPS** (foreground service) — requiere proyecto nativo; backend ya acepta driver_id/vehicle_id. Web/PWA con Wake Lock funciona en primer plano.
3. Migración zinc→tokens completa (574 clases restantes en TerminalMenu/ServiciosPanel/Passenger).
4. `sitio_id` aplicado en TODOS los listados (hoy: despacho + ownership socios) y config per-sitio.
5. Índices para colecciones de módulos + 2dsphere.
6. Job de expiración de ofertas (hoy perezosa).
7. Historial de turnos en UI del Driver (endpoint listo).
8. WS en memoria → Redis adapter si se escala horizontal.

## 12. Criterio de éxito (§43)
Cumplido en producto: la operadora sigue despachando por radio **pero ahora ve unidades
en vivo, busca direcciones, recibe ubicaciones por WhatsApp y el sistema cierra los
servicios al llegar**. El socio ve flota, conductores con expedientes, mantenimientos,
documentación con alertas, turnos con renta y un dashboard ejecutivo. El taxista solo
gestiona turno+GPS; nadie pulsa "finalizar" si el geofence ya detectó la llegada.

*«TaxiHUB no cambia la forma en que opera el sitio. Hace que esa forma de trabajar sea
más rápida, visible y controlable.»*
