import { memo } from "react";
import { Marker } from "react-leaflet";
import { pointIcon } from "@/lib/taxiIcon";
import { PALETA } from "@/design/status";

/**
 * PickupMarker — punto de origen del servicio (verde de marca).
 * DestinationMarker — punto de destino (rojo semántico).
 */
function PickupMarker({ lat, lng, label, size = "md" }) {
  if (lat == null || lng == null) return null;
  return <Marker position={[lat, lng]} icon={pointIcon(label, PALETA.primary, { size })} zIndexOffset={600} />;
}

export default memo(PickupMarker);
