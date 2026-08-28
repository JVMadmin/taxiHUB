import { memo } from "react";
import { Marker } from "react-leaflet";
import { taxiIcon } from "@/lib/taxiIcon";
import { colorDe, labelDe } from "@/design/status";

/**
 * TaxiMarker — marcador de unidad del Centro de Operaciones (Design System 2.0).
 * Estado/consume colores desde la SSOT (design/status). Memoizado: el mapa
 * tiene cientos de unidades y solo unas pocas cambian por tick de GPS.
 */
function TaxiMarker({ op, selected, onSelect, showLabel = true, filtroRutaColor }) {
  if (op.lat == null || op.lng == null) return null;
  const color = filtroRutaColor || colorDe("operador", op.estado);
  const label = showLabel ? op.placa || op.numero_economico || "" : "";
  return (
    <Marker
      position={[op.lat, op.lng]}
      icon={taxiIcon(color, label, { selected: !!selected })}
      eventHandlers={{ click: () => onSelect?.(op) }}
      zIndexOffset={selected ? 1000 : 0}
    />
  );
}

export default memo(TaxiMarker);

export { labelDe };
