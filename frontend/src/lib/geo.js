// Utilidades geoespaciales compartidas (Fase 9).
// Haversine puro en cliente para distancias/ETA y fallback cuando el
// proveedor de rutas no está disponible.

export function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// Distancia Haversine entre dos puntos [lat, lng] en metros.
export function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Acepta pares {lat,lng} o arreglos [lat,lng].
export function distM(a, b) {
  const [lat1, lng1] = Array.isArray(a) ? a : [a.lat, a.lng];
  const [lat2, lng2] = Array.isArray(b) ? b : [b.lat, b.lng];
  if (lat1 == null || lat2 == null || lng1 == null || lng2 == null) return null;
  return haversineM(lat1, lng1, lat2, lng2);
}

// Distancia legible: "850 m" | "1.4 km"
export function fmtDist(m) {
  if (m == null || Number.isNaN(m)) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// ETA legible: "3 min" | "1 h 5 min" | "50 s"
export function fmtDuration(sec) {
  if (sec == null || Number.isNaN(sec)) return "—";
  if (sec < 60) return `${Math.max(1, Math.round(sec))} s`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

// Ruta recta (fallback) entre dos puntos -> lista [lat, lng].
export function straightLine(a, b, steps = 32) {
  const [lat1, lng1] = Array.isArray(a) ? a : [a.lat, a.lng];
  const [lat2, lng2] = Array.isArray(b) ? b : [b.lat, b.lng];
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push([lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t]);
  }
  return out;
}

// Rumbo inicial (grados, 0-360) para orientar la flecha del vehículo.
export function bearing(lat1, lng1, lat2, lng2) {
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

// Convierte geometry GeoJSON LineString del backend a latlngs de Leaflet.
export function geometryToLatLngs(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return null;
  return geometry.coordinates.map(([lng, lat]) => [lat, lng]);
}

export function puntoMedio(a, b) {
  const [lat1, lng1] = Array.isArray(a) ? a : [a.lat, a.lng];
  const [lat2, lng2] = Array.isArray(b) ? b : [b.lat, b.lng];
  return [(lat1 + lat2) / 2, (lng1 + lng2) / 2];
}

// Encuentra el punto sobre la polilínea más cercano a `ref`, y devuelve el
// punto que está `aheadM` metros más adelante en la ruta (ambos pares {lat,lng}),
// más el rumbo de ese tramo. Útil para el "indicador de ruta" del despachador.
export function pointOnRoute(ref, latlngs) {
  const [rlat, rlng] = Array.isArray(ref) ? ref : [ref.lat, ref.lng];
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < latlngs.length; i++) {
    const [lat, lng] = latlngs[i];
    const d = haversineM(rlat, rlng, lat, lng);
    if (d < bestD) { bestD = d; best = i; }
  }
  return { index: best, distance: bestD };
}

// Recorre `latlngs` desde `startIndex` acumulando distancia hasta alcanzar
// `aheadM` metros; devuelve el punto interpolado y el rumbo del tramo.
export function pointAlongRoute(latlngs, startIndex, aheadM) {
  if (!latlngs || latlngs.length < 2) return null;
  let acc = 0;
  for (let i = startIndex; i < latlngs.length - 1; i++) {
    const [lat1, lng1] = latlngs[i];
    const [lat2, lng2] = latlngs[i + 1];
    const seg = haversineM(lat1, lng1, lat2, lng2);
    if (acc + seg >= aheadM) {
      const t = (aheadM - acc) / (seg || 1);
      return {
        lat: lat1 + (lat2 - lat1) * t,
        lng: lng1 + (lng2 - lng1) * t,
        brg: bearing(lat1, lng1, lat2, lng2),
      };
    }
    acc += seg;
  }
  return null;
}

// Punto enfrente del taxi sobre la ruta: busca el vértice más cercano al taxi
// y avanza `aheadM` metros por la polilínea.
export function puntoAdelanteEnRuta(taxi, latlngs, aheadM = 200) {
  if (!latlngs || latlngs.length < 2 || !taxi) return null;
  const near = pointOnRoute(taxi, latlngs);
  return pointAlongRoute(latlngs, near.index, aheadM);
}