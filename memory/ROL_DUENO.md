# Rol Dueño de Flota — Implementación

Añade una quinta superficie a taxiHUB: un panel para dueños de flota que ven únicamente sus propios vehículos, conductores y servicios. Implementado como ownership ligero (`vehiculos.propietario_id`), no como reactivación de `sitios`. Ver `memory/AUDITORIA.md` para el diagnóstico previo y `.claude/plans/refactored-munching-lark.md` para el plan aprobado.

## Modelo y tenancy

- Nueva colección `usuarios_dueno` (nombre, usuario, password_hash, activo, creado) — mismo shape que `usuarios_terminal`.
- `vehiculos.propietario_id: Optional[str]` — campo nuevo, nulo por defecto (cero impacto en vehículos existentes/gestión centralizada).
- Índices: `vehiculos.propietario_id`, `usuarios_dueno.usuario` (unique).
- El aislamiento se resuelve siempre en backend a partir de `propietario_id` → nunca se confía en filtros del frontend.

## Endpoints nuevos (`backend/server.py`)

| Método | Ruta | Auth | Notas |
|---|---|---|---|
| POST | `/api/dueno/usuarios` | `require_terminal` | Alta de cuentas — sin registro público (evita repetir SEC-01 de la auditoría) |
| GET | `/api/dueno/usuarios` | `require_terminal` | Listado para la central |
| POST | `/api/dueno/login` | público | Devuelve `{token, usuario}` |
| GET | `/api/dueno/me` | `require_dueno` | Perfil |
| GET | `/api/dueno/dashboard` | `require_dueno` | KPIs agregados (taxis por estado, servicios/ingresos de hoy) |
| GET | `/api/dueno/flota` | `require_dueno` | Vehículos propios + conductor + conteo de servicios (sin N+1) |
| GET | `/api/dueno/flota/{id}` | `require_dueno` | Detalle: conductor, track GPS, servicio activo — 404 si no es tuyo |
| GET | `/api/dueno/servicios` | `require_dueno` | Filtros: `desde`, `hasta`, `vehiculo_id`, `operador_id`, `estado` |
| GET | `/api/dueno/servicios/{id}` | `require_dueno` | Detalle enriquecido — 404 si no es tuyo |
| GET | `/api/dueno/reportes` | `require_dueno` | Agregaciones por día/vehículo/conductor, completados/cancelados, ingresos |
| WS | `/api/ws/dueno/{id}` | token en query | Mismo patrón que `ws_operador`/`ws_pasajero` |

Modelos: `DuenoUserCreate`, `DuenoLoginBody`. `VehiculoCreate`/`VehiculoUpdate` ganan `propietario_id` y `anio` (campo "Año" pedido explícitamente y ausente hasta ahora).

## Métrica nueva: distancia/duración persistida

`terminar_servicio` ahora calcula y guarda `distancia_m`/`duracion_s` reales (vía `_calcular_metricas_servicio`): duración = tiempo real transcurrido; distancia = recorrido GPS real del conductor en la ventana del viaje, con fallback a línea recta origen→destino si no hay track suficiente. Nunca se inventa un valor — queda `null` si no hay datos. No se implementaron `comisión`/`importe neto`: no existe ninguna fuente real de tasa de comisión (regla explícita: no inventar datos).

## Tiempo real

`ConnectionManager` extendido con `duenos`/`send_dueno`. Nuevo helper `_notificar_dueno_de_operador(operador_id, message)` enganchado en los mismos puntos donde ya se notificaba a la terminal (ubicación, cambios de estado, y el choke point único `_notificar_servicio`) — el dueño ve cambios sin recargar, reutilizando exactamente los mismos payloads que ya consume el frontend del Terminal/Operador.

## Frontend

**Nuevos componentes de sistema** (`frontend/src/components/`): `Button` (consolida los 3 patrones de botón detectados en la auditoría), `LoadingState`, `ErrorState` (hermanos de `EmptyState`), `KPICard`, `DataTable` (activa `.th-table`, escrito y sin usar), `VehicleCard`, `ServiceCard`, `FilterBar`.

**App del Dueño** (`frontend/src/pages/DuenoLogin.jsx`, `DuenoApp.jsx`, `pages/dueno/{Dashboard,Flota,Mapa,Servicios,Reportes}.jsx`): shell con sidebar (desktop) / nav inferior (móvil), WebSocket propio, cinco secciones completas y conectadas a datos reales. Rutas nuevas `/dueno/login` y `/dueno` en `App.js`. Cliente API `duenoApi` en `lib/api.js` siguiendo el patrón `mk()` ya existente.

**Reportes**: 4 gráficos con `recharts` (instalado, sin usar hasta ahora) — paleta categórica de orden fijo, colores de estado (completado/cancelado) reservados y nunca reutilizados en la parte categórica, un solo hue para magnitudes (servicios/ingresos por día), tema claro/oscuro vía `useMode()`.

**Pasajero**: nueva pestaña Perfil (nombre, teléfono, fecha de registro, viajes totales/cancelados — datos reales, ningún campo inventado) + navegación inferior fija reemplazando las pestañas superiores.

**Aplicado en paralelo a las superficies existentes** (parte del alcance elegido, "todo en paralelo"):
- `Button` unificado en `Terminal.jsx`, `OperadorApp.jsx`, `PassengerApp.jsx`, `ServiciosPanel.jsx`, `TerminalMenu.jsx` — sustituye los 3 patrones de botón primario documentados en la auditoría (DS-03).
- `LoadingState`/`ErrorState` añadidos a los paneles de Clientes, Vehículos, Reportes, Chat y Tarifas en `TerminalMenu.jsx` (antes: `.then()` sin manejo de error → panel en blanco silencioso ante cualquier fallo, UX-01 de la auditoría).

## Fuera de alcance de esta pasada

Documentado explícitamente para no confundir "no implementado" con "olvidado": rediseño del sistema de anclaje de paneles flotantes del Terminal, retrofit completo de `zinc-*` → tokens fuera de los archivos tocados, y los 7 hallazgos P0 de seguridad de `memory/AUDITORIA.md` (siguen pendientes, son un pedido aparte).

## Pruebas

- `tests/test_dueno.py` (7 tests nuevos): alta protegida, login, aislamiento de flota bidireccional, aislamiento de servicios, métricas persistidas, dashboard con conteos correctos, no-regresión en `/api/vehiculos`.
- Suite completa: **24/24 passing** (17 preexistentes + 7 nuevos), sin tocar `pytest.ini`.
- Verificación end-to-end en navegador contra el backend real: dos dueños de prueba, ownership cruzado confirmado (cada uno ve solo lo suyo, incluida verificación de que un dueño no puede leer el vehículo/servicio del otro), y regresión confirmada en Terminal/Operador/Pasajero.

## Datos de prueba creados en esta sesión (entorno de desarrollo local)

- Dueño A: `flota_palenque` / `flota123` → ve TX-101 (Carlos Ramírez)
- Dueño B: `flota_pakal` / `flota123` → ve TX-102 (Ana Torres)
- Un servicio completado de prueba (Rosa Jimenez, $85, TX-101) para poblar dashboard/servicios/reportes de Dueño A.
