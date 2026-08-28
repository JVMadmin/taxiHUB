# FASE 3 — CENTRO DE OPERACIONES (Command Center)

> Estado: refactorización por extracción completada y validada.
> Principio: cero cambios de lógica — solo reorganización en componentes del Design System 2.0.

## Qué se hizo

### Extracción de componentes (`src/components/ops/`)
| Componente | Responsabilidad | Líneas extraídas de Terminal.jsx |
|---|---|---|
| `OpsTopbar.jsx` | Consola superior: identidad, sitio/reloj, contadores de flota (SSOT), acciones, perfil, indicadores móviles | ~100 |
| `FleetPanel.jsx` | Panel lateral: filtro por ruta, búsqueda, lista de unidades, leyenda de estados | ~105 |
| `MissionCard.jsx` | Panel del taxi seleccionado: identidad, GPS, recorrido, ruta del servicio | ~145 |
| `OpsMobileDock.jsx` | Dock móvil: llamada, zoom, servicios, flota, menú | ~55 |
| `indicadores.js` | Definición de indicadores desde la SSOT (`design/status.js`) | ~10 |

### Resultado
- `Terminal.jsx`: 914 → ~560 líneas (−39%). Ahora es **orquestador**: mapa + estado + WS.
- La lógica de negocio (WebSocket, tracking 8 s, routing OSRM, picking, despacho) quedó **byte a byte idéntica**.
- Los componentes usan tokens DS 2.0 (`design/status`, `design/icons`); el mapa usa `PALETA` de la SSOT para origen/destino/ruta.

### Correcciones durante la fase
- Import faltante `ServiciosPanel` detectado por captura visual (ErrorBoundary) — corregido y revalidado.
- Catálogo de iconos completado (`Filter`, `LayoutPanelLeft`, `Menu`, `Minus`, `ClipboardList`, `RouteIcon`).

## Validación
- `yarn build` OK (CRA producción).
- 32/32 tests backend OK.
- Captura visual desktop: topbar con contadores (1 Disponible), panel flota con unidad en vivo, leyenda 2.0, tray de servicios y mapa con rótulos — todo funcional.

## Pendiente de fases siguientes (no de esta fase)
- Sidebar permanente por módulos (FLOTA/SOCIOS/REPORTES/CONFIG del prompt) → llega con F4+ cuando existan las pantallas destino; hoy el rail admin (TerminalMenu) cumple ese rol.
- MapSearch global → F4.
- Migración completa de zinc→tokens en TerminalMenu/ServiciosPanel → se hace al tocar cada uno (regla de no-regresión).
