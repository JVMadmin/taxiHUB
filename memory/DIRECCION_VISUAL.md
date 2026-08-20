# Dirección visual — aprobada y aplicada en toda la app

**Estado:** dirección aprobada por el usuario el 2026-08-18. Aplicada el mismo día en tres pasadas: primero **Pasajero** y **Operador** (a petición explícita), después **Terminal** (Terminal.jsx, TerminalMenu.jsx, ServiciosPanel.jsx) y **Dev** (DevPanel.jsx) a petición de "continuar", y finalmente los **9 archivos periféricos restantes** (Brand.jsx, ConfirmAction.jsx, EmptyState.jsx, ModeToggle.jsx, ServicioModal.jsx, TerminalDisplayControls.jsx, ThemeSwitcher.jsx, TerminalLogin.jsx, pages/dueno/Mapa.jsx) en una sesión nueva. Dueño ya nació con tokens desde el principio.

Con esto, **0 usos de `zinc-*` quedan en `frontend/src`** (bajó de ~570 al inicio). Las 5 superficies de la app usan el mismo lenguaje visual: Button unificado, tokens de color, marcador de vehículo compartido (`pillCarIcon`, incluyendo ahora el Mapa del Dueño, que usaba `car3dIcon`).

Preview: [taxiHUB Reimaginado](https://claude.ai/code/artifact/8d048168-e3da-4a17-8fa9-2df9f571d5f3)

## Lección importante: "tokens aplicados" ≠ "coincide con el pitch"

El 2026-08-18, después de reportar las 3 pasadas de arriba como completas, el usuario comparó la pantalla real de "viaje activo" del Pasajero contra el mockup del pitch y señaló correctamente que **no se parecían en nada** — tenía razón. Lo que se hizo en las pasadas anteriores fue tokenizar (zinc-* → tokens, Button unificado, pillCarIcon) manteniendo la ESTRUCTURA/composición original de cada pantalla. El pitch, en cambio, propone una composición distinta para la pantalla de viaje: mapa a pantalla completa, pill de estado flotante, bottom sheet anclado sobre el mapa (no una tarjeta separada debajo). Aplicar tokens a la estructura vieja nunca iba a producir esa composición.

**Corregido el mismo día**: se reconstruyó `PassengerApp.jsx`'s vista "viaje" (servicio activo) para igualar la composición del pitch — ver sección siguiente. **Moraleja para cualquier pantalla que quede pendiente de contrastar contra el pitch**: no asumir que la migración de tokens ya cerró la brecha. Hay que comparar composición contra el mockup real (`WebFetch` a la URL del artefacto trae el HTML/CSS fuente exacto), no solo paleta de color.

## Corregido: vista "viaje" (servicio activo) del Pasajero — igualada al pitch

- **Backend** (`backend/server.py`, función `_servicio_para_pasajero`): se agregó `telefono` al dict `out["taxi"]` — el dato ya existía en `operadores.telefono`, solo no se exponía a este endpoint. Habilita un botón de llamada real (`tel:`), no inventado.
- **Frontend** (`PassengerApp.jsx`, vista `"viaje"` con `servicio` activo): reestructurada de "mapa en tarjeta de 256px + tarjeta de conductor separada debajo" a mapa inmersivo a toda la altura disponible (`h-[calc(100vh-4.25rem)]`), con:
  - Pill de estado flotante arriba (reutiliza `ServicioBadge`, no un componente nuevo).
  - Sheet inferior anclado al **contenedor del mapa** (`absolute`, no `fixed` como el `BottomSheet` compartido) para no taparse con la nav inferior fija de Pasajero — decisión deliberada de NO reusar el componente `BottomSheet.jsx` aquí porque ese es `fixed` a todo el viewport y competiría en z-index con `pas-nav-mobile`.
  - Fila de metadatos (distancia + método de pago) — nuevo helper compartido `metodoPago()` extraído a `lib/utils.js` (antes duplicado localmente en `ServiciosPanel.jsx`).
  - Botón de llamada (`tel:`) + "Cancelar viaje" en la misma fila de acciones.
- Verificado end-to-end con datos reales: se creó una solicitud como pasajero, se despachó/asignó desde Terminal, y se confirmó que la vista renderiza igual que el mockup (avatar CR, TX-101, ETA tabular, distancia, botón de llamada con `tel:916-200-0001` real). 24/24 tests de backend siguen pasando.
- **No se tocó** el resto de las vistas de Pasajero (solicitar/historial/perfil) ni Operador — el pitch solo mostraba esta pantalla específica como referencia; si Operador tiene una pantalla equivalente (oferta/en camino) que también debería igualar esta composición, es trabajo pendiente no solicitado aún.

## Bugs reportados el mismo día tras el rediseño de "viaje" — los 3 corregidos

El usuario reportó dos síntomas tras la vista inmersiva: **(1)** el mapa se veía "sobrepuesto" al sheet de cancelación, y **(2)** al despachar/asignar un taxi, no aparecía en la pantalla del Operador. Investigado con sesiones reales de Pasajero + Terminal + Operador en paralelo (3 tabs de navegador), no con suposiciones:

1. **Z-index de Leaflet vs. el sheet (`PassengerApp.jsx`)** — `.leaflet-container` tiene `position:relative` pero **sin `z-index` propio**, así que NO crea su propio stacking context; sus panes internos (`marker-pane` en `z-index:600`, controles en `1000`) terminaban compitiendo directamente contra el sheet (`z-[10]`) en el contexto del padre — y ganaban. Confirmado con `getComputedStyle` antes/después. **Fix:** envolver el `MapContainer` en un `<div className="absolute inset-0 z-0">`, el mismo patrón que ya usa `Terminal.jsx:311`. Verificado con `elementFromPoint` sobre el botón "Cancelar viaje": antes de tocarlo apuntaba al mapa, después apunta al botón.
2. **`POST /dispatch/offer` nunca notificaba a los operadores ofertados (`backend/server.py`, `_notificar_servicio`)** — la función solo hacía `send_operador` cuando `operador_asignado_id` estaba seteado, pero al *ofertar* (a diferencia de *asignar*) ese campo queda vacío a propósito (se llena solo cuando alguien acepta); el candidato solo vive en `ofrecido_a`. Resultado: el conductor nunca veía la oferta, sin importar cuántos taxis hubiera disponibles — el flujo de "Despachar" estaba roto desde antes de esta sesión, no es una regresión del rediseño visual. **Fix:** cuando `estado == "ofrecido"`, hacer `send_operador` a cada id en `ofrecido_a`; cuando es `asignado`/`en_curso`, se mantiene el envío único a `operador_asignado_id` de siempre. Verificado end-to-end: Terminal despacha → Carlos Ramírez ve la tarjeta "NUEVO SERVICIO" con cuenta regresiva → acepta → Pasajero ve el viaje asignado en tiempo real.
3. **Bug menor relacionado, mismo hallazgo:** `GET /servicios/mis-activos` no llamaba a `_expirar_ofertas_vencidas()` antes de leer, así que una oferta ya vencida (nunca limpiada, sin job de fondo) se colaba como "activa" y el conductor veía un toast fantasma de "Oferta expirada" en cada login. Fix de una línea: llamar a esa función (ya existente, usada en `_buscar_candidatos`) al inicio del endpoint.

Los 24 tests de backend se re-ejecutaron después de cada uno de estos 3 fixes, siempre en verde.

## La tesis

No es un cambio de identidad — taxiHUB ya es oscuro con acento esmeralda (`memory/DESIGN.md`). Lo que falta es ejecutarlo con disciplina en toda la app: escala tipográfica real, marcador de vehículo con identidad propia, tarjetas con la superficie "machined" que hoy solo vive en el Terminal.

## Decisiones fijadas por el preview

- **Sin tipografía nueva** — una sola familia (la que la app ya carga), jerarquía por peso/tracking/tabular-nums. `DESIGN.md` ya lo prohibía explícitamente; el preview lo respeta.
- **Sin cambio de paleta de marca** — mismo esmeralda, mismos 5 colores de estado semánticos. Los grises ganan un tono de temperatura (dejan de ser zinc puro), no cambia el hue de marca.
- **Marcador de vehículo nuevo**: placa redondeada, acento de marca, indicador de rumbo (triángulo), anillo de estado, anillo pulsante al seleccionar. Reemplaza el ícono genérico actual de `car3dIcon()`.

## Ya implementado (Pasajero + Operador)

- **`pillCarIcon()` nuevo** en `frontend/src/lib/taxiIcon.js` — placa redondeada, color de estado/marca, triángulo de rumbo, anillo de selección pulsante (`.th-marker-ring` en `index.css`). Acepta `color` explícito para el caso "tu taxi en vivo" (sin estado de flota relevante). **`car3dIcon()` no se tocó** — Terminal y el Mapa del dueño lo siguen usando, fuera de alcance de esta pasada.
- **`iniciales()`** extraído a `frontend/src/lib/utils.js` (evita duplicar el helper de avatar entre Pasajero y Operador).
- **Tokens en vez de `zinc-*`** en `OperadorLogin.jsx`, `OperadorApp.jsx` y `PassengerApp.jsx` (0 ocurrencias de `zinc-*` restantes en esos archivos).
- **`tailwind.config.js`**: se agregó `brand.contrast` (existía la variable CSS `--brand-contrast`, faltaba el mapeo a clase Tailwind — lo necesitaban los avatares nuevos).
- **`BottomSheet.jsx`** (existía sin usar) ganó un modo `dismissible={false}` para paneles de estado persistente (no todo bottom sheet es un modal descartable) y también se le quitó su propio `zinc-*`. Las 4 bottom sheets de `OperadorApp.jsx` ahora son una sola definición reutilizada, no 4 copias del mismo markup.
- **Tarjeta de conductor** con el lenguaje del preview (avatar con iniciales + gradiente de marca, placa en chip mono, ETA grande tabular) en: la tarjeta de viaje del pasajero, y el `ClienteAvatar` en las tarjetas de oferta/asignación del conductor.
- Verificado en navegador contra el backend real: marcador confirmado renderizando en un mapa real (rotación por rumbo + anillo pulsante), tarjeta de conductor confirmada con datos reales, sin regresiones ni errores nuevos de consola.

## Ya implementado (Terminal + Dev — segunda pasada)

- **Terminal.jsx**: marcador de flota migrado de `car3dIcon()` a `pillCarIcon()`, reutilizando `colorForOperador()` sin cambios (pasado como `color` override, ver nota abajo) para conservar el color-por-ruta cuando hay un filtro activo. **No se tocó** `DraggablePanel`, ningún valor `z-[...]`, ni la lógica de posicionamiento absoluto de los paneles — el riesgo identificado (paneles flotantes sin tests) se evitó por scope, no por suerte. 0 `zinc-*` restantes.
- **TerminalMenu.jsx** y **ServiciosPanel.jsx**: los 74 y ~15 usos de `zinc-*` restantes (los 7 sub-paneles del menú, las tarjetas de servicio y candidatos) migrados a tokens. 0 restantes en ambos.
- **DevPanel.jsx**: `Button` unificado + tokens; los colores `emerald-500`/`bg-red-500` hardcodeados (nunca tocados por el preview original) también migrados a las variantes `primary`/`destructive`.
- **Nota técnica sobre `pillCarIcon`**: acepta un `color` override (además de `estado`) precisamente para este caso — Terminal necesita que el color del marcador sea "el color de la ruta filtrada, si hay una" en vez de "el color del estado del operador", y `colorForOperador()` ya resolvía esa prioridad; `pillCarIcon` solo consume su resultado.
- Verificado en navegador: marcadores nuevos confirmados en el mapa del Terminal (`.th-pill-car`, 2 unidades), Mission Card, panel de Vehículos y login de Dev funcionando sin regresiones ni errores de consola nuevos.

## Ya implementado (9 archivos periféricos — tercera pasada, sesión nueva)

- **`Brand.jsx`**: `BrandMark`/`BrandWordmark` a tokens (`text-brand-contrast`, `text-foreground`, `text-muted-foreground`).
- **`ConfirmAction.jsx`**: diálogo de confirmación crítica a `bg-popover`/`border-border`/tokens de texto; el botón "no-danger" pasa a `text-brand-contrast`.
- **`EmptyState.jsx`**: borde punteado y textos a tokens (`border-border`, `bg-card/40`, `bg-secondary`, `text-muted-foreground`).
- **`ModeToggle.jsx`** y **`ThemeSwitcher.jsx`**: botones/paneles flotantes del header a tokens (`text-foreground/80`, `hover:bg-secondary`, `bg-card`).
- **`TerminalDisplayControls.jsx`**: popover de ajustes de pantalla a tokens; se conserva el `style` inline con la variable `--ui-alpha` (es funcional, controla la transparencia en vivo, no decorativo).
- **`ServicioModal.jsx`** (19 ocurrencias, el más grande de esta pasada): modal de nueva llamada migrado a tokens + `Button` unificado (`variant="ghost"` para Cancelar, `loading` para Crear servicio).
- **`TerminalLogin.jsx`** (14 ocurrencias): reescrito para igualar el patrón exacto de `DuenoLogin.jsx`/`OperadorLogin.jsx` — `Button` unificado con `loading`, `bg-background`/`bg-card` en vez de `zinc-950`.
- **`pages/dueno/Mapa.jsx`**: además del único `zinc-500` en el popup, se migró su marcador de `car3dIcon()` a `pillCarIcon()` (era el último call site pendiente) — con esto los 5 mapas de la app (Terminal, Operador, Pasajero, Dueño/Flota, Dueño/Mapa) usan el mismo marcador.
- Verificado en navegador contra el backend real: `ServicioModal` (fondo `rgb(22,22,24)`, botón submit `rgb(54,211,153)` = brand), `ConfirmAction` (alertdialog con los mismos tokens), `EmptyState` (borde punteado + `bg-card/40`) confirmados renderizando con los valores de color esperados. `grep -rc "zinc-" frontend/src` → 0 resultados en todo el árbol.
- Regresión backend completa re-ejecutada al cierre (`pytest tests/`) para confirmar que ningún cambio de frontend afectó nada del backend (por diseño, no debería — pero se corrobora igual).

## Pendiente (fuera de esta pasada)

1. Escala tipográfica de 6 pasos formalizada como tokens en `index.css` (hoy la disciplina de color ya es consistente vía tokens; los tamaños sueltos `text-[10px]`/`text-[11px]` siguen sin una escala formal). Esto es ahora lo único que queda de la lista original de pendientes visuales.
2. El sistema de anclaje de paneles flotantes del Terminal en sí (RSP-01/02/03/04 de `memory/AUDITORIA.md`) sigue sin rediseñar — solo cambió su piel visual, no su mecánica de drag/z-index.
3. Los 7 hallazgos de seguridad P0 (`SEC-01`–`SEC-07`) de `memory/AUDITORIA.md` siguen sin atacar — nunca formaron parte del alcance visual.

## Cómo retomar esto

`pillCarIcon`, `iniciales()`, el patrón de tarjeta con avatar/chip-mono/ETA-tabular, el modo `dismissible={false}` de `BottomSheet`, y el componente `Button` ya existen y son el vocabulario a reutilizar. La migración `zinc-*` → tokens está **completa** (0 restantes); lo que queda pendiente es la escala tipográfica formal, el rediseño de la mecánica de paneles del Terminal, o la seguridad P0 — tres pistas independientes, cualquiera se puede retomar sin coordinación con las otras.
