#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Evolucionar taxiHUB a plataforma profesional de sitios de taxis: flota (conductores/vehículos), estados OFFLINE/AVAILABLE/BUSY/PAUSED/OUT_OF_SERVICE, GPS profesional, despacho v1, asignación atómica libre de doble-aceptación, privacidad GPS del pasajero, multi-sitio y APIs listas para Driver/Passenger App."
backend:
  - task: "Asignación atómica de servicios (concurrencia: 1 gana, 0 reintenta)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "`_asignar_atomicamente` con update_one({_id, estado∈[pendiente,ofrecido]}) + matched_count. Test `test_concurrencia_solo_un_ganador` (asyncio.gather de 2 aceptadores) verde."
  - task: "GPS profesional (POST /api/locations, accuracy/speed/heading/battery, staleness configurable)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Pipeline `_actualizar_ubicacion` reutilizado por /locations y /operadores/{id}/ubicacion. Notificación de ubicación solo al pasajero del servicio activo."
  - task: "Máquina de estados del conductor validada en backend"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "`_validar_transicion_estado` bloquea transiciones inválidas (soltar servicio activo, averiado→libre/ocupado). Test `test_estado_bloqueado_con_servicio_activo` verde."
  - task: "Privacidad GPS pasajero (nunca ve flota ni GPS ajeno)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Scopes pasajero prohiben /operadores. Viaje activo solo devuelve su taxi. Test `test_privacy_pasajero_no_ve_flota` verde."
  - task: "Ciclo de vida servicio + cancelación + despacho + rechazo/vencido"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Lifecycle, cancelar, despacho por distancia, oferta vencida (410) y rechazo→pendiente verdes."
  - task: "Seguridad por scopes JWT y aislamiento multitenant (sitio_id)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "require_terminal/operador/pasajero/dev + _mismo_o_terminal. Test `test_scopes_roles` verde."
  - task: "Migraciones seguras idempotentes (site, vehiculos backfill desde placa, índice)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "`_migraciones()` en startup; no borra datos; crea vehículos por conductor con `placa` y `sitio_id` por defecto."
  - task: "WebSockets protegidos con autenticación (token en query + scope/subject)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "`ws_autenticar()` valida JWT y cierra 1008. Verificado contra MongoDB real: token válido abre; sin token/token inválido/canal de otro operador → 1008. Causa del 404 inicial: uvicorn sin librería `websockets` (se instaló). Frontend envía `?token=` en los WS."
  - task: "Routing pasajero (el pasajero de su viaje puede calcular su ruta)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Nueva dependencia `_any_autenticado_o_pasajero` usada SOLO en POST /routing/route; el pasajero ya ve su origen y el taxi asignado, la polilínea no expone flota ajena. Test `test_routing_acepta_pasajero` verde (16/16 totales)."
  - task: "Calificación del conductor y chat pasajero-operador por servicio"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Implementados POST /api/servicios/{id}/calificacion y GET/POST /api/servicios/{id}/mensajes, autorización por scope, persistencia embebida/compartida, notificaciones WS e índices startup. py_compile pasa; pytest no pudo iniciar porque faltan pytest-xdist y pytest-asyncio en el entorno."
frontend:
  - task: "Terminal: termApi para todas las llamadas, popup de taxi ampliado, panel de servicios con pestañas + despacho + flota"
    implemented: true
    working: true
    file: "frontend/src/pages/Terminal.jsx, TerminalMenu.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status:
      - working: true
        agent: "main"
        comment: "Compila con `yarn build`. DevPanel usa devApi; Terminallog de sesión intacto."
  - task: "App operador: aceptar/rechazar/iniciar/terminar para servicios digitales + carga de activos + estado averiado"
    implemented: true
    working: true
    file: "frontend/src/pages/OperadorApp.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Compila. Verificado por E2E Playwright (Fase 8.1): el operador recibe el servicio por WS autenticado, inicia, termina y vuelve a libre."
- task: "Fix UX despacho: tras ofrecer, el panel pasa a pestaña 'ofrecido' para mostrar candidatos"
    implemented: true
    working: true
    file: "frontend/src/components/TerminalMenu.jsx"
    stuck_count: 1
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "En E2E no aparecían los candidatos porque al ofertar el servicio salía de la pestaña 'pendiente'. Fix: `setTab('ofrecido')` tras despachar. Verificado por E2E Dispatcher completo en verde."
  - task: "Passenger App web (/pasajero): registro/login, solicitar con mapa, taxi en vivo por WS, cancelar, historial"
    implemented: true
    working: true
    file: "frontend/src/pages/PassengerApp.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "E2E Playwright OK: login maria → viaje asignado con taxi (Carlos Ramírez, TX-101, GPS) → historial → cancelación. Petición por API del pasajero → despacho → aceptación verificado también."
  - task: "Routing (Fase 9E): POST /api/routing/route con OSRM + fallback Haversine"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Endpoint accesible para operador/terminal (nunca pasajero). `ROUTING_PROVIDER_URL` configurable (default OSRM público). Fallback automático a línea recta si el proveedor cae. 3 tests verdes: auth obligatoria, fallback Haversine, acepta operador."
  - task: "Design System y rediseño UX/UI profesional (Fase 9A/9B/9C)"
    implemented: true
    working: true
    file: "frontend/src/index.css, tailwind.config.js, pages/Terminal.jsx, pages/OperadorApp.jsx, components/*"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Tokens de marca CSS variables (multi-paleta), superficies/elevaciones/chips/skeletons/botones elevados, animaciones estándar. Dispatcher: header + indicadores en tiempo real + panel de taxi seleccionado + tray de servicios + sidebar rediseñado. Driver App: mapa a pantalla completa con navegación GPS (ruta OSRM + distancia + ETA), bottom sheet por estado, estado siempre visible, GPS/conexión. `craco build` compila sin warnings."
  - task: "Navegación GPS del conductor: ruta, ETA, recálculo, seguimiento (Fase 9D/9E)"
    implemented: true
    working: true
    file: "frontend/src/pages/OperadorApp.jsx, hooks/useRouting.js, lib/geo.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Polilínea de ruta real sobre calles vía endpoint de routing, marcador del vehículo con rumbo, cliente/destino, distancia+ETA en vivo, recálculo al moverse ≥60 m, centrado por botón. Fallback a línea recta si el backend no responde."
  - task: "Fase 11 — Terminal: transparencia de interfaz ajustable (slider), paneles flotantes arrastrables, ruta real al destino del servicio activo, indicador de dirección, iconos 3D"
    implemented: true
    working: true
    file: "frontend/src/pages/Terminal.jsx, components/DraggablePanel.jsx, components/TerminalDisplayControls.jsx, components/RoutePolyline.jsx, lib/taxiIcon.js, index.css"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Slider de transparencia (Ajustes de pantalla) aplica `--ui-alpha` en vivo a bezel/popups; paneles (sidebar, tray, mission card) arrastrables con persistencia en localStorage; taxis con servicio activo dibujan ruta OSRM→destino con casco + flujo animado + flecha de rumbo + distancia/ETA en la card. Marcadores con coche 3D isométrico (car3dIcon). `useRouting` corregido con versionado de respuestas (escapadas durante re-renders; ya no hay 'Maximum update depth')."
      - working: true
        agent: "main"
        comment: "REGRESIÓN CORREGIDA (reportada por el usuario y reproducida con Playwright): 'Maximum update depth exceeded' al alternar la ruta del servicio activo. Causa: la rama de reset de `useRouting` (`!enabled`) llamaba `setState` en CADA render porque `origin` era un literal `{lat,lng}` nuevo por render → bucle `setState→render→setState`. Fix: guard de transición `inactiveRef` en `useRouting.js` (solo se emite el reset al entrar al estado inactivo) + `rutaOrigen` memoizado con `useMemo` en `Terminal.jsx`. Verificado: stress E2E (3 ciclos × 2 taxis × 4 toggles ruta on/off, 6 clicks) con 0 errores de consola y assert funcional (flow 1 → off 0 → on 1, flecha de rumbo 1); `craco build` 'Compiled successfully' sin warnings."
  - task: "Fase 11 — Pasajero: rutas reales (plan + tramo vivo taxi→destino), coche 3D orientado por rumbo, letras grandes chofer/unidad"
    implemented: true
    working: true
    file: "frontend/src/pages/PassengerApp.jsx, hooks/useRouting.js, components/RoutePolyline.jsx, lib/taxiIcon.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "El pasajero ya traza la ruta real del viaje (OSRM): plan punteado + tramo del taxi en vivo con flujo animado y chip 'Ruta: X · ≈Y min al destino'. El taxi es un coche 3D isométrico orientado por el rumbo real hacia el destino (GPS por WS). Nombre del conductor en text-xl y 'Unidad' en text-base (letras grandes)."
  - task: "Fase 11 — Operador: marcador 3D del vehículo + letras grandes (nombre y unidad)"
    implemented: true
    working: true
    file: "frontend/src/pages/OperadorApp.jsx, lib/taxiIcon.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "driverIcon reemplazado por car3dIcon (coche isométrico 3D) orientado con el heading GPS; header con nombre en letras grandes y 'Unidad X' más legibles."
  - task: "Fase 12 — Terminal responsive: web escritorio + app celular (dock inferior con acciones y zoom)"
    implemented: true
    working: true
    file: "frontend/src/pages/Terminal.jsx, Terminal.css, components/TerminalMenu.jsx, components/DraggablePanel.jsx, constants/testIds/dispatcher.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Nuevo dock inferior móvil (Llamada/Servicios/Flota/Menú + zoom +/−) que se oculta al abrir cualquier panel; header compacto en móvil (se ocultan ThemeSwitcher/ModeToggle/Ajustes/toggle de servicios); rail del menú admin oculto en móvil (el dock abre el panel con sección por defecto 'operadores'); mission card a ancho completo en móvil; Leaflet ZoomControl en desktop y oculto en móvil (zoom del dock); DraggablePanel sin arrastre/offset persistido en pantallas táctiles. Verificado con Playwright en viewport 390x844: dock visible → tray/menú/flota abren y ocultan el dock → cierran y el dock vuelve → zoom funciona → modal 'Nueva llamada' abre → selección de taxi muestra la mission card. Sin errores de consola. Desktop 1400x900: rail visible, panel de operadores abre, mission card funciona, dock oculto. `craco build` compila."
  - task: "Fase 12 — Imágenes de tipo/modelo de vehículo (referencia visual en pasajero, operador y terminal)"
    implemented: true
    working: true
    file: "backend/server.py (auth/me enriquecido), frontend/src/lib/utils.js, components/VehicleImage.jsx, pages/PassengerApp.jsx, pages/OperadorApp.jsx, public/assets/vehicles/march.png"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Catálogo local extensible en utils.js (`VEHICLE_TYPE_ASSETS`, hoy `march` → /assets/vehicles/march.png) con prioridad foto propia → catálogo por modelo/marca/tipo → imagen del VehicleType → genérica. `/auth/me` ahora embebe el vehículo del operador (`_vehiculo_resumen`). Las tres fichas muestran la misma imagen: ficha del pasajero (nueva miniatura pas-vehiculo-img), header del operador (sustituye el asset azul genérico) y mission card de la terminal. Verificado con Playwright: las tres apps muestran `/assets/vehicles/march.png` para el Nissan March de Carlos (TX-101), sin errores de consola. `craco build` compila."
metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 7
  run_ui: true

test_plan:
  current_focus:
    - "E2E Terminal móvil: dock inferior completo (Llamada/Servicios/Flota/Menú), paneles a pantalla, zoom, mission card a ancho completo y que el dock reaparezca al cerrar paneles."
    - "E2E Imágenes de vehículo: verificar que el asset local del modelo (march.png) se muestre en ficha del pasajero, header del operador y mission card de la terminal; añadir más modelos al catálogo VEHICLE_TYPE_ASSETS."
    - "Backend: probar calificación única del pasajero en servicio completado y chat de viaje con scopes/estados/WS."
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "Implementación Fase 8 completa. 10/10 pruebas backend verdes (mongomock-motor, sin MongoDB real). Frontend compila (yarn build). El entorno local no tiene mongod/Docker, por lo que la verificación E2E en navegador queda pendiente de entorno con servicios."
  - agent: "main"
    message: "Fase 8.1 completada con servicios reales: MongoDB 8.0.0 portable + uvicorn + frontend :3000. E2E Dispatcher (Playwright) en verde para solicitud→despacho→asignación→aceptación→seguimiento→completado. WebSockets autenticados (1008 en inválidos) y 10/10 tests verdes. Fix: pestaña 'ofrecido' tras despachar."
  - agent: "main"
    message: "Fase 9 completada: 13/13 tests backend verdes (3 nuevos de routing con fallback Haversine) y `craco build` sin warnings. Rediseño completo UX/UI (Terminal → Dispatcher profesional, OperadorApp → navegación GPS con OSRM + bottom sheet, logins y Passenger alineados). Pendiente de testing_agent: verificación visual con navegador (necesita backend + MongoDB real) y E2E del flujo de navegación del conductor."
  - agent: "main"
    message: "Fase 11 en verde (16/16 tests backend; `craco build` compila sin warnings; E2E Playwright de saneado con 0 errores de consola). Funcionalidades nuevas a retestar: transparencia manual (slider 40–95%, `--ui-alpha` en vivo), paneles flotantes arrastrables y persistidos (sidebar, tray, mission card), ruta OSRM al destino del servicio activo con card de distancia/ETA y flecha de rumbo, rutas reales + coche 3D en el mapa del pasajero, marcador 3D del conductor, y letras grandes chofer/unidad en pasajero y conductor. Nota de entorno: pytest corre con `-o required_plugins=` (Python 3.14 pierde distinfo de plugins); los servicios están levantados en localhost (Mongo :27017, API :8000, UI :3000) y el frontend se sirve desde un lanzador .bat con ruta larga (el watcher de Node crashea con rutas 8.3 cortas). Datos demo: terminal central/central123 (también hay op2), operadores op1/op2 taxi123; op2 tiene un servicio 'Pakal' asignado para probar la ruta."
  - agent: "main"
    message: "Fase 11 · REGRESIÓN reportada por el usuario y CORREGIDA (test_sequence 5): 'Maximum update depth exceeded' en el Dispatcher al alternar la ruta del servicio activo. Fix en `useRouting.js` (guard de transición `inactiveRef` para la rama de reset, que se disparaba en cada render por el literal `{lat,lng}` nuevo) + `rutaOrigen` con `useMemo` en `Terminal.jsx`. Verificado con Playwright: stress de 6 clicks de taxi × 4 toggles ruta on/off con 0 errores de consola; assert funcional (polilínea flujo 1 → toggle off 0 → toggle on 1, flecha de rumbo 1); `craco build` 'Compiled successfully'. Retestar E2E del toggle de ruta (testId terminal-ruta-toggle) y la card 'Ruta a destino' (distancia/ETA). Nota de datos demo: el servicio 'Pakal' viejo (fecha UTC 08-16, fuera de /servicios/hoy) se terminó; se creó 'E2E Check' asignado a Ana Torres (TX-102) con destino Pakal para reproducir la ruta activa; Ana quedó en estado libre con ese servicio asignado."
  - agent: "main"
    message: "Implementada calificación y chat de viaje en backend/server.py. Verificación estática: python -m py_compile backend/server.py pasa; black --check detecta formato preexistente del archivo y pytest no inicia por plugins requeridos ausentes."
  - agent: "main"
    message: "Fase 12: Terminal responsive (web escritorio + celular) y catálogo de imágenes de vehículo por modelo. `craco build` compila; Playwright verde en móvil (390x844) y escritorio (1400x900) sin errores de consola. Las tres apps (pasajero, operador, terminal) muestran /assets/vehicles/march.png para el Nissan March de Carlos (TX-101)."
  - agent: "main"
    message: "Documento de presentación para clientes creado en docs/FUNCIONES-APPS.md con las funciones de las tres apps (Terminal, Operador, Pasajero), seguridad y resumen técnico (FastAPI + MongoDB + React + Leaflet/OSRM + WebSockets + JWT)."
