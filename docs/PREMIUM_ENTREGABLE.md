# PREMIUM UX/UI OVERHAUL — ENTREGA FINAL

> F1–F6 implementadas + F7–F16 implementadas en un solo pase + validación (F17/F18).
> **86/86 tests** · build OK · Docker montado · capturas E2E reales.

---

## 1. Qué cambió VISUALMENTE (evidente, no solo colores)

| Zona | Antes | Ahora |
|---|---|---|
| **Terminal layout** | Mapa full-screen con 4 paneles flotantes apilados | **Split view real**: sidebar flota fija + mapa protagonista + panel derecho del DS |
| **Rail admin** | 10 iconos planos | **Agrupado por responsabilidad**: OPERAR / FLOTA / CONTROL, con panel 400px (720px WhatsApp) |
| **Drawers** | Caja negra alpha+blur | Superficie `--th-surface` + border del DS (dark y claro correctos) |
| **Marcadores** | Sprite + placa simple | Píldora placa + **punto de estado con glow**, halo pulsante, transición suave 1s entre GPS |
| **WhatsApp** | Lista→chat plano | **720px dos columnas**: búsqueda, avatares, encabezado, UBICACIÓN RECIBIDA con 2 acciones + **TAXIS MÁS CERCANOS** con [ASIGNAR] |
| **Nueva llamada** | Formulario administrativo | **Centro de despacho de 4 pasos**: origen→destino→cercanos→asignar; cliente colapsado al final |
| **MissionCard** | — | + [VER EXPEDIENTE] → abre expediente real desde la Terminal |
| **Nav móvil Dueño** | 12 etiquetas amontonadas | Iconos compactos + scroll (0px overflow) |
| **Encoding** | "LlegÃ³ al cliente" (doble-codificación de acentos) | "Llegué al cliente" — recuperación byte-a-byte verificada por codepoints |

## 2. Qué cambió en UX

- **Operadora**: flujo despacho reducido a marcar→elegir de la lista→ASIGNAR (§46).
- **WhatsApp §47**: ubicación→taxis cercanos→ASIGNAR sin copiar coordenadas.
- **Duplicaciones eliminadas**: tray de servicios (unificado al panel), servicioForm simplificado.
- **Panel contextual único**: MissionCard solo aparece al seleccionar (§10).

## 3. Funcionalidades conservadas (no-regresión)
Auth, GPS/track, WebSockets (4 canales), multi-tenant, despacho atómico, geofence F5,
turnos con km, expedientes socio, socios, mantenimiento, combustible socio, objetos con
estados, ejecutivo, todos los data-testids. **79 → 86 tests** (todos verdes en cada fase).

## 4. Funcionalidades mejoradas
- Expediente de conductor: ahora **accesible desde Terminal** (solo lectura) con socio resuelto.
- Mantenimiento/Combustible: **consulta desde Terminal** (sin botones de escritura — §27/§39).
- Odómetro del vehículo se actualiza con cada carga de combustible del taxista.

## 5. Funcionalidades nuevas necesarias
| Feature | Backend | Frontend |
|---|---|---|
| **Asignaciones** socio→unidad→conductor con historial | `asignaciones` + CRUD (cerrar previa, actualizar unidad) + aislamiento 404 | Vista en panel Dueño (crear/finalizar/historial) |
| **Combustible del taxista** | `POST /combustible` (multipart + ticket) + `/combustible/mis-cargas` | Overlay en Driver App: fecha/litros/costo/km/estación/foto ticket + historial |
| **Consulta Terminal** | módulo `terminal_consulta_module` (6 endpoints read-only) | 5 paneles: Choferes→Expediente, Socios, Mantenimiento, Combustible, Dashboard |
| **Dashboard administrador** | `GET /terminal/dashboard` | Panel con 8 KPIs + estados de flota |

## 6–7. Problemas detectados → corregidos
1. **Mojibake masivo** ("LlegÃ³") por re-guardado PowerShell con encoding por defecto → recuperación byte-a-byte (C3/C2+byte→codepoint) verificada por codepoints (é=233, ó=243).
2. `ServicioCreate.destino` requerido (422 en WhatsApp asignar) → `destino: {}`.
3. Div flex-1 vacío ocupaba media pantalla de WhatsApp → excluido.
4. Tiles desalineadas al cambiar layout → `SizeInvalidator` (ResizeObserver).
5. Rail fuera de rango con panel 720px → offset dinámico.

## 8. Pendiente
- Android background GPS (proyecto nativo — sin hack web).
- P0 seguridad (endpoints de alta públicos, JWT sin exp, CORS *) — bloqueante para producción.
- Migración zinc→tokens restante en vistas 1.x (Pasajero fuera de alcance).
- WhatsApp: proveedor oficial (webhook ya responde 503 sin token, sin hacks).

## Validación final
- **86/86 tests** (7 nuevos premium: consulta terminal×3, asignaciones×2, combustible×2).
- Capturas E2E reales: expediente desde Terminal (Ana Torres + alertas), Asignaciones (socio),
  Driver con "Llegué al cliente" correcto, despacho paso a paso con clics reales en mapa,
  WhatsApp→asignación completa, Terminal dark/claro.
- **Docker montado**: `docker compose up -d --build` con las imágenes finales; backend
  sirve el código nuevo por volumen; nginx sirve la build final; seed OK.
