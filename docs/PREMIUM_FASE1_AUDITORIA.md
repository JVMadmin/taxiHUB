# PREMIUM UX/UI OVERHAUL — FASE 1: AUDITORÍA (sin modificar código)

> Base de partida: TaxiHUB 2.0 completo (F1–F13, 79/79 tests, Docker verde).
> Este documento mapea CADA requisito del prompt premium contra el estado real:
> **EXISTE / PARCIAL / BRECHA** — y define el plan de 18 fases.

---

## 1. Inventario (ya auditado en F1-2.0; resumen operativo)

- **Frontend**: Terminal (orquestador + ops/ components), Driver App, Pasajero, Dueño (12 vistas), Dev.
- **Backend**: server.py + 2 módulos. Despacho atómico, GPS/track, WS×4, geofence F5, turnos F6, WhatsApp F4, geocoding F4, expedientes F8, ejecutivo F12.
- **Design System 2.0**: tokens, SSOT estados, iconos, map components (F2).

---

## 2. Mapeo requisito-por-requisito del prompt premium

### A. TERMINAL / OPERADORA
| Requisito | Estado | Brecha |
|---|---|---|
| Recibir servicios, llamadas, WhatsApp, mapa, taxis, asignar | **EXISTE** | — |
| Consultar choferes/expedientes | **BRECHA** | Expedientes son scope `dueno` — la operadora no los ve. Falta lectura (solo consulta) scope terminal |
| Consultar socios | **BRECHA** | `/dueno/*` requiere dueno; terminal sin acceso de consulta |
| Consultar mantenimiento/combustible | **BRECHA** | Ídem: scope dueno. Terminal no consulta nada de esto |
| **NO registrar combustible** | **CUMPLE por omisión** | Terminal no tiene botón de combustible; regla a mantener y documentar en la UI |
| Asignaciones socio→unidad→conductor | **BRECHA TOTAL** | No existe módulo de asignaciones con historial (solo `operador_conductor_id` plano y `turnos_config` de relevos) |

### B. TAXISTA
| Requisito | Estado | Brecha |
|---|---|---|
| Turno con km, GPS, estado, servicio asignado, navegación opcional | **EXISTE** (F6) | — |
| **Registrar combustible + ticket foto + historial** | **BRECHA TOTAL** | `combustible_cargas` es del socio; el taxista no tiene UI ni endpoint propio |
| Kilometraje | **EXISTE** (turnos) | — |
| GPS en segundo plano real | PARCIAL | Web/PWA (Wake Lock); Android nativo pendiente (sin hack) |

### C. SOCIO
| Requisito | Estado | Brecha |
|---|---|---|
| Mi operación (KPIs, mapa flota, alertas, actividad) | **EXISTE** (Dashboard, Socios, Mapa, Ejecutivo) | Rediseño visual pendiente |
| Detalle de unidad completo (mantenimiento, combustible, historial) | PARCIAL | `/dueno/flota/{id}` da conductor+track+servicios; faltan combustible y mantenimientos en la misma vista |
| Registrar combustible (opcional) | **EXISTE** | — |
| Asignar conductor a unidad | PARCIAL | Hoy es editar vehículo (`operador_conductor_id`); falta flujo claro "Asignar conductor" con historial |

---

## 3. UX/UI (el núcleo de este prompt)

| Requisito | Estado | Brecha |
|---|---|---|
| Jerarquía/navegación/composición premium evidente | **BRECHA** | La estructura es funcional-pero-funcional: paneles flotantes apilados, no Command Center con sidebar fija |
| **Eliminar ventanas flotantes** (§10) | **BRECHA** | Terminal tiene 4 capas flotantes simultáneas: FleetPanel (DraggablePanel), MissionCard (DraggablePanel), tray Servicios (DraggablePanel), rail admin — además del mapa. Prompt pide sidebar fija + panel contextual + split view |
| **Eliminar drawers negros** (§11) | **BRECHA** | TerminalMenu (rail+panel) usa superficie `--ui-alpha` oscura independiente del DS; no usa .th-card/.th-surface |
| Sidebar por grupos OPERAR/FLOTA/CONTROL (§9) | **BRECHA** | Rail actual es plano (10 iconos sin jerarquía de grupos) |
| WhatsApp estilo WhatsApp Web (§15) | PARCIAL | Panel funcional en TerminalMenu (lista+chat+marcar mapa); falta: búsqueda de conversaciones, encabezado con estado, burbujas más fieles, panel de detalles, ver-en-mapa persistente (split view) |
| Despacho paso a paso (§17) | PARCIAL | ServicioModal es formulario administrativo; falta flujo: ubicación→destino→**taxis cercanos ordenados con [ASIGNAR]**→datos cliente al final |
| Marcadores premium (§14) | PARCIAL | Assets por estado + placa; falta id visible + panel con acciones [VER EXPEDIENTE][VER UNIDAD][SEGUIR] |
| Expediente conductor premium (§18) | PARCIAL | Vista dueno existe; falta acceso terminal + acciones [VER][EDITAR][SUBIR] |
| Expediente unidad (§19) | BRECHA UI | Vista dedicada con combustible/mantenimiento/historial juntos |
| Asignaciones (§21-22) | **BRECHA TOTAL** (ver A) | Backend + UI |
| Dashboard administrador (§32) | **BRECHA** | Ejecutivo es del socio; la terminal no tiene dashboard propio |
| Mapa premium (§12) | PARCIAL | Esri Base+Reference (rótulos/POIs); se puede evaluar estilo "Navigation" más rico |
| Animaciones micro (§35) | PARCIAL | Existen pulse/ping; falta movimiento suave de taxis entre posiciones (hoy: salto por actualización) |
| Estados loading/empty/error (§36) | **EXISTE** (LoadingState/ErrorState/EmptyState en todas) | — |
| Responsive (§37) | PARCIAL | 0px overflow verificado; nav móvil corregida; dock móvil existe |
| Permisos visibles (§39) | **BRECHA** | Regla "no mostrar acciones no permitidas" — hoy la terminal simplemente no tiene los endpoints; la UI premium debe reflejarlo deliberadamente |

---

## 4. Funciones duplicadas / confusión detectada

1. **Dos listas de servicios**: tray flotante del mapa + sección "Servicios de hoy" del rail → misma info, dos lugares.
2. **Chat central (rail) vs WhatsApp (rail)**: dos bandejas de mensajería — confunden (una es interna operador↔central, la otra clientes). Renombrar/separar visualmente.
3. **Mis-activos** se consulta en Terminal.jsx y ServiciosPanel.jsx (duplicación de carga, ya detectada en F1-2.0).
4. **Turnos socio (relevo) vs turnos taxista**: mismo nombre, conceptos distintos — renombrar en UI ("Relevos y renta" vs "Mi turno").
5. `DeviceModeToggle` con iframe `?embed=1` (hack visual del panel dueño).

---

## 5. Plan de 18 fases (§52) con mapeo realista

| Fase prompt | Alcance real sobre lo existente |
|---|---|
| 1. Auditoría | **Este documento** |
| 2. Design System | Ya existe (F2-2.0) → refinamientos por fase |
| 3. **Shell/Layout general** | **Núcleo del cambio**: Terminal con sidebar fija por grupos (OPERAR/FLOTA/CONTROL), fin de los DraggablePanels permanentes, split-view mapa+contexto, drawers unificados al DS (.th-card), fondo consistente |
| 4. Centro de Operaciones | Panel contextual único (unidad seleccionada), unificar tray de servicios, marcadores premium con acciones |
| 5. WhatsApp | Split view estilo WhatsApp Web: búsqueda, detalles, ver-en-mapa persistente |
| 6. **Despacho paso a paso** | Nuevo flujo de asignación: ubicación→destino→candidatos cercanos con distancia→[ASIGNAR]→datos cliente |
| 7. Expedientes | Backend: lectura scope terminal (solo consulta) + acciones según permisos; accesos desde Terminal |
| 8. Socios | Consulta socio desde terminal + rediseño |
| 9. **Asignaciones** | **Backend nuevo**: entidad asignación socio→unidad→conductor con historial + UI (terminal y socio) |
| 10. Unidades y conductores | Expediente de unidad premium (combustible+mantenimiento+historial juntos) |
| 11. App Taxista | Mantener minimalismo; + combustible |
| 12. **Combustible/km** | **Backend nuevo**: carga desde operador (ticket foto); socio opcional; terminal SOLO consulta (sin botones de escritura) |
| 13. Mantenimiento | Terminal consulta (read-only scope), socio escribe |
| 14. Objetos | Pulir visual (ciclo ya existe F11) |
| 15. Dashboard Socio | Rediseño del existente |
| 16. Dashboard Administrador | Nuevo: vista terminal con métricas del sitio |
| 17. Responsive | Verificación por rol (ya 0px overflow; re-auditar tras rediseños) |
| 18. Auditoría visual final | Batería completa de capturas + entregable |

**Backend nuevo requerido** (mínimo, reutilizando patrones):
1. Asignaciones (F9): colección `asignaciones` + CRUD + historial.
2. Combustible taxista (F12): extender `combustible_cargas` con `operador_id` + upload ticket (reutiliza `put_object`).
3. Lecturas scope terminal de datos socio/mantenimiento/combustible (F7/13): endpoints read-only `/terminal/...` con permit según configuración.
4. Dashboard administrador (F16): agregación por sitio.

---

## 6. Riesgos
1. **No-regresión**: la Terminal es el corazón operativo (79 tests + E2E). El rediseño del shell (F3) es el cambio más riesgoso → hacer por extracción con capturas antes/después.
2. **Compat 1.x**: `/resolver` de reportes, estado legacy del operador, tokens históricos — mantener.
3. Permisos: nuevos endpoints de consulta terminal NO deben filtrar datos que la operadora no deba ver (decidir alcance: consulta general vs por permiso).
4. Alcance: el prompt prohíbe autoasignación — los candidatos cercanos en despacho son RECOMENDACIÓN, la decisión sigue siendo de la operadora.

## 7. Decisión solicitada
Arrancar FASE 3 (Shell/Layout) que habilita visualmente todo lo demás, siguiendo el orden §52.
