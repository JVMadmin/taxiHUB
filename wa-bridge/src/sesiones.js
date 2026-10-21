// Una sesión de WhatsApp (Baileys) por sitio/central. Guarda credenciales en
// DATA_DIR/<sitio>/auth y los contactos que escribieron en DATA_DIR/<sitio>/contactos.json.
import fs from "node:fs/promises";
import path from "node:path";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  isJidStatusBroadcast,
  isLidUser,
  isPnUser,
  jidNormalizedUser,
  normalizeMessageContent,
  useMultiFileAuthState,
} from "baileys";
import {
  acotar,
  dentroDeVentana,
  esperaEntreEnvios,
  extraerContenido,
  soloDigitos,
  usuarioDeJid,
  VENTANA_RESPUESTA_MS,
} from "./util.js";

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_QR = 6; // ~2 min de QR sin escanear y se detiene (se vuelve a pedir desde la terminal)

export class GestorSesiones {
  constructor({ dataDir, logger, baileysLogger, notificar, nombreDispositivo }) {
    this.dataDir = dataDir;
    this.log = logger;
    this.baileysLogger = baileysLogger;
    this.notificar = notificar; // async (payload) => void — webhook del backend
    this.nombreDispositivo = nombreDispositivo;
    this.sesiones = new Map();
    this.versionWa = null;
  }

  dir(sitio) {
    return path.join(this.dataDir, sitio);
  }

  async restaurar() {
    let sitios = [];
    try {
      sitios = await fs.readdir(this.dataDir);
    } catch {
      return;
    }
    for (const sitio of sitios) {
      try {
        await fs.access(path.join(this.dir(sitio), "auth", "creds.json"));
        this.log.info({ sitio }, "Restaurando sesión de WhatsApp");
        await this.iniciar(sitio, {});
      } catch {
        /* carpeta sin credenciales: nada que restaurar */
      }
    }
  }

  estado(sitio) {
    const s = this.sesiones.get(sitio);
    if (!s) return { sitio_id: sitio, sesion: false, estado: "desconectado", conectado: false };
    return {
      sitio_id: sitio,
      sesion: true,
      estado: s.estado,
      conectado: s.estado === "conectado",
      numero_vinculado: s.numero || null,
      qr_code: s.estado === "esperando_qr" ? s.qr : null,
      pairing_code: s.pairingCode || null,
      dispositivo: this.nombreDispositivo,
      mensajes_enviados_hoy: s.enviadosHoy.fecha === hoy() ? s.enviadosHoy.n : 0,
      motivo: s.motivo || null,
    };
  }

  async iniciar(sitio, { modo = "qr", telefono } = {}) {
    const previa = this.sesiones.get(sitio);
    if (previa && previa.estado === "conectado") return this.estado(sitio);
    if (previa) await this.detener(sitio, { borrar: false });

    const s = {
      sitio,
      estado: "conectando",
      qr: null,
      qrVistos: 0,
      pairingCode: null,
      pairingPendiente: modo === "codigo" ? soloDigitos(telefono) : null,
      numero: null,
      motivo: null,
      sock: null,
      reintentos: 0,
      detenida: false,
      cola: Promise.resolve(),
      ultimoEnvio: 0,
      enviadosHoy: { fecha: hoy(), n: 0 },
      contactos: await this.leerContactos(sitio),
    };
    this.sesiones.set(sitio, s);
    await this.conectar(s);
    // Dar tiempo a que llegue el primer QR / código para que la terminal lo muestre de inmediato.
    for (let i = 0; i < 20 && s.estado === "conectando" && !s.pairingCode; i++) await dormir(250);
    return this.estado(sitio);
  }

  async conectar(s) {
    if (s.detenida) return;
    const { state, saveCreds } = await useMultiFileAuthState(path.join(this.dir(s.sitio), "auth"));
    if (!this.versionWa) {
      try {
        this.versionWa = (await fetchLatestBaileysVersion()).version;
      } catch {
        this.versionWa = undefined; // Baileys usa su versión incluida
      }
    }
    const sock = makeWASocket({
      auth: state,
      version: this.versionWa,
      logger: this.baileysLogger,
      browser: Browsers.ubuntu(this.nombreDispositivo),
      markOnlineOnConnect: false, // el teléfono de la central sigue recibiendo notificaciones
      // Sin historial completo, pero con la sincronización inicial: de ahí salen los mapeos LID → número.
      syncFullHistory: false,
    });
    s.sock = sock;
    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", (u) => this.alActualizar(s, sock, u).catch((e) => this.log.error(e)));
    sock.ev.on("messages.upsert", (ev) => this.alRecibir(s, sock, ev).catch((e) => this.log.error(e)));
  }

  async alActualizar(s, sock, { connection, lastDisconnect, qr }) {
    if (sock !== s.sock) return; // evento de un socket viejo
    if (qr) {
      s.qrVistos += 1;
      if (s.pairingPendiente) {
        const numero = s.pairingPendiente;
        s.pairingPendiente = null;
        try {
          s.pairingCode = await sock.requestPairingCode(numero);
          s.estado = "esperando_codigo";
        } catch (e) {
          this.log.warn({ sitio: s.sitio, err: e?.message }, "No se pudo pedir el código de vinculación");
          s.qr = qr;
          s.estado = "esperando_qr";
        }
      } else if (s.estado !== "esperando_codigo") {
        s.qr = qr;
        s.estado = "esperando_qr";
      }
      if (s.qrVistos > MAX_QR && !sock.authState.creds.registered) {
        s.motivo = "qr_expirado";
        await this.detener(s.sitio, { borrar: true, conservarEstado: true });
      }
      return;
    }
    if (connection === "open") {
      s.estado = "conectado";
      s.qr = null;
      s.pairingCode = null;
      s.motivo = null;
      s.reintentos = 0;
      s.numero = sock.user?.id ? `+${usuarioDeJid(sock.user.id)}` : null;
      this.log.info({ sitio: s.sitio, numero: s.numero }, "WhatsApp conectado");
      return;
    }
    if (connection === "close") {
      const codigo = lastDisconnect?.error?.output?.statusCode;
      if (s.detenida) return;
      if (codigo === DisconnectReason.loggedOut || codigo === DisconnectReason.forbidden) {
        this.log.warn({ sitio: s.sitio, codigo }, "Sesión cerrada desde el teléfono; se borran credenciales");
        s.motivo = "sesion_cerrada_en_telefono";
        await this.detener(s.sitio, { borrar: true, conservarEstado: true });
        return;
      }
      if (codigo === DisconnectReason.connectionReplaced) {
        s.motivo = "abierta_en_otro_lugar";
        await this.detener(s.sitio, { borrar: false, conservarEstado: true });
        return;
      }
      s.estado = sock.authState.creds.registered ? "reconectando" : "conectando";
      s.reintentos += 1;
      const espera = codigo === DisconnectReason.restartRequired ? 0 : Math.min(60000, 1000 * 2 ** Math.min(s.reintentos, 6));
      this.log.info({ sitio: s.sitio, codigo, espera }, "Reconectando WhatsApp");
      await dormir(espera);
      if (!s.detenida && this.sesiones.get(s.sitio) === s) await this.conectar(s);
    }
  }

  async alRecibir(s, sock, { messages, type }) {
    if (type !== "notify") return;
    for (const msg of messages) {
      const key = msg.key || {};
      const jid = key.remoteJid;
      if (!jid || key.fromMe) continue;
      if (isJidGroup(jid) || isJidBroadcast(jid) || isJidStatusBroadcast(jid) || isJidNewsletter(jid)) continue;
      const contenido = extraerContenido(normalizeMessageContent(msg.message));
      if (!contenido) continue;

      // Número real del pasajero: el chat puede venir por LID (identificador anónimo de WhatsApp).
      let pn = isPnUser(jid) ? jid : isPnUser(key.remoteJidAlt) ? key.remoteJidAlt : null;
      if (!pn && isLidUser(jid)) {
        try {
          pn = await sock.signalRepository?.lidMapping?.getPNForLID(jid);
        } catch {
          pn = null;
        }
      }
      const telefono = `+${usuarioDeJid(pn ? jidNormalizedUser(pn) : jid)}`;
      const nombre = msg.pushName || telefono;

      s.contactos[soloDigitos(telefono)] = { jid: jidNormalizedUser(jid), nombre, ultimo_entrante: Date.now() };
      await this.guardarContactos(s);

      // Marcar como leído con una pausa natural.
      setTimeout(() => sock.readMessages([key]).catch(() => {}), 800 + Math.floor(Math.random() * 700));

      await this.notificar({
        sitio_id: s.sitio,
        remitente: { nombre, telefono },
        mensaje: contenido,
      });
    }
  }

  // Encola el envío y responde de inmediato; el resultado final se avisa al backend.
  encolar(sitio, { telefono, texto, typing_ms, delay_queue_ms, mensaje_id }) {
    const s = this.sesiones.get(sitio);
    if (!s || s.estado !== "conectado") return { ok: false, status: 409, error: "whatsapp_no_conectado" };
    const contacto = s.contactos[soloDigitos(telefono)];
    if (!dentroDeVentana(contacto)) {
      return { ok: false, status: 403, error: "fuera_de_ventana_24h" };
    }
    const escribiendo = acotar(typing_ms, 800, 4000, 2000);
    const esperaPedida = acotar(delay_queue_ms, 0, 30000, 0);
    s.cola = s.cola.then(async () => {
      await dormir(Math.max(esperaPedida, esperaEntreEnvios(s.ultimoEnvio)));
      let estado = "enviado";
      let error = null;
      let waId = null;
      try {
        const sock = s.sock;
        if (!sock || s.estado !== "conectado") throw new Error("whatsapp_no_conectado");
        await sock.presenceSubscribe(contacto.jid).catch(() => {});
        await sock.sendPresenceUpdate("composing", contacto.jid).catch(() => {});
        await dormir(escribiendo);
        await sock.sendPresenceUpdate("paused", contacto.jid).catch(() => {});
        const r = await sock.sendMessage(contacto.jid, { text: texto });
        waId = r?.key?.id || null;
        if (s.enviadosHoy.fecha !== hoy()) s.enviadosHoy = { fecha: hoy(), n: 0 };
        s.enviadosHoy.n += 1;
      } catch (e) {
        estado = "fallido";
        error = String(e?.message || e).slice(0, 200);
        this.log.warn({ sitio, error }, "Envío de WhatsApp fallido");
      } finally {
        s.ultimoEnvio = Date.now();
      }
      if (mensaje_id) {
        await this.notificar({ tipo: "estado_envio", sitio_id: sitio, mensaje_id, estado, error, wa_id: waId });
      }
    });
    return { ok: true, status: 202, encolado: true };
  }

  async detener(sitio, { borrar = false, conservarEstado = false } = {}) {
    const s = this.sesiones.get(sitio);
    if (s) {
      s.detenida = true;
      try {
        if (borrar && s.sock && s.estado === "conectado") await s.sock.logout();
      } catch {
        /* ya estaba cerrada */
      }
      try {
        s.sock?.end(undefined);
      } catch {
        /* noop */
      }
      if (conservarEstado) {
        s.estado = "desconectado";
        s.qr = null;
        s.pairingCode = null;
        s.sock = null;
      } else {
        this.sesiones.delete(sitio);
      }
    }
    if (borrar) await fs.rm(path.join(this.dir(sitio), "auth"), { recursive: true, force: true });
    return this.estado(sitio);
  }

  async leerContactos(sitio) {
    try {
      return JSON.parse(await fs.readFile(path.join(this.dir(sitio), "contactos.json"), "utf8"));
    } catch {
      return {};
    }
  }

  async guardarContactos(s) {
    // Solo sirven para responder dentro de 24 h; se descartan a los 7 días.
    const limite = Date.now() - 7 * VENTANA_RESPUESTA_MS;
    for (const [k, c] of Object.entries(s.contactos)) if (!(c.ultimo_entrante > limite)) delete s.contactos[k];
    await fs.mkdir(this.dir(s.sitio), { recursive: true });
    const archivo = path.join(this.dir(s.sitio), "contactos.json");
    await fs.writeFile(`${archivo}.tmp`, JSON.stringify(s.contactos));
    await fs.rename(`${archivo}.tmp`, archivo);
  }
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}
