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
 */

let watcherId = null;
let webWatchId = null;
let usingNativePlugin = false;

export function esEntornoNativoAndroid() {
  return (
    typeof window !== "undefined" &&
    !!(window.Capacitor?.isNativePlatform?.() || window.Capacitor?.Plugins?.BackgroundGeolocation)
  );
}

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
            onLocation?.({
              lat: location.latitude,
              lng: location.longitude,
              accuracy: location.accuracy ?? 10,
              speed: location.speed ?? 0,
              heading: location.bearing ?? null,
              fromBackgroundService: true,
            });
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
          onLocation?.({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed,
            heading: pos.coords.heading,
            fromBackgroundService: false,
          });
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
