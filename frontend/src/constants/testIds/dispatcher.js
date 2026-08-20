// Test IDs para el dispatcher (mapa terminal, servicios, flota, despacho).
// Convención kebab-case: <feature>-<element>.

export const DISPATCH = {
  serviciosTabs: "serv-tab",             // + `-${estado}`  (p.ej. serv-tab-pendiente)
  despacharBtn: "despachar-",            // + servicioId
  asignarBtn: "asignar-",                // + servicioId (data-testid de tarjeta)
  candidatosList: "candidatos-",         // + servicioId
  cancelarServicioBtn: "cancelar-",      // + servicioId
  nuevoVehiculo: "nuevo-vehiculo-btn",
  formularioVehiculo: "form-vehiculo",
  vehiculoRow: "vehiculo-row-",          // + vehiculoId
  candidatoAsignar: "asignar-candidato-",// + operadorId

  // Fase 9 — Dispatcher profesional
  serviciosTrayToggle: "servicios-tray-toggle",
  serviciosTray: "servicios-tray",
  sidebarToggle: "sidebar-toggle",
  taxiDetailPanel: "taxi-detail-panel",
  taxiDetailClose: "taxi-detail-close",
  seguirTaxiBtn: "seguir-taxi-btn",
  verServicioBtn: "ver-servicio-btn",
  servicioFiltroLimpiar: "servicio-filtro-limpiar",
  flotaFiltro: "flota-filtro-",          // + `-${id}`
  vehiculoEdit: "vehiculo-edit-",        // + vehiculoId
  formEditVehiculo: "form-edit-",        // + vehiculoId
  verRecorridoBtn: "ver-recorrido-btn",  // Fase 10: historial de recorrido

  // Fase 11 — Transparencia, paneles móviles y ruta a destino
  uiControls: "terminal-ui-controls",    // botón Ajustes de pantalla
  uiOpacity: "terminal-ui-opacity",      // slider de transparencia
  rutaToggle: "terminal-ruta-toggle",    // mostrar/ocultar ruta al destino
};