import { useEffect, useRef } from "react";
import { Polyline } from "react-leaflet";

/**
 * RoutePolyline — Polyline de react-leaflet con clase extra añadida
 * imperativamente al <path> del SVG. react-leaflet v4 no propaga
 * `pathOptions.className` a Leaflet, así que la añadimos aquí tras montar
 * (necesaria para la animación de "flujo" `.th-route-flow`).
 */
export function RoutePolyline({ positions, pathOptions, className, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current && ref.current._path;
    if (el && className) el.classList.add(className);
  }, [className]);
  return <Polyline ref={ref} positions={positions} pathOptions={pathOptions} {...rest} />;
}

export default RoutePolyline;