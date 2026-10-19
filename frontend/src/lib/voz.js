/**
 * lib/voz.js — Voz IA (TTS), comandos de voz (STT) y notificaciones del sistema
 * para la Driver App (operador).
 *
 * - TTS vía `speechSynthesis` (sin dependencias, funciona offline con voces
 *   locales). Voz español México preferida, fallback a cualquier voz `es-*`.
 * - Comandos vía Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`,
 *   requiere HTTPS o localhost + permiso de micrófono).
 * - Notificaciones vía Notification API + vibración.
 */

// ---------------------------------------------------------------------------
// Texto a voz (TTS)
// ---------------------------------------------------------------------------

let vozElegida = null;
let audioCtx = null;
let keepAliveTimer = null;

/**
 * Mantiene vivo el canal de audio en Android/WebView aun con la pantalla apagada
 * emitiendo un pulso inaudible cada 20s mientras el operador está en turno.
 */
export function activarKeepAliveAudio(activo = true) {
  if (typeof window === "undefined") return;
  if (!activo) {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
    return;
  }
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    if (!keepAliveTimer) {
      keepAliveTimer = setInterval(() => {
        try {
          if (!audioCtx) return;
          if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          gain.gain.value = 0.0001; // inaudible keepalive
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.05);
        } catch {}
      }, 20000);
    }
  } catch {}
}

/**
 * Emite un tono doble de despacho antes del anuncio por voz para despertar
 * la atención del operador incluso con pantalla bloqueada.
 */
export function sonarAlertaOferta() {
  try {
    if (typeof window !== "undefined" && window.TaxiHubNative && typeof window.TaxiHubNative.playAlert === "function") {
      window.TaxiHubNative.playAlert();
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    const now = audioCtx.currentTime;
    [880, 1174.66].forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);
      gain.gain.setValueAtTime(0.18, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.12);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.13);
    });
  } catch {}
}

export function esVozFemenina(v) {
  if (!v) return false;
  const nombre = ((v.name || "") + " " + (v.voiceURI || "")).toLowerCase();
  const femaleKeywords = [
    "female", "mujer", "dalia", "sabina", "paulina", "hilda", "elena", 
    "helena", "laura", "monica", "mónica", "lucia", "lucía", "sofia", 
    "sofía", "camila", "penelope", "penélope", "victoria", "carmen", "rosa",
    "maria", "maría", "esperanza", "clara", "alva", "paloma", "francisca", "salome", "salomé",
    "zira", "mia", "eva", "ines", "inés"
  ];
  return femaleKeywords.some((kw) => nombre.includes(kw));
}

function elegirVoz() {
  try {
    const synth = window.speechSynthesis;
    const voces = synth?.getVoices?.() || [];
    if (!voces.length) return null;
    
    // 1. Voz femenina en español de México
    const femMx = voces.find((v) => /es[-_]MX/i.test(v.lang) && esVozFemenina(v));
    if (femMx) return femMx;

    // 2. Voz femenina en cualquier dialecto de español (es-ES, es-US, es-419, etc.)
    const femEs = voces.find((v) => /^es/i.test(v.lang) && esVozFemenina(v));
    if (femEs) return femEs;

    // 3. Cualquier voz en español México
    const esMx = voces.find((v) => /es[-_]MX/i.test(v.lang));
    if (esMx) return esMx;

    // 4. Cualquier voz en español
    const esAny = voces.find((v) => /^es/i.test(v.lang));
    if (esAny) return esAny;

    // 5. Cualquier voz femenina
    const femAny = voces.find((v) => esVozFemenina(v));
    if (femAny) return femAny;

    return voces[0];
  } catch {
    return null;
  }
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    vozElegida = elegirVoz();
  };
}

export function vozDisponible() {
  return (
    typeof window !== "undefined" &&
    (!!window.TaxiHubNative || "speechSynthesis" in window || !!window.Capacitor?.Plugins?.TextToSpeech)
  );
}

export function detenerVoz() {
  try {
    if (typeof window !== "undefined" && window.TaxiHubNative && typeof window.TaxiHubNative.stop === "function") {
      window.TaxiHubNative.stop();
    }
    window.Capacitor?.Plugins?.TextToSpeech?.stop?.();
    window.speechSynthesis?.cancel();
  } catch {
    /* noop */
  }
}

/**
 * Habla un texto con la voz IA. En Android nativo (Capacitor) utiliza el motor
 * nativo del sistema si está disponible para garantizar reproducción con pantalla
 * apagada; en navegador usa `speechSynthesis` + keep-alive de AudioContext.
 */
export function hablarVoz(texto, { rate = 1.02, pitch = 1.16, alertaPrevia = false } = {}) {
  if (!texto || !vozDisponible()) return false;
  try {
    if (alertaPrevia) sonarAlertaOferta();

    // 1. Motor nativo de Android (TaxiHubNativeBridge) - Funciona con pantalla apagada y en background
    if (typeof window !== "undefined" && window.TaxiHubNative && typeof window.TaxiHubNative.speak === "function") {
      window.TaxiHubNative.speak(texto);
      return true;
    }

    const capTts = window.Capacitor?.Plugins?.TextToSpeech;
    if (capTts?.speak) {
      capTts.speak({
        text: texto,
        lang: "es-MX",
        rate,
        pitch,
        volume: 1.0,
        category: "ambient",
      }).catch(() => {});
      return true;
    }
    const synth = window.speechSynthesis;
    if (!synth) return false;
    if (!vozElegida) vozElegida = elegirVoz();
    synth.cancel();
    if (synth.paused) synth.resume();
    const utt = new SpeechSynthesisUtterance(texto);
    utt.lang = "es-MX";
    utt.rate = rate;
    utt.pitch = pitch;
    if (vozElegida) utt.voice = vozElegida;
    synth.speak(utt);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Resolución de sitios aproximados (sin coordenadas numéricas para el chofer)
// ---------------------------------------------------------------------------

export const POIS_REFERENCIA_PALENQUE = [
  { nombre: "Estación del Tren Maya", alias: ["tren maya", "estacion tren", "tren"], lat: 17.5359, lng: -91.9592, radioM: 1500 },
  { nombre: "Mercado Municipal", alias: ["mercado", "mercado municipal"], lat: 17.5080, lng: -91.9835, radioM: 450 },
  { nombre: "Parque Central", alias: ["parque central", "parque", "centro"], lat: 17.5096, lng: -91.9818, radioM: 400 },
  { nombre: "Terminal ADO", alias: ["ado", "terminal ado", "autobuses"], lat: 17.5139, lng: -91.9856, radioM: 400 },
  { nombre: "Hospital General", alias: ["hospital", "hospital general"], lat: 17.5077, lng: -91.9800, radioM: 500 },
  { nombre: "Zona Arqueológica de Palenque", alias: ["ruinas", "zona arqueologica"], lat: 17.4840, lng: -92.0458, radioM: 3000 },
  { nombre: "Crucero a Pakal-Ná", alias: ["crucero", "pakal na", "pakal-na"], lat: 17.5270, lng: -91.9750, radioM: 800 },
  { nombre: "Colonia Pakal-Ná", alias: ["pakal na", "pakal-na", "pakal"], lat: 17.5350, lng: -91.9680, radioM: 1200 },
  { nombre: "Aeropuerto de Palenque", alias: ["aeropuerto"], lat: 17.5342, lng: -91.9875, radioM: 1500 },
  { nombre: "Boulevard Aeropuerto", alias: ["boulevard", "blvd"], lat: 17.5300, lng: -91.9700, radioM: 700 },
  { nombre: "Avenida Hidalgo esquina con 5 de Mayo", lat: 17.5105, lng: -91.9825, radioM: 350 },
  { nombre: "Avenida Juárez esquina con 20 de Noviembre", lat: 17.5120, lng: -91.9840, radioM: 350 },
  { nombre: "Avenida Reforma esquina con Jiménez", lat: 17.5090, lng: -91.9805, radioM: 350 },
  { nombre: "Periférico Sur", lat: 17.5050, lng: -91.9820, radioM: 600 },
  { nombre: "Carretera a Catazajá", alias: ["playas de catazaja", "catazaja"], lat: 17.7200, lng: -92.0100, radioM: 8000 },
  { nombre: "Carretera a Villahermosa", alias: ["villahermosa"], lat: 17.8000, lng: -92.2000, radioM: 15000 },
];

function haversineMts(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Traduce un texto o coordenadas geográficas a un nombre de sitio o referencia
 * de calle/esquina aproximada de Palenque, eliminando completamente números de latitud/longitud.
 */
export function resolverSitioAproximado(texto, coords = null) {
  let raw = typeof texto === "string" ? texto.trim() : (texto?.texto || "");
  let lat = coords?.lat != null ? Number(coords.lat) : null;
  let lng = coords?.lng != null ? Number(coords.lng) : null;

  // Si no se pasaron coords separadas pero el texto contiene coordenadas tipo "17.509, -91.982"
  if ((lat == null || lng == null) && raw) {
    const match = raw.match(/(-?\d{1,3}\.\d+)[\s,]+(-?\d{1,3}\.\d+)/);
    if (match) {
      lat = Number(match[1]);
      lng = Number(match[2]);
    }
  }

  // Detectar si el texto es solo coordenadas o un texto genérico del mapa
  const esGenericoOCoord =
    !raw ||
    /coordenada|marcada en mapa|ubicaci[oó]n (marcada|actual)|punto en mapa/i.test(raw) ||
    /^-?\d+\.\d+/.test(raw) ||
    /lat\s*[:=]|lng\s*[:=]/i.test(raw);

  // Si tenemos coordenadas y el texto es genérico o numérico, buscar el POI / esquina más cercana
  if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
    let mejor = null;
    let menorDist = Infinity;
    for (const p of POIS_REFERENCIA_PALENQUE) {
      const d = haversineMts(lat, lng, p.lat, p.lng);
      if (d < menorDist) {
        menorDist = d;
        mejor = p;
      }
    }

    if (mejor && menorDist <= mejor.radioM) {
      return menorDist < 80 ? mejor.nombre : `Cerca de ${mejor.nombre}`;
    }

    if (esGenericoOCoord && mejor && menorDist <= 3500) {
      return `Rumbo a ${mejor.nombre}`;
    }
  }

  // Si el texto ya tiene un nombre legible de calle o comercio, limpiarlo de cualquier número de coordenadas
  if (raw && !esGenericoOCoord) {
    const limpio = raw
      .replace(/\(?-?\d{1,3}\.\d+[\s,]+-?\d{1,3}\.\d+\)?/g, "")
      .replace(/,\s*Chiapas|\bCP\s*\d{5}/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (limpio && limpio.length > 2) {
      return limpio;
    }
  }

  return "Palenque Centro";
}

/**
 * Anuncio vocal estructurado y profesional del despacho para el conductor:
 * - NO menciona tarifa (instrucción explícita).
 * - Menciona el sitio aproximado (calle, esquina, POI como Mercado o Estación Tren Maya), NUNCA coordenadas.
 * - Si el destino fue fijado, SÍ menciona el destino. Si no fue fijado, no lo menciona.
 * - Despierta pantalla si está apagada.
 */
export function anunciarServicioEntrante({
  origen,
  destino,
  coordsOrigen,
  coordsDestino,
  distanciaKm,
} = {}) {
  // Despertar pantalla si el dispositivo lo soporta
  if (typeof navigator !== "undefined" && navigator.wakeLock) {
    navigator.wakeLock.request("screen").catch(() => {});
  }

  const sitioOrigen = resolverSitioAproximado(origen, coordsOrigen);
  const destinoTxt = typeof destino === "string" ? destino.trim() : (destino?.texto || "");
  const tieneDestino =
    destinoTxt &&
    destinoTxt !== "Sin destino" &&
    destinoTxt !== "Destino libre" &&
    !/no fijado|sin destino/i.test(destinoTxt);

  const sitioDestino = tieneDestino
    ? resolverSitioAproximado(destinoTxt, coordsDestino)
    : null;

  const partes = ["Nuevo servicio disponible."];
  if (sitioOrigen) {
    partes.push(`Pasajero en ${sitioOrigen}.`);
  }
  if (distanciaKm && typeof distanciaKm === "number" && distanciaKm > 0) {
    const dist = distanciaKm.toFixed(1);
    partes.push(`A ${dist} kilómetros.`);
  }

  // Si el destino fue fijado, sí debe mencionar el destino
  if (sitioDestino && sitioDestino !== sitioOrigen) {
    partes.push(`Destino ${sitioDestino}.`);
  }

  // NO SE MENCIONA TARIFA
  partes.push("Toca la pantalla para aceptar.");

  return hablarVoz(partes.join(" "), { alertaPrevia: true, rate: 1.05 });
}

export function probarAudioVoz() {
  sonarAlertaOferta();
  setTimeout(() => {
    hablarVoz("Audio y alertas de TaxiHUB Driver funcionando correctamente.", { rate: 1.02 });
  }, 350);
}

// Precarga voces cuando el navegador las publica tarde (Chrome desktop).
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  try {
    window.speechSynthesis.onvoiceschanged = () => {
      vozElegida = elegirVoz();
    };
  } catch {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// Reconocimiento de voz (comandos: aceptar / rechazar)
// ---------------------------------------------------------------------------

export function reconocimientoDisponible() {
  return (
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition)
  );
}

/**
 * Crea un reconocedor de un solo disparo (no continuo): escucha hasta obtener
 * un resultado final o hasta `timeoutMs`. Llama `onFinal(texto)` en minúsculas.
 */
export function crearReconocimiento({ lang = "es-MX", timeoutMs = 15000, onFinal, onEnd, onError } = {}) {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = lang;
  rec.interimResults = false;
  rec.maxAlternatives = 3;
  let timer = null;
  let terminado = false;
  const finalizar = () => {
    if (terminado) return;
    terminado = true;
    if (timer) clearTimeout(timer);
    try {
      rec.stop();
    } catch {
      /* noop */
    }
  };
  rec.onresult = (ev) => {
    const res = ev.results?.[ev.results.length - 1]?.[0];
    const texto = (res?.transcript || "").toLowerCase().trim();
    if (texto) {
      finalizar();
      onFinal?.(texto);
    }
  };
  rec.onerror = (ev) => {
    finalizar();
    onError?.(ev?.error || "error");
  };
  rec.onend = () => {
    if (timer) clearTimeout(timer);
    onEnd?.();
  };
  timer = setTimeout(() => {
    finalizar();
    onEnd?.();
  }, timeoutMs);
  try {
    rec.start();
  } catch {
    if (timer) clearTimeout(timer);
    return null;
  }
  return { reconocimiento: rec, detener: finalizar };
}

/** Clasifica un transcript a intención de oferta. */
export function clasificarComandoOferta(texto) {
  const t = (texto || "").toLowerCase();
  if (/(rechaz|rechazo|no quiero|cancela|declin)/.test(t)) return "rechazar";
  if (/(acept|acepto|sí, voy|sí voy|sí)\b|voy|dale|confirmo|ok\b|vale|confirmar|ok$/.test(t)) return "confirmar";
  if (/(distancia|dónde|donde|cuántos|minutos)/.test(t)) return "distancia";
  return null;
}

// ---------------------------------------------------------------------------
// Notificaciones del sistema
// ---------------------------------------------------------------------------

export function notificacionesDisponibles() {
  return (
    typeof window !== "undefined" &&
    (!!window.TaxiHubNative || "Notification" in window || !!window.Capacitor?.Plugins?.LocalNotifications)
  );
}

export async function pedirPermisoNotificaciones() {
  try {
    if (typeof window !== "undefined" && window.TaxiHubNative && typeof window.TaxiHubNative.requestAllPermissions === "function") {
      window.TaxiHubNative.requestAllPermissions();
      return "granted";
    }
    const localNotif = window.Capacitor?.Plugins?.LocalNotifications;
    if (localNotif && typeof localNotif.requestPermissions === "function") {
      const res = await localNotif.requestPermissions();
      if (res?.display === "granted") return "granted";
    }
  } catch {}
  if (!notificacionesDisponibles()) return "denied";
  try {
    if (Notification.permission === "granted") return "granted";
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export function vibrar(patron = [200, 100, 200]) {
  try {
    navigator.vibrate?.(patron);
  } catch {
    /* noop */
  }
}

/**
 * Muestra notificación del sistema (funciona con la app en segundo plano
 * dentro del navegador y en Android nativo). Requiere permiso concedido.
 */
export function mostrarNotificacion({ titulo, cuerpo, tag = "taxihub-oferta" }) {
  try {
    if (typeof window !== "undefined" && window.TaxiHubNative && typeof window.TaxiHubNative.showNotification === "function") {
      window.TaxiHubNative.showNotification(titulo, cuerpo);
      return true;
    }
    const localNotif = window.Capacitor?.Plugins?.LocalNotifications;
    if (localNotif && typeof localNotif.schedule === "function") {
      localNotif.schedule({
        notifications: [
          {
            title: titulo,
            body: cuerpo,
            id: Math.floor((Date.now() + Math.random() * 1000) % 100000),
            sound: "dispatch_alert.wav",
            smallIcon: "ic_stat_taxihub",
            actionTypeId: "",
            extra: { tag },
          },
        ],
      }).catch(() => {});
      return true;
    }
  } catch {}

  if (!notificacionesDisponibles() || Notification.permission !== "granted") return false;
  try {
    const n = new Notification(titulo, {
      body: cuerpo,
      tag,
      renotify: true,
      requireInteraction: true,
      icon: "/assets/vehicles/march.png",
      badge: "/assets/vehicles/march.png",
      vibrate: [200, 100, 200, 100, 300],
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        /* noop */
      }
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
