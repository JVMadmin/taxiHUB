# TaxiHUB — Documento de Diseño e Identidad Visual (`DESIGN.md`)

**Versión:** 2.3 (Amarillo Luminoso sobre azul negro profundo)  
**Dominio Oficial:** `https://taxihub.cloud`  
**Última Actualización:** 2026-10-23  

---

## 1. Filosofía de Diseño: Deporte Tecnológico & Taxi de Alta Gama

Se descartaron los esquemas genéricos de verdes fluorescentes para adoptar la **identidad emblemática del taxi moderno**:
- **Color Núcleo:** Amarillo Luminoso (*Luminous Cyber-Taxi Yellow* `#FFE600` / `#FFD000` con gradiente cálido a `#FF9900`).
- **Superficies:** Azul negro profundo (`#050B12` fondo, `#0A121D` y `#0F1926` superficies), con bordes azul grisáceo de baja intensidad.
- **Verde (`#22C55E`):** exclusivamente para estados operativos positivos (Disponible, En línea, GPS OK, Completado).
- **Micro-interacciones:** Resplandores suaves (*glow* perimetral `rgba(255, 230, 0, 0.28)`), transiciones de 150-250ms y botones con retroalimentación visual al presionar.

---

## 2. Especificación de Tokens y Paleta de Colores

### 2.1 Colores Principales (Variables CSS en `tokens.css`)

```css
:root {
  /* Marca Principal */
  --th-primary: #FFE600;
  --th-primary-dark: #FFB800;
  --th-primary-light: #FFF8C5;
  --th-primary-soft: rgba(255, 230, 0, 0.15);

  /* Acento en vivo de la marca (no confundir con estados positivos) */
  --th-live: #FFE600;
  --th-success: #22C55E; /* Disponible, En línea, GPS OK, Completado */

  /* Superficies (azul negro profundo) */
  --th-bg: #050B12;
  --th-surface: #0F1926;
  --th-surface-2: #13202F;
  --th-surface-3: #162436;
  --th-border: rgba(148, 172, 204, 0.12);

  /* Tipografía y contraste */
  --th-text: #EDF2F8;
  --th-muted: #93A4B8;
  --primary-foreground: #050B12; /* Texto sobre fondo amarillo */
}
```

### 2.2 Semántica de Estados Operativos (`status.js`)

| Estado | Clave | Color HEX | Etiqueta | Aplicación |
| :--- | :--- | :--- | :--- | :--- |
| **Disponible** | `libre` | `#22C55E` | "Disponible" | Marcadores en mapa, contadores de flota, botón de estado del chofer. |
| **Ocupado** | `ocupado` | `#F4544C` | "Ocupado" | Vehículo con pasaje a bordo o viaje en curso. |
| **Pausado** | `no_disponible` | `#FF9900` | "Pausado" | Operador en descanso o carga de combustible. |
| **Averiado** | `averiado` | `#9A6BFF` | "Averiado" | Unidad reportada con falla mecánica. |
| **Offline** | `fuera_de_servicio` | `#9CA0AA` | "Offline" | Operador sin sesión activa o sin señal GPS. |

---

## 3. Componentes de Identidad Visual

### 3.1 `BrandMark` (`frontend/src/components/Brand.jsx`)
Isotipo vectorial con **Pin GPS satelital**, silueta de taxi frontal con copete iluminado y ondas concéntricas de radio. Soporta tamaños:
- `xs` (28x28px): Badges y tablas compactas.
- `sm` (36x36px): Barra de navegación superior (Landing, Pasajero).
- `md` (44x44px): Tamaño estándar predeterminado.
- `lg` (56x56px): Pantallas de inicio de sesión (Operador, Dueño, Terminal).
- `xl` (72x72px): Vistas de bienvenida y splash.

### 3.2 `BrandWordmark` (`frontend/src/components/Brand.jsx`)
Renderiza `taxi` en blanco puro y `HUB` en amarillo luminoso con halo (`text-shadow`), junto con el subtítulo oficial:
`CENTRAL Y DESPACHO SATELITAL`.

### 3.3 Favicon y Metadatos
- `frontend/public/favicon.svg`: Icono vectorial escalable para navegadores de escritorio y móviles.
- `frontend/public/manifest.json`: Configurado con tema `#050B12` e icono SVG maskable.
- `frontend/public/assets/branding/logo.svg`: Logo completo para exportación y uso en documentos.

---

## 4. Diseño de Pantallas Clave

### 4.1 App del Operador (`/operador`)
- Header flotante con foto de perfil con aro amarillo (`ring-[#FFE600]`), cronómetro de turno mono-espaciado y kilometraje.
- Control de estado tipo *segmented control* donde "Disponible" resalta en amarillo luminoso con texto en contraste oscuro.
- Botones de acción de gran tamaño con bordes `rounded-2xl` y sombra luminosa.
- Chat directo con el usuario con burbujas de mensaje del operador en amarillo taxi.

### 4.2 App del Pasajero (`/pasajero`)
- Mapa en tiempo real con marcadores amarillos de unidades libres.
- Cuadro de cotización de viaje moderno con cálculo de tarifa y tiempo de llegada.
- Modal de chat estilizado en `#11141D` con opción para tomar y enviar fotos de punto de encuentro.
- Barra inferior con iconos táctiles y estado activo en amarillo luminoso.

### 4.3 Terminal de Despacho (`/terminal`)
- Mapa táctico con capas de calor, unidades en patrullaje continuo y panel de comandos con atajos de teclado.

### 4.4 Landing Web Pública (`https://taxihub.cloud`)
- Navegación sticky de cristal templado.
- Hero con titular en gradiente amarillo-ámbar de alto impacto.
- Simulador de despacho en tiempo real con unidades orbitando sobre Palenque.
- Calculadora de precios con selector deslizante y cotización instantánea.
