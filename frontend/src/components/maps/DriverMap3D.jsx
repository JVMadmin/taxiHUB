import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./driverMap3d.css";
import { pointAlongRoute, pointOnRoute } from "@/lib/geo";

/**
 * Mapa de navegación 3D del chofer (MapLibre GL, sin API key):
 * - Calles: estilo vectorial oscuro de OpenFreeMap + edificios extruidos (OpenStreetMap).
 * - Satélite: Esri World Imagery + etiquetas.
 * - Relieve: tiles públicos de elevación de AWS (Terrarium); se apaga en equipos modestos.
 * - Cámara: en 3D sigue al taxi inclinada y orientada a su rumbo; si el chofer mueve el
 *   mapa deja de seguirlo hasta que pulse "centrar" (`recenterN`).
 * Si el equipo no tiene WebGL, OperadorApp usa el mapa Leaflet de siempre.
 */
const ESTILO_CALLES = "https://tiles.openfreemap.org/styles/dark";
const DEM_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const ESTILO_SATELITE = {
  version: 8,
  sources: {
    sat: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 18,
      attribution: "Tiles &copy; Esri World Imagery",
    },
    ref: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 18,
    },
  },
  layers: [
    { id: "sat", type: "raster", source: "sat" },
    { id: "ref", type: "raster", source: "ref" },
  ],
};

export function webglDisponible() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

// El relieve pide más GPU/datos: solo en equipos con 4+ núcleos y, si se sabe, 3+ GB.
function equipoAguantaRelieve() {
  const nucleos = navigator.hardwareConcurrency || 4;
  const memoria = navigator.deviceMemory;
  return nucleos >= 4 && (memoria == null || memoria >= 3);
}

function elementoTaxi() {
  const el = document.createElement("div");
  el.className = "th-driver3d-taxi";
  el.innerHTML =
    '<div class="th-driver3d-halo"></div>' +
    '<img src="/assets/vehicles/taxi-operador.png" alt="" draggable="false" />';
  return el;
}

function elementoPunto(texto, color) {
  const el = document.createElement("div");
  el.className = "th-driver3d-punto";
  el.innerHTML = `<span class="th-driver3d-etiqueta" style="background:${color}">${texto}</span><span class="th-driver3d-pin" style="background:${color}"></span>`;
  return el;
}

const lngLat = (p) => [p[1], p[0]]; // [lat, lng] → [lng, lat]

// La hoja inferior de la app tapa ~45% de la pantalla: el taxi va en la parte visible.
const relleno = (map) => ({ top: 110, bottom: Math.round(map.getContainer().clientHeight * 0.45), left: 0, right: 0 });

// Hacia dónde va el taxi: manda el movimiento real (rumbo confiable que calcula la app con
// el GPS en marcha o el desplazamiento ≥ 8 m). Sin ese dato (recién abierto, sin moverse) y
// sobre la ruta (≤ 35 m), el sentido de la calle por la que sale. null = conservar el anterior.
function rumboVehiculo(pos, heading, rutaLatLngs) {
  const h = Number(heading);
  if (heading != null && Number.isFinite(h)) return h;
  if (pos && rutaLatLngs && rutaLatLngs.length > 1) {
    const cerca = pointOnRoute(pos, rutaLatLngs);
    if (cerca.distance <= 35) {
      const adelante = pointAlongRoute(rutaLatLngs, cerca.index, 25);
      if (adelante) return adelante.brg;
    }
  }
  return null;
}

// Ángulo acumulado para girar por el camino corto (359° → 1° gira 2°, no 358°).
function anguloContinuo(previo, nuevo) {
  if (previo == null) return nuevo;
  const delta = ((((nuevo - previo) % 360) + 540) % 360) - 180;
  return previo + delta;
}

function agregarCapas(map, { relieve }) {
  if (relieve && !map.getSource("dem")) {
    map.addSource("dem", { type: "raster-dem", tiles: [DEM_TILES], tileSize: 256, maxzoom: 15, encoding: "terrarium" });
  }
  // Edificios 3D sobre la capa "building" de OpenMapTiles (solo en el estilo de calles).
  if (map.getSource("openmaptiles") && !map.getLayer("th-edificios-3d")) {
    const primeraEtiqueta = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
    map.addLayer(
      {
        id: "th-edificios-3d",
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 14,
        paint: {
          "fill-extrusion-color": "#1f2733",
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.85,
        },
      },
      primeraEtiqueta
    );
  }
  if (!map.getSource("th-ruta")) {
    map.addSource("th-ruta", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    const comun = { type: "line", source: "th-ruta", layout: { "line-cap": "round", "line-join": "round" } };
    map.addLayer({ ...comun, id: "th-ruta-borde", paint: { "line-color": "#03070C", "line-width": 11, "line-opacity": 0.85 } });
    map.addLayer({ ...comun, id: "th-ruta-linea", paint: { "line-color": "#FFE600", "line-width": 6.5 } });
    map.addLayer({
      ...comun,
      id: "th-ruta-guia",
      layout: { "line-cap": "butt", "line-join": "round" },
      paint: { "line-color": "#FFFFFF", "line-width": 2, "line-opacity": 0.85, "line-dasharray": [2, 4] },
    });
  }
}

export function DriverMap3D({
  center,
  driverPos,
  heading = 0,
  puntos = [],
  rutaLatLngs,
  boundsPoints,
  capa = "calles",
  modo3d = true,
  recenterN = 0,
}) {
  const contRef = useRef(null);
  const mapRef = useRef(null);
  const taxiRef = useRef(null);
  const puntosRef = useRef([]);
  const siguiendoRef = useRef(true);
  const listoRef = useRef(false);
  const ultimo = useRef({ driverPos, heading, rutaLatLngs, modo3d });
  ultimo.current = { driverPos, heading, rutaLatLngs, modo3d };
  const relieve = useRef(equipoAguantaRelieve()).current;
  const rumboRef = useRef(null); // último rumbo bueno (grados, acumulado)
  const rumboActual = () => {
    const { driverPos: pos, heading: h, rutaLatLngs: ruta } = ultimo.current;
    const r = rumboVehiculo(pos, h, ruta);
    if (r != null) rumboRef.current = anguloContinuo(rumboRef.current, r);
    return rumboRef.current ?? 0;
  };

  // Crear el mapa una vez.
  useEffect(() => {
    const map = new maplibregl.Map({
      container: contRef.current,
      style: capa === "satelite" ? ESTILO_SATELITE : ESTILO_CALLES,
      center: lngLat(center),
      zoom: 16,
      pitch: modo3d ? 58 : 0,
      maxPitch: 70,
      attributionControl: { compact: true },
      dragRotate: true,
      fadeDuration: 0,
    });
    mapRef.current = map;
    const dejarDeSeguir = (e) => {
      if (e.originalEvent) siguiendoRef.current = false; // solo gestos del chofer
    };
    map.on("dragstart", dejarDeSeguir);
    map.on("rotatestart", dejarDeSeguir);
    map.on("style.load", () => {
      agregarCapas(map, { relieve });
      listoRef.current = true;
      aplicarModo(map, ultimo.current.modo3d, relieve);
      pintarRuta(map, ultimo.current.rutaLatLngs);
    });
    return () => {
      listoRef.current = false;
      map.remove();
      mapRef.current = null;
      taxiRef.current = null;
      puntosRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cambio de capa (calles ↔ satélite): recarga el estilo y vuelve a poner capas propias.
  const capaRef = useRef(capa);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || capaRef.current === capa) return;
    capaRef.current = capa;
    listoRef.current = false;
    map.setStyle(capa === "satelite" ? ESTILO_SATELITE : ESTILO_CALLES);
  }, [capa]);

  // 2D ↔ 3D
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listoRef.current) return;
    siguiendoRef.current = true;
    aplicarModo(map, modo3d, relieve);
  }, [modo3d, relieve]);

  // Taxi del chofer + cámara que lo sigue.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!driverPos) {
      taxiRef.current?.remove();
      taxiRef.current = null;
      return;
    }
    if (!taxiRef.current) {
      // El marcador queda alineado al mapa (rotación 0) y la imagen gira dentro con transición.
      taxiRef.current = new maplibregl.Marker({
        element: elementoTaxi(),
        rotationAlignment: "map",
        pitchAlignment: "map",
      })
        .setLngLat(lngLat(driverPos))
        .addTo(map);
    } else {
      taxiRef.current.setLngLat(lngLat(driverPos));
    }
    // La imagen del taxi mira al este: se resta 90° al rumbo.
    const rumbo = rumboActual();
    const img = taxiRef.current.getElement().querySelector("img");
    if (img) img.style.transform = `rotate(${rumbo - 90}deg)`;
    if (siguiendoRef.current && modo3d) {
      map.easeTo({
        center: lngLat(driverPos),
        bearing: rumbo,
        pitch: 58,
        zoom: Math.max(map.getZoom(), 16.5),
        padding: relleno(map),
        duration: 900,
      });
    }
  }, [driverPos, heading, modo3d, rutaLatLngs]);

  // Puntos (cliente / destino)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    puntosRef.current.forEach((m) => m.remove());
    puntosRef.current = puntos
      .filter((p) => p?.pos)
      .map((p) => new maplibregl.Marker({ element: elementoPunto(p.texto, p.color), anchor: "bottom" }).setLngLat(lngLat(p.pos)).addTo(map));
  }, [puntos]);

  // Ruta
  useEffect(() => {
    const map = mapRef.current;
    if (map && listoRef.current) pintarRuta(map, rutaLatLngs);
  }, [rutaLatLngs]);

  // En 2D: encuadrar ruta / puntos cuando cambian de verdad.
  const boundsKey = useRef("");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || modo3d || !boundsPoints || boundsPoints.length < 2) return;
    const key = boundsPoints.map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join("|");
    if (key === boundsKey.current) return;
    boundsKey.current = key;
    const b = new maplibregl.LngLatBounds();
    boundsPoints.forEach((p) => b.extend(lngLat(p)));
    map.fitBounds(b, { padding: { top: 140, bottom: 260, left: 60, right: 60 }, maxZoom: 16, duration: 600 });
  }, [boundsPoints, modo3d]);

  // Botón "centrar en mi ubicación"
  const prevN = useRef(recenterN);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || recenterN === prevN.current) return;
    prevN.current = recenterN;
    siguiendoRef.current = true;
    const { driverPos: pos } = ultimo.current;
    if (!pos) return;
    map.easeTo(
      modo3d
        ? { center: lngLat(pos), bearing: rumboActual(), pitch: 58, zoom: 16.5, padding: relleno(map), duration: 700 }
        : { center: lngLat(pos), bearing: 0, pitch: 0, zoom: Math.max(map.getZoom(), 15), padding: relleno(map), duration: 700 }
    );
  }, [recenterN, modo3d]);

  return <div ref={contRef} className="h-full w-full" data-testid="driver-map-3d" />;
}

function aplicarModo(map, modo3d, relieve) {
  if (modo3d) {
    if (relieve && map.getSource("dem")) map.setTerrain({ source: "dem", exaggeration: 1.4 });
    if (map.getLayer("th-edificios-3d")) map.setLayoutProperty("th-edificios-3d", "visibility", "visible");
    map.easeTo({ pitch: 58, duration: 600 });
  } else {
    map.setTerrain(null);
    if (map.getLayer("th-edificios-3d")) map.setLayoutProperty("th-edificios-3d", "visibility", "none");
    map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
  }
}

function pintarRuta(map, latlngs) {
  const src = map.getSource("th-ruta");
  if (!src) return;
  src.setData(
    latlngs && latlngs.length > 1
      ? { type: "Feature", geometry: { type: "LineString", coordinates: latlngs.map((p) => [p[1], p[0]]) }, properties: {} }
      : { type: "FeatureCollection", features: [] }
  );
}

export default DriverMap3D;
