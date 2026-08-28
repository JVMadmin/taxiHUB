import { memo } from "react";
import TaxiMarker from "./TaxiMarker";

/**
 * FleetLayer — capa de flota del mapa. Renderiza TaxiMarkers memoizados;
 * solo re-renderizan las unidades cuyo objeto cambió (comparación shallow
 * por referencia: el upsert del WS crea objetos nuevos solo para las que
 * recibieron actualización).
 */
function FleetLayer({ operadores, selectedId, onSelect, filtroRutaColor, showLabel }) {
  const items = Object.values(operadores || {});
  return (
    <>
      {items.map((op) => (
        <TaxiMarker
          key={op.id}
          op={op}
          selected={op.id === selectedId}
          onSelect={onSelect}
          showLabel={showLabel}
          filtroRutaColor={filtroRutaColor}
        />
      ))}
    </>
  );
}

export default memo(FleetLayer);
