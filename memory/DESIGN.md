# taxiHUB — Parámetros de Diseño (Design System)

Documento de referencia visual para mantener una identidad **orgánica y coherente**
entre las pantallas (Terminal/Dispatcher, Operador, Pasajero, Dev). Este documento es
normativo: ante cualquier cambio de UI, se debe cumplir. Las preferencias pueden
ajustarse en `frontend/src/index.css`; este doc describe el **porqué** y el **cómo**.

---

## 1. Modo de registro y protagonista

- **Modo:** *Operate* (el usuario completa una tarea; escaneabilidad y consistencia
  sobre expresión). El estilo es de "consola de control", no de página de marketing.
- **Protagonista absoluto:** el **mapa** y la flota en movimiento. Todo el chrome
  flotante debe **cederle protagonismo**: se encoge, se recoge, y no compite con él.

## 2. Paleta y color

- **Regla 60/30/10:** ~60% superficies neutras (zinc/grafito), ~30% tono secundario,
  ~10% acento de marca.
- **El color es semántico, nunca decorativo.** Gris construye estructura; el color
  comunica estado, identidad o acción.
- **Estados de conductor/servicio:** usar SIEMPRE las constantes de `lib/api.js`
  (`ESTADO_COLORS`, `SERVICIO_COLORS`) — nunca hex literal.
- **Acento de marca:** vía variables `--brand`, `--brand-bright`, `--brand-strong`
  (multi-paleta: esmeralda/oceano/ambar). No fijar verde esmeralda a mano.
- Los indicadores de flota conservan sus colores semánticos (libre/ocupado/pausado/
  offline/averiado) — son señales de estado, no decoración.

## 3. Estrategia de profundidad

- **Layered / "machined" (Double-Bezel).** Los contenedores flotantes sobre el mapa
  son "placas de vidrio en un chasis": shell exterior sutil + núcleo interior con su
  propio fondo.
- **Radios concéntricos:** `outerRadius = innerRadius + padding`. Nunca el mismo
  radio en padre e hijo.
- **Elevación:** `elev-1/2/3` existentes (borde O sombra, no ambos "fantasma").
- **En tema oscuro, la elevación se logra con bordes y tono, no con sombras fuertes.**

## 4. Glassmorphism — uso restringido

- `glass-panel` (blur) **solo en chrome flotante fijo**: header/cluster, rail lateral,
  tray de servicios, sidebar, panel del taxi, picking-banner.
- **Nunca** blur en contenido desplazable largo (listas, paneles de menú, tray). Eso
  dispara repintado de GPU y se ve sucio. El contenido desplazable usa superficies
  **opacas y quietas** (`bg-zinc-950/95` sin blur, o `surface-2`).

## 5. Tipografía

- **Familia:** Inter (existente, profesional). No introducir fuentes "display" de
  moda sin justificación. La identidad se gana por jerarquía, no por cambiar la fuente.
- **Jerarquía:** base 14px, ratio ~1.25. Peso + color + tracking hacen más trabajo que
  el tamaño solo.
- **Datos dinámicos (contadores, temporizadores, montos, distancias):** usar
  `tabular-nums` para evitar layout shift (utility `.mono-num`).
- **IDs/etiquetas técnicas:** monoespaciada (`font-mono`) para `#NÚMERO`, unidades,
  placa, hora del reloj de la consola.

## 6. Densidad y ritmo espacial

- **Tool-densa en paneles:** padding base 12–16px.
- **Respiración desigual:** agrupar lo relacionado y dejar aire real entre grupos.
- **Proporciones:** los paneles laterales ~300–400px (contenido servido por el mapa);
  el mapa domina el ancho.

## 7. Motion

- **Curva de entrada:** `cubic-bezier(0.23, 1, 0.32, 1)` (ease-out fuerte). Nunca
  `ease-in` para entradas.
- **Feedback de presión:** `transform: scale(0.97)` en `:active`, nunca por debajo 0.95.
- **Duración:** botones 100–160ms; dropdowns/popovers 150–250ms; paneles 200–500ms.
- **Solo `transform` y `opacity`** (composited). Nunca animar width/height/top/left.
- **Siempre respetar `prefers-reduced-motion`** (ya global en `index.css`).

## 8. Firma visual (elementos que hacen a taxiHUB taxiHUB)

1. **Instrument Cluster (header):** una sola consola flotante unificada que integra
   brand + reloj en vivo (mono, tabular) + indicadores de flota + CTA + perfil.
   Una pieza, no tres píldoras separadas.
2. **Píldoras de taxi en el mapa** (`lib/taxiIcon.js`): marcador con radio concéntrico
   y anillo de selección/siguiendo — la identidad visual de la flota.
3. **Mission Card:** el taxi seleccionado se lee como una "misión en vivo" (unidad,
   estado, precisión/velocidad/GPS como células tabulares) anclada al mapa.

## 9. Estados de componente (obligatorio)

- Todo control interactivo: default, hover, active, focus (`:focus-visible`), disabled.
- Todo dato: loading (`th-skeleton`), empty (`EmptyState`), error (toast).
- **Test IDs centralizados** en `frontend/src/constants/testIds/` — nunca strings
  sueltos en JSX. No romper los existentes.
- **Idioma:** textos de UI siempre en español.

## 10. Anti-reglas (evitar "AI slop")

- NO exceso de tarjetas iguales; variar ritmo y densidad.
- NO `rounded-2xl` repetido en todo; usar escala concéntrica.
- NO gradientes ni color decorativo; color = significado.
- NO cinco acentos; un acento de marca + colores semánticos de estado.
- NO sombras dramáticas en oscuro; borde + tono.
- NO glassmorphism decorativo en contenido desplazable.
- NO layouts monocordes: mapa siempre presente y visible.

---

## 11. Modos de apariencia (oscuro default / claro papel cálido)

- **Dos modos** controlados por `data-mode` en `<html>` (motor: `lib/theme.js`
  `applyMode/getMode`; hook `hooks/useMode.js`; botón de día/noche
  `components/ModeToggle.jsx` con `data-testid="mode-toggle"`).
- **Oscuro = predeterminado.** Sin atributo = look heredado (NUNCA se debe
  alterar el modo oscuro con el refactor del claro: es la línea base).
- **Claro ("papel cáildo")** se activa con `data-mode="claro"`:
  - Fondo `#f3eee4`, tinta grafito cálido (`#1f1c15`), hairline
    `rgba(60,52,40,.15)`; la profundidad se logra con **sombras suaves**
    (`.elev-*` claros), no bordes.
  - Acento de marca respeta `data-theme` actual (esmeralda/oceano/ambar) con
    variantes oscurecidas para contraste sobre papel.
  - Mapas CARTO `light_all`; popups/controles Leaflet claros.
  - Estados semánticos (badges) se adaptan con `.sem-badge` (color-mix vía
    `--sc`), nunca tintes hardcodeados.
- Los overrides del modo claro viven en `index.css`, bloque `[data-mode="claro"]`
  (misma técnica `!important` que las paletas). Al añadir un color zinc-* nuevo
  en el UI, revisar que exista su override claro.

## 12. Tratamiento "3D" (machined)

- **Regla:** 3D SUTIL y con función — da tacto de chasis/instrumento; nunca
  arbitrario. Se respeta `prefers-reduced-motion`.
- **Botones de icono elevados:** utilidad `.th-3d` (luz interior arriba +
  sombra interior abajo + drop suave; press = `translateY(1px)` con luz
  invertida). Aplicar solo a clústeres de acción (headers, rail del menú,
  toggles), no a cada botón.
- **Iconos:** `.th-icon-3d` (drop-shadow de vidrio/metal). Sin degradados
  decorativos.
- **CTA principal:** `.btn-primary-elev` con destello superior
  (`inset 0 1px 0` blanco) encima del pivote `--brand-strong` (look "pulsable").
- En claro los sombras se suavizan (`.th-hi`/`.th-lo`/`.th-drop` se ajustan por
  modo) para no romper el contraste.

---

*Última actualización: dualidad de modos (oscuro default / claro papel cáildo)
y tratamiento 3D sutil. Aplicar a las demás pantallas (Operador, Pasajero, Dev)
para mantener coherencia.*