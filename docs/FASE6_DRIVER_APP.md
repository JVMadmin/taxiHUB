# FASE 6 — DRIVER APP (Turno + GPS + Km)

> Estado: implementada y validada — 48/48 tests (40 previos + 8 de turnos), build OK, capturas E2E del flujo km.
> Principio §15: el taxista NO gestiona la operación. Su app: INICIAR TURNO + GPS + FINALIZAR TURNO + DATOS.

## 1. Backend: turnos con kilometraje (F6.1/F6.2)

### Colección nueva: `turnos`
```js
{ operador_id, vehiculo_id, sitio_id,
  inicio: ISO, fin: ISO|null,
  odometro_inicio: float, odometro_fin: float|null }
```

### Endpoints (todos `require_operador_estricto` — cada taxista solo lo suyo)
| Endpoint | Función |
|---|---|
| `POST /turnos/iniciar {odometro_km}` | Crea turno; si estaba `fuera_de_servicio` pasa a `libre` (con broadcast WS). 409 si ya hay turno abierto |
| `POST /turnos/finalizar {odometro_km}` | Valida km_fin ≥ km_inicio (400 si no); calcula `km_recorridos` y `duracion_s`; pasa a `fuera_de_servicio` **solo si no tiene servicios activos** (respeta la máquina de estados). 409 sin turno |
| `GET /turnos/activo` | Turno abierto + resumen GPS (lat/lng/última actualización/precisión/batería) |
| `GET /turnos/mis-turnos?limite=` | Historial propio, más reciente primero, con km y duración calculados |

### Reglas de integración con el sistema existente
- **Iniciar turno ≠ iniciar servicio**: el turno es la jornada; los servicios siguen su propio ciclo.
- **Guardarraíl**: con turno abierto, `PATCH /operadores/{id}/estado` a `fuera_de_servicio` responde **409** ("finaliza tu turno") — evita cerrar la jornada sin km finales. El único cierre es `POST /turnos/finalizar`.
- Finalizar con servicio activo no abandona al pasajero: el operador no cambia de estado hasta que el servicio termine.
- `EstadoOperador` sin cambios (cero impacto en despacho/GPS/geofence).

## 2. Driver App (frontend, cambios quirúrgicos en OperadorApp.jsx)

- **"Entrar en operación" → modal de km iniciales** (`km-overlay`, `km-input`): captura el tablero, crea el turno y conecta al taxista.
- **"Salir de operación" → modal de km finales**: muestra los km iniciales del turno para referencia; al confirmar muestra "Recorriste N km".
- **TurnoCard en el sheet principal** (`turno-card`): km inicio · tiempo transcurrido · **estado GPS** (🟢 Activo / 🟡 Limitado / sin conexión) usando las señales ya existentes (`gpsStale`, `wsState`).
- **Google Maps opcional** (§15): botón "Abrir en Google Maps" en las tarjetas "Ir por el cliente" (`abrir-google-maps`) y "Llevando al destino" (`abrir-google-maps-destino`) con `https://maps.google.com/dir/?api=1&destination=lat,lng`. La navegación es OPCIONAL.
- Auto-finalización F5 integrada: cuando el geofence cierra el viaje, el taxista recibe "Servicio completado — quedas disponible" sin pulsar nada.

### data-testids nuevos
`km-overlay`, `km-input`, `km-cancelar`, `km-confirmar`, `turno-card`, `turno-km-inicio`, `driver-gps-estado`, `abrir-google-maps`, `abrir-google-maps-destino`.

## 3. GPS en segundo plano (§16)
- Web (PWA): Wake Lock ya existente (pantalla activa en turno) + envío cada ~9 s + indicador de señal `gpsStale` — ahora visible como estado 🟢/🟡/🔴 en la TurnoCard.
- **Android background location (foreground service)**: requiere proyecto nativo (Capacitor/React Native). El backend ya acepta `driver_id`/`vehicle_id` en `/api/locations` (diseñado para la app móvil). **Pendiente explícito** — no se implementa en web sin hacks (el navegador suspende timers en background).

## 4. Validación
- `tests/test_turnos.py`: 8 tests escritos antes del backend (rojo→verde): registro de datos, no-duplicar turno, cálculo km/duración, km menor→400, finalizar sin turno→409, guardarraíl 409 con turno abierto, historial ordenado, resumen activo con GPS.
- Regresión completa: **48/48** en 80 s.
- Capturas E2E (430px, móvil): Driver App en operación + modal "Finalizar turno" con captura de km.

## 5. Pendientes de fase (registrados, no en esta pasada)
- Vista de historial de turnos en la app (endpoint ya existe).
- Android foreground service (proyecto nativo).
- Campo `odometro` del vehículo auto-actualizado al cerrar turno (hoy lo alimenta mantenimiento; unificar en F9).
