# PREMIUM FASE 3 — SHELL/LAYOUT GENERAL (Command Center real)

> Estado: implementado y validado — 79/79 tests, build OK, capturas dark/claro.
> Fase núcleo del overhaul visual: fin de los paneles flotantes apilados.

## Qué cambió estructuralmente

### ANTES (1.x / F3-2.0)
- Mapa a pantalla completa con **4 capas flotantes superpuestas**:
  FleetPanel flotante (arrastrable) + tray de Servicios flotante (arrastrable)
  + MissionCard flotante + rail admin plano.
- Panel del rail con superficie alpha "caja negra" (blur independiente del DS).

### AHORA (split view premium)
```
┌──────────┬──────────────────────────────┬─────────┐
│ SIDEBAR  │  MAPA (protagonista)         │ RAIL    │
│ Flota    │  Topbar + Buscador +         │ agrupado│
│ fija     │  Panel contextual (misión)   │ +PANEL  │
│ w-72     │                              │ DS 400px│
└──────────┴──────────────────────────────┴─────────┘
```
1. **Sidebar izquierda fija** (flex, no overlay): FleetPanel como columna real;
   overlay deslizante solo en móvil (<md).
2. **Tray de Servicios eliminado** → los Servicios viven como pestaña del panel
   derecho (un solo lugar por función; duplicación eliminada).
3. **Rail agrupado por responsabilidad** (§9): OPERAR (asignar/servicios/WhatsApp/chat),
   FLOTA (vehículos/tipos/operadores/clientes), CONTROL (reportes/rutas/tarifas).
4. **Panel derecho en superficie DS**: `--th-surface` + border (sin alpha-box ni blur
   "negro"). En dark y claro toma el token correcto.
5. **MissionCard = único panel contextual** (aparece solo al seleccionar unidad — §10).
6. **Topbar/Search/banner viven dentro del área del mapa** (composición correcta).

### Fix técnico incluido
`SizeInvalidator` (ResizeObserver → `map.invalidateSize()`): Leaflet requiere
invalidación cuando el contenedor cambia de tamaño (split view / paneles);
sin esto las tiles quedan desalineadas con huecos.

## Validación
- 79/79 tests (backend intacto, solo reorganización de shell).
- Capturas: claro (split view completo) y dark (con panel Servicios abierto,
  superficie DS, servicio de prueba de WhatsApp visible).
- data-testids conservados: `terminal-sidebar`, `terminal-map`, `menu-*`,
  `panel-*`, `servicios-tray` (ahora dentro del panel derecho).

## Compatibilidad
- Todas las funciones del rail (11 secciones) intactas.
- Picking, ServicioModal, WhatsApp→mapa, MissionCard (seguir/ruta/track): intactos.
- DraggablePanel ahora SOLO para la MissionCard contextual (arrastrable por diseño).
