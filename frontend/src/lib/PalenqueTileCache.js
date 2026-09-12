// PalenqueTileCache.js - Precalentamiento y precarga inteligente de teselas OSM para Palenque
// Precarga las teselas de los niveles de zoom 13, 14 y 15 que cubren Palenque, Chiapas.
// Al usar new Image(), el navegador las almacena en HTTP Cache (memoria y disco),
// evitando pantallas negras o parpadeos durante el zoom in/out.

function latLngToTile(lat, lng, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y, z: zoom };
}

// Bounding box de Palenque y alrededores (Centro, Pakal-Na, Cañada, Ruinas, Periférico)
const PALENQUE_BBOX = {
  minLat: 17.470,
  maxLat: 17.560,
  minLng: -92.050,
  maxLng: -91.950,
};

let yaPrecargado = false;

export function obtenerUrlsTeselasPalenque() {
  const subdomains = ['a', 'b', 'c'];
  const urls = [];
  const zooms = [13, 14, 15];

  for (const z of zooms) {
    const topTile = latLngToTile(PALENQUE_BBOX.maxLat, PALENQUE_BBOX.minLng, z);
    const bottomTile = latLngToTile(PALENQUE_BBOX.minLat, PALENQUE_BBOX.maxLng, z);

    const minX = Math.min(topTile.x, bottomTile.x);
    const maxX = Math.max(topTile.x, bottomTile.x);
    const minY = Math.min(topTile.y, bottomTile.y);
    const maxY = Math.max(topTile.y, bottomTile.y);

    let sIdx = 0;
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const s = subdomains[sIdx % subdomains.length];
        sIdx++;
        urls.push('https://' + s + '.tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png');
      }
    }
  }

  return urls;
}

export function precargarTilesPalenque(concurrencia = 12) {
  if (yaPrecargado) return Promise.resolve(0);
  if (typeof window === 'undefined') return Promise.resolve(0);
  yaPrecargado = true;

  const urls = obtenerUrlsTeselasPalenque();

  return new Promise((resolve) => {
    let index = 0;
    let completados = 0;
    let activos = 0;

    function cargarSiguiente() {
      if (index >= urls.length && activos === 0) {
        resolve(completados);
        return;
      }

      while (activos < concurrencia && index < urls.length) {
        const url = urls[index++];
        activos++;
        // fetch con cache:force-cache persiste en caché de disco HTTP
        // más efectivo que new Image() en navegadores modernos
        fetch(url, { cache: 'force-cache', mode: 'no-cors' })
          .then(() => { activos--; completados++; cargarSiguiente(); })
          .catch(() => { activos--; completados++; cargarSiguiente(); });
      }
    }

    // Iniciar tras 50ms para no bloquear el primer render de la UI
    setTimeout(cargarSiguiente, 50);
  });
}
