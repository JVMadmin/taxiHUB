# PREMIUM FASE 4 — CENTRO DE OPERACIONES (marcadores + contextual)

> Estado: implementado y validado — 79/79 tests, build OK, captura E2E con marcador
> premium seleccionado y MissionCard en vivo.

## 1. Marcadores premium (§14)

`taxiStateAssetIcon` mejorado:
- **Píldora de identificación**: placa visible + **punto de estado** con glow del
  color SSOT (misma píldora, no elementos separados).
- **Halo de selección** pulsante en el color del estado (ya existía) + `zIndexOffset`
  para que el taxi seleccionado quede por encima de la flota.
- **Transición suave de posición** (§35): CSS `transition: transform 1s linear` en el
  icono — el taxi se desliza entre actualizaciones GPS (9 s) en vez de saltar.

## 2. Panel contextual (§10/§14)

MissionCard (único flotante permitido, aparece solo con unidad seleccionada) muestra:
TX-105-style: unidad, conductor, estado, marca/modelo, ruta, **velocidad, precisión GPS,
última actualización**, recorrido en vivo (distancia/ventana/puntos) y acciones
**[Seguir taxi] [Ver servicio]**.

`[VER EXPEDIENTE]` / `[VER UNIDAD]`: quedan para F7/F10-premium — requieren los
endpoints de lectura scope terminal que se construyen ahí (evitar botones muertos,
regla §39: no mostrar acciones no ejecutables).

## 3. Validación
- 79/79 tests.
- E2E: selección desde sidebar → seguir taxi → vuelo hasta Catazajá con marcador
  premium + halo + píldora TX-101 + MissionCard con datos GPS reales (148 m precisión,
  4.6 km recorrido, 254 puntos).
- Overflow móvil sigue en 0 px.
