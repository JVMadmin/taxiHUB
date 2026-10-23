# TaxiHUB — Documento de Diseño e Identidad Visual (`DESIGN.md`)

**Versión:** 2.2 (Edición Amarillo Luminoso / *Electric Taxi Glow*)  
**Dominio Oficial:** `https://taxihub.cloud`  
**Última Actualización:** 2026-10-23  

---

## 1. Filosofía de Diseño: Deporte Tecnológico & Taxi de Alta Gama

Se descartaron los esquemas genéricos de verdes fluorescentes para adoptar la **identidad emblemática del taxi moderno**:
- **Color Núcleo:** Amarillo Luminoso (*Luminous Cyber-Taxi Yellow* `#FFE600` / `#FFD000` con gradiente cálido a `#FF9900`).
- **Superficies:** Carbón profundo y obsidiana (`#070809`, `#0B0D10`, `#11141D`), eliminando interfaces sobrecargadas con marcos blancos o contrastes chillones.
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

  /* Estado Disponible / En Vivo */
  --th-live: #FFE600;
  --th-live-soft: rgba(255, 230, 0, 0.15);

  /* Superficies Oscuras */
  --th-bg: #0B0D10;
  --th-surface: #17191E;
  --th-surface-2: #1B1E24;
  --th-surface-3: #22252C;

  /* Tipografía y Contraste */
  --th-text: #F5F5F7;
  --th-muted: #9CA0AA;
  --primary-foreground: #0C0E14; /* Texto negro sobre fondo amarillo */
}
```

### 2.2 Semántica de Estados Operativos (`status.js`)

| Estado | Clave | Color HEX | Etiqueta | Aplicación |
| :--- | :--- | :--- | :--- | :--- |
| **Disponible** | `libre` | `#FFE600` | "Disponible" | Marcadores en mapa, botón segmented control, pings de radar. |
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
- `frontend/public/manifest.json`: Configurado con tema `#0C0E14` e icono SVG maskable.
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
