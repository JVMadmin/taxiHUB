# FASE 5 — AUTOMATIZACIÓN DE LLEGADA Y FINALIZACIÓN (Geofence)

> Estado: implementada y validada — 40/40 tests (32 regresión + 8 geofence nuevos), build OK.
> Principio del producto: la operadora no finaliza manualmente; el sistema detecta la llegada
> de forma AUTORITATIVA EN BACKEND. La asignación sigue siendo 100% manual.

## 1. Motor de geofence (backend autoritativo)

### Ubicación
`backend/server.py` → `_evaluar_llegada_geofence()` (junto a `_actualizar_ubicacion`).

### Flujo por cada reporte GPS
1. Si `auto_complete_enabled` es falso → salir (no-op).
2. Buscar servicio `en_curso` del conductor con `destino.lat/lng` presentes.
   Sin destino georreferenciado → geofence desactivado para ese servicio.
3. **Validación de precisión**: `accuracy > max_gps_accuracy_m` (o desconocida) → no evaluar.
4. **Validación de radio**: distancia haversine al destino ≤ `arrival_radius_m`;
   si está fuera → limpiar conteo de permanencia (`llegada` unset).
5. **Validación de velocidad**: `speed > 2.78 m/s` (>10 km/h) → no cerrar (pasa de largo).
6. **Dwell**: primer punto dentro de zona marca `llegada.dentro_desde`;
   al acumular `arrival_dwell_s` dentro (los reportes salen cada ~9 s) → completar.
   Con `dwell_s <= 0` la llegada es inmediata.
7. **Carrera resuelta**: `UPDATE` condicionado por `estado=en_curso` → solo un cierre;
   si otro proceso ya lo cerró, no doble-contabiliza.
8. Al completar: servicio → `completado` con `auto_completado: True` y
   `motivo_cierre: "geofence"`, operador → `libre`, métricas disponibles.

### Eventos WebSocket nuevos
- Terminal (broadcast): `{type: "destino_alcanzado", servicio_id, operador_id, ts}`
- Conductor: mismo evento por su canal.
- Además se emiten los eventos estándar `estado` (libre) y `servicio` (actualizado).

### Casos especiales cubiertos (tests)
| Caso | Comportamiento | Test |
|---|---|---|
| Llegada perfecta (dwell 0) | completa + libera taxi | `test_llegada_auto_completa_servicio` |
| Dentro del radio sin dwell cumplido | sigue en_curso | `test_dwell_insuficiente_no_completa` |
| GPS impreciso (80m > 30m máx) | nunca finaliza | `test_gps_impreciso_no_completa` |
| Velocidad alta (43 km/h) | no finaliza | `test_velocidad_alta_no_completa` |
| Fuera del radio / salida antes del dwell | reinicia conteo | `test_fuera_de_radio_y_salida_cancela_dwell` |
| Servicio sin destino con coords | geofence inactivo | `test_sin_destino_no_geofence` |
| `auto_complete_enabled=false` | no completa | `test_disabled_no_completa` |
| Dwell acumulado entre reportes | completa al cumplir | `test_dwell_acumulado_completa` |

- GPS fluctuante: tolerado por radio + dwell (no se exige salida/entrada exacta).
- Backend sin conexión con el taxi: sin reportes no hay evaluación (no falsos cierres).

## 2. Configuración (colección `config`, sembrada en migraciones)
| Clave | Default | Significado |
|---|---|---|
| `auto_complete_enabled` | `True` | Interruptor maestro |
| `arrival_radius_m` | `75` | Radio de llegada alrededor del destino (50–100 recomendado) |
| `arrival_dwell_s` | `30` | Permanencia dentro del radio (30–60 recomendado) |
| `max_gps_accuracy_m` | `30` | Precisión mínima exigida al GPS |

Editables vía `POST /api/config/set` (terminal). Nota: la config es global;
la variante por-sitio llega con el trabajo multi-tenant (F7+).

## 3. UX
- **Terminal**: toast discreto "Destino alcanzado — servicio completado automáticamente"
  (5 s, sin acción requerida) + refresco del tray de servicios.
- **Operador**: toast "Servicio completado — quedas disponible". El taxista no pulsa nada.
- Sin confirmaciones obligatorias ni trabajo extra para la operadora.

## 4. Cambios en contratos (compatibles)
- `POST /api/locations` y `POST /api/operadores/{id}/ubicacion` ahora pueden incluir
  `llegada_detectada` / `servicio_auto_completado` en la respuesta (aditivo).
- Servicios nuevos campos: `auto_completado`, `motivo_cierre`, `llegada{dentro_desde, confirmada_en, dist_m}`.
- Ningún contrato existente cambió de forma rompedora; 32/32 tests de regresión en verde.

## 5. Validación
- 8 tests nuevos (`tests/test_geofence.py`) escritos ANTES del backend (rojo→verde).
- Regresión completa: 40/40 en 72 s.
- Config verificada en contenedor: las 4 claves con defaults correctos.
