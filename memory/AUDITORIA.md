# Auditoría taxiHUB — Diagnóstico técnico y de diseño

**Alcance:** `backend/server.py` + `frontend/src` (86 archivos) · **Hallazgos:** 84 (7 P0 · 26 P1) · **Estado:** diagnóstico, sin cambios aplicados al código.

Versión visual (recomendada para lectura): [artefacto publicado](https://claude.ai/code/artifact/c44908a0-f360-4a12-a459-611670506e96). Este archivo es la copia de referencia en texto plano para el repositorio.

---

## A. Resumen ejecutivo

taxiHUB no es un prototipo. Es un producto con criterio: la máquina de estados del conductor vive en el backend, los WebSockets están autenticados por *scope* y verifican el sujeto, hay Wake Lock y detección de GPS obsoleto en la app del chofer, y existe un `memory/DESIGN.md` normativo que razona el porqué de cada decisión visual. Ese nivel de cuidado es poco común.

El problema es que ese criterio no está aplicado de forma uniforme. Tres patrones se repiten en todas las capas y explican la mayoría de los 84 hallazgos:

1. **Lo bueno existe pero no se usa.** Hay un sistema de tokens completo en `tailwind.config.js` y **574 clases `zinc-*` escritas a mano** que lo esquivan. Hay 46 componentes shadcn/ui instalados y **36 sin usar** mientras la app reimplementa a mano tablas, tarjetas, badges y pestañas. Hay un `constants/testIds/` declarado obligatorio en `AGENTS.md` que **no se importa ni una sola vez**. Hay un `components/BottomSheet.jsx` sin usar mientras `OperadorApp` duplica ese markup cuatro veces.
2. **Solo está contemplado el camino feliz.** Once llamadas `.then()` sin `.catch()` dejan seis paneles del despachador en blanco permanente si la petición falla. No hay interceptor de 401: una sesión caducada produce fallos silenciosos pantalla por pantalla en lugar de devolver al login.
3. **Hay agujeros de seguridad que invalidan el modelo de permisos.** El endpoint que crea cuentas de despachadora no exige autenticación, y la pantalla de login ofrece un botón público para usarlo. Cualquiera que abra la URL puede darse de alta con acceso total a la flota, al GPS en vivo y a los datos de los clientes. Los JWT no caducan nunca.

**Antes de producción:** los siete P0 son de seguridad y se corrigen en una sesión: proteger dos endpoints, añadir `exp` al JWT, quitar la credencial `central/central123` sembrada en el arranque, cerrar `/api/seed`, validar las subidas de archivo y fijar CORS. Ninguno requiere rediseño ni refactor.

El resto se ordena en tres frentes: **consolidar el Design System** (los tokens ya existen, hay que usarlos — esto además arregla el modo claro, hoy sostenido por 30 `!important`), **cubrir los estados de interfaz** (carga, error, sesión caducada, botón ocupado) y **partir los tres archivos gigantes** (`server.py` 2 233 líneas, `OperadorApp.jsx` 975, `Terminal.jsx` 819).

**¿Parece software profesional que una empresa pagaría?** Sí en el conductor, no todavía en el despachador. La app del chofer está bien resuelta: un mapa, un estado, un botón grande. El despachador acumula paneles flotantes arrastrables que se solapan entre sí, ocho alturas de botón distintas, tres apariencias para la acción primaria, y **no tiene ningún dashboard** — ni ingresos del día, ni servicios completados, ni tiempo medio de asignación, aunque todos esos datos ya están en la base.

---

## B. Estado actual

### Pila tecnológica

| Capa | Elección | Notas |
|---|---|---|
| Backend | FastAPI + Motor (MongoDB async) | Todo en un archivo: `backend/server.py`, 2 233 líneas |
| Auth | JWT HS256 + bcrypt | Cuatro *scopes*: operador, terminal, pasajero, dev |
| Tiempo real | WebSockets nativos + `ConnectionManager` en memoria | Tres canales: terminal (broadcast), operador, pasajero |
| Frontend | React 19 + CRA vía CRACO | Alias `@` → `src`. JavaScript, sin TypeScript |
| Estilos | Tailwind 3.4 + shadcn/ui + CSS propio | `index.css`: 850 líneas de sistema propio |
| Mapa | Leaflet + react-leaflet 4 + teselas CARTO | Rutas reales vía OSRM público, con *fallback* Haversine |
| Rutas | react-router 7, siete rutas planas | Sin rutas protegidas ni *code splitting* |
| Estado | Solo `useState` local | Sin store; react-query y SWR instalados y sin usar |
| Notificaciones | sonner | Segundo sistema (Radix toast) presente y muerto |
| Almacenamiento | Disco local `backend/uploads/` | Servido por `GET /api/files/{path}` |
| Tests | pytest (backend) | `tests/` vacío; suites en `test_reports/`. Frontend sin tests |
| Lint / tipos | Sin comando ejecutable | Plugins instalados, sin script `lint` |

### Las cuatro superficies

- **Terminal / despachador** (`/`, `/terminal`) — Mapa a pantalla completa con chrome flotante: consola superior con marca, reloj, cinco contadores de flota y seis botones; barra lateral de flota arrastrable; bandeja de servicios arrastrable; tarjeta del taxi seleccionado arrastrable; rail derecho de nueve iconos que abre un panel deslizante con siete sub-paneles (servicios, vehículos, operadores, clientes, reportes, chat, rutas, tarifas).
- **Operador / conductor** (`/operador`) — Mapa de navegación con *bottom sheet* que cambia según el estado: fuera de turno, en turno sin servicio, servicio digital (oferta → en camino → en curso), servicio propio. Más tres *overlays*: iniciar servicio, reportar objeto, chat.
- **Pasajero** (`/pasajero`) — Tres pestañas (mi viaje, solicitar, historial) en columna de 448 px, con mapa embebido de 256 px de alto.
- **Dev** (`/dev`) — Logotipo, alta/baja de cuentas, descarga de respaldo, auditoría. Sin responsive.

### Cifras de la inspección

| Cifra | Qué mide |
|---|---|
| 574 | clases `zinc-*` escritas a mano fuera de `ui/` |
| 79 | colores hexadecimales literales en páginas y componentes |
| 36/46 | componentes shadcn/ui instalados y nunca importados |
| 8 | alturas de botón distintas (h-7 … h-16) |
| 10 | valores de `z-index` sin escala, repartidos en 6 archivos |
| 11 | `.then()` sin `.catch()` en rutas de carga |
| 1 | `aria-label` en toda la aplicación |
| 0 | referencias a `constants/testIds/`, declarado obligatorio |

---

## Lo que está bien y no hay que tocar

- **El backend es la fuente de verdad de la máquina de estados.** `_validar_transicion_estado` impide que un conductor con servicio activo se declare libre, y que un vehículo averiado pase a ocupado. La UI no puede corromper el dominio.
- **`_asignar_atomicamente`** resuelve la carrera de dos conductores aceptando la misma oferta. Es el problema difícil del despacho y está bien resuelto.
- **`serialize()`** elimina `password_hash` de forma centralizada. Ninguna respuesta puede filtrarlo por olvido.
- **WebSockets autenticados por scope *y* por sujeto** (`_ws_payload_valido`): un operador no puede abrir el canal de otro.
- **`useRouting`** es código maduro: *dedupe* por distancia recorrida, versionado de respuestas en vuelo y guard de transición para evitar el bucle `setState→render→setState`. Los comentarios explican el porqué, no el qué.
- **La app del conductor está pensada para uso real en campo**: Wake Lock en turno, detección de GPS obsoleto, banner de sin conexión, badge de reconexión del WebSocket.
- **`.sem-badge` con `color-mix`** y los componentes `EstadoBadge` / `ServicioBadge` / `EmptyState` / `ConfirmAction` / `GpsBadge`: pequeños, con una sola responsabilidad, y nunca comunican estado solo por color. Modelo a seguir para el resto del sistema.
- **`prefers-reduced-motion`** respetado globalmente y `tabular-nums` en todos los contadores.
- **Migraciones idempotentes que nunca borran datos** y uso de bcrypt (no MD5, no SHA sin sal).
- **`memory/DESIGN.md`** es un buen documento normativo. El problema no es el documento; es que el código lo incumple en puntos medibles.

---

## C. Problemas críticos — P0 y P1

### P0 — Deben resolverse antes de continuar

**SEC-01 · Cualquiera puede crear una cuenta de despachadora con acceso total** — Crítico
- Ubicación: `backend/server.py:566` · `frontend/src/pages/TerminalLogin.jsx:194`
- Evidencia: `@api_router.post("/terminal/usuarios")` se declara sin `Depends(require_terminal)` ni ninguna otra dependencia de autenticación. La pantalla de login expone además el botón público «Crear una nueva cuenta de operadora» que lo invoca.
- Impacto: escalada de privilegios total y anónima — GPS en vivo de toda la flota, listado completo de clientes con teléfonos, historial de servicios, chat con conductores, capacidad de crear/asignar/cancelar servicios.
- Recomendación: añadir `_=Depends(require_terminal)` al endpoint y eliminar el modo «registro» de `TerminalLogin.jsx`. El alta de despachadoras pasa al panel dev o a una sección de administración dentro del Terminal.

**SEC-02 · El listado de cuentas de despachadora es público** — Crítico
- Ubicación: `backend/server.py:576`
- Evidencia: `GET /api/terminal/usuarios` sin parámetros ni dependencias. Devuelve nombre y usuario de todas las cuentas.
- Impacto: enumeración de usuarios sin autenticar; combinado con SEC-09 (sin límite de intentos), entrega media credencial antes de empezar.
- Recomendación: proteger con `require_terminal`, o eliminar el endpoint (hoy el frontend no lo consume).

**SEC-03 · Los JWT no caducan nunca** — Crítico
- Ubicación: `backend/server.py:146-148` y `561-563`
- Evidencia: el payload solo lleva `sub`, `usuario`, `scope`, `iat`. Sin claim `exp`.
- Impacto: un token filtrado concede acceso permanente. La única forma de revocarlo es desactivar la cuenta entera.
- Recomendación: añadir `exp` (sugerido: 12 h operador/pasajero, 8 h terminal, 1 h dev) y capturar `jwt.ExpiredSignatureError` devolviendo 401 distinguible. Emparejar con interceptor de respuesta en frontend (UX-03).

**SEC-04 · Credencial por defecto sembrada en cada arranque** — Crítico
- Ubicación: `backend/server.py:2177-2180`
- Evidencia: si `usuarios_terminal` está vacía, inserta `{"usuario": "central", "password_hash": hash_password("central123")}`.
- Impacto: toda instalación nueva arranca con una credencial de administración conocida y documentada en `test_result.md`.
- Recomendación: sembrar solo desde `SEED_TERMINAL_USER`/`SEED_TERMINAL_PASSWORD`, o generar contraseña aleatoria de un solo uso emitida por el log de arranque, forzando cambio en el primer acceso.

**SEC-05 · `POST /api/seed` abierto sin autenticación** — Crítico
- Ubicación: `backend/server.py:2025`
- Evidencia: sin dependencias. Sobre base vacía crea `op1`, `op2`, `op3` con contraseña `taxi123` y devuelve las credenciales en la respuesta.
- Impacto: sobre un despliegue recién levantado, un atacante crea tres cuentas de conductor con credenciales conocidas.
- Recomendación: proteger con `require_dev`, o registrarlo solo si `ENABLE_SEED` está activo.

**SEC-06 · Subida de archivos sin validar, servida con el `Content-Type` que envía el cliente** — Crítico
- Ubicación: `backend/server.py:1737-1745`, `1919-1925`, `1763`
- Evidencia: la extensión sale del nombre de archivo del cliente; no se comprueba tipo real ni tamaño; `download_file` responde con `media_type=record.get("content_type")`, valor que también vino del cliente en la subida.
- Impacto: un conductor autenticado sube HTML declarando `text/html` y obtiene una URL en el mismo origen que lo sirve como página — XSS almacenado con acceso al `localStorage` donde viven los cuatro tokens (que no caducan, SEC-03). Sin límite de tamaño, vector de DoS trivial sobre el disco.
- Recomendación: lista blanca de extensiones y tipos MIME reales (verificar *magic bytes*), límite de tamaño, servir siempre con `Content-Type` derivado del servidor más `Content-Disposition: attachment` y `X-Content-Type-Options: nosniff`.

**SEC-07 · CORS abierto por defecto con credenciales permitidas** — Crítico
- Ubicación: `backend/server.py:2155-2161`
- Evidencia: `allow_origins=os.environ.get('CORS_ORIGINS', '*').split(',')` junto a `allow_credentials=True`, `allow_methods=["*"]`, `allow_headers=["*"]`.
- Impacto: si `CORS_ORIGINS` falta en producción, la API queda accesible desde cualquier origen.
- Recomendación: exigir `CORS_ORIGINS` explícito y fallar el arranque si no está definido. Restringir métodos y cabeceras a lo usado.

### P1 — Impacto alto en operación o mantenimiento

**UX-01 · Seis paneles del despachador quedan en blanco para siempre si falla su carga** — Alto
- Ubicación: `TerminalMenu.jsx:177, 264, 394, 441, 597` · `Terminal.jsx:246, 259` · `DevPanel.jsx:87, 108, 161`
- Evidencia: once cargas de la forma `termApi.get("/clientes").then((r) => setClientes(r.data))` sin `.catch`. Estado inicial `null`, condicionado a `x !== null`.
- Impacto: con red caída, backend reiniciándose o token caducado, los paneles se abren vacíos sin spinner ni mensaje ni reintento. La despachadora no distingue «no hay datos» de «el sistema no responde».
- Recomendación: modelar cada carga con tres estados explícitos (cargando · error · datos) mediante hook común, y renderizar un `ErrorState` con acción de reintento.

**UX-03 · La sesión caducada no se detecta en ninguna pantalla** — Alto
- Ubicación: `frontend/src/lib/api.js:12-20`
- Evidencia: la factoría `mk()` solo registra interceptor de *request*. No hay interceptor de *response*, ninguna pantalla comprueba 401.
- Impacto: cuando el token deje de ser válido (tras implementar SEC-03), cada pantalla fallará a su manera, sin indicar al usuario que debe volver a entrar.
- Recomendación: interceptor de respuesta compartido: ante 401, limpiar token del scope, cerrar WebSockets, redirigir al login con aviso.

**DS-01 · El sistema de tokens existe y 574 clases codificadas a mano lo esquivan** — Alto
- Ubicación: todo `pages/` y `components/` (excepto `ui/`) · `tailwind.config.js:19-40`
- Evidencia: `tailwind.config.js` define `brand`, `surface`, `surface-2/3`, `card`, `border`, `muted-foreground`, `popover`… ligados a variables CSS. Frente a eso: 574 usos de `zinc-*`. Los tokens solo se usan para `brand`.
- Impacto: causa raíz de casi toda la deuda visual. El modo claro no puede redefinir `zinc-800`, así que se implementó como 30 reglas `!important` — cada nuevo `zinc-*` rompe el modo claro en silencio.
- Recomendación: migración mecánica y verificable (`bg-zinc-950 → bg-background`, `bg-zinc-900 → bg-card`, `bg-zinc-800 → bg-surface-3`, `text-zinc-100 → text-foreground`, `text-zinc-500 → text-muted-foreground`, `border-zinc-800 → border-border`). Al terminar, los `!important` de `index.css:654-683` se borran.

**DS-03 · La acción primaria tiene tres apariencias distintas** — Alto
- Ubicación: transversal · `ServiciosPanel.jsx:91`, `TerminalMenu.jsx:124/138/197/204/290/304`, `Terminal.jsx:454`, `OperadorApp.jsx:646/907`
- Evidencia: `.btn-primary-elev` (12 usos), `bg-brand text-zinc-950 hover:bg-brand-bright` inline (20 usos), `<Button variant="default">` de shadcn (token `--primary`, un tercer color). Ocho alturas de botón: `h-7`…`h-16`.
- Impacto: «Guardar» se ve distinto en cada módulo. Pierde la señal de acción principal.
- Recomendación: un único `<Button>` con variantes `primary/secondary/ghost/destructive` y tamaños `sm/md/lg` mapeados a tres alturas (32/40/56 px). Prohibir `bg-brand` inline.

**A11Y-01 · Doce botones de solo icono sin nombre accesible** — Alto
- Ubicación: `Terminal.jsx:436, 445, 466, 480` · `TerminalMenu.jsx:51, 78, 355, 365` · `ThemeSwitcher.jsx:23` · `TerminalDisplayControls.jsx:15` · `OperadorApp.jsx:534` · `PassengerApp.jsx:263`
- Evidencia: un solo `aria-label` en toda la aplicación (`ModeToggle.jsx`). El resto usa `title`, inconsistente en lectores de pantalla y ausente en móvil.
- Impacto: toda la navegación del despachador es inoperable con lector de pantalla; bloquea licitaciones con requisitos de accesibilidad.
- Recomendación: regla de sistema — todo botón sin texto visible lleva `aria-label`. Activar `eslint-plugin-jsx-a11y` (ya en devDependencies).

**A11Y-03 · Cuatro modales hechos a mano sin foco atrapado ni cierre con Escape** — Alto
- Ubicación: `OperadorApp.jsx:886, 919, 942` · `Terminal.jsx:499`
- Evidencia: «Iniciar servicio», «Reportar objeto» y «Chat» son `<div className="fixed inset-0 z-[900]">` sin `role="dialog"`, sin `aria-modal`, sin gestión de foco, sin `Escape`.
- Impacto: trampa de teclado; imposible cerrar sin apuntar con precisión a la X (grave dentro de un coche).
- Recomendación: sustituir por el `Dialog` de Radix ya instalado, y el *bottom sheet* por `BottomSheet.jsx` (existe sin usar), añadiendo gestión de foco.

**RSP-03 · El rail del menú sale del viewport en móvil** — Alto
- Ubicación: `TerminalMenu.jsx:43` y `64`
- Evidencia: el rail se posiciona en `right-[408px]` con panel abierto; el panel es `w-[400px] max-w-[92vw]`. En móvil el panel se encoge pero el desplazamiento del rail sigue fijo — queda ~33 px fuera del borde en 375 px de ancho.
- Impacto: en móvil, abrir cualquier sección hace desaparecer el propio menú.
- Recomendación: desplazamiento derivado del ancho real del panel, o panel a pantalla completa en móvil con rail oculto.

**ARQ-01 · Todo el backend en un archivo de 2 233 líneas** — Alto
- Ubicación: `backend/server.py`
- Evidencia: config de Mongo, almacenamiento, hashing, JWT, seis dependencias de autorización, 21 modelos, `ConnectionManager`, ~70 endpoints, despacho, proxy OSRM, seed y migraciones, todo en un módulo.
- Impacto: ninguna parte se puede probar aislada; explica directamente los P0 — fácil que un endpoint se quede sin `Depends` entre setenta seguidos.
- Recomendación: separar por capas (`core/`, `models/`, `routers/`, `services/`, `realtime/`) sin cambiar comportamiento.

**ARQ-04 · El *bottom sheet* del conductor está duplicado cuatro veces, y existe el componente sin usar** — Alto
- Ubicación: `OperadorApp.jsx:550, 575, 692, 854` · `components/BottomSheet.jsx`
- Evidencia: las cuatro variantes repiten literalmente el mismo markup de contenedor y handle. `BottomSheet.jsx` encapsula exactamente eso y no se importa.
- Impacto: cualquier ajuste hay que hacerlo cuatro veces; ya divergen (dos usan `pb-6`, una `pb-5`).
- Recomendación: usar `BottomSheet` para las cuatro.

**COD-01 · La convención de test IDs declarada obligatoria no se usa ni una vez** — Alto
- Ubicación: `frontend/src/constants/testIds/` (6 archivos, 131 líneas) · `AGENTS.md`
- Evidencia: `AGENTS.md` exige centralizar los testids ahí; cero importaciones del directorio en todo `src/`. Los ~140 `data-testid` son cadenas literales inline.
- Impacto: documentación normativa contradicha por el código — erosiona la confianza en el resto del documento.
- Recomendación: migrar los `data-testid` a las constantes, o borrar el directorio y el párrafo de `AGENTS.md`.

**PERF-01 · La búsqueda de candidatos es N+1 sobre toda la flota** — Alto
- Ubicación: `backend/server.py:1133-1169`
- Evidencia: `_buscar_candidatos` carga hasta 1000 operadores y, por cada uno, ejecuta `count_documents` + `find_one` en serie.
- Impacto: con 200 taxis, ~400 consultas secuenciales por cada despacho, justo cuando la despachadora está esperando con el cliente al teléfono.
- Recomendación: una sola agregación con `$lookup`; a futuro índice `2dsphere` + `$geoNear`.

---

## D. Auditoría visual

La dirección de `memory/DESIGN.md` es buena y está bien argumentada: consola de control, mapa protagonista, profundidad "*machined*" de doble bisel, color semántico. El problema aparece donde el código no la sigue.

### El código incumple su propio documento normativo

| Regla de DESIGN.md | Realidad en el código |
|---|---|
| «Usar SIEMPRE las constantes de `lib/api.js` — nunca hex literal» | **79 hexadecimales literales**. `Terminal.jsx:336` con `"#22c55e"`; `PassengerApp.jsx:306` con `"#10b981"`; `OperadorApp.jsx:611-613` con `"#27272a"` y `"#a1a1aa"` |
| «No fijar verde esmeralda a mano» | 23 clases `emerald-400/500` literales, más el bloque de compatibilidad de `index.css:36-52` con `!important` por paleta |
| «Nunca blur en contenido desplazable largo» | El panel de `TerminalMenu` lleva `blur(14px)` sobre contenedor `overflow-y-auto`; `.bezel-shell` aplica `blur(12px)` a la barra lateral y la bandeja, ambas desplazables |
| «Radios concéntricos: nunca el mismo radio en padre e hijo» | Se cumple en `bezel-shell`, pero hay `rounded-xl` anidado en `rounded-xl` en tarjetas de servicio, vehículo y candidatos |

### Escalas ausentes

- **Tipografía** — sin escala. `text-[10px]`, `text-[11px]`, `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl` sin ratio, más valores arbitrarios como `text-[1.05rem]`. Los 10-11 px se usan intensivamente para etiquetas, por debajo del mínimo cómodo en turnos largos.
- **Radios** — seis valores sin sistema: `rounded-md/lg/xl` (48 usos)/`2xl`/`3xl`/`full` (47 usos), más `rounded-[10px]` literal.
- **Elevación** — `elev-1/2/3` bien definidos pero apenas usados (5 veces); en su lugar sombras arbitrarias repetidas cuatro veces.
- **Capas** — diez valores de `z-index` mágicos en seis archivos, con colisiones reales: el rail (600) se dibuja sobre el panel que abre (590); el desplegable de `ThemeSwitcher` usa 999 dentro de una cabecera en 500.

### Elementos que restan profesionalidad

- **Dos engranajes contiguos** — `ThemeSwitcher` (icono `Settings`) y `TerminalDisplayControls` (`Settings2`), uno al lado del otro, visualmente indistinguibles.
- **Tres sistemas de badge** — `EstadoBadge`/`ServicioBadge` correctos; badge de vehículo con estilos inline; badge «Resuelto» con emerald fijo que ignora la paleta activa.
- **Dos patrones de menú adyacentes** — `ThemeSwitcher` hecho a mano con listener de `mousedown`; su vecino usa `Popover` de Radix.
- **Sin tablas** — `.th-table` definido en CSS y nunca usado; todos los listados son tarjetas apiladas en columna de 400 px, desperdiciando pantalla grande.

---

## E. Auditoría UX

### Flujo 1 · La despachadora recibe una llamada y despacha un taxi

Pasos actuales: nueva llamada → nombre/teléfono → marcar origen en mapa (**el modal se cierra**) → clic en mapa (**se reabre**) → marcar destino (**se cierra otra vez**) → clic en mapa (**se reabre**) → texto de origen/destino obligatorio aunque ya haya coordenadas → crear servicio → abrir bandeja → localizar tarjeta → despachar → elegir taxi → asignar.

Problemas: el modal se cierra y reabre dos veces perdiendo contexto; el texto es obligatorio pese a tener coordenadas; no hay *geocoding* en toda la app; el servicio nace, se despacha y se asigna en tres pantallas.

Recomendación: el modal no se cierra nunca (mini-mapa embebido o modo translúcido); *geocoding* inverso que rellena el texto; «Crear y despachar» mostrando los tres taxis más cercanos — `GET /dispatch/candidates` ya existe y el frontend nunca lo llama.

### Flujo 2 · El conductor recibe y completa un servicio

**Bien resuelto**, conservar: oferta con distancia/ETA/cuenta atrás → aceptar → «Llegué al cliente» → «Finalizar viaje» con confirmación. Observaciones menores: `iniciarViaje` y `crearServicio` sin `try/catch`; ningún botón se deshabilita en vuelo (riesgo de doble toque con el móvil en soporte).

### Flujo 3 · El pasajero pide un taxi

Problemas: primer clic fija origen, segundo destino, sin corregir uno solo («Limpiar» borra ambos); sin búsqueda de dirección; **no se muestra precio antes de confirmar**, aunque el backend ya calcula distancia/ETA por OSRM y hay tarifas configuradas.

### Transversales

- **Guardado invisible por `onBlur`** en vehículos, rutas y tarifas — sin indicación de guardado, sin cancelar, sin manejo de fallo.
- **Confirmación incoherente** — eliminar vehículo/tarifa pide confirmación; cancelar un servicio (afecta a un cliente esperando) no, y carece de `try/catch`.
- **Sin estado ocupado** — de 39 mutaciones, solo 4 deshabilitan su botón en vuelo.
- **Teléfonos que no son enlaces** — sin `tel:` en ninguna parte, siendo la acción principal de una central telefónica.
- **Paneles arrastrables que se pierden** — `DraggablePanel` persiste posición sin validar contra el viewport actual; sin «restablecer posición».

---

## F. Auditoría técnica

### Tamaño de los módulos

| Archivo | Líneas | Responsabilidades que acumula |
|---|---|---|
| `backend/server.py` | 2 233 | Config, almacenamiento, auth, 21 modelos, WebSockets, ~70 endpoints, despacho, routing, seed, migraciones |
| `pages/OperadorApp.jsx` | 975 | Geolocalización, WebSocket, subida de fotos, chat, tarifas, 4 sheets, 3 overlays, navegación |
| `pages/Terminal.jsx` | 819 | Mapa, WebSocket, 3 pollings, filtros, búsqueda, 5 paneles flotantes, subida de foto |
| `components/TerminalMenu.jsx` | 635 | Rail + panel + **siete sub-paneles CRUD completos** |
| `pages/PassengerApp.jsx` | 423 | Auth, 3 vistas, mapa, WebSocket, routing |

### Duplicación

- **WebSocket implementado tres veces** (`Terminal.jsx:165`, `OperadorApp.jsx:210`, `PassengerApp.jsx:123`) con reconexión a 3 s fijos, sin *backoff* exponencial.
- **Chat implementado dos veces** (`OperadorApp.jsx:941-973`, `TerminalMenu.jsx:465-498`).
- **`WS_BASE` recalculado a mano** en `OperadorApp.jsx:216` en lugar de importar el de `lib/api.js`.
- **Cuatro patrones para «crear entidad»**, **dos tipos de select** (Radix + nativo).

### Código muerto

- **36 de 46 componentes shadcn/ui** nunca importados (`Card`, `Table`, `Badge`, `Tabs`, `Skeleton`, `Separator`, `Tooltip`, `Sheet`, `DropdownMenu`…).
- **Segundo sistema de toasts completo y muerto** (`hooks/use-toast.js` + `ui/toaster.jsx` + `ui/toast.jsx` sobre Radix) mientras la app usa `sonner`.
- **16 dependencias declaradas y nunca importadas**: `recharts`, `framer-motion`, `embla-carousel-react`, `react-hook-form`, `zod`, `@hookform/resolvers`, `date-fns`, `dayjs`, `lodash`, `vaul`, `swr`, `@tanstack/react-query`, `cmdk`, `input-otp`, `react-day-picker`, `react-resizable-panels`.
- `components/BottomSheet.jsx`, `BrandLockup`, `.th-table`: exportados/definidos, nunca usados.
- `ServicioCard` recibe `onAsignar`/`asignando` sin usarlos.

### Otros defectos técnicos

- **Doble `<input ref={fileRef}>`** en `OperadorApp.jsx:447` y `669`, ambos montados a la vez — funciona por accidente.
- **`URL.createObjectURL` en el render** sin `revokeObjectURL` — fuga de memoria, agravada porque el reloj re-renderiza cada segundo.
- **Sin tipos ni validación de contratos** — sin TypeScript ni PropTypes, `checkJs` desactivado, en un dominio con objetos anidados complejos.
- **Sin lint ejecutable** — `eslint-plugin-jsx-a11y`, `eslint-plugin-import`, `eslint-plugin-react`, `black`, `isort`, `flake8`, `mypy` instalados sin comando que los invoque.
- **Lógica frágil de filtrado** en `TerminalMenu.jsx:285` — deduce estado quitando la «s» final del filtro; se rompe en silencio al añadir un filtro nuevo.

---

## G. Responsive

Solo la app del conductor está realmente diseñada para su tamaño; el despachador está diseñado para escritorio y encogido; el pasajero está diseñado para móvil y estirado; el panel dev no tiene *breakpoints*.

| Superficie | Escritorio | Portátil | Tablet | Móvil |
|---|---|---|---|---|
| Terminal | Correcto | Cabecera saturada | Paneles se solapan | Rail fuera de pantalla |
| Operador | Columna centrada | Correcto | Correcto | **Correcto** |
| Pasajero | Columna de 448 px | Columna de 448 px | Columna de 448 px | **Correcto** |
| Dev | Correcto | Correcto | Nav fija de 176 px | **Inutilizable** |

- **RSP-01** — cabecera del Terminal saturada entre 1024-1280 px: marca, subtítulo, sitio, reloj, 5 contadores, 6 botones, foto, nombre, badge, salir en una fila sin colapso a menú.
- **RSP-02** — tarjeta del taxi (`right-16`, `w-[300px]`) se solapa con el rail del menú (`right-3`).
- **RSP-04** — bandeja de servicios `h-[340px]` fija; en móvil apaisado cubre la pantalla completa y tapa el mapa.
- **RSP-07** — pasajero clavado a `max-w-md`; en escritorio, columna estrecha con mapa de 256 px fijo.
- **RSP-08** — todos los listados son tarjetas pese al CSS `.th-table` ya escrito; peor uso posible del espacio en pantalla grande.

---

## H. Accesibilidad

Área con mayor distancia entre intención y ejecución. El sistema hace bien lo difícil (nunca comunica estado solo con color, respeta `prefers-reduced-motion`, define `:focus-visible` global) y falla en lo básico.

- **A11Y-02** — un solo `htmlFor` en toda la app. Los `<Label>` de los cuatro formularios principales son decorativos.
- **A11Y-04** — `text-zinc-500` sobre `bg-zinc-950` ≈ 4,1:1, por debajo de AA (4,5:1), usado **88 veces**, mayoritariamente en 10-11 px. `text-zinc-600` cae a ≈ 3:1.
- **A11Y-05** — 34 botones `h-8` (32 px) y 4 `h-7` (28 px), por debajo del mínimo recomendado de 44 px.
- **A11Y-06** — los botones de estado del conductor no exponen `aria-pressed`; suenan idénticos con lector de pantalla.
- **A11Y-08** — `zoomControl={false}` en ambos mapas elimina los únicos controles enfocables.

---

## I. Rendimiento

- **PERF-02** — polling a 8 s sobre `/servicios/hoy` y `/operadores/{id}/track` pese a que el WebSocket ya notifica esos eventos.
- **PERF-03** — `useClock` y el contador de oferta actualizan estado en la raíz de la página cada 1000 ms, re-renderizando el árbol completo (mapa incluido).
- **PERF-05** — `car3dIcon()` reconstruido por cada marcador en cada render; con 50 taxis visibles, 50 iconos regenerados por segundo.
- **PERF-04** — un solo *bundle* para las cuatro apps, sin `React.lazy`, arrastrando las 16 dependencias no importadas.
- **PERF-07** — `list_reportes` carga toda la tabla de operadores en memoria solo para resolver nombres.

---

## J. Seguridad

Los siete P0 están en la sección C. Adicionales de severidad media:

- **SEC-08** — `GET /api/files/{path}` sin autenticación (aunque sí valida contra la BD, cerrando la travesía de directorios). Las URLs con `uuid4` no son adivinables, pero no son privadas.
- **SEC-09** — sin *rate limiting* en los cuatro endpoints de login.
- **SEC-10** — cuatro tokens en `localStorage`, agrava el impacto de SEC-06.
- **SEC-11** — tokens de WebSocket en la *query string*, quedan en logs de proxies intermedios.
- **SEC-12** — el panel dev está enlazado desde dos pantallas de login públicas sin necesidad.

**Lectura de conjunto:** el modelo de permisos está bien diseñado (cuatro scopes, dependencias específicas, verificación de sujeto en WS, `serialize()` a prueba de fugas). Lo que falla es la aplicación uniforme: tres endpoints se quedaron sin su `Depends` en un archivo con setenta. Se arregla haciendo que el router declare la dependencia por defecto (ver sección M), no revisando una vez más.

---

## K. Design System

**Existe un Design System real, y la aplicación no lo usa.** No es un caso de «faltan tokens»: los tokens están, son buenos, y hay 574 clases codificadas a mano rodeándolos.

| Pieza | Estado | Detalle |
|---|---|---|
| Tokens de color | Existe · sin usar | Solo `brand` se usa de verdad |
| Modo claro/oscuro | Parche | 30 `!important` reescribiendo utilidades zinc |
| Paletas (3) | Parcial | 23 `emerald-*` literales las ignoran |
| Escala tipográfica | No existe | 8 tamaños sin ratio + valores entre corchetes |
| Escala de espaciado | Implícita | La de Tailwind, sin criterio de densidad propio |
| Radios | Sin escala | `--radius` definido; 6 valores sueltos conviven |
| Elevación | Existe · poco usada | `elev-1/2/3` bien definidos, 5 usos |
| Capas (z-index) | No existe | 10 valores mágicos, con colisiones reales |
| Botón | 3 sistemas | `.btn-primary-elev` · `bg-brand` inline · `<Button>` shadcn |
| Badge de estado | **Correcto** | `.sem-badge` + `EstadoBadge`/`ServicioBadge` |
| EmptyState | **Correcto** | Bien diseñado, usado en 8 sitios |
| ConfirmAction | **Correcto** | Falta aplicarlo a cancelar servicio |
| LoadingState | Solo 1 sitio | `.th-skeleton` existe; solo `ServiciosPanel` lo usa |
| ErrorState | No existe | Causa directa de UX-01 |
| Table | CSS muerto | `.th-table` definido, cero usos |
| Card/Tabs/Skeleton/Tooltip | Instalados · reimplementados | Existen en `ui/`, rehecho a mano |
| Iconografía | Sin regla | 6 tamaños sin sistema, colisiones semánticas |

### Lo que debe convertirse en componente (priorizado por duplicación que elimina hoy)

1. `Button` — unifica 3 sistemas y 8 alturas
2. `ErrorState` — no existe, causa de UX-01
3. `LoadingState` — el skeleton ya está escrito
4. `DataPanel` — envoltorio de 3 estados para los 7 sub-paneles del TerminalMenu
5. `FormField` — resuelve A11Y-02 en un solo sitio
6. `DataTable` — sobre `.th-table` ya escrito
7. `EntityForm` — unifica los 4 patrones de alta
8. `ChatThread` — elimina duplicación conductor/terminal
9. `IconButton` — `aria-label` obligatorio por contrato, resuelve A11Y-01
10. `Toolbar` — cabecera del Terminal con desbordamiento a menú

`BottomSheet`, `Modal`, `Drawer`, `Select`, `Popover`, `Tabs`, `Badge`, `Card`, `Skeleton` **no hay que crearlos**: ya están instalados, solo falta usarlos.

---

## L. Matriz completa de hallazgos

84 hallazgos ordenados por prioridad. La lista completa con severidad, ubicación exacta, problema, impacto y recomendación está en el [artefacto publicado](https://claude.ai/code/artifact/c44908a0-f360-4a12-a459-611670506e96) (sección L, tabla completa). Resumen de IDs por categoría:

- **Seguridad (SEC):** 01-12
- **UX:** 01-14
- **Design System (DS):** 01-11
- **Accesibilidad (A11Y):** 01-08
- **Arquitectura (ARQ):** 01-05
- **Código (COD):** 01-11
- **Performance (PERF):** 01-07
- **Responsive (RSP):** 01-08
- **Navegación (NAV):** 01-06
- **Consistencia UI (CON):** 01-05
- **Incompleto/funcionalidad (INC):** 01-08
- **Dashboard (DASH):** 01

---

## M. Arquitectura propuesta

Reorganización, no reescritura. El dominio está bien modelado; el comportamiento no cambia, solo dónde vive cada cosa. Todo lo listado en "Lo que está bien" se mueve intacto.

### Backend — separar por capa

```
backend/app/
  core/
    config.py       # variables validadas; falla al arrancar si falta CORS_ORIGINS/JWT_SECRET
    security.py     # hashing, JWT (aquí vive exp)
    deps.py         # require_operador · require_terminal · require_pasajero · require_dev
  models/           # los 21 modelos Pydantic, por dominio
  routers/
    auth.py  operadores.py  vehiculos.py  clientes.py
    servicios.py  dispatch.py  rutas.py  tarifas.py
    reportes.py  mensajes.py  archivos.py  dev.py
  services/
    dispatch.py     # _buscar_candidatos con agregación, sin N+1
    routing.py      # proxy OSRM + fallback Haversine + caché
    storage.py      # subida validada, MIME real, límite de tamaño
    estados.py      # _validar_transicion_estado, _asignar_atomicamente — se mueven tal cual
  realtime/
    manager.py      # ConnectionManager
    channels.py     # los tres endpoints WS
  main.py
```

**La decisión que evita que los P0 vuelvan:** cada router se registra con su dependencia por defecto: `APIRouter(prefix="/vehiculos", dependencies=[Depends(require_terminal)])`. Un endpoint nuevo nace protegido y abrirlo exige anotación explícita y visible en revisión. Hoy es al revés.

### Frontend — organizar por dominio

```
frontend/src/
  app/
    router.jsx        # rutas + ProtectedRoute + React.lazy por superficie
    providers.jsx
  shared/
    api/
      client.js       # los 4 clientes axios + interceptor 401 compartido
      hooks.js         # useQuery / useMutation propios
    realtime/
      useRealtime.js  # un único WebSocket con backoff exponencial
    ui/               # el Design System: Button, FormField, DataTable, DataPanel,
                      # ErrorState, LoadingState, EmptyState, Badge, IconButton…
    lib/              # geo, time, theme, taxiIcon — sin cambios
  features/
    fleet/            # flota, vehículos, operadores
    dispatch/         # servicios, despacho, candidatos
    driver/           # turno, oferta, navegación, servicio propio
    passenger/        # solicitud, viaje activo, historial
    chat/             # ChatThread compartido conductor ↔ terminal
    admin/            # rutas, tarifas, configuración, dev
  pages/              # solo composición: qué features monta cada superficie
```

### Qué conservar, mover, fusionar y eliminar

| Acción | Elementos |
|---|---|
| **Conservar sin tocar** | `useRouting`, `lib/geo.js`, `lib/time.js`, `lib/taxiIcon.js`, `lib/theme.js`, `EstadoBadge`, `ServicioBadge`, `EmptyState`, `ConfirmAction`, `ConnectionBadge`, `GpsBadge`, `RoutePolyline`, `Brand`, `.sem-badge`, `_validar_transicion_estado`, `_asignar_atomicamente`, `serialize()`, autenticación WS |
| **Mover sin reescribir** | Los 7 sub-paneles de `TerminalMenu` → `features/`. Los ~70 endpoints → sus routers. Despacho y estados → `services/` |
| **Fusionar** | 3 botones primarios → `Button`. 3 WebSockets → `useRealtime`. 2 chats → `ChatThread`. 4 bottom sheets → `BottomSheet`. 4 formularios de alta → `EntityForm`. 3 badges → `Badge` |
| **Crear** | `ErrorState`, `LoadingState`, `DataPanel`, `DataTable`, `FormField`, `IconButton`, `Toolbar`, `ProtectedRoute`, interceptor 401, `useQuery`/`useMutation` |
| **Eliminar** | Sistema de toasts de Radix, 36 componentes `ui/` no usados tras adoptar los necesarios, 16 dependencias no importadas, `POST /locations`, los 30 `!important` del modo claro, y `constants/testIds/` o los testids inline (una de las dos cosas) |

---

## N. Rediseño visual propuesto

No es un cambio de dirección estética — la de `memory/DESIGN.md` es buena y se mantiene. Es terminar de aplicarla y cerrar las escalas que faltan.

### Color

- Tokens actuales se conservan. Añadir `--surface-4` para el nivel más elevado. Subir el token de texto secundario hasta cumplir 4,5:1.
- Semántica de estado: única fuente en `ESTADO_COLORS`/`SERVICIO_COLORS`, consumida siempre vía `.sem-badge`. Cero hex literales en JSX.
- Eliminar el bloque de compatibilidad emerald de `index.css:36-52`.

### Tipografía — escala de seis pasos, mínimo 12 px, Inter mantenida

| Paso | Tamaño | Peso | Uso |
|---|---|---|---|
| display | 24 px | 800 | Número de unidad en mission card, importes |
| title | 18 px | 700 | Cabeceras de panel, nombre del conductor |
| body-lg | 16 px | 500 | Botones principales, contenido del sheet |
| body | 14 px | 400 | Texto general, filas, campos |
| caption | 13 px | 400 | Metadatos, texto secundario (hoy 10-11 px) |
| label | 12 px | 600 | Versalitas, encabezados de tabla |

`tabular-nums` obligatorio en toda cifra que se actualice o alinee (`.mono-num` ya existe).

### Escalas restantes

- **Espaciado:** 4 · 8 · 12 · 16 · 24 · 32 · 48. Dos densidades: compacta (despachador), cómoda (conductor/pasajero).
- **Radios:** 4 pasos derivados de `--radius` (6 · 10 · 14 · 999).
- **Elevación:** solo `elev-1/2/3`. Cero sombras arbitrarias.
- **Capas:** escala nombrada — `base 0 · map 10 · chrome 100 · panel 200 · overlay 300 · modal 400 · toast 500`.
- **Iconos:** tres tamaños (14 · 16 · 20) + mapa explícito acción → icono.

### El dashboard que falta

Mayor impacto comercial, menor coste técnico — los datos ya están en `servicios` y `recharts` ya está instalado:

- **Fila de KPIs:** servicios de hoy, completados, cancelados, ingresos, tiempo medio de asignación, tasa de rechazo de ofertas.
- **Curva de demanda por hora** — dice a la central cuántos taxis necesita y cuándo.
- **Ranking de conductores** por servicios completados y tiempo de respuesta.
- **Atención requerida:** servicios pendientes sin despachar, ofertas por vencer, taxis con GPS obsoleto, reportes sin resolver.

Regla de composición: lo que exige acción va arriba/izquierda; el histórico, abajo.

---

## O. Plan de implementación

Siete fases ordenadas por dependencia real. Cada una deja el producto funcionando.

### Fase 0 — Cerrar los P0 de seguridad (~1 sesión)
- Proteger `POST`/`GET /terminal/usuarios`; quitar el modo registro de `TerminalLogin`
- Añadir `exp` a ambos emisores de JWT; 401 distinguible al expirar
- Sustituir la semilla `central/central123`
- Proteger `POST /seed`
- Validar subidas (MIME real, tamaño); servir con `Content-Type` del servidor + `nosniff`
- Exigir `CORS_ORIGINS`
- Tests de regresión de estos seis puntos antes de tocar nada más

### Fase 1 — Estados de interfaz y sesión (2-3 sesiones)
- Interceptor 401 compartido en `lib/api.js`
- `useQuery`/`useMutation` propios con cargando · error · datos
- `ErrorState` y `LoadingState`
- Migrar los 11 `.then()` sin `.catch()` y las ~25 mutaciones sin manejo
- `loading` en `Button`
- `ProtectedRoute` en el router

### Fase 2 — Consolidar el Design System (3-4 sesiones)
- Migración mecánica de las 574 clases `zinc-*` a tokens
- Eliminar los 30 `!important` del modo claro; verificar 3 paletas × 2 modos
- `Button` unificado
- Escalas de tipografía, radios, elevación, capas en tokens
- `IconButton` con `aria-label` obligatorio y `FormField` con `htmlFor`
- Activar `eslint-plugin-jsx-a11y` + script `lint`

### Fase 3 — Reorganizar el backend (3-4 sesiones)
- Separar `server.py` en core/models/routers/services/realtime
- Router con dependencia por defecto
- Reescribir `_buscar_candidatos` como agregación (PERF-01)
- *Rate limiting* en logins; autenticar `/api/files`
- Suite de pruebas de máquina de estados y asignación atómica

### Fase 4 — Reorganizar el frontend y eliminar duplicación (4-5 sesiones)
- Estructura `features/`; los 7 sub-paneles salen de `TerminalMenu`
- `useRealtime` con backoff
- `BottomSheet`, `ChatThread`, `EntityForm`, `DataPanel`
- Modales del conductor sobre Radix `Dialog`
- `React.lazy` por superficie; purga de dependencias no importadas
- Eliminar sistema de toasts muerto; resolver contradicción de testIds

### Fase 5 — Rediseñar el despachador (3-4 sesiones)
- `Toolbar` con desbordamiento a menú
- Sistema de anclaje único para chrome flotante; acotar `DraggablePanel` al viewport + «restablecer posición»
- Panel del menú a pantalla completa en móvil
- Bandeja de altura relativa
- `DataTable` sobre `.th-table` ya escrito
- Flujo de nueva llamada sin cierres del modal, con *geocoding* y candidatos integrados
- Sección activa en la URL

### Fase 6 — Dashboard y cierre de funcionalidad (2-3 sesiones)
- Panel de operación con KPIs, curva de demanda, «atención requerida»
- Módulo de clientes completo (edición, búsqueda, `tel:`)
- Pantalla de ajustes (umbral GPS, TTL de oferta)
- Estimación de precio para el pasajero + edición del viaje activo
- Restablecimiento de contraseña
- Pasajero con diseño propio para escritorio; panel dev responsive

### Sobre el orden

Las fases 0 y 1 son independientes del rediseño y pueden entregarse esta semana sin tocar estilos. La fase 2 debe ir antes que la 5: rediseñar el despachador sobre las 574 clases codificadas a mano duplicaría el trabajo. La fase 3 conviene antes que la 4 porque el contrato de la API estabiliza lo que el frontend consume.

**Si hubiera que elegir una sola cosa: la fase 0.** Todo lo demás es mejora; eso es exposición.

---

*Auditoría en modo diagnóstico · 84 hallazgos · Ningún archivo de código modificado durante la inspección.*
