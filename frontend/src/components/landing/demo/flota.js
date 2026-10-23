// Simulación de la flota de demostración de la landing.
// Calles reales de Palenque (pistas.js) con unidades y choferes sintéticos: nada de esto
// toca la API ni datos de producción. Un solo "mundo" compartido por todos los mapas de la
// página, que solo avanza mientras algún mapa está visible (y nunca con movimiento reducido).
import { PISTAS } from "./pistas";

// La demo corre acelerada para que el movimiento se vea a escala de ciudad.
export const ESCALA_TIEMPO = 3;
// En una central real la oferta dura `oferta_duracion_seg` (60 s por defecto); aquí se acorta.
export const OFERTA_DEMO_S = 6;
export const OFERTA_REAL_S = 60;
export const ACEPTA_TRAS_S = 4;

const R = 6371000;
const rad = (g) => (g * Math.PI) / 180;
export function distM(a, b) {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function rumbo(a, b) {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function prepararRuta(id, p) {
  const acum = [0];
  for (let i = 1; i < p.puntos.length; i++) acum.push(acum[i - 1] + distM(p.puntos[i - 1], p.puntos[i]));
  const largo = acum[acum.length - 1];
  const cerrada = distM(p.puntos[0], p.puntos[p.puntos.length - 1]) < 60;
  return { id, nombre: p.nombre, puntos: p.puntos, acum, largo, cerrada };
}
export const RUTAS = Object.fromEntries(Object.entries(PISTAS).map(([id, p]) => [id, prepararRuta(id, p)]));

// Calle legible a partir del nombre de la pista ("Pista Centro - Av. Juárez y Mercado" → "Centro · Av. Juárez y Mercado").
export const nombreZona = (pistaId) =>
  (RUTAS[pistaId]?.nombre || "").replace(/^Pista\s+/i, "").replace(/\s+-\s+/g, " · ");

function normalizar(ruta, s) {
  if (ruta.cerrada) return ((s % ruta.largo) + ruta.largo) % ruta.largo;
  return Math.max(0, Math.min(ruta.largo, s));
}

// Punto a `s` metros del inicio de la ruta: [lat, lng] + rumbo de la calle en ese tramo.
export function puntoEn(ruta, s) {
  const d = normalizar(ruta, s);
  const { acum, puntos } = ruta;
  let lo = 0;
  let hi = acum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (acum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const a = puntos[lo];
  const b = puntos[hi];
  const tramo = acum[hi] - acum[lo] || 1;
  const t = (d - acum[lo]) / tramo;
  return { lat: a[0] + (b[0] - a[0]) * t, lng: a[1] + (b[1] - a[1]) * t, rumbo: rumbo(a, b), i: lo };
}

// Tramo de calle entre dos distancias, en el sentido de avance (para dibujar la ruta al cliente).
export function tramo(ruta, desde, hasta, dir = 1) {
  const pts = [];
  const paso = 25;
  const total = distanciaAdelante(ruta, desde, hasta, dir);
  for (let m = 0; m <= total; m += paso) {
    const p = puntoEn(ruta, desde + dir * m);
    pts.push([p.lng, p.lat]);
  }
  const fin = puntoEn(ruta, hasta);
  pts.push([fin.lng, fin.lat]);
  return pts;
}

// Metros que faltan para llegar de `desde` a `hasta` avanzando en `dir`.
export function distanciaAdelante(ruta, desde, hasta, dir = 1) {
  if (ruta.cerrada) {
    const d = dir > 0 ? hasta - desde : desde - hasta;
    return ((d % ruta.largo) + ruta.largo) % ruta.largo;
  }
  const d = (hasta - desde) * dir;
  return d >= 0 ? d : Infinity;
}

// Unidades sintéticas. `f` = posición inicial como fracción de la ruta; `vel` en m/s reales.
const BASE = [
  { id: "017", chofer: "Ramiro Cruz", pista: "pista_centro_juarez", estado: "libre", f: 0.06, vel: 8.2 },
  { id: "023", chofer: "Lucía Hernández", pista: "pista_centro_juarez", estado: "libre", f: 0.38, vel: 7.4 },
  { id: "028", chofer: "Efraín Gómez", pista: "pista_centro_juarez", estado: "ocupado", f: 0.7, vel: 9.1 },
  { id: "031", chofer: "Mariana López", pista: "pista_canada_ado", estado: "libre", f: 0.2, vel: 8.6 },
  { id: "042", chofer: "Jorge Albores", pista: "pista_canada_ado", estado: "ocupado", f: 0.55, vel: 9.6 },
  { id: "054", chofer: "Sergio Pérez", pista: "pista_periferico_sur", estado: "libre", f: 0.3, vel: 10.2 },
  { id: "063", chofer: "Elena Ruiz", pista: "pista_periferico_sur", estado: "ocupado", f: 0.75, vel: 9.4 },
  { id: "075", chofer: "Alberto Díaz", pista: "pista_pakal_na", estado: "libre", f: 0.45, vel: 10.8 },
  { id: "081", chofer: "Rosa Martínez", pista: "pista_tren_maya", estado: "no_disponible", f: 0.4, vel: 0 },
  { id: "096", chofer: "Iván Morales", pista: "pista_carretera_ruinas", estado: "ocupado", f: 0.25, vel: 11.5 },
  { id: "104", chofer: "Patricia Vela", pista: "pista_centro_juarez", estado: "libre", f: 0.86, vel: 6.8 },
];

function crearUnidad(b) {
  const ruta = RUTAS[b.pista];
  const u = { ...b, ruta, s: ruta.largo * b.f, dir: 1, rastro: [], lat: 0, lng: 0, rumbo: 0, servicio: false, velActual: b.vel };
  const p = puntoEn(ruta, u.s);
  Object.assign(u, { lat: p.lat, lng: p.lng, rumbo: p.rumbo });
  return u;
}

const RASTRO_MAX = 32;
const RASTRO_CADA_S = 0.9;

function crearMundo() {
  const unidades = BASE.map(crearUnidad);
  const porId = new Map(unidades.map((u) => [u.id, u]));
  const oyentes = new Set();
  const oyentesServicio = new Set();
  let relojRastro = 0;
  let activos = 0;
  let raf = null;
  let ultimo = 0;
  let t = 0; // segundos de simulación

  // ---------- servicio de demostración (despacho) ----------
  const servicioInicial = () => ({ fase: "inactivo", candidatos: [], idx: 0, unidadId: null, recogida: null, inicioFase: 0, rechazos: 0 });
  let servicio = servicioInicial();
  const avisarServicio = () => oyentesServicio.forEach((f) => f({ ...servicio }));
  const fase = (nueva, extra = {}) => {
    servicio = { ...servicio, ...extra, fase: nueva, inicioFase: t };
    avisarServicio();
  };

  function mover(u, dt) {
    if (u.vel <= 0) return;
    const ruta = u.ruta;
    u.s += u.dir * u.velActual * dt * ESCALA_TIEMPO;
    if (!ruta.cerrada) {
      if (u.s >= ruta.largo) { u.s = ruta.largo; u.dir = -1; }
      else if (u.s <= 0) { u.s = 0; u.dir = 1; }
    }
    u.s = normalizar(ruta, u.s);
    const p = puntoEn(ruta, u.s);
    u.lat = p.lat;
    u.lng = p.lng;
    u.rumbo = u.dir > 0 ? p.rumbo : (p.rumbo + 180) % 360;
  }

  function avanzarServicio() {
    const s = servicio;
    if (s.fase === "ofertando") {
      if (t - s.inicioFase >= ACEPTA_TRAS_S) {
        const u = porId.get(s.candidatos[s.idx]?.id);
        if (!u) return;
        u.servicio = true;
        u.velActual = Math.max(u.vel, 9);
        fase("asignado", { unidadId: u.id });
      }
    } else if (s.fase === "asignado") {
      const u = porId.get(s.unidadId);
      const falta = distanciaAdelante(u.ruta, u.s, s.recogida.s, u.dir);
      if (falta < 12 || falta === Infinity) {
        u.estado = "ocupado";
        fase("en_curso");
      }
    } else if (s.fase === "en_curso" && t - s.inicioFase > 9) {
      const u = porId.get(s.unidadId);
      u.estado = "libre";
      u.servicio = false;
      u.velActual = u.vel;
      fase("completado");
    }
  }

  function paso(dt) {
    t += dt;
    for (const u of unidades) mover(u, dt);
    relojRastro += dt;
    if (relojRastro >= RASTRO_CADA_S) {
      relojRastro = 0;
      for (const u of unidades) {
        if (u.vel <= 0) continue;
        u.rastro.push([u.lng, u.lat]);
        if (u.rastro.length > RASTRO_MAX) u.rastro.shift();
      }
    }
    avanzarServicio();
    oyentes.forEach((f) => f());
  }

  function bucle(ahora) {
    const dt = Math.min(0.1, (ahora - ultimo) / 1000);
    ultimo = ahora;
    paso(dt);
    raf = requestAnimationFrame(bucle);
  }

  return {
    unidades,
    porId,
    get t() { return t; },
    get servicio() { return { ...servicio }; },
    // Un mapa visible pide movimiento; al salir de pantalla lo libera.
    activar() {
      activos += 1;
      if (activos === 1) {
        ultimo = performance.now();
        raf = requestAnimationFrame(bucle);
      }
      let liberado = false;
      return () => {
        if (liberado) return;
        liberado = true;
        activos -= 1;
        if (activos === 0 && raf) {
          cancelAnimationFrame(raf);
          raf = null;
        }
      };
    },
    // Con movimiento reducido el mundo no corre solo: la demo avanza a saltos al pedirlo.
    adelantar(segundos) {
      const pasos = Math.ceil(segundos / 0.1);
      for (let i = 0; i < pasos; i++) paso(0.1);
    },
    // Movimiento reducido: avanza la demo hasta el siguiente cambio de fase, de un salto.
    adelantarHastaCambio(maxSegundos = 180) {
      const inicial = servicio.fase;
      for (let i = 0; i < maxSegundos * 10 && servicio.fase === inicial; i++) paso(0.1);
    },
    suscribir(f) { oyentes.add(f); return () => oyentes.delete(f); },
    suscribirServicio(f) { oyentesServicio.add(f); return () => oyentesServicio.delete(f); },

    // Nuevo pedido en el centro: el cliente espera sobre Av. Juárez, por delante de una unidad libre.
    nuevoPedido() {
      for (const u of unidades) {
        if (u.servicio) { u.servicio = false; u.velActual = u.vel; }
      }
      const ruta = RUTAS.pista_centro_juarez;
      const libres = unidades.filter((u) => u.pista === ruta.id && u.estado === "libre");
      const ref = libres[Math.floor((t * 7) % Math.max(1, libres.length))] || unidades[0];
      const sRecogida = normalizar(ruta, ref.s + ref.dir * (380 + ((t * 53) % 160)));
      const p = puntoEn(ruta, sRecogida);
      servicio = { ...servicioInicial(), fase: "pendiente", inicioFase: t, recogida: { s: sRecogida, lat: p.lat, lng: p.lng, pista: ruta.id } };
      avisarServicio();
    },

    // Igual que el despacho real: candidatos libres ordenados por cercanía; se ofrece a uno a la vez.
    ofrecer() {
      const rec = servicio.recogida;
      if (!rec) return;
      const ruta = RUTAS[rec.pista];
      const candidatos = unidades
        .filter((u) => u.estado === "libre" && !u.servicio)
        .map((u) => {
          const porCalle = u.pista === rec.pista ? distanciaAdelante(ruta, u.s, rec.s, u.dir) : Infinity;
          return { id: u.id, metros: porCalle, recta: distM([u.lat, u.lng], [rec.lat, rec.lng]) };
        })
        .filter((c) => c.metros !== Infinity)
        .sort((a, b) => a.metros - b.metros)
        .slice(0, 3);
      fase(candidatos.length ? "ofertando" : "sin_unidades", { candidatos, idx: 0, rechazos: 0 });
    },

    // El chofer no responde a tiempo: la oferta pasa al siguiente candidato (cascada).
    rechazarOferta() {
      if (servicio.fase !== "ofertando") return;
      const idx = servicio.idx + 1;
      if (idx >= servicio.candidatos.length) fase("sin_unidades", { rechazos: servicio.rechazos + 1 });
      else fase("ofertando", { idx, rechazos: servicio.rechazos + 1 });
    },

    reiniciarServicio() {
      for (const u of unidades) {
        if (u.servicio) { u.servicio = false; u.velActual = u.vel; }
      }
      servicio = servicioInicial();
      avisarServicio();
    },

    // Ruta que falta por recorrer hasta el cliente ([lng, lat][]), o null.
    rutaAlCliente() {
      if (servicio.fase !== "asignado") return null;
      const u = porId.get(servicio.unidadId);
      return tramo(u.ruta, u.s, servicio.recogida.s, u.dir);
    },
    metrosAlCliente() {
      if (servicio.fase !== "asignado") return null;
      const u = porId.get(servicio.unidadId);
      return distanciaAdelante(u.ruta, u.s, servicio.recogida.s, u.dir);
    },
  };
}

export const flota = crearMundo();

export const CENTRO_PALENQUE = { lat: 17.5112, lng: -91.9858 };
