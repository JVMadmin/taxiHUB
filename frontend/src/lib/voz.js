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

function elegirVoz() {
  try {
    const voces = window.speechSynthesis?.getVoices?.() || [];
    if (!voces.length) return null;
    // Preferencia: español México → cualquier español → primera disponible.
    return (
      voces.find((v) => /es[-_]MX/i.test(v.lang)) ||
      voces.find((v) => /^es/i.test(v.lang)) ||
      voces[0]
    );
  } catch {
    return null;
  }
}

export function vozDisponible() {
  return (
    typeof window !== "undefined" &&
    ("speechSynthesis" in window || !!window.Capacitor?.Plugins?.TextToSpeech)
  );
}

export function detenerVoz() {
  try {
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
export function hablarVoz(texto, { rate = 1.02, pitch = 1, alertaPrevia = false } = {}) {
  if (!texto || !vozDisponible()) return false;
  try {
    if (alertaPrevia) sonarAlertaOferta();
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
  return typeof window !== "undefined" && "Notification" in window;
}

export async function pedirPermisoNotificaciones() {
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
 * dentro del navegador). Requiere permiso concedido.
 */
export function mostrarNotificacion({ titulo, cuerpo, tag = "taxihub-oferta" }) {
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
