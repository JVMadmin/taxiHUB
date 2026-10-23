# TaxiHUB — Sistema de Diseño Integral (Amarillo Luminoso & Obsidian)

Plataforma de radiodespacho y control satelital para sitios y cooperativas de radio taxi.
Identidad visual oficial: **Amarillo Taxi Luminoso (*Electric Taxi Glow*)**, contrastado sobre superficies oscuras carbón/obsidiana (`#0B0D10` / `#11141D`), eliminando los verdes genéricos y elevando el producto a un estándar de alta gama tecnológico.

---

## 1. Identidad Visual de Marca (taxiHUB)

### 1.1 Isotipo Vectorial Oficial (`BrandMark`)
- **Composición:** Pin GPS satelital con gradiente luminoso (`#FFE600` &rarr; `#FF9900`), silueta frontal de taxi con copete y faros iluminados, y ondas superiores de radiodespacho.
- **Contenedor:** Cápsula geométrica con fondo grafito profundo (`#181B22` &rarr; `#0C0E14`), bisel perimetral en ámbar/amarillo (`rgba(255, 230, 0, 0.4)`) y resplandor sutil (`shadow-[0_4px_18px_rgba(255,230,0,0.22)]`).
- **Archivos Vectoriales:**
  - `frontend/public/assets/branding/logo.svg` (Isotipo + Wordmark horizontal).
  - `frontend/public/favicon.svg` (Favicon oficial escalable para navegadores modernos).

### 1.2 Wordmark y Subtítulo (`BrandWordmark`)
- **Nombre:** `taxi` en blanco puro / pizarra (`#F8FAFC` en dark, `#0F172A` en claro) + `HUB` en amarillo luminoso (`#FFE600`) con halo luminiscente (`text-shadow: 0 0 14px rgba(255, 230, 0, 0.45)`).
- **Subtítulo Oficial:** `CENTRAL Y DESPACHO SATELITAL` (en monospace, uppercase, tracking `0.16em`).

---

## 2. Paleta de Colores y Tokens de Diseño

| Rol Semántico | Token / Variable | Valor HEX / HSL | Uso Principal |
| :--- | :--- | :--- | :--- |
| **Marca Principal** | `--th-primary` / `--brand` | `#FFE600` / `49 100% 50%` | Botones de acción principal (CTA), bordes de foco, acentos de marca. |
| **Marca Secundario** | `--th-primary-dark` | `#FFB800` | Hover en botones primarios, paradas de gradientes. |
| **En Vivo / Libre** | `--th-live` / `ESTADOS_OPERADOR.libre` | `#FFE600` | Unidades disponibles, chip "Disponible", marcadores GPS en mapa. |
| **Superficie Lienzo** | `--th-bg` / `--background` | `#0B0D10` / `#070809` | Fondo general de apps (Terminal, Operador, Pasajero en modo oscuro). |
| **Superficie Elevada** | `--th-surface` / `--card` | `#17191E` / `#11141D` | Paneles flotantes, bottom sheets, modales y formularios. |
| **Superficie Secundaria** | `--th-surface-2` | `#1B1E24` | Inputs, filas de tabla, tarjetas secundarias. |
| **Texto de Alto Contraste** | `--primary-foreground` / `--brand-contrast` | `#0C0E14` (Tinta negra) | Texto sobre botones o badges amarillos luminosos (WCAG AAA). |
| **Texto Principal** | `--th-text` / `--foreground` | `#F5F5F7` / `#F8FAFC` | Títulos y etiquetas en tema oscuro. |
| **Texto Silenciado** | `--th-muted` / `--muted-foreground` | `#9CA0AA` / `#64748B` | Subtítulos, timestamps, telemetría secundaria. |
| **Peligro / Ocupado** | `--th-danger` / `ocupado` | `#F4544C` | Unidades ocupadas, servicios cancelados, acciones destructivas. |
| **Alerta / Pausa** | `--th-warning` / `no_disponible` | `#FF9900` | Choferes en pausa, servicios pendientes. |
| **Información / Ruta** | `--th-info` / `en_camino` | `#38BDF8` | Rutas de navegación, conductor en camino. |

---

## 3. Tipografía y Jerarquía
- **Familia Primaria:** Inter (400 regular, 500 medium, 600 semibold, 700 bold, 800 extrabold).
- **Familia Monospace:** Fira Code / ui-monospace para telemetría, contadores de turno, cronómetros y placas económicas (`#TX-101`).
- **Escala de Botones y Objetivos Táctiles:** Mínimo 44px de altura (`min-h-[44px]` o `min-h-[48px]`), bordes redondeados ergonómicos (`rounded-xl` / `rounded-2xl`).

---

## 4. Mapas y Telemetría en Tiempo Real
- **Ruta Activa (`RouteLine`):** Trazo principal en amarillo luminoso (`#FFE600`) con un contorno exterior oscuro profundo (`#04110C`, 9px) que garantiza 100% de visibilidad tanto en mapa diurno como nocturno.
- **Marcadores de Unidad (`pillCarIcon`):** Insignia rotatoria 360° con silueta vector de taxi, flecha de rumbo del vehículo y anillo perimetral pulsante cuando la unidad está seleccionada.
- **Pines de Origen y Destino:** Origen en amarillo luminoso (`#FFE600`) y destino en rojo coral (`#F4544C`).

---

## 5. Módulos y Aplicaciones Integradas

1. **Terminal de Central (`/terminal`):**
   - Mapa interactivo con filtro de flota por estado en amarillo luminoso.
   - Panel de despacho y cotizador con rutas automáticas.
2. **App del Operador / Chofer (`/operador`):**
   - Header flotante con cronómetro de turno y estado de GPS.
   - Selector tipo segmented control para cambiar entre Disponible (`#FFE600`), Ocupado (`#F4544C`) y Pausado (`#FF9900`).
   - Botones de acción de viaje con feedback táctil y aura luminosa.
   - Chat directo con el pasajero con envío de imágenes.
3. **App del Pasajero (`/pasajero`):**
   - Localización en mapa en tiempo real de unidades libres cercanas.
   - Cotizador de tarifa predefinida y cálculo de ruta.
   - Pantalla de espera de confirmación compacta y moderna.
   - Chat directo con el conductor (burbujas en amarillo luminoso y panel con vista previa de fotos).
4. **Panel del Socio / Dueño (`/dueno`):**
   - Dashboard ejecutivo, liquidación de combustible y comisiones de flota.
5. **Web Pública (`https://taxihub.cloud`):**
   - Landing moderna con simulador de despacho, cotizador interactivo y descarga directa de instaladores y APKs.
