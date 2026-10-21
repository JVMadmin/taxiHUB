// Funciones puras del puente (sin Baileys ni red) para poder probarlas con node --test.

export const VENTANA_RESPUESTA_MS = 24 * 60 * 60 * 1000;
const SITIO_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function sitioValido(sitio) {
  return typeof sitio === "string" && SITIO_RE.test(sitio);
}

export function soloDigitos(telefono) {
  return String(telefono || "").replace(/\D/g, "");
}

// "5219161234567:12@s.whatsapp.net" → "5219161234567"
export function usuarioDeJid(jid) {
  return String(jid || "").split("@")[0].split(":")[0];
}

// ¿Se le puede escribir? Solo a quien escribió primero en las últimas 24 h.
export function dentroDeVentana(contacto, ahora = Date.now()) {
  return !!contacto && typeof contacto.ultimo_entrante === "number"
    && ahora - contacto.ultimo_entrante <= VENTANA_RESPUESTA_MS;
}

// Contenido ya normalizado (sin envolturas efímeras / ver una vez) → { texto, lat, lng }.
export function extraerContenido(m) {
  if (!m) return null;
  const loc = m.locationMessage || m.liveLocationMessage;
  if (loc && loc.degreesLatitude != null && loc.degreesLongitude != null) {
    const etiqueta = [loc.name, loc.address].filter(Boolean).join(" · ");
    return {
      texto: etiqueta ? `📍 ${etiqueta}` : "📍 Ubicación compartida",
      lat: Number(loc.degreesLatitude),
      lng: Number(loc.degreesLongitude),
    };
  }
  const texto =
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    m.templateButtonReplyMessage?.selectedDisplayText;
  if (texto) return { texto: String(texto).slice(0, 2000) };
  if (m.audioMessage) return { texto: "[Nota de voz]" };
  if (m.imageMessage) return { texto: "[Imagen]" };
  if (m.videoMessage) return { texto: "[Video]" };
  if (m.stickerMessage) return { texto: "[Sticker]" };
  if (m.documentMessage) return { texto: "[Documento]" };
  if (m.contactMessage || m.contactsArrayMessage) return { texto: "[Contacto]" };
  // Reacciones, ediciones, protocolos, encuestas…: no son mensajes para la central.
  return null;
}

// Espera entre envíos del mismo sitio: mínimo 3 s + 0–1.5 s al azar (≈ 14 mensajes/min como máximo).
export function esperaEntreEnvios(ultimoEnvio, ahora = Date.now(), azar = Math.random()) {
  const minimo = 3000 + Math.floor(azar * 1500);
  return Math.max(0, ultimoEnvio + minimo - ahora);
}

export function acotar(valor, min, max, porDefecto) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(max, Math.max(min, Math.round(n)));
}
