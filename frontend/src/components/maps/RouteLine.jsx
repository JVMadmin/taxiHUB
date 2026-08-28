import { RoutePolyline } from "@/components/RoutePolyline";
import { PALETA } from "@/design/status";

/**
 * RouteLine — trazo de ruta del servicio (origen→destino o GPS track).
 * Variante "service": color de marca con casing oscuro para legibilidad
 * sobre mapa claro/oscuro. Variante "track": línea fina del recorrido GPS.
 */
export function RouteLine({ positions, variant = "service", flow = false }) {
  if (!positions || positions.length < 2) return null;
  const isService = variant === "service";
  return (
    <>
      {isService && (
        <RoutePolyline
          positions={positions}
          pathOptions={{ color: "#04110C", weight: 9, opacity: 0.35, lineCap: "round" }}
        />
      )}
      <RoutePolyline
        positions={positions}
        pathOptions={{
          color: isService ? PALETA.primary : PALETA.info,
          weight: isService ? 4.5 : 3,
          opacity: 0.95,
          dashArray: isService ? null : "1 8",
          lineCap: "round",
        }}
        className={flow ? "th-route-flow" : undefined}
      />
    </>
  );
}

export default RouteLine;
