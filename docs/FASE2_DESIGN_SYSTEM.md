# FASE 2 — DESIGN SYSTEM TaxiHUB 2.0

> Estado: implementada la capa base. Estrategia aditiva: convive con el sistema 1.x;
> las pantallas migran por fases (F3 Centro de Operaciones primero).

## 1. Arquitectura del Design System

```
frontend/src/design/
├── tokens.css      ← Tokens: paleta, superficies dark/claro, tipografía, sombras,
│                     radios, componentes primitivos (.th-card, .th-btn, .th-status,
│                     .th-map-ctl, clases tipográficas .th-display…)
├── status.js       ← SSOT de estados: ESTADOS_OPERADOR / SERVICIO / UNIDAD /
│                     DOCUMENTO / OBJETO + helpers (colorDe, labelDe, estiloEstado)
└── icons.js        ← Catálogo de iconografía curada (re-exporta lucide; un solo estilo)

frontend/src/components/maps/
├── TaxiMarker.jsx       ← Marcador de unidad (color por SSOT, memoizado)
├── PickupMarker.jsx     ← Punto de origen (verde de marca)
├── DestinationMarker.jsx← Punto de destino (rojo)
├── RouteLine.jsx        ← Trazo de ruta (service con casing / track punteado)
├── MapControls.jsx      ← Controles flotantes (zoom/ubicar)
├── FleetLayer.jsx       ← Capa de flota memoizada
└── index.js             ← Barrel
```

## 2. Tokens (paleta normativa del prompt)

| Token | Valor | Uso |
|---|---|---|
| `--th-primary` | `#10B981` | Identidad de marca, acciones primarias |
| `--th-primary-dark` | `#047857` | Hover/pressed, contraste sobre claro |
| `--th-primary-light` | `#D1FAE5` | Fondos suaves de marca |
| `--th-success` | `#10B981` | Estado disponible/vigente/completado |
| `--th-danger` | `#EF4444` | Ocupado/vencido/cancelado |
| `--th-warning` | `#F59E0B` | Pausado/mantenimiento/pendiente |
| `--th-info` | `#3B82F6` | En camino/ofrecida/info |
| `--th-purple` | `#8B5CF6` | Averiado/asignado |
| `--th-bg` | dark `#07131D` / claro `#F6F8F7` | Fondo del producto |
| `--th-surface` | dark `#0D1B26` / claro `#FFFFFF` | Cards/paneles |
| `--th-text` | dark `#E8EEF2` / claro `#172026` | Texto |
| `--th-muted` | dark `#8A97A0` / claro `#6B7280` | Texto secundario |
| `--th-border` | dark `#1C2F3D` / claro `#E5E7EB` | Bordes |

Dark es el modo por defecto; `html[data-mode="claro"]` activa la paleta clara normativa.
También disponibles en Tailwind como `bg-th-primary`, `text-th-muted`, `border-th-border`, etc.

## 3. Tipografía

Escala `Display / H1 / H2 / H3 / Body / Body-Small / Label / Caption / Metric / Numeric`.
Dos vías equivalentes: clases utilitarias CSS (`.th-display`…`.th-numeric`) o clases
Tailwind (`text-display`, `text-h1`…, `text-metric`, `text-num`). Métricas con
`tabular-nums` para evitar saltos de layout en contadores.

## 4. Sistema de estados (SSOT)

Fuente única: `src/design/status.js`. `lib/api.js` re-exporta `ESTADO_COLORS`,
`ESTADO_LABEL`, `SERVICIO_COLORS`, `SERVICIO_LABEL` desde aquí — los consumidores
existentes no cambiaron y ya usan la nueva paleta.

| Estado operador | Color | Label |
|---|---|---|
| `libre` | `#10B981` | Disponible |
| `ocupado` | `#EF4444` | Ocupado |
| `no_disponible` | `#F59E0B` | Pausado |
| `fuera_de_servicio` | `#6B7280` | Offline |
| `averiado` | `#8B5CF6` | Averiado |
| `en_camino` *(reservado F5)* | `#3B82F6` | En camino |
| `mantenimiento` *(reservado F9)* | `#F59E0B` | Mantenimiento |

Los estados `reservado` ya están definidos para que backend/frontend los adopten
sin re-trabajo; la UI actual no los muestra (leyenda filtrada por `ORDEN_CONTEO_FLOTA`).

## 5. Map components

Componentes reutilizables construidos sobre react-leaflet + `lib/taxiIcon` (no se
duplican iconos). `TaxiMarker` y `FleetLayer` están memoizados para performance con
flotas grandes (solo re-renderizan unidades actualizadas). `MapControls` expone
`data-testid` (`map-zoom-in/out/locate`).

## 6. Reglas visuales (del prompt)

- Verde `#10B981` = identidad. Sin abuso de gradientes ni glassmorphism.
- Sombras moderadas (`--th-shadow-1/2`), radios consistentes (`--th-radius-*`).
- Badge de estado siempre con punto + texto (nunca color únicamente) — accesibilidad.
- `data-testid` en componentes interactivos nuevos (convención kebab-case).

## 7. Migración progresiva (no big-bang)

1. F2 (esta fase): SSOT + tokens + map components. Terminal ya consume la nueva
   paleta de estados vía re-exports (contadores y leyenda incluidos).
2. F3: Centro de Operaciones consume `.th-card/.th-btn/th-*` y map components.
3. F4+: cada pantalla nueva nace 100% en tokens 2.0; las existentes migran al tocarlas.

## 8. Validación de esta fase

- `yarn build` OK (compilación de producción).
- 32/32 tests backend OK (sin cambios de backend).
- Captura visual de Terminal: contadores/leyenda con paleta 2.0.
- Compatibilidad verificada: Pasajero/Operador/Dueño consumen re-exports sin cambios.
