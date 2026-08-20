# API taxiHUB — Documentación técnica

Backend: FastAPI + MongoDB (Motor). Todo bajo el prefijo `/api` en `backend/server.py`.

## Autenticación (JWT HS256, bearer) — scopes
| Scope   | Login                            | Token                 | Usos backend |
|---------|----------------------------------|-----------------------|--------------|
| operador| `POST /api/auth/login`           | `Authorization: Bearer` (localStorage `op_token`) | estados, GPS, servicios propios, chat, reportes |
| terminal| `POST /api/terminal/login`       | `term_token`          | CRUD operadores/vehículos/clientes/rutas/tarifas, servicios, despacho, reportes, chat |
| pasajero| `POST /api/clientes/login` /registro | `pas_token` (futura app) | solicitar taxi, cancelar, ver su taxi asignado |
| dev     | `POST /api/dev/login`            | `dev_token`            | `/dev/*` |

Dependencias FastAPI: `require_operador(+estricto)`, `require_terminal`, `require_pasajero`, `require_dev`, `_mismo_o_terminal` (operador propio o terminal), `_any_autenticado` (operador/terminal). Un operador `SOLO` puede operar sobre su propio `operador_id`. Los tokens previos sin `scope` siguen sirviendo para operador (compat).

## Colecciones
`operadores` (conductor), `vehiculos` (flota), `clientes` (pasajeros con credenciales opcionales), `sitios`, `rutas`, `servicios` (ride), `tarifas_predefinidas`, `reportes_objetos`, `mensajes_chat`, `usuarios_terminal`, `config` (clave-valor), `archivos`.

Cada documento lleva `sitio_id` (default `"default"`) aislando datos por sitio.

## Estados
Conductor (backend = fuente de verdad):
| Valor | Concepto | Mapa |
|---|---|---|
| `libre` | AVAILABLE | 🟢 |
| `ocupado` | BUSY | 🔴 |
| `no_disponible` | PAUSED | 🟡 |
| `fuera_de_servicio` | OFFLINE | ⚫ |
| `averiado` | OUT_OF_SERVICE | 🟣 |

Reglas (máquina de estados): con un servicio activo (`pendiente/ofrecido/asignado/en_curso`) el conductor no puede soltar el estado hacia `libre/no_disponible/averiado/fuera_de_servicio`; un `averiado` no puede quedar `libre/ocupado`. La app solo solicita cambios; el backend valida.

Servicio (ride):
`pendiente (PENDING) → ofrecido (OFFERED) → asignado (ASSIGNED) → en_curso (IN_PROGRESS) → completado (COMPLETED)`, más `cancelado`, `vencido (EXPIRED)` y `rechazado` (registro por conductor).

## Ciclo del servicio
```
Pasajero/terminal → POST /servicios (pendiente) → POST /dispatch/offer (ofrecido a N taxis)
→ el conductor POST /servicios/{id}/aceptar (ASIGNACIÓN ATÓMICA: 1 gana, 0 = 409)
→ POST /iniciar (en_curso) → POST /terminar (completado)
```
La asignación usa `update_one({_id, estado∈[pendiente,ofrecido]}, {operador, estado:"asignado"})` y verifica `matched_count`. La asignación manual del dispatcher pasa por la misma función (`/asignar`).

## Despacho
`GET /api/dispatch/candidates?lat&lng&num` → taxis `libre`, vehículo `activo`, GPS fresco (umbral `config.gps_stale_seconds`, default 120), ordenados por distancia (Haversine) al origen. `POST /api/dispatch/offer` fija `expira_en` (TTL `config.oferta_duracion_seg`, default 60) y notifica. Ofertas vencidas → `vencido`.

## GPS
- `POST /api/locations` (`lat, lng, accuracy, speed, heading, battery_level, timestamp, status`, `driver_id/vehicle_id` opcionales) — pensado para web y la futura app Android (foreground service / envío periódico).
- Alias compatible: `POST /api/operadores/{id}/ubicacion`.
- El servidor guarda `ultima_actualizacion` (reloj servidor); la frescura la audita el backend, no el cliente.
- **Privacidad**: el pasajero SOLO recibe eventos/ubicación de **su taxi asignado** y solo después de la asignación. Nunca recibe la flota. La restricción se impone en backend (no solo en la UI).

## WebSockets
- `GET /api/ws/terminal` → broadcast de toda la flota/eventos (solo operadora).
- `GET /api/ws/operador/{operador_id}` → mensajes/servicios propios.
- `GET /api/ws/pasajero/{pasajero_id}` → SOLO su servicio + taxi.

Eventos: `ubicacion`, `estado`, `servicio`, `mensaje`, `reporte`, `driver.location_updated`, `ride.*` (convención existente `nuevo_servicio`).

## Configuración (config collection)
- `gps_stale_seconds` = 120 (frescura GPS para despacho/mapa)
- `oferta_duracion_seg` = 60 (TTL de ofertas)
- `POST /api/config/set` (terminal) · `GET /api/config/{key}` (operador/terminal)

## Pasajero (preparada para app)
- `POST /api/clientes` con `usuario/contrasena` → registra y devuelve `token` (scope pasajero); sin credenciales → terminal registra cliente sin cuenta.
- `GET /api/clientes/me`, `/me/servicios`, `/me/viaje-activo` (solo su taxi).
- `POST /api/servicios` con token pasajero → exige coordenadas; estado `pendiente`.
- `POST /api/servicios/{id}/cancelar` (solo propio).
- `metodo_pago` default `cash`; a futuro `card/online` sin tocar la arquitectura.

## Driver App preparada
`POST /auth/login`, `PATCH /operadores/{id}/estado`, `POST /locations`, `GET /servicios/mis-activos`, `POST /servicios/{id}/aceptar|rechazar|iniciar|terminar`, `POST /operadores/{id}/servicio` (radio).

## Seguridad / aislamiento
- Scopes por rol; validación de IDs (`to_oid`); un conductor no consulta GPS/vehiculos/servicios ajenos; pasajero nunca vista flota ni GPS de otros; operadora solo su flota (por `sitio_id`).