import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useReducedMotion } from "framer-motion";
import { Minus, Plus, Maximize2, RotateCw } from "lucide-react";
import { ESTADOS_OPERADOR } from "@/design/status";
import { webglDisponible } from "@/components/maps/DriverMap3D";
import { LANDING } from "@/constants/testIds";
import { flota, CENTRO_PALENQUE, ESCALA_TIEMPO } from "./flota";
import { useSimulacion } from "./useFlota";
import { useEnVista } from "../motion";

/*
 * Mapa real de Palenque (MapLibre + OpenFreeMap, el mismo motor del mapa 3D del chofer)
 * repintado con la paleta del sistema, con la flota de demostración encima.
 * - Arrastre para mover; zoom con los botones, doble clic o Ctrl/⌘ + rueda (la rueda sola
 *   desplaza la página: el mapa nunca secuestra el scroll). En táctil, dos dedos.
 * - Unidades como botones: clic/toque o Enter las selecciona (aria-pressed).
 */
const ESTILO = "https://tiles.openfreemap.org/styles/dark";
const LIMITES = [[-92.09, 17.44], [-91.88, 17.6]];
const IDIOMA = {
  "CooperativeGesturesHandler.WindowsHelpText": "Usa Ctrl + rueda del mouse para acercar el mapa",
  "CooperativeGesturesHandler.MacHelpText": "Usa ⌘ + rueda del mouse para acercar el mapa",
  "CooperativeGesturesHandler.MobileHelpText": "Usa dos dedos para mover el mapa",
};

// Colores del estilo oscuro → azul negro de TaxiHUB (ids de capa de OpenFreeMap "dark").
const PINTURA = {
  background: ["background-color", "#050B12"],
  water: ["fill-color", "#0A1C2F"],
  waterway: ["line-color", "#0D2236"],
  landuse_residential: ["fill-color", "#07111B"],
  landcover_wood: ["fill-color", "#081620"],
  landuse_park: ["fill-color", "#081722"],
  building: ["fill-color", "#0D1A29"],
  "aeroway-area": ["fill-color", "#0B1622"],
  "aeroway-runway": ["line-color", "#13233A"],
  "aeroway-taxiway": ["line-color", "#101E30"],
  highway_path: ["line-color", "#122033"],
  highway_minor: ["line-color", "#16273C"],
  highway_major_casing: ["line-color", "rgba(5, 11, 18, 0.9)"],
  highway_major_inner: ["line-color", "#1D3049"],
  highway_major_subtle: ["line-color", "#1D3049"],
  highway_motorway_casing: ["line-color", "rgba(5, 11, 18, 0.9)"],
  highway_motorway_inner: ["line-color", "#27405F"],
  highway_motorway_subtle: ["line-color", "#22385A"],
  railway: ["line-color", "#1A2A3E"],
  railway_minor: ["line-color", "#1A2A3E"],
  railway_transit: ["line-color", "#1A2A3E"],
};
function pintarEstilo(map) {
  for (const capa of map.getStyle().layers) {
    try {
      const p = PINTURA[capa.id];
      if (p) map.setPaintProperty(capa.id, p[0], p[1]);
      else if (/dashline$/.test(capa.id)) map.setPaintProperty(capa.id, "line-color", "#050B12");
      else if (/^boundary/.test(capa.id)) map.setPaintProperty(capa.id, "line-color", "#1A2A3E");
      if (capa.type === "symbol") {
        const lugar = /^place_/.test(capa.id);
        map.setPaintProperty(capa.id, "text-color", lugar ? "#8A9BB0" : capa.id === "water_name" ? "#3E5C7A" : "#5D7290");
        map.setPaintProperty(capa.id, "text-halo-color", "#050B12");
      }
    } catch (_) {
      /* capa sin esa propiedad: se deja como viene */
    }
  }
}

const SIN_RELLENO = { top: 0, right: 0, bottom: 0, left: 0 };
const vacio = { type: "FeatureCollection", features: [] };
const linea = (coords) =>
  coords && coords.length > 1 ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } } : vacio;

function agregarCapas(map) {
  map.addSource("ld-servicio", { type: "geojson", data: vacio });
  map.addLayer({ id: "ld-servicio-borde", type: "line", source: "ld-servicio", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#03070C", "line-width": 9, "line-opacity": 0.9 } });
  map.addLayer({ id: "ld-servicio-linea", type: "line", source: "ld-servicio", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#FFE600", "line-width": 4.5 } });
  map.addLayer({ id: "ld-servicio-guia", type: "line", source: "ld-servicio", layout: { "line-join": "round" }, paint: { "line-color": "#050B12", "line-width": 1.6, "line-dasharray": [1.5, 3] } });
  map.addSource("ld-rastro", { type: "geojson", data: vacio, lineMetrics: true });
  map.addLayer({
    id: "ld-rastro-linea",
    type: "line",
    source: "ld-rastro",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-width": 3.5,
      "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, "rgba(255,230,0,0)", 1, "rgba(255,230,0,0.95)"],
    },
  });
}

function etiquetaEstado(u) {
  if (u.servicio) return "va por un cliente";
  return (ESTADOS_OPERADOR[u.estado]?.label || u.estado).toLowerCase();
}

function crearElementoUnidad(u, i, alSeleccionar) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "ld-unidad";
  el.style.setProperty("--i", String(i));
  el.setAttribute("data-testid", `${LANDING.demoUnidad}-${u.id}`);
  el.innerHTML =
    '<span class="ld-unidad-rumbo" aria-hidden="true"></span>' +
    '<span class="ld-unidad-punto" aria-hidden="true"></span>' +
    `<span class="ld-unidad-num" aria-hidden="true">${u.id}</span>`;
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    alSeleccionar?.(u.id);
  });
  return el;
}

function crearElementoCliente() {
  const el = document.createElement("div");
  el.className = "ld-cliente";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = '<span class="ld-cliente-pulso"></span><span class="ld-cliente-pin"></span><span class="ld-cliente-txt">Cliente</span>';
  return el;
}

export function MapaDemo({
  seleccionId,
  onSeleccionar,
  mostrarServicio = false,
  mostrarRastro = false,
  seguir = false,
  onDejarDeSeguir,
  vista = { zoom: 14.3, pitch: 38, bearing: -12 },
  entrada = false,
  relleno = SIN_RELLENO,
  className = "",
  etiqueta = "Mapa de demostración de Palenque con unidades en tiempo real",
}) {
  const reduce = useReducedMotion();
  const cajaRef = useRef(null);
  const contRef = useRef(null);
  const mapRef = useRef(null);
  const marcadores = useRef(new Map());
  const clienteRef = useRef(null);
  const props = useRef({});
  props.current = { ...props.current, seleccionId, onSeleccionar, mostrarServicio, mostrarRastro, seguir, onDejarDeSeguir, relleno };
  const [estado, setEstado] = useState(() => (webglDisponible() ? "cargando" : "sin-webgl"));
  const [intento, setIntento] = useState(0);
  const visible = useEnVista(cajaRef, "80px");
  useSimulacion(visible && estado === "listo");

  // Crear el mapa (una vez por intento).
  useEffect(() => {
    if (!webglDisponible()) return undefined;
    let vivo = true;
    const conEntrada = entrada && !reduce;
    const map = new maplibregl.Map({
      container: contRef.current,
      style: ESTILO,
      center: [CENTRO_PALENQUE.lng, CENTRO_PALENQUE.lat],
      zoom: conEntrada ? vista.zoom - 1.1 : vista.zoom,
      pitch: conEntrada ? 0 : vista.pitch,
      bearing: conEntrada ? 0 : vista.bearing,
      minZoom: 12.4,
      maxZoom: 17.6,
      maxBounds: LIMITES,
      cooperativeGestures: true,
      dragRotate: false,
      touchPitch: false,
      pitchWithRotate: false,
      attributionControl: { compact: true },
      locale: IDIOMA,
      fadeDuration: 0,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    const caja = cajaRef.current;
    const marcadoresMapa = marcadores.current;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => map.resize()) : null;
    ro?.observe(caja);

    const tiempoLimite = setTimeout(() => {
      if (vivo && !map.isStyleLoaded()) setEstado("error");
    }, 15000);

    map.on("error", (e) => {
      // Un tile suelto que falla no tumba la demo; sin estilo no hay mapa.
      if (vivo && !map.isStyleLoaded() && /style|Failed to fetch|NetworkError/i.test(String(e?.error?.message || ""))) setEstado("error");
    });
    map.on("dragstart", (e) => {
      if (e.originalEvent) props.current.onDejarDeSeguir?.();
    });

    map.on("load", () => {
      if (!vivo) return;
      clearTimeout(tiempoLimite);
      pintarEstilo(map);
      agregarCapas(map);
      flota.unidades.forEach((u, i) => {
        const el = crearElementoUnidad(u, i, (id) => props.current.onSeleccionar?.(id));
        if (conEntrada) el.classList.add("ld-unidad--entra");
        const m = new maplibregl.Marker({ element: el }).setLngLat([u.lng, u.lat]).addTo(map);
        marcadores.current.set(u.id, m);
      });
      map.setPadding(props.current.relleno);
      actualizar(true);
      setEstado("listo");
      if (conEntrada) {
        map.easeTo({ zoom: vista.zoom, pitch: vista.pitch, bearing: vista.bearing, duration: 1700, easing: (t) => 1 - Math.pow(1 - t, 3) });
      }
    });

    let ultimoGeo = 0;
    let ultimoSeguir = 0;
    function actualizar(forzar = false) {
      const map2 = mapRef.current;
      if (!map2) return;
      const { seleccionId: sel, mostrarServicio: ms, mostrarRastro: mr, seguir: sg } = props.current;
      const bearing = map2.getBearing();
      for (const u of flota.unidades) {
        const m = marcadores.current.get(u.id);
        if (!m) continue;
        m.setLngLat([u.lng, u.lat]);
        const el = m.getElement();
        if (forzar || el.dataset.estado !== u.estado || el.dataset.servicio !== String(u.servicio)) {
          el.dataset.estado = u.estado;
          el.dataset.servicio = String(u.servicio);
          el.style.setProperty("--color", ESTADOS_OPERADOR[u.estado]?.color || "#93A4B8");
          el.setAttribute("aria-label", `Unidad ${u.id}, ${etiquetaEstado(u)}`);
        }
        el.style.setProperty("--rumbo", `${u.rumbo - bearing}deg`);
        el.classList.toggle("is-detenida", u.vel <= 0);
        const esSel = u.id === sel;
        if (forzar || el.classList.contains("is-sel") !== esSel) {
          el.classList.toggle("is-sel", esSel);
          el.setAttribute("aria-pressed", String(esSel));
        }
      }
      const ahora = performance.now();
      if (forzar || ahora - ultimoGeo > 110) {
        ultimoGeo = ahora;
        const fuenteServ = map2.getSource("ld-servicio");
        fuenteServ?.setData(ms ? linea(flota.rutaAlCliente()) : vacio);
        const u = flota.porId.get(sel);
        map2.getSource("ld-rastro")?.setData(mr && u ? linea([...u.rastro, [u.lng, u.lat]]) : vacio);
      }
      if (sg && sel && ahora - ultimoSeguir > 450) {
        ultimoSeguir = ahora;
        const u = flota.porId.get(sel);
        if (u) map2.easeTo({ center: [u.lng, u.lat], duration: 450, easing: (x) => x });
      }
    }
    const quitar = flota.suscribir(() => actualizar());
    props.current.actualizar = actualizar;

    return () => {
      vivo = false;
      clearTimeout(tiempoLimite);
      quitar();
      ro?.disconnect();
      marcadoresMapa.clear();
      clienteRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intento]);

  // Zona del mapa tapada por paneles (la cámara centra las unidades en la parte visible).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || estado !== "listo") return;
    const p = map.getPadding();
    if (["top", "right", "bottom", "left"].every((k) => p[k] === relleno[k])) return;
    map.easeTo({ padding: relleno, duration: reduce ? 0 : 280 });
  }, [relleno, estado, reduce]);

  // Selección: resalta la unidad y, si la cambió el visitante, lleva la cámara hacia ella
  // (la selección inicial no mueve la cámara: dejaría fuera la vista de la ciudad).
  const selPrevia = useRef(undefined);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || estado !== "listo") return;
    props.current.actualizar?.(true);
    const primera = selPrevia.current === undefined;
    selPrevia.current = seleccionId;
    if (primera) return;
    const u = seleccionId && flota.porId.get(seleccionId);
    if (u) map.easeTo({ center: [u.lng, u.lat], zoom: Math.max(map.getZoom(), 14.6), duration: reduce ? 0 : 650 });
  }, [seleccionId, estado, reduce]);

  // Capas que dependen de la pestaña (servicio / rastro) y marcador del cliente.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || estado !== "listo") return undefined;
    props.current.actualizar?.(true);
    const pintarCliente = (s) => {
      const mostrar = mostrarServicio && s.recogida && ["pendiente", "ofertando", "asignado", "sin_unidades"].includes(s.fase);
      if (mostrar) {
        if (!clienteRef.current) clienteRef.current = new maplibregl.Marker({ element: crearElementoCliente() });
        clienteRef.current.setLngLat([s.recogida.lng, s.recogida.lat]).addTo(map);
      } else {
        clienteRef.current?.remove();
      }
      props.current.actualizar?.(true);
    };
    pintarCliente(flota.servicio);
    return flota.suscribirServicio((s) => {
      pintarCliente(s);
      if (mostrarServicio && s.fase === "pendiente" && s.recogida) {
        map.easeTo({ center: [s.recogida.lng, s.recogida.lat], zoom: Math.max(map.getZoom(), 14.8), duration: reduce ? 0 : 650 });
      }
    });
  }, [mostrarServicio, mostrarRastro, estado, reduce]);

  const zoom = (d) => mapRef.current?.easeTo({ zoom: mapRef.current.getZoom() + d, duration: reduce ? 0 : 280 });
  const encuadrar = () =>
    mapRef.current?.easeTo({ center: [CENTRO_PALENQUE.lng, CENTRO_PALENQUE.lat], zoom: vista.zoom, pitch: vista.pitch, bearing: vista.bearing, duration: reduce ? 0 : 650 });

  return (
    <div ref={cajaRef} className={`ld-mapa ${className}`} role="region" aria-label={etiqueta}>
      {estado === "sin-webgl" ? (
        <figure className="ld-mapa-respaldo">
          <img src="/landing/terminal.webp" alt="Captura real de la Terminal de TaxiHUB con el mapa de la flota" loading="lazy" />
          <figcaption>Tu navegador no permite mapas interactivos (WebGL). Esta es una captura real de la Terminal.</figcaption>
        </figure>
      ) : (
        <div ref={contRef} className="ld-mapa-lienzo" />
      )}

      {estado === "cargando" && (
        <div className="ld-mapa-cargando" aria-live="polite">
          <span className="ld-mapa-cargando-txt">Cargando el mapa de Palenque…</span>
        </div>
      )}
      {estado === "error" && (
        <div className="ld-mapa-error" role="alert">
          <p>No se pudo cargar el mapa. Revisa tu conexión.</p>
          <button
            type="button"
            className="ld-btn ld-btn--secundario ld-btn--chico"
            onClick={() => {
              setEstado("cargando");
              setIntento((n) => n + 1);
            }}
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" /> Reintentar
          </button>
        </div>
      )}

      {estado === "listo" && (
        <>
          <div className="ld-mapa-sello" aria-hidden="true">
            <span>Datos de demostración</span>
            {!reduce && <span className="ld-mapa-sello-vel">Simulación ×{ESCALA_TIEMPO}</span>}
          </div>
          <div className="ld-mapa-controles" style={{ right: Math.max(10, (relleno.right || 0) + 4) }}>
            <button type="button" onClick={() => zoom(1)} aria-label="Acercar el mapa" data-testid={LANDING.demoZoomIn}>
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => zoom(-1)} aria-label="Alejar el mapa" data-testid={LANDING.demoZoomOut}>
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={encuadrar} aria-label="Volver a la vista de la ciudad">
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
