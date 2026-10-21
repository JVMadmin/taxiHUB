// Puente WhatsApp de TaxiHUB. Solo escucha dentro de la red de Docker: el backend
// lo llama con `Authorization: Bearer <WA_BRIDGE_TOKEN>` y el puente reenvía los
// mensajes entrantes a `BACKEND_URL/api/wa/webhook` con el mismo token.
import crypto from "node:crypto";
import http from "node:http";
import pino from "pino";
import { GestorSesiones } from "./sesiones.js";
import { sitioValido } from "./util.js";

const PORT = Number(process.env.PORT || 3099);
const TOKEN = process.env.WA_BRIDGE_TOKEN || process.env.WA_WEBHOOK_TOKEN || "";
const BACKEND_URL = (process.env.BACKEND_URL || "http://taxihub-backend:8000").replace(/\/$/, "");
const DATA_DIR = process.env.DATA_DIR || "/data";

const log = pino({ level: process.env.LOG_LEVEL || "info" });
if (!TOKEN) {
  log.fatal("Falta WA_BRIDGE_TOKEN (o WA_WEBHOOK_TOKEN): el puente no arranca sin token");
  process.exit(1);
}

async function notificar(payload) {
  for (let intento = 0; intento < 4; intento++) {
    try {
      const r = await fetch(`${BACKEND_URL}/api/wa/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) return;
      if (r.status === 401 || r.status === 503) {
        log.error({ status: r.status }, "El backend rechazó el webhook: revisa WA_WEBHOOK_TOKEN en ambos lados");
        return;
      }
    } catch (e) {
      log.warn({ err: e?.message, intento }, "Webhook al backend falló");
    }
    await new Promise((res) => setTimeout(res, 1000 * 2 ** intento));
  }
  log.error({ tipo: payload.tipo || "mensaje", sitio: payload.sitio_id }, "Webhook descartado tras 4 intentos");
}

const gestor = new GestorSesiones({
  dataDir: DATA_DIR,
  logger: log,
  baileysLogger: log.child({ modulo: "baileys" }, { level: process.env.BAILEYS_LOG_LEVEL || "warn" }),
  notificar,
  nombreDispositivo: process.env.WA_NOMBRE_DISPOSITIVO || "TaxiHUB Central",
});

function tokenValido(cabecera) {
  const a = Buffer.from(String(cabecera || ""));
  const b = Buffer.from(`Bearer ${TOKEN}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function responder(res, status, cuerpo) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(cuerpo));
}

async function leerJson(req) {
  let datos = "";
  for await (const parte of req) {
    datos += parte;
    if (datos.length > 64 * 1024) throw new Error("cuerpo demasiado grande");
  }
  return datos ? JSON.parse(datos) : {};
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://puente");
  try {
    if (req.method === "GET" && url.pathname === "/health") return responder(res, 200, { ok: true });
    if (!tokenValido(req.headers.authorization)) return responder(res, 401, { error: "no_autorizado" });

    if (req.method === "GET" && url.pathname === "/status") {
      const sitio = url.searchParams.get("sitio_id");
      if (!sitioValido(sitio)) return responder(res, 400, { error: "sitio_invalido" });
      return responder(res, 200, gestor.estado(sitio));
    }

    const m = url.pathname.match(/^\/sesiones\/([^/]+)\/(iniciar|cerrar)$/);
    if (req.method === "POST" && m) {
      const sitio = decodeURIComponent(m[1]);
      if (!sitioValido(sitio)) return responder(res, 400, { error: "sitio_invalido" });
      const body = await leerJson(req);
      const estado = m[2] === "iniciar"
        ? await gestor.iniciar(sitio, { modo: body.modo === "codigo" ? "codigo" : "qr", telefono: body.telefono })
        : await gestor.detener(sitio, { borrar: true });
      return responder(res, 200, estado);
    }

    if (req.method === "POST" && url.pathname === "/send") {
      const body = await leerJson(req);
      if (!sitioValido(body.sitio_id) || !body.telefono || !body.texto) {
        return responder(res, 400, { error: "datos_incompletos" });
      }
      const r = gestor.encolar(body.sitio_id, { ...body, texto: String(body.texto).slice(0, 4000) });
      return responder(res, r.status, r);
    }

    return responder(res, 404, { error: "no_encontrado" });
  } catch (e) {
    log.error({ err: e?.message, ruta: url.pathname }, "Error en el puente");
    return responder(res, 500, { error: "error_interno" });
  }
});

servidor.listen(PORT, async () => {
  log.info({ PORT, BACKEND_URL }, "Puente WhatsApp escuchando");
  await gestor.restaurar();
});

for (const senal of ["SIGTERM", "SIGINT"]) {
  process.on(senal, () => {
    log.info("Cerrando puente (las sesiones se conservan en disco)");
    servidor.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
