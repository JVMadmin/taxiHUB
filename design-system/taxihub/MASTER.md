# TaxiHUB — Sistema de diseño de la web pública (taxihub.cloud)

Generado con la skill **UI/UX Pro Max** (`.agents/skills/ui-ux-pro-max`, comando
`search.py "SaaS B2B fleet dispatch taxi real-time dark dashboard" --design-system --variance 6 --motion 7 --density 4`)
y **adaptado** a la identidad existente. La salida cruda de la skill propuso verde neón `#00FF41` + rojo y
tipografía serif de "real estate"; ambas se descartaron por contradecir la marca (esmeralda sobre fondo oscuro).

## Patrón de página
`Real-Time / Operations Landing` (skill, dominio `landing`): Hero con vista previa del producto → indicadores →
cómo funciona → CTA. Reglas heredadas: CTA primario en nav y tras métricas, telemetría etiquetada como demo
(no "en vivo" si no hay fuente), controles de pausa, estado final estático con `prefers-reduced-motion`.

## Identidad (se conserva)
- Logotipo: `BrandMark` (cuadro esmeralda con icono de auto) + wordmark `taxi` + `HUB` (`components/Brand.jsx`). No se redibuja.
- Paleta: fondo `#050505/#07090D`, superficies `#0B0D10/#12151B`, texto `#F5F5F7`, texto secundario `#9CA0AA`,
  marca esmeralda `#10B981` (`hsl(var(--brand))`), índigo `#4F5DFF` solo como acento secundario, ámbar `#F59E0B` solo para estado "ocupado".

## Tipografía (skill, dominio `typography`)
- Plus Jakarta Sans (800/700 titulares, 500/400 cuerpo) — "B2B SaaS, profesional y accesible".
- Fira Code para telemetría, atajos y cifras (precio) — "Dashboard Data".
- Cuerpo ≥16px, interlineado 1.5, titulares 1.05–1.15.

## Movimiento (skill, dominio `gsap`/`ux`; motor: Motion (`framer-motion`))
- Micro-interacciones 150–300 ms; revelados 500–700 ms; easing `[0.32, 0.72, 0, 1]`.
- Animar solo `transform` y `opacity`. Una sección con scroll-linked sticky como máximo.
- `prefers-reduced-motion`: estado final inmediato, sin parallax ni bucles.
- Video: sin autoplay, `controls`, `preload="none"`, poster, subtítulos incrustados en el propio video.

## Antipatrones evitados
Emoji como iconos (se usa Lucide), degradado de texto morado/índigo, insignias inventadas ("V4.2 PRO MAX"),
métricas no verificables ("1.4 segundos"), hover como única interacción, objetivos táctiles < 44 px.

## Revisión de calidad (Apple Design)
`.agents/skills/apple-design`: se aplicaron `accessibility.md`, `typography.md`, `color.md`, `layout.md`, `motion.md`
como filtro de calidad (contraste calculado, tamaños mínimos, movimiento reducido, jerarquía) sin imitar estética de Apple.
