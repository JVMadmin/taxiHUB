import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { resolveVehicleImage, VEHICLE_IMAGE_FALLBACK } from "@/lib/utils";

// Imagen del vehículo (VehicleType 3D / foto real), protagonista en las
// tarjetas de flota. Prioridad foto propia -> tipo -> genérica ya la resuelve
// `resolveVehicleImage`; este componente solo cubre el caso "la URL resuelta
// no carga" (archivo borrado, red) cayendo también al genérico.
export function VehicleImage({ vehiculo, alt, className, imgClassName, ...rest }) {
  const primary = resolveVehicleImage(vehiculo);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [primary]);

  return (
    <div className={cn("relative overflow-hidden bg-secondary/50", className)} {...rest}>
      <img
        src={failed ? VEHICLE_IMAGE_FALLBACK : primary}
        alt={alt || [vehiculo?.marca, vehiculo?.modelo].filter(Boolean).join(" ") || "Vehículo"}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn("h-full w-full object-contain", imgClassName)}
      />
    </div>
  );
}

export default VehicleImage;
