import { memo } from "react";
import { Marker } from "react-leaflet";
import { pointIcon } from "@/lib/taxiIcon";
import { PALETA } from "@/design/status";

function DestinationMarker({ lat, lng, label, size = "md" }) {
  if (lat == null || lng == null) return null;
  return <Marker position={[lat, lng]} icon={pointIcon(label, PALETA.danger, { size })} zIndexOffset={600} />;
}

export default memo(DestinationMarker);
