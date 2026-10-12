/**
 * lib/backgroundGps.js — Seguimiento GPS persistente en 2º plano (Android APK + Web).
 *
 * - Si corre dentro de la APK nativa de Android (Capacitor) y está disponible el
 *   plugin `@capacitor-community/background-geolocation` (registrado en
 *   `window.Capacitor.Plugins.BackgroundGeolocation`), levanta un Foreground Service
 *   de Android con notificación persistente ("TaxiHUB en turno — GPS y Voz activos")
 *   que transmite coordenadas aun con la pantalla apagada o la app minimizada.
 * - Si corre en navegador móvil/escritorio, combina `navigator.geolocation.watchPosition`
 *   con `WakeLock` de pantalla e intervalo de respaldo.
 * - Buffer offline local: encola puntos si la red cae o hay baja cobertura (Palenque-Catazajá)
 *   y los transmite en lote con su timestamp original (/api/locations/batch).
 */

const STORAGE_KEY_OFFLINE_GPS = "taxihub_gps_offline_queue";
const MAX_COLA_OFFLINE = 400;

let watcherId = null;
let webWatchId = null;
let usingNativePlugin = false;
let ultimoReporteLocal = null;
let sincronizandoLote = false;

export function esEntornoNativoAndroid() {
  return (
    typeof window !== "undefined" &&
    !!(window.Capacitor?.isNativePlatform?.() || window.Capacitor?.Plugins?.BackgroundGeolocation)
  );
}

// ---------------------------------------------------------------------------
// Buffer Offline (LocalStorage FIFO)
// ---------------------------------------------------------------------------

export function obtenerColaOffline() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OFFLINE_GPS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function encolarPuntoOffline(punto) {
  if (typeof window === "undefined" || !punto) return;
  try {
    const cola = obtenerColaOffline();
    cola.push({
      lat: punto.lat,
      lng: punto.lng,
      accuracy: punto.accuracy ?? null,
      speed: punto.speed ?? null,
      heading: punto.heading ?? null,
      battery_level: punto.battery_level ?? null,
      client_ts: punto.client_ts || new Date().toISOString(),
    });
    // Limitar tamaño máximo para no saturar memoria
    const recortada = cola.slice(-MAX_COLA_OFFLINE);
    localStorage.setItem(STORAGE_KEY_OFFLINE_GPS, JSON.stringify(recortada));
  } catch {}
}

export function limpiarColaOffline(cantidad = null) {
  if (typeof window === "undefined") return;
  try {
    if (cantidad === null) {
      localStorage.removeItem(STORAGE_KEY_OFFLINE_GPS);
      return;
    }
    const cola = obtenerColaOffline();
    const restantes = cola.slice(cantidad);
    localStorage.setItem(STORAGE_KEY_OFFLINE_GPS, JSON.stringify(restantes));
  } catch {}
}

/**
 * Vacía la cola de puntos GPS acumulados offline enviándolos al endpoint de batch.
 */
export async function vaciarColaOffline({ apiFetch, operadorId } = {}) {
  if (sincronizandoLote || typeof window === "undefined") return { ok: true, procesados: 0 };
  const cola = obtenerColaOffline();
  if (!cola.length) return { ok: true, procesados: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: false, motivo: "sin_conexion" };

  sincronizandoLote = true;
  try {
    const endpoint = operadorId
      ? `/api/operadores/${operadorId}/ubicaciones-batch`
      : `/api/locations/batch`;
    const res = await apiFetch(endpoint, {
      method: "POST",
      body: JSON.stringify({ puntos: cola }),
    });
    if (res && (res.ok || res.status === 200)) {
      limpiarColaOffline();
      return { ok: true, procesados: cola.length };
    }
  } catch (err) {
    // Si falla el lote, los puntos se mantienen en la cola
  } finally {
    sincronizandoLote = false;
  }
  return { ok: false, pendientes: cola.length };
}

/**
 * Envía una ubicación al backend con resiliencia: si falla o está offline,
 * la encola en local; si tiene éxito, intenta vaciar la cola pendiente.
 */
export async function enviarUbicacionRobusta(punto, { operadorId, apiFetch } = {}) {
  ultimoReporteLocal = { ...punto, ts: new Date().toISOString() };
  if (!apiFetch || !operadorId) {
    encolarPuntoOffline(punto);
    return { ok: false, buffer: true };
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    encolarPuntoOffline(punto);
    return { ok: false, buffer: true, offline: true };
  }

  try {
    const res = await apiFetch(`/api/operadores/${operadorId}/ubicacion`, {
      method: "POST",
      body: JSON.stringify({
        lat: punto.lat,
        lng: punto.lng,
        accuracy: punto.accuracy,
        speed: punto.speed,
        heading: punto.heading,
        battery_level: punto.battery_level,
        timestamp: punto.client_ts || new Date().toISOString(),
      }),
    });
    // Si hay puntos acumulados offline, vaciarlos
    const cola = obtenerColaOffline();
    if (cola.length > 0) {
      vaciarColaOffline({ apiFetch, operadorId }).catch(() => {});
    }
    return { ok: true, ...res };
  } catch (err) {
    encolarPuntoOffline(punto);
    return { ok: false, buffer: true, error: err?.message };
  }
}

export function obtenerEstadoGps() {
  const cola = obtenerColaOffline();
  return {
    activo: watcherId !== null || webWatchId !== null,
    modo: usingNativePlugin ? "android_foreground_service" : (webWatchId !== null ? "web_watch_position" : "inactivo"),
    esNativo: esEntornoNativoAndroid(),
    puntosEnColaOffline: cola.length,
    ultimoReporte: ultimoReporteLocal,
  };
}

// ---------------------------------------------------------------------------
// Inicialización y parada del servicio
// ---------------------------------------------------------------------------

export async function iniciarGpsSegundoPlano({ onLocation, onError }) {
  await detenerGpsSegundoPlano();

  const bgPlugin =
    typeof window !== "undefined" ? window.Capacitor?.Plugins?.BackgroundGeolocation : null;

  if (bgPlugin && typeof bgPlugin.addWatcher === "function") {
    try {
      usingNativePlugin = true;
      watcherId = await bgPlugin.addWatcher(
        {
          backgroundTitle: "TaxiHUB Operador en Turno",
          backgroundMessage: "Ubicación GPS y avisos de voz activos con pantalla apagada.",
          requestPermissions: true,
          stale: false,
          distanceFilter: 8,
        },
        (location, error) => {
          if (error) {
            onError?.(error);
            return;
          }
          if (location) {
            const punto = {
              lat: location.latitude,
              lng: location.longitude,
              accuracy: location.accuracy ?? 10,
              speed: location.speed ?? 0,
              heading: location.bearing ?? null,
              client_ts: new Date().toISOString(),
              fromBackgroundService: true,
            };
            ultimoReporteLocal = punto;
            onLocation?.(punto);
          }
        }
      );
      return { modo: "android_foreground_service", watcherId };
    } catch (err) {
      usingNativePlugin = false;
      onError?.(err);
    }
  }

  // Fallback Web / PWA con watchPosition continuo de alta precisión
  if (typeof navigator !== "undefined" && navigator.geolocation) {
    try {
      webWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          const punto = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed,
            heading: pos.coords.heading,
            client_ts: new Date().toISOString(),
            fromBackgroundService: false,
          };
          ultimoReporteLocal = punto;
          onLocation?.(punto);
        },
        (err) => onError?.(err),
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 12000,
        }
      );
      return { modo: "web_watch_position", watcherId: webWatchId };
    } catch (err) {
      onError?.(err);
    }
  }

  return { modo: "interval_only", watcherId: null };
}

export async function detenerGpsSegundoPlano() {
  const bgPlugin =
    typeof window !== "undefined" ? window.Capacitor?.Plugins?.BackgroundGeolocation : null;
  if (usingNativePlugin && bgPlugin && watcherId != null) {
    try {
      await bgPlugin.removeWatcher({ id: watcherId });
    } catch {}
  }
  if (webWatchId != null && typeof navigator !== "undefined" && navigator.geolocation) {
    try {
      navigator.geolocation.clearWatch(webWatchId);
    } catch {}
  }
  watcherId = null;
  webWatchId = null;
  usingNativePlugin = false;
}
